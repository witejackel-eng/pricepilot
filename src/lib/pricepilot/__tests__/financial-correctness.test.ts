/**
 * Financial correctness tests — verify the canonical pricing engine
 * produces the exact expected numbers for three canonical scenarios
 * described in the stability spec.
 *
 * Scenario 1: Tax exempt
 *   Purchase cost: ₹100
 *   Selling price: ₹125
 *   Fees: 0
 *   Expected profit: ₹25
 *   Expected margin: 20%
 *
 * Scenario 2: Tax inclusive
 *   Purchase cost: ₹100
 *   Selling price: ₹150
 *   GST: 20%
 *   Expected net revenue: ₹125
 *   Expected GST: ₹25
 *   Expected profit: ₹25
 *
 * Scenario 3: Tax exclusive
 *   Purchase cost: ₹100
 *   Base selling price: ₹125
 *   GST: 20%
 *   Marketplace fee: 10%
 *   Customer pays: ₹150
 *   Marketplace fee: ₹12.50
 *   Profit: ₹12.50
 */

import { describe, it, expect } from 'vitest';
import { calculateOutcomeAtPrice } from '../pricing-engine';
import { resolveEffectivePricingPolicy } from '../resolve-rule';
import { createDefaultBusinessSettings, createDefaultPricingRule, Product, BusinessSettings, PricingRule } from '../types';
import { safelyRecalculateProduct } from '../safe-calculation';

function makeSettings(overrides: Partial<BusinessSettings> = {}): BusinessSettings {
  return { ...createDefaultBusinessSettings(), ...overrides };
}

function makeRules(overrides: Partial<PricingRule> = {}): PricingRule[] {
  return [{ ...createDefaultPricingRule(), id: 'rule-1', isActive: true, ...overrides }];
}

function makeProduct(overrides: Partial<Product>): Product {
  const defaults: Product = {
    id: 'prod-fin-1',
    sku: 'FIN-1',
    name: 'Financial Test Product',
    category: '',
    brand: '',
    description: '',
    tags: [],
    purchaseCost: 100,
    shippingCost: 0,
    packagingCost: 0,
    handlingCost: 0,
    otherCosts: 0,
    returnRatePercent: 0,
    damageRatePercent: 0,
    customDutyPercent: 0,
    freightPercent: 0,
    currentSellingPrice: 125,
    competitorPrices: [],
    salesChannel: 'online-marketplace',
    taxRatePercent: 0,
    taxTreatment: 'exempt',
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
    recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isApproved: false,
    notes: '',
  };
  return { ...defaults, ...overrides } as Product;
}

describe('Financial correctness — Scenario 1: Tax exempt', () => {
  it('produces ₹25 profit and 20% margin with no fees', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 0,
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
      taxTreatment: 'exempt',
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 125,
      taxRatePercent: 0,
      taxTreatment: 'exempt',
      marketplaceFeePercent: 0,
      paymentFeePercent: 0,
    });
    const rules = makeRules({ targetMarginPercent: 20, minimumMarginPercent: 10 });
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 125,
      businessSettings: settings,
      effectiveRule,
    });

    // Profit = selling price - purchase cost - fees = 125 - 100 - 0 = 25
    expect(outcome.netProfit).toBeCloseTo(25, 1);
    // Margin = profit / selling price * 100 = 25 / 125 * 100 = 20%
    expect(outcome.effectiveMarginPercent).toBeCloseTo(20, 1);
    // Total landed cost = purchase cost (no extras) = 100
    expect(outcome.totalLandedCost).toBeCloseTo(100, 1);
    // No tax should be applied
    expect(outcome.outputTax).toBeCloseTo(0, 1);
    // No fees should be applied
    expect(outcome.totalSellingFees).toBeCloseTo(0, 1);
  });
});

describe('Financial correctness — Scenario 2: Tax inclusive', () => {
  it('extracts ₹25 GST from a ₹150 inclusive price with 20% GST', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 20,
      taxTreatment: 'inclusive',
      defaultMarketplaceFeePercent: 0,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 150,
      taxRatePercent: 20,
      taxTreatment: 'inclusive',
      marketplaceFeePercent: 0,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 150,
      businessSettings: settings,
      effectiveRule,
    });

    // Net revenue = 150 / 1.20 = 125
    expect(outcome.netSalesRevenue).toBeCloseTo(125, 1);
    // GST = 150 - 125 = 25
    expect(outcome.outputTax).toBeCloseTo(25, 1);
    // Profit = net revenue - purchase cost - fees = 125 - 100 - 0 = 25
    expect(outcome.netProfit).toBeCloseTo(25, 1);
  });
});

describe('Financial correctness — Scenario 3: Tax exclusive with marketplace fee', () => {
  it('charges ₹150 customer-payable, ₹12.50 marketplace fee, ₹12.50 profit', () => {
    const settings = makeSettings({
      defaultTaxRatePercent: 20,
      taxTreatment: 'exclusive',
      defaultMarketplaceFeePercent: 10,
      defaultPaymentFeePercent: 0,
    });
    const product = makeProduct({
      purchaseCost: 100,
      currentSellingPrice: 125, // base price
      taxRatePercent: 20,
      taxTreatment: 'exclusive',
      marketplaceFeePercent: 10,
      paymentFeePercent: 0,
    });
    const rules = makeRules();
    const effectiveRule = resolveEffectivePricingPolicy(product, rules, settings);
    const outcome = calculateOutcomeAtPrice({
      product,
      sellingPrice: 125,
      businessSettings: settings,
      effectiveRule,
    });

    // Customer pays = base + GST = 125 + (125 * 0.20) = 125 + 25 = 150
    expect(outcome.customerPayableAmount).toBeCloseTo(150, 1);
    // Marketplace fee = 10% of base selling price = 12.50
    // The marketplace percentage fee should be ~12.50 (depending on feeBasePolicy).
    // Default feeBasePolicy is 'product-price-only' so fee is on 125, not 150.
    expect(outcome.marketplacePercentageFee).toBeCloseTo(12.5, 1);
    // Profit = net revenue - cost - fees
    //   net revenue = 125 (exclusive, so gross = net)
    //   profit = 125 - 100 - 12.50 = 12.50
    expect(outcome.netProfit).toBeCloseTo(12.5, 1);
  });
});

describe('Financial correctness — engine never produces NaN/Infinity', () => {
  it('produces only finite numbers for a normal product', () => {
    const settings = makeSettings();
    const product = makeProduct({ purchaseCost: 100, currentSellingPrice: 150 });
    const rules = makeRules();
    const result = safelyRecalculateProduct(product, settings, rules);
    expect(result.success).toBe(true);
    const p = result.product;
    const numericFields = [
      p.calculatedBaseCost,
      p.calculatedTotalLandedCost,
      p.calculatedBreakEvenPrice,
      p.calculatedMarginPercent,
      p.calculatedProfitPerUnit,
      p.calculatedTotalPercentageFees,
      p.calculatedTotalFixedFees,
      p.calculatedHealthScore,
      p.recommendedPrices.breakEven,
      p.recommendedPrices.minimum,
      p.recommendedPrices.balanced,
      p.recommendedPrices.premium,
    ];
    for (const v of numericFields) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
