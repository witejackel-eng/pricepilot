/**
 * PricePilot - Product Pricing & Profit Optimiser
 * Type Definitions
 * 
 * All TypeScript type definitions for the PricePilot application.
 */

// ============================================================
// Enums / String Literal Types
// ============================================================

/** Pricing status indicating the health of a product's pricing */
export type PricingStatus =
  | 'loss-making'         // Selling below total landed cost
  | 'below-break-even'    // Selling below break-even (doesn't cover fees + minimum margin)
  | 'low-margin'          // Margin is below the healthy threshold
  | 'healthy'             // Margin is within the healthy range
  | 'high-margin'         // Margin is above the healthy range but below premium
  | 'above-market'        // Price significantly exceeds competitor average
  | 'missing-data'        // Critical data fields are missing
  | 'needs-review'        // Flagged for manual review due to unusual values
  | 'approved';           // Manually reviewed and approved

/** Rounding rules for price finalization */
export type RoundingRule =
  | 'no-rounding'           // No rounding applied
  | 'nearest-whole'         // Round to nearest whole number
  | 'nearest-5'             // Round to nearest 5
  | 'nearest-10'            // Round to nearest 10
  | 'end-in-99'             // End price in .99 (e.g., 499.99)
  | 'end-in-95'             // End price in .95 (e.g., 499.95)
  | 'end-in-9'              // End price in .9 (e.g., 499.9)
  | 'end-in-49'             // End price in .49 (e.g., 499.49)
  | 'end-in-99-whole'       // End price in 99 (e.g., 499)
  | 'custom';               // Custom rounding rule

/** Recommendation mode for pricing suggestions */
export type RecommendationMode =
  | 'minimum'       // Minimum safe price (break-even + tiny buffer)
  | 'competitive'   // Competitor-aligned pricing
  | 'balanced'      // Balance between margin and competitiveness
  | 'premium'       // Maximum margin pricing
  | 'custom';       // Custom target margin/markup

/** Profitability meter levels */
export type ProfitabilityMeter =
  | 'loss'          // Negative margin
  | 'break-even'    // ~0% margin
  | 'low-margin'    // Below healthy threshold
  | 'healthy'       // Good margin range
  | 'strong-margin'; // Excellent margin

/** Level at which a pricing rule applies */
export type RuleLevel =
  | 'global'      // Applies to all products
  | 'category'    // Applies to a specific category
  | 'brand'       // Applies to a specific brand
  | 'channel'     // Applies to a specific sales channel
  | 'product';    // Applies to a specific product (SKU)

/** Sales channel types */
export type SalesChannel =
  | 'online-marketplace'
  | 'own-website'
  | 'retail-store'
  | 'wholesale'
  | 'distributor'
  | 'offline'
  | 'other';

/** Import flow step */
export type ImportStep =
  | 'upload'       // File upload step
  | 'preview'      // Data preview step
  | 'mapping'      // Column mapping step
  | 'cleaning'     // Data cleaning step
  | 'confirmation'; // Final confirmation step

/** Warning severity levels */
export type WarningSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Pricing confidence levels */
export type PricingConfidence = 'high' | 'medium' | 'low';

/** Price approval status */
export type PriceApprovalStatus = 'none' | 'selected' | 'approved';

/** Product lifecycle status */
export type LifecycleStatus =
  | 'active'         // Fully active product
  | 'draft'          // In draft / not yet launched
  | 'missing-data'   // Missing critical data fields
  | 'needs-review'   // Flagged for manual review
  | 'approved'       // Price approved through workflow
  | 'archived';      // Archived / no longer sold

/** Input tax credit recoverability */
export type InputTaxCreditRecoverable = 'recoverable' | 'not-recoverable' | 'partially-recoverable';

/** Purchase cost tax mode */
export type PurchaseCostTaxMode = 'including-tax' | 'excluding-tax';

/** Export preset types */
export type ExportPreset =
  | 'full'           // Full product data with all calculations
  | 'summary'        // Summary view with key metrics
  | 'pricing-only'   // Only pricing-related columns
  | 'cost-analysis'  // Cost breakdown analysis
  | 'competitor'     // Competitor comparison
  | 'custom';        // Custom column selection

/** Application interface mode */
export type ApplicationMode = 'owner' | 'advanced';

/** Tax treatment types */
export type TaxTreatment =
  | 'inclusive'   // Tax included in selling price
  | 'exclusive'   // Tax added on top of selling price
  | 'exempt'      // No tax applied
  | 'reverse'     // Reverse charge mechanism
  | 'composite';  // Composite tax scheme (GST with multiple components)

// ============================================================
// Currency
// ============================================================

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  decimals: number;     // Number of decimal places (2 for most, 3 for AED historically, 0 for JPY)
  symbolPosition: 'prefix' | 'suffix';  // Symbol before or after amount
  locale: string;       // BCP 47 locale for formatting
}

/** Supported currencies with full metadata */
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', symbol: '₹',  name: 'Indian Rupee',        decimals: 2, symbolPosition: 'prefix', locale: 'en-IN' },
  { code: 'GBP', symbol: '£',  name: 'British Pound',       decimals: 2, symbolPosition: 'prefix', locale: 'en-GB' },
  { code: 'USD', symbol: '$',  name: 'US Dollar',           decimals: 2, symbolPosition: 'prefix', locale: 'en-US' },
  { code: 'EUR', symbol: '€',  name: 'Euro',                decimals: 2, symbolPosition: 'suffix', locale: 'de-DE' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',         decimals: 2, symbolPosition: 'prefix', locale: 'ar-AE' },
];

// ============================================================
// Product
// ============================================================

export interface Product {
  // --- Identification ---
  id: string;                  // Unique ID (UUID)
  sku: string;                 // SKU / product code
  name: string;                // Product name
  category: string;            // Product category
  brand: string;               // Brand name
  description: string;         // Short description
  tags: string[];              // Tags for filtering

  // --- Cost Information ---
  purchaseCost: number;        // Raw purchase / manufacturing cost
  shippingCost: number;        // Shipping / freight cost per unit
  packagingCost: number;       // Packaging cost per unit
  handlingCost: number;        // Handling / labour cost per unit
  otherCosts: number;          // Any other per-unit costs
  returnRatePercent: number;   // Expected return rate (%)
  damageRatePercent: number;   // Expected damage rate (%)
  customDutyPercent: number;   // Custom duty rate (% of purchase cost)
  freightPercent: number;      // Freight as % of purchase cost (alternative to flat shipping)

  // --- Selling Information ---
  currentSellingPrice: number; // Current selling price
  competitorPrices: CompetitorPrice[];  // Competitor price data
  salesChannel: SalesChannel;  // Primary sales channel
  taxRatePercent: number;      // Tax rate (%)
  taxTreatment: TaxTreatment;  // How tax is applied

  // --- Fee Information ---
  marketplaceFeePercent: number;   // Marketplace commission (% of selling price)
  marketplaceFeeFixed: number;     // Marketplace fixed fee per transaction
  paymentFeePercent: number;       // Payment gateway fee (%)
  paymentFeeFixed: number;         // Payment gateway fixed fee per transaction
  shippingChargeToCustomer: number; // What customer pays for shipping
  otherFeesPercent: number;        // Other percentage-based fees
  otherFeesFixed: number;          // Other fixed fees

  // --- Calculated Values (populated by engine) ---
  calculatedBaseCost: number;
  calculatedExpectedReturnCost: number;
  calculatedExpectedDamageCost: number;
  calculatedTotalLandedCost: number;
  calculatedBreakEvenPrice: number;
  calculatedMarkupPercent: number;
  calculatedMarginPercent: number;
  calculatedProfitPerUnit: number;
  calculatedTotalPercentageFees: number;
  calculatedTotalFixedFees: number;
  calculatedPricingStatus: PricingStatus;
  calculatedProfitabilityMeter: ProfitabilityMeter;
  calculatedHealthScore: number;  // 0-100 health score summarising overall pricing health

  // --- Full PriceOutcome (populated by engine) ---
  calculatedPriceOutcome?: PriceOutcome;

  // --- Recommendations (populated by engine) ---
  recommendedPrices: RecommendedPrices;
  recommendedOutcomes?: RecommendedOutcomes;

  // --- Purchase-Side Tax ---
  purchaseTaxRatePercent: number;       // Purchase-side tax rate (%) - default 0
  inputTaxCreditRecoverable: InputTaxCreditRecoverable; // Whether input tax is recoverable
  inputTaxRecoverablePercent: number;   // 0-100: percentage of input tax recoverable (for partially-recoverable)
  purchaseCostTaxMode: PurchaseCostTaxMode;             // Whether purchaseCost includes tax
  
  // --- Fee Base ---
  feeBasePolicy: FeeBasePolicy;         // What base percentage fees are calculated on

  // --- Recommendation Selection ---
  selectedRecommendationMode: RecommendationMode;  // Which recommendation mode was selected
  customRecommendedPrice: number;                   // Custom recommended price (if mode = custom)
  finalApprovedPrice: number;                       // Final approved price after workflow
  priceApprovalStatus: PriceApprovalStatus;         // Approval workflow status
  approvedAt: string;                               // ISO date when price was approved

  // --- Inventory & Sales ---
  quantity: number;                 // Current stock quantity (default 0)
  monthlyUnitsSold: number;         // Units sold last month (default 0)
  expectedMonthlyUnits: number;     // Expected monthly unit sales (default 0)

  // --- Import Tracking ---
  importBatchId?: string;           // Batch ID if imported
  importSourceFileName?: string;    // Original file name if imported
  importSourceSheet?: string;       // Sheet name in the imported file
  importOriginalRowNumber?: number; // Row number in original file if imported

  // --- Lifecycle ---
  lifecycleStatus: LifecycleStatus;  // Product lifecycle state

  // --- Metadata ---
  createdAt: string;           // ISO date string
  updatedAt: string;           // ISO date string
  isApproved: boolean;         // Manually approved flag
  notes: string;               // Free-text notes
}

export interface CompetitorPrice {
  name: string;                // Competitor name or "Competitor 1"
  price: number;               // Competitor's selling price
  url?: string;                // Link to competitor listing
  dateChecked?: string;        // ISO date when price was checked
}

export interface RecommendedPrices {
  breakEven: number;           // Break-even price (net profit = 0)
  minimum: number;             // Minimum safe price
  competitive: number;         // Competitor-aligned price
  balanced: number;            // Balanced price
  premium: number;             // Premium / high-margin price
  custom?: number;             // Custom target price (if custom mode)
  confidence?: PricingConfidence; // Confidence level of recommendations
}

// ============================================================
// Pricing Rules
// ============================================================

export interface PricingRule {
  id: string;                  // Unique ID
  name: string;                // Rule name (descriptive)
  level: RuleLevel;            // What level this rule applies at
  targetCategory?: string;     // Category name (if level = category)
  targetBrand?: string;        // Brand name (if level = brand)
  targetChannel?: SalesChannel; // Channel (if level = channel)
  targetProductId?: string;    // Product ID (if level = product)
  targetProductSku?: string;   // Product SKU (if level = product)

  // --- Margin / Markup Targets ---
  targetMarginPercent: number;  // Target margin %
  minimumMarginPercent: number; // Minimum acceptable margin %
  maximumMarginPercent: number; // Maximum margin %
  targetMarkupPercent: number;  // Target markup %
  
  // --- Rounding ---
  roundingRule: RoundingRule;
  customRoundingValue?: number;  // For custom rounding

  // --- Competitor Strategy ---
  competitorStrategy: CompetitorStrategy;

  // --- Override Settings ---
  overrideTaxRatePercent?: number;
  overrideTaxTreatment?: TaxTreatment;
  overrideMarketplaceFeePercent?: number;
  overrideMarketplaceFeeFixed?: number;
  overridePaymentFeePercent?: number;
  overridePaymentFeeFixed?: number;
  overrideOtherFeesPercent?: number;
  overrideOtherFeesFixed?: number;
  overrideFeeBasePolicy?: FeeBasePolicy;
  overrideCompetitorStrategy?: CompetitorStrategy;
  overrideMinimumProfitPerUnit?: number;
  overrideCustomRoundingValue?: number;

  // --- Priority & Metadata ---
  priority: number;            // Higher number = higher priority within same level
  isActive: boolean;           // Whether rule is active
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface CompetitorStrategy {
  mode: 'ignore' | 'match-average' | 'below-average' | 'above-average' | 'match-lowest' | 'match-highest' | 'custom-offset';
  offsetPercent?: number;      // For custom-offset: % offset from competitor base
  offsetFixed?: number;        // For custom-offset: fixed offset from competitor base
  weightPercent?: number;      // How much weight to give competitor data (0-100)
}

// ============================================================
// Business Settings
// ============================================================

export interface BusinessSettings {
  businessName: string;
  currencyCode: string;        // One of SUPPORTED_CURRENCIES codes
  country: string;             // ISO country code (IN, GB, US, etc.)
  taxTreatment: TaxTreatment;  // Default tax treatment
  defaultTaxRatePercent: number;
  defaultMarketplaceFeePercent: number;
  defaultPaymentFeePercent: number;
  defaultMarketplaceFeeFixed: number;
  defaultPaymentFeeFixed: number;
  
  // --- Default Margin Targets ---
  defaultTargetMarginPercent: number;
  defaultMinimumMarginPercent: number;
  defaultMaximumMarginPercent: number;
  
  // --- Default Cost Defaults ---
  defaultReturnRatePercent: number;
  defaultDamageRatePercent: number;
  defaultCustomDutyPercent: number;
  defaultFreightPercent: number;
  defaultShippingCost: number;
  defaultPackagingCost: number;
  defaultHandlingCost: number;
  defaultOtherCosts: number;
  
  // --- Rounding ---
  defaultRoundingRule: RoundingRule;
  customRoundingValue?: number;
  
  // --- Profitability Thresholds ---
  lowMarginThresholdPercent: number;   // Below this = low-margin
  healthyMarginMinPercent: number;     // Start of healthy range
  healthyMarginMaxPercent: number;     // End of healthy range
  strongMarginThresholdPercent: number; // Above this = strong
  aboveMarketThresholdPercent: number;  // % above competitor avg = "above market"
  
  // --- Minimum Profit ---
  minimumProfitPerUnit: number;         // Minimum absolute profit per unit required

  // --- Fee Base Policy ---
  feeBasePolicy: FeeBasePolicy;         // What base percentage fees are calculated on
  defaultOtherFeesPercent: number;      // Default other percentage-based fees
  defaultOtherFeesFixed: number;        // Default other fixed fees
  defaultInputTaxRecoverablePercent: number; // Default percentage of input tax recoverable (0-100)
  defaultPurchaseTaxRatePercent: number;      // Default purchase-side tax rate
  
  // --- Onboarding ---
  onboardingCompleted: boolean;
  onboardingStep: number;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Scenario (Saved Snapshot)
// ============================================================

export interface Scenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  
  // --- Scenario Type ---
  scenarioType: 'catalogue' | 'simulator';
  
  // --- Catalogue Snapshot Data ---
  snapshotProducts: Product[];
  snapshotPricingRules: PricingRule[];
  snapshotBusinessSettings: BusinessSettings;
  
  // --- Simulator Data ---
  simulatorInputs?: Record<string, number | string>;  // Simulator input values
  simulatorOutcome?: PriceOutcome;                    // Outcome at proposed price
  simulatorRecommendations?: RecommendedOutcomes;     // Recommendation results
  
  // --- Comparison ---
  comparisonScenarioId?: string;  // If this scenario was created by comparing with another
  isBaseline: boolean;            // Whether this is the baseline/current scenario
}

// ============================================================
// Import-Related Types
// ============================================================

export interface ColumnMapping {
  sourceColumn: string;        // Column name from the imported file
  targetField: string;         // Field name in our Product type
  confidence: number;          // Auto-detection confidence (0-1)
  isManual: boolean;           // Whether user manually set this mapping
  transform?: string;          // Optional transform: 'strip-currency', 'strip-percent', 'split-comma', 'trim'
}

export interface ImportState {
  step: ImportStep;
  fileName: string;
  fileSize: number;
  fileType: string;            // 'xlsx' | 'csv' | 'json'
  
  // --- Raw Data ---
  rawHeaders: string[];
  rawRows: Record<string, string>[];
  totalRows: number;
  
  // --- Mapping ---
  columnMappings: ColumnMapping[];
  unmappedColumns: string[];
  
  // --- Cleaning ---
  cleanedRows: Record<string, unknown>[];
  skippedRows: number;
  duplicateCount: number;
  blankFieldCount: number;
  invalidValueCount: number;
  cleaningErrors: ImportError[];
  cleaningWarnings: ImportError[];
  
  // --- Confirmation ---
  previewProducts: Partial<Product>[];
  readyToImport: boolean;
}

export interface ImportError {
  row: number;
  column: string;
  value: string;
  message: string;
  severity: WarningSeverity;
}

// ============================================================
// Import Cleaning Types (Phase 5)
// ============================================================

/** Percentage format interpretation mode */
export type PercentFormat =
  | 'auto'                // Detect automatically from column distribution
  | 'whole-percentages'   // 18 means 18%
  | 'decimal-fractions';  // 0.18 means 18%

/** How to handle rows whose SKU already exists in the import batch or in the existing catalog */
export type DuplicateHandling =
  | 'skip'        // Skip duplicate SKU rows (default) — counted in importSummary.duplicates
  | 'overwrite'   // Replace existing product with same SKU
  | 'allow';      // Import all rows, even if SKU matches

/** Cleaning options that control how imported data is processed */
export interface CleaningOptions {
  stripCurrencySymbols: boolean;     // Strip currency symbols (₹, $, £, €, ¥)
  stripGroupingCommas: boolean;      // Remove grouping commas (1,00,000 → 100000)
  parsePercentages: boolean;         // Parse percentage values (18, 18%, 0.18)
  skipBlankRequired: boolean;        // Skip rows with blank required fields
  skipDuplicateSku: boolean;         // Legacy boolean — kept for backward compatibility. When true, behaves like duplicateHandling='skip'.
  duplicateHandling: DuplicateHandling;  // How to handle duplicate SKUs (skip | overwrite | allow)
  percentFormat: PercentFormat;      // How to interpret percentage values
}

/** A row that was skipped, duplicated, or flagged during import cleaning */
export interface ImportRowIssue {
  originalRowNumber: number;
  reason: string;
  originalData: Record<string, string>;
}

/** A product draft created from an imported row, with import metadata */
export interface ImportedProductDraft {
  name?: string;
  sku?: string;
  category?: string;
  brand?: string;
  purchaseCost?: number;
  currentSellingPrice?: number;
  shippingCost?: number;
  packagingCost?: number;
  handlingCost?: number;
  otherCosts?: number;
  returnRatePercent?: number;
  damageRatePercent?: number;
  marketplaceFeePercent?: number;
  paymentFeePercent?: number;
  taxRatePercent?: number;
  description?: string;
  competitorPrices?: Array<{ name: string; price: number }>;
  quantity?: number;
  monthlyUnitsSold?: number;
  // Import metadata
  importBatchId: string;
  importSourceFileName: string;
  importOriginalRowNumber: number;
  importOriginalData: Record<string, string>;
  importSourceSheet?: string;
}

/** Statistics about the import cleaning process */
export interface ImportStatistics {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  duplicateRows: number;
  invalidRows: number;
  missingCostRows: number;
  missingPriceRows: number;
  invalidPercentRows: number;
}

/** Unified result from the import cleaning engine */
export interface CleanImportResult {
  cleanedProducts: ImportedProductDraft[];
  skippedRows: ImportRowIssue[];
  duplicateRows: ImportRowIssue[];
  invalidRows: ImportRowIssue[];
  warnings: ImportRowIssue[];
  statistics: ImportStatistics;
}

export function createDefaultCleaningOptions(): CleaningOptions {
  return {
    stripCurrencySymbols: true,
    stripGroupingCommas: true,
    parsePercentages: true,
    skipBlankRequired: true,
    skipDuplicateSku: true,
    duplicateHandling: 'skip',
    percentFormat: 'auto',
  };
}

// ============================================================
// App Settings
// ============================================================

export interface AppSettings {
  // --- Display ---
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  showCalculatedColumns: boolean;
  defaultView: 'dashboard' | 'products' | 'pricing-rules' | 'import' | 'settings' | 'scenarios';
  pageSize: number;             // Table page size (10, 20, 50, 100)
  highlightLossMaking: boolean;
  highlightAboveMarket: boolean;
  
  // --- Interface Mode ---
  applicationMode: ApplicationMode;  // 'owner' (default) or 'advanced'
  
  // --- Data ---
  autoRecalculate: boolean;     // Auto-run calculations when data changes
  confirmBeforeDelete: boolean;
  confirmBeforeBulkAction: boolean;
  
  // --- Auto-save ---
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number;   // Auto-save interval in milliseconds
  
  // --- Export ---
  defaultExportPreset: ExportPreset;
  includeCalculatedInExport: boolean;
  
  // --- Onboarding ---
  tourCompleted: boolean;         // Whether guided tour has been completed
  sampleDataLoaded: boolean;      // Whether sample/demo data is currently loaded
  
  updatedAt: string;
}

// ============================================================
// Warnings
// ============================================================

export interface Warning {
  id: string;
  productId: string;
  type: string;                 // Warning type key
  severity: WarningSeverity;
  message: string;              // Human-readable message
  detail?: string;              // Additional detail
  suggestion?: string;          // Suggested action
  field?: string;               // Product field that triggered the warning
  value?: number;               // Numeric value related to the warning
  createdAt: string;
}

// ============================================================
// Pricing Engine Types
// ============================================================

/** Engine-level pricing warning (distinct from app-level Warning) */
export interface PricingWarning {
  type: string;                 // Warning type key (e.g. 'missing-cost', 'impossible-margin')
  severity: WarningSeverity;
  message: string;              // Human-readable message
  detail?: string;              // Additional detail
  suggestion?: string;          // Suggested action
  field?: string;               // Product field that triggered the warning
  value?: number;               // Numeric value related to the warning
}

/** The complete outcome of evaluating a price through the canonical engine */
export interface PriceOutcome {
  enteredSellingPrice: number;
  customerPayableAmount: number;
  
  grossSalesAmount: number;        // Gross sales (inclusive: selling price; exclusive: net revenue)
  netSalesRevenue: number;         // Revenue after removing output tax
  outputTax: number;

  grossPurchaseCost: number;       // Purchase cost before tax adjustments
  netPurchaseCost: number;         // Purchase cost after removing recoverable input tax
  recoverableInputTax: number;
  nonRecoverableInputTax: number;
  
  purchaseCost: number;            // Base purchase cost (same as product.purchaseCost)
  fixedProductCosts: number;       // Shipping + packaging + handling + other
  expectedReturnCost: number;
  expectedDamageCost: number;
  customDutyCost: number;
  totalLandedCost: number;
  
  marketplacePercentageFee: number;
  marketplaceFixedFee: number;
  paymentPercentageFee: number;
  paymentFixedFee: number;
  otherPercentageFees: number;
  otherFixedFees: number;
  totalSellingFees: number;
  
  totalCostPerSuccessfulSale: number;
  netProfit: number;
  effectiveMarginPercent: number;
  markupPercent: number;
  
  isProfitable: boolean;
  isBreakEven: boolean;
  satisfiesMinimumMargin: boolean;
  satisfiesTargetMargin: boolean;
  satisfiesMinimumProfit: boolean;
  warnings: PricingWarning[];
  confidence: PricingConfidence;
}

/** Resolved pricing policy with source tracing.
 * 
 * THE SINGLE AUTHORITY for all effective policy values.
 * Every field is resolved independently from the highest-priority source:
 * Product > Brand > Category > Channel > Global > BusinessSettings defaults
 * 
 * Components must read final values directly from this interface.
 * sourceTrace is for explanation and auditability only.
 */
export interface ResolvedPricingPolicy {
  // --- Margin Targets ---
  targetMarginPercent: number;
  minimumMarginPercent: number;
  premiumMarginPercent: number;
  minimumProfitPerUnit: number;
  
  // --- Tax ---
  taxRatePercent: number;
  taxTreatment: TaxTreatment;
  
  // --- Marketplace Fees ---
  marketplaceFeePercent: number;
  marketplaceFeeFixed: number;
  
  // --- Payment Fees ---
  paymentFeePercent: number;
  paymentFeeFixed: number;
  
  // --- Other Fees ---
  otherFeesPercent: number;
  otherFeesFixed: number;
  
  // --- Competitor Strategy ---
  competitorStrategy: CompetitorStrategy;
  
  // --- Rounding ---
  roundingRule: RoundingRule;
  customRoundingValue?: number;
  
  // --- Fee Base Policy ---
  feeBasePolicy: FeeBasePolicy;
  
  // --- Purchase-Side Tax ---
  inputTaxRecoverablePercent: number;  // 0-100: percentage of input tax that is recoverable
  
  // --- Source tracing - shows which rule provided each value ---
  sourceTrace: Record<string, { value: number | string | object; source: string }>;
}

/** Policy for what selling-price base percentage fees are calculated on */
export type FeeBasePolicy =
  | 'product-price-only'            // Fees on product selling price only
  | 'product-price-plus-shipping'   // Fees on product price + customer shipping
  | 'customer-payable-gross';       // Fees on total customer-payable amount

/** Recommendation result status */
export type RecommendationStatus =
  | 'success'              // A valid recommendation was found
  | 'missing-data'         // Critical data missing (e.g. no purchase cost)
  | 'impossible'           // No price satisfies the constraints
  | 'market-conflict'      // Competitor data conflicts with minimum safe price
  | 'unresolved';          // Rounding could not find a safe value

/** Recommendation result with structured outcome */
export interface RecommendationResult {
  mode: 'break-even' | 'minimum' | 'competitive' | 'balanced' | 'premium';
  status: RecommendationStatus;
  rawPrice?: number;            // Price before rounding
  finalPrice?: number;          // Price after rounding and validation
  outcome?: PriceOutcome;       // Full outcome at the recommended price
  confidence: PricingConfidence;
  warnings: PricingWarning[];
  explanation: string;          // Human-readable explanation of how the price was determined
}

/** All recommendation outcomes for a product */
export interface RecommendedOutcomes {
  breakEven: RecommendationResult;
  minimum: RecommendationResult;
  competitive: RecommendationResult;
  balanced: RecommendationResult;
  premium: RecommendationResult;
}

// ============================================================
// Export Config
// ============================================================

export interface ExportConfig {
  preset: ExportPreset;
  columns: string[];            // Specific columns for custom preset
  includeHeaders: boolean;
  format: 'xlsx' | 'csv';
  currencyCode: string;
  includeTimestamp: boolean;
  sheetName: string;
}

// ============================================================
// Default Values Factory
// ============================================================

export function createDefaultBusinessSettings(): BusinessSettings {
  return {
    businessName: '',
    currencyCode: 'INR',
    country: 'IN',
    taxTreatment: 'inclusive',
    defaultTaxRatePercent: 18,
    defaultMarketplaceFeePercent: 5,
    defaultPaymentFeePercent: 2,
    defaultMarketplaceFeeFixed: 0,
    defaultPaymentFeeFixed: 0,
    defaultTargetMarginPercent: 25,
    defaultMinimumMarginPercent: 10,
    defaultMaximumMarginPercent: 60,
    defaultReturnRatePercent: 2,
    defaultDamageRatePercent: 1,
    defaultCustomDutyPercent: 0,
    defaultFreightPercent: 0,
    defaultShippingCost: 0,
    defaultPackagingCost: 0,
    defaultHandlingCost: 0,
    defaultOtherCosts: 0,
    defaultRoundingRule: 'no-rounding',
    lowMarginThresholdPercent: 10,
    healthyMarginMinPercent: 15,
    healthyMarginMaxPercent: 40,
    strongMarginThresholdPercent: 40,
    aboveMarketThresholdPercent: 30,
    minimumProfitPerUnit: 0,
    feeBasePolicy: 'product-price-only',
    defaultOtherFeesPercent: 0,
    defaultOtherFeesFixed: 0,
    defaultInputTaxRecoverablePercent: 100,
    defaultPurchaseTaxRatePercent: 0,
    onboardingCompleted: false,
    onboardingStep: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultProduct(): Partial<Product> {
  return {
    id: '',
    sku: '',
    name: '',
    category: '',
    brand: '',
    description: '',
    tags: [],
    purchaseCost: 0,
    shippingCost: 0,
    packagingCost: 0,
    handlingCost: 0,
    otherCosts: 0,
    returnRatePercent: 0,
    damageRatePercent: 0,
    customDutyPercent: 0,
    freightPercent: 0,
    currentSellingPrice: 0,
    competitorPrices: [],
    salesChannel: 'online-marketplace',
    taxRatePercent: 0,
    taxTreatment: 'inclusive',
    marketplaceFeePercent: 0,
    marketplaceFeeFixed: 0,
    paymentFeePercent: 0,
    paymentFeeFixed: 0,
    shippingChargeToCustomer: 0,
    otherFeesPercent: 0,
    otherFeesFixed: 0,
    calculatedBaseCost: 0,
    calculatedExpectedReturnCost: 0,
    calculatedExpectedDamageCost: 0,
    calculatedTotalLandedCost: 0,
    calculatedBreakEvenPrice: 0,
    calculatedMarkupPercent: 0,
    calculatedMarginPercent: 0,
    calculatedProfitPerUnit: 0,
    calculatedTotalPercentageFees: 0,
    calculatedTotalFixedFees: 0,
    calculatedPricingStatus: 'missing-data',
    calculatedProfitabilityMeter: 'loss',
    calculatedHealthScore: 0,
    purchaseTaxRatePercent: 0,
    inputTaxCreditRecoverable: 'not-recoverable',
    inputTaxRecoverablePercent: 100,
    purchaseCostTaxMode: 'excluding-tax',
    feeBasePolicy: 'product-price-only',
    selectedRecommendationMode: 'balanced',
    customRecommendedPrice: 0,
    finalApprovedPrice: 0,
    priceApprovalStatus: 'none',
    approvedAt: '',
    quantity: 0,
    monthlyUnitsSold: 0,
    expectedMonthlyUnits: 0,
    lifecycleStatus: 'active',
    recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isApproved: false,
    notes: '',
  };
}

export function createDefaultPricingRule(): PricingRule {
  return {
    id: '',
    name: '',
    level: 'global',
    targetMarginPercent: 25,
    minimumMarginPercent: 10,
    maximumMarginPercent: 60,
    targetMarkupPercent: 33,
    roundingRule: 'no-rounding',
    competitorStrategy: {
      mode: 'match-average',
      weightPercent: 30,
    },
    priority: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: '',
  };
}

export function createDefaultAppSettings(): AppSettings {
  return {
    theme: 'system',
    compactMode: false,
    showCalculatedColumns: true,
    defaultView: 'dashboard',
    pageSize: 20,
    highlightLossMaking: true,
    highlightAboveMarket: true,
    applicationMode: 'owner',
    autoRecalculate: true,
    confirmBeforeDelete: true,
    confirmBeforeBulkAction: true,
    autoSaveEnabled: true,
    autoSaveIntervalMs: 30000,
    defaultExportPreset: 'full',
    includeCalculatedInExport: true,
    tourCompleted: false,
    sampleDataLoaded: false,
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultImportState(): ImportState {
  return {
    step: 'upload',
    fileName: '',
    fileSize: 0,
    fileType: '',
    rawHeaders: [],
    rawRows: [],
    totalRows: 0,
    columnMappings: [],
    unmappedColumns: [],
    cleanedRows: [],
    skippedRows: 0,
    duplicateCount: 0,
    blankFieldCount: 0,
    invalidValueCount: 0,
    cleaningErrors: [],
    cleaningWarnings: [],
    previewProducts: [],
    readyToImport: false,
  };
}
