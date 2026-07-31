/**
 * PricePilot - Duplicate SKU Reconciliation
 *
 * When an import contains a SKU that already exists in the catalogue,
 * the user must choose how to handle it. We support five strategies:
 *
 *   - update-existing:    Replace financial inputs on the existing
 *                         product with the uploaded values.
 *   - fill-missing:       Only fill fields that are currently empty/zero.
 *   - keep-existing:      Skip this row entirely (no change).
 *   - create-copy:        Create a new product with a new SKU suffix.
 *   - skip:               Same as keep-existing but tracked separately.
 *
 * When any financial input changes (purchaseCost, fees, tax), the
 * previous price approval is invalidated:
 *   priceApprovalStatus: 'none'
 *   finalApprovedPrice: 0
 *   approvedAt: ''
 *
 * The owner is shown: "The previous approval was removed because the
 * product cost changed."
 *
 * When updating, we preserve:
 *   - Internal product ID
 *   - Notes
 *   - Tags
 *   - Created date
 *   - Approval history (where valid — see above for invalidation)
 */

import { Product, BusinessSettings, PricingRule } from './types';
import { safelyRecalculateProduct } from './safe-calculation';

// ============================================================
// Types
// ============================================================

export type DuplicateResolutionStrategy =
  | 'update-existing'
  | 'fill-missing'
  | 'keep-existing'
  | 'create-copy'
  | 'skip';

export interface DuplicateDiff {
  field: string;
  label: string;
  currentValue: unknown;
  uploadedValue: unknown;
  /** True if the values differ in a way that affects price calculation. */
  affectsCalculation: boolean;
}

export interface DuplicateReconciliationInput {
  /** The product already in the catalogue. */
  existing: Product;
  /** The product parsed from the import row. */
  uploaded: Product;
  /** The strategy chosen by the user. */
  strategy: DuplicateResolutionStrategy;
}

export interface DuplicateReconciliationResult {
  /** The product to keep in the catalogue (may be existing, updated, or a new copy). */
  product: Product;
  /** True if the existing product's price approval was invalidated. */
  approvalInvalidated: boolean;
  /** True if a new product was created (create-copy strategy). */
  createdNew: boolean;
  /** True if no change was made (keep-existing / skip). */
  skipped: boolean;
  /** Human-readable message for the owner. */
  message: string;
  /** Field-by-field differences that were applied. */
  appliedChanges: DuplicateDiff[];
}

// ============================================================
// Internal: which fields are "financial inputs"
// ============================================================

const FINANCIAL_INPUT_FIELDS: Array<{ field: keyof Product; label: string }> = [
  { field: 'purchaseCost', label: 'Purchase Cost' },
  { field: 'shippingCost', label: 'Shipping Cost' },
  { field: 'packagingCost', label: 'Packaging Cost' },
  { field: 'handlingCost', label: 'Handling Cost' },
  { field: 'otherCosts', label: 'Other Costs' },
  { field: 'returnRatePercent', label: 'Return Rate %' },
  { field: 'damageRatePercent', label: 'Damage Rate %' },
  { field: 'customDutyPercent', label: 'Custom Duty %' },
  { field: 'freightPercent', label: 'Freight %' },
  { field: 'currentSellingPrice', label: 'Current Selling Price' },
  { field: 'taxRatePercent', label: 'Tax Rate %' },
  { field: 'taxTreatment', label: 'Tax Treatment' },
  { field: 'marketplaceFeePercent', label: 'Marketplace Fee %' },
  { field: 'marketplaceFeeFixed', label: 'Marketplace Fixed Fee' },
  { field: 'paymentFeePercent', label: 'Payment Fee %' },
  { field: 'paymentFeeFixed', label: 'Payment Fixed Fee' },
  { field: 'shippingChargeToCustomer', label: 'Shipping Charge to Customer' },
  { field: 'otherFeesPercent', label: 'Other Fees %' },
  { field: 'otherFeesFixed', label: 'Other Fixed Fees' },
  { field: 'purchaseTaxRatePercent', label: 'Purchase Tax Rate %' },
  { field: 'inputTaxCreditRecoverable', label: 'Input Tax Credit' },
  { field: 'inputTaxRecoverablePercent', label: 'Input Tax Recoverable %' },
  { field: 'purchaseCostTaxMode', label: 'Purchase Cost Tax Mode' },
  { field: 'feeBasePolicy', label: 'Fee Base Policy' },
];

// ============================================================
// Internal: compute differences between existing and uploaded product
// ============================================================

export function computeDuplicateDiff(
  existing: Product,
  uploaded: Product
): DuplicateDiff[] {
  const diffs: DuplicateDiff[] = [];
  for (const { field, label } of FINANCIAL_INPUT_FIELDS) {
    const current = existing[field];
    const uploadedValue = uploaded[field];
    if (!valuesEqual(current, uploadedValue)) {
      diffs.push({
        field: String(field),
        label,
        currentValue: current,
        uploadedValue,
        affectsCalculation: true,
      });
    }
  }
  // Also surface identity / metadata differences (non-financial).
  if (!valuesEqual(existing.name, uploaded.name)) {
    diffs.push({
      field: 'name',
      label: 'Product Name',
      currentValue: existing.name,
      uploadedValue: uploaded.name,
      affectsCalculation: false,
    });
  }
  if (!valuesEqual(existing.category, uploaded.category)) {
    diffs.push({
      field: 'category',
      label: 'Category',
      currentValue: existing.category,
      uploadedValue: uploaded.category,
      affectsCalculation: true,
    });
  }
  if (!valuesEqual(existing.brand, uploaded.brand)) {
    diffs.push({
      field: 'brand',
      label: 'Brand',
      currentValue: existing.brand,
      uploadedValue: uploaded.brand,
      affectsCalculation: true,
    });
  }
  return diffs;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    // Use a small epsilon for floating-point comparison.
    return Math.abs(a - b) < 0.0001;
  }
  return a === b;
}

// ============================================================
// Internal: detect whether any financial input changed
// ============================================================

function hasFinancialChange(diffs: DuplicateDiff[]): boolean {
  return diffs.some(d => d.affectsCalculation);
}

// ============================================================
// Main Entry Point
// ============================================================

export function reconcileDuplicate(
  input: DuplicateReconciliationInput,
  businessSettings: BusinessSettings,
  pricingRules: PricingRule[]
): DuplicateReconciliationResult {
  const { existing, uploaded, strategy } = input;
  const diffs = computeDuplicateDiff(existing, uploaded);

  // ----- Strategy: keep-existing or skip -----
  if (strategy === 'keep-existing' || strategy === 'skip') {
    return {
      product: existing,
      approvalInvalidated: false,
      createdNew: false,
      skipped: true,
      message: strategy === 'keep-existing'
        ? 'Kept the existing product. No changes were made.'
        : 'Skipped this row. No changes were made.',
      appliedChanges: [],
    };
  }

  // ----- Strategy: create-copy -----
  if (strategy === 'create-copy') {
    const newProduct: Product = {
      ...uploaded,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      sku: `${uploaded.sku}-COPY`,
      lifecycleStatus: 'active',
      priceApprovalStatus: 'none',
      finalApprovedPrice: 0,
      approvedAt: '',
      isApproved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: uploaded.notes ?? '',
    };
    // Recalculate the new copy.
    const calcResult = safelyRecalculateProduct(newProduct, businessSettings, pricingRules);
    return {
      product: calcResult.product,
      approvalInvalidated: false,
      createdNew: true,
      skipped: false,
      message: `Created a separate copy with SKU "${newProduct.sku}".`,
      appliedChanges: diffs,
    };
  }

  // ----- Strategy: update-existing -----
  if (strategy === 'update-existing') {
    const financialChange = hasFinancialChange(diffs);
    const updated: Product = {
      ...existing, // preserve id, notes, tags, createdAt, etc.
      ...uploaded, // apply uploaded values
      // Re-assert preserved fields explicitly (defensive):
      id: existing.id,
      notes: existing.notes ? existing.notes : uploaded.notes,
      tags: existing.tags && existing.tags.length > 0 ? existing.tags : uploaded.tags,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      // Invalidate approval if any financial input changed.
      priceApprovalStatus: financialChange ? 'none' : existing.priceApprovalStatus,
      finalApprovedPrice: financialChange ? 0 : existing.finalApprovedPrice,
      approvedAt: financialChange ? '' : existing.approvedAt,
      isApproved: financialChange ? false : existing.isApproved,
      // Preserve import-source tracking from the upload.
      importBatchId: uploaded.importBatchId ?? existing.importBatchId,
      importSourceFileName: uploaded.importSourceFileName ?? existing.importSourceFileName,
      importSourceSheet: uploaded.importSourceSheet ?? existing.importSourceSheet,
      importOriginalRowNumber: uploaded.importOriginalRowNumber ?? existing.importOriginalRowNumber,
    };
    const calcResult = safelyRecalculateProduct(updated, businessSettings, pricingRules);
    return {
      product: calcResult.product,
      approvalInvalidated: financialChange,
      createdNew: false,
      skipped: false,
      message: financialChange
        ? 'Updated the existing product. The previous approval was removed because the product cost changed.'
        : 'Updated the existing product. No financial inputs changed, so the existing approval was preserved.',
      appliedChanges: diffs,
    };
  }

  // ----- Strategy: fill-missing -----
  if (strategy === 'fill-missing') {
    // Only copy fields from uploaded that are empty/zero on existing.
    const filled = { ...existing };
    let filledAny = false;
    const appliedChanges: DuplicateDiff[] = [];

    for (const { field, label } of FINANCIAL_INPUT_FIELDS) {
      const currentValue = existing[field];
      const uploadedValue = uploaded[field];
      if (isEmptyValue(currentValue) && !isEmptyValue(uploadedValue)) {
        (filled as Record<string, unknown>)[field as string] = uploadedValue;
        filledAny = true;
        appliedChanges.push({
          field: String(field),
          label,
          currentValue,
          uploadedValue,
          affectsCalculation: true,
        });
      }
    }

    if (!filledAny) {
      return {
        product: existing,
        approvalInvalidated: false,
        createdNew: false,
        skipped: true,
        message: 'No missing fields to fill. The existing product was left unchanged.',
        appliedChanges: [],
      };
    }

    // fill-missing only adds values where none existed, so it cannot
    // change an existing approval — but if any financial field was
    // filled, we still invalidate to be safe (the engine will recompute).
    const financialChange = hasFinancialChange(appliedChanges);
    filled.priceApprovalStatus = financialChange ? 'none' : existing.priceApprovalStatus;
    filled.finalApprovedPrice = financialChange ? 0 : existing.finalApprovedPrice;
    filled.approvedAt = financialChange ? '' : existing.approvedAt;
    filled.isApproved = financialChange ? false : existing.isApproved;
    filled.updatedAt = new Date().toISOString();

    const calcResult = safelyRecalculateProduct(filled, businessSettings, pricingRules);
    return {
      product: calcResult.product,
      approvalInvalidated: financialChange,
      createdNew: false,
      skipped: false,
      message: financialChange
        ? 'Filled in missing fields. The previous approval was removed because new financial inputs were added.'
        : 'Filled in missing fields. The existing approval was preserved.',
      appliedChanges,
    };
  }

  // Should never reach here — TypeScript exhaustiveness check.
  return {
    product: existing,
    approvalInvalidated: false,
    createdNew: false,
    skipped: true,
    message: `Unknown strategy: ${String(strategy)}. No changes were made.`,
    appliedChanges: [],
  };
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return value === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// ============================================================
// Batch Helper
// ============================================================

export interface BatchReconciliationResult {
  /** Map of existingProductId -> reconciled product. */
  updatedProducts: Product[];
  /** New products created via create-copy. */
  newProducts: Product[];
  /** SKUs that were skipped (keep-existing / skip). */
  skippedSkus: string[];
  /** Messages for the UI. */
  messages: string[];
  /** True if any approval was invalidated. */
  anyApprovalInvalidated: boolean;
}

export function reconcileDuplicates(
  inputs: DuplicateReconciliationInput[],
  businessSettings: BusinessSettings,
  pricingRules: PricingRule[]
): BatchReconciliationResult {
  const updatedProducts: Product[] = [];
  const newProducts: Product[] = [];
  const skippedSkus: string[] = [];
  const messages: string[] = [];
  let anyApprovalInvalidated = false;

  for (const input of inputs) {
    const result = reconcileDuplicate(input, businessSettings, pricingRules);
    messages.push(`[${input.uploaded.sku || input.uploaded.name}] ${result.message}`);
    if (result.createdNew) {
      newProducts.push(result.product);
    } else if (!result.skipped) {
      updatedProducts.push(result.product);
    } else {
      skippedSkus.push(input.uploaded.sku);
    }
    if (result.approvalInvalidated) {
      anyApprovalInvalidated = true;
    }
  }

  return {
    updatedProducts,
    newProducts,
    skippedSkus,
    messages,
    anyApprovalInvalidated,
  };
}
