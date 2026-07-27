/**
 * PricePilot - Sample Product Data
 *
 * 12 fictional products across 5 categories:
 * - CCTV Cameras (3 products)
 * - Biometric Devices (2 products)
 * - Headsets (2 products)
 * - Network Equipment (3 products)
 * - Office Electronics (2 products)
 *
 * All values are fictional and realistic for the Indian market (INR).
 * Clearly marked as fictional. Calculated values are left at defaults
 * and should be populated by running the calculation engine.
 */

import { Product, PricingRule, CompetitorPrice, SalesChannel, TaxTreatment, InputTaxCreditRecoverable, PurchaseCostTaxMode, RecommendationMode, PriceApprovalStatus } from './types';

// ============================================================
// Helper for generating IDs
// ============================================================

function generateId(index: number): string {
  return `sample-prod-${index.toString().padStart(3, '0')}`;
}

/** Default values for the new Phase 2 engine fields */
const ENGINE_DEFAULTS = {
  purchaseTaxRatePercent: 18,
  inputTaxCreditRecoverable: 'recoverable' as InputTaxCreditRecoverable,
  purchaseCostTaxMode: 'including-tax' as PurchaseCostTaxMode,
  selectedRecommendationMode: 'balanced' as RecommendationMode,
  customRecommendedPrice: 0,
  finalApprovedPrice: 0,
  priceApprovalStatus: 'none' as PriceApprovalStatus,
  approvedAt: '',
  quantity: 50,
  monthlyUnitsSold: 0,
  expectedMonthlyUnits: 0,
};

/** Apply the new engine fields to a partial product definition */
function withEngineFields(base: Omit<Product, keyof typeof ENGINE_DEFAULTS>): Product {
  return { ...base, ...ENGINE_DEFAULTS } as Product;
}

// ============================================================
// CCTV Cameras
// ============================================================

const cctvCamera1 = withEngineFields({
  id: generateId(1),
  sku: 'CCTV-HD-360',
  name: 'SecureView 360° HD Dome Camera',
  category: 'CCTV Cameras',
  brand: 'SecureView',
  description: 'Fictional 360-degree HD dome security camera with night vision, motion detection, and weather-resistant housing. Ideal for indoor and outdoor surveillance.',
  tags: ['cctv', 'camera', 'dome', 'hd', '360-degree', 'security'],

  // Cost Information
  purchaseCost: 2450,
  shippingCost: 120,
  packagingCost: 45,
  handlingCost: 30,
  otherCosts: 25,
  returnRatePercent: 3.5,
  damageRatePercent: 0.8,
  customDutyPercent: 0,
  freightPercent: 0,

  // Selling Information
  currentSellingPrice: 4999,
  competitorPrices: [
    { name: 'SafeEye', price: 5200, dateChecked: '2024-11-15' },
    { name: 'WatchGuard Pro', price: 4800, dateChecked: '2024-11-10' },
    { name: 'DigiSecure', price: 5050, dateChecked: '2024-11-12' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  // Fee Information
  marketplaceFeePercent: 8,
  marketplaceFeeFixed: 25,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 3,
  shippingChargeToCustomer: 0,
  otherFeesPercent: 0,
  otherFeesFixed: 0,

  // Calculated Values (defaults — to be populated by engine)
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  // Metadata
  createdAt: '2024-10-01T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product for demo purposes. Popular mid-range dome camera.',
});

const cctvCamera2 = withEngineFields({
  id: generateId(2),
  sku: 'CCTV-BT-1080',
  name: 'TrailEyes 1080p Bullet Camera',
  category: 'CCTV Cameras',
  brand: 'TrailEyes',
  description: 'Fictional 1080p bullet-style outdoor CCTV camera with 30m IR range, IP66 weatherproof rating, and wide-angle lens.',
  tags: ['cctv', 'camera', 'bullet', '1080p', 'outdoor', 'security'],

  purchaseCost: 1800,
  shippingCost: 95,
  packagingCost: 35,
  handlingCost: 20,
  otherCosts: 15,
  returnRatePercent: 2.0,
  damageRatePercent: 1.2,
  customDutyPercent: 0,
  freightPercent: 0,

  currentSellingPrice: 3499,
  competitorPrices: [
    { name: 'SafeEye', price: 3600, dateChecked: '2024-11-14' },
    { name: 'VisionTech', price: 3300, dateChecked: '2024-11-11' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 8,
  marketplaceFeeFixed: 25,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 3,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-02T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Entry-level bullet camera for outdoor use.',
});

const cctvCamera3 = withEngineFields({
  id: generateId(3),
  sku: 'CCTV-PTZ-4K',
  name: 'OmniWatch 4K PTZ Camera',
  category: 'CCTV Cameras',
  brand: 'OmniWatch',
  description: 'Fictional 4K PTZ (Pan-Tilt-Zoom) security camera with 25x optical zoom, auto-tracking, and enterprise-grade video analytics.',
  tags: ['cctv', 'camera', 'ptz', '4k', 'enterprise', 'security'],

  purchaseCost: 12000,
  shippingCost: 350,
  packagingCost: 120,
  handlingCost: 80,
  otherCosts: 50,
  returnRatePercent: 1.5,
  damageRatePercent: 0.5,
  customDutyPercent: 5,
  freightPercent: 0,

  currentSellingPrice: 24999,
  competitorPrices: [
    { name: 'ProSecure', price: 26500, dateChecked: '2024-11-15' },
    { name: 'WatchGuard Pro', price: 23000, dateChecked: '2024-11-10' },
    { name: 'SafeEye', price: 25500, dateChecked: '2024-11-12' },
    { name: 'DigiSecure', price: 24000, dateChecked: '2024-11-13' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 5,
  marketplaceFeeFixed: 50,
  paymentFeePercent: 2,
  paymentFeeFixed: 5,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-03T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. High-end PTZ camera for enterprise use. Includes 5% custom duty.',
});

// ============================================================
// Biometric Devices
// ============================================================

const biometric1 = withEngineFields({
  id: generateId(4),
  sku: 'BIO-FP-PRO',
  name: 'IdentiTouch Pro Fingerprint Scanner',
  category: 'Biometric Devices',
  brand: 'IdentiTouch',
  description: 'Fictional high-precision fingerprint biometric scanner with live finger detection, USB connectivity, and SDK for integration.',
  tags: ['biometric', 'fingerprint', 'scanner', 'access-control', 'security'],

  purchaseCost: 4500,
  shippingCost: 150,
  packagingCost: 80,
  handlingCost: 45,
  otherCosts: 30,
  returnRatePercent: 1.5,
  damageRatePercent: 0.5,
  customDutyPercent: 0,
  freightPercent: 0,

  currentSellingPrice: 8999,
  competitorPrices: [
    { name: 'BioScan', price: 8500, dateChecked: '2024-11-15' },
    { name: 'SecurePrint', price: 9200, dateChecked: '2024-11-10' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 6,
  marketplaceFeeFixed: 30,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 3,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-04T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Professional fingerprint scanner for office security.',
});

const biometric2 = withEngineFields({
  id: generateId(5),
  sku: 'BIO-FACE-ULTRA',
  name: 'FaceGate Ultra Facial Recognition Terminal',
  category: 'Biometric Devices',
  brand: 'FaceGate',
  description: 'Fictional AI-powered facial recognition terminal with dual-camera 3D depth sensing, mask detection, and temperature screening.',
  tags: ['biometric', 'facial-recognition', 'terminal', 'access-control', 'ai'],

  purchaseCost: 18500,
  shippingCost: 400,
  packagingCost: 150,
  handlingCost: 100,
  otherCosts: 75,
  returnRatePercent: 1.0,
  damageRatePercent: 0.3,
  customDutyPercent: 10,
  freightPercent: 0,

  currentSellingPrice: 34999,
  competitorPrices: [
    { name: 'BioScan', price: 36000, dateChecked: '2024-11-15' },
    { name: 'SecurePrint', price: 33000, dateChecked: '2024-11-10' },
    { name: 'FaceAuth', price: 34500, dateChecked: '2024-11-12' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 4,
  marketplaceFeeFixed: 75,
  paymentFeePercent: 2,
  paymentFeeFixed: 5,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-05T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Advanced facial recognition with 10% custom duty (imported component).',
});

// ============================================================
// Headsets
// ============================================================

const headset1 = withEngineFields({
  id: generateId(6),
  sku: 'HS-NC-500',
  name: 'CallPro 500 Noise-Cancelling Headset',
  category: 'Headsets',
  brand: 'CallPro',
  description: 'Fictional over-ear noise-cancelling headset designed for call centres and office use. USB + Bluetooth dual connectivity.',
  tags: ['headset', 'noise-cancelling', 'bluetooth', 'usb', 'call-centre', 'office'],

  purchaseCost: 2200,
  shippingCost: 85,
  packagingCost: 60,
  handlingCost: 35,
  otherCosts: 20,
  returnRatePercent: 4.0,
  damageRatePercent: 1.5,
  customDutyPercent: 0,
  freightPercent: 0,

  currentSellingPrice: 4499,
  competitorPrices: [
    { name: 'ClearVoice', price: 4200, dateChecked: '2024-11-14' },
    { name: 'SoundWork', price: 4700, dateChecked: '2024-11-11' },
    { name: 'TalkEase', price: 4350, dateChecked: '2024-11-12' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 8,
  marketplaceFeeFixed: 25,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 3,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-06T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Popular call-centre headset with higher return rate (sizing issues).',
});

const headset2 = withEngineFields({
  id: generateId(7),
  sku: 'HS-BT-LITE',
  name: 'EchoLite Bluetooth Earhook Headset',
  category: 'Headsets',
  brand: 'EchoLite',
  description: 'Fictional lightweight single-ear Bluetooth headset for mobile professionals. 12-hour battery, echo cancellation.',
  tags: ['headset', 'bluetooth', 'earhook', 'mobile', 'lightweight'],

  purchaseCost: 850,
  shippingCost: 45,
  packagingCost: 25,
  handlingCost: 15,
  otherCosts: 10,
  returnRatePercent: 5.0,
  damageRatePercent: 2.0,
  customDutyPercent: 0,
  freightPercent: 0,

  currentSellingPrice: 1999,
  competitorPrices: [
    { name: 'ClearVoice', price: 1800, dateChecked: '2024-11-14' },
    { name: 'TalkEase', price: 2100, dateChecked: '2024-11-11' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 10,
  marketplaceFeeFixed: 15,
  paymentFeePercent: 3,
  paymentFeeFixed: 3,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-07T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Budget earhook headset. Higher return and damage rates typical for low-cost electronics.',
});

// ============================================================
// Network Equipment
// ============================================================

const network1 = withEngineFields({
  id: generateId(8),
  sku: 'NET-SW-24P',
  name: 'LinkForge 24-Port Managed Switch',
  category: 'Network Equipment',
  brand: 'LinkForge',
  description: 'Fictional 24-port Gigabit managed network switch with VLAN support, QoS, and web-based management interface.',
  tags: ['network', 'switch', 'managed', '24-port', 'gigabit', 'vlan'],

  purchaseCost: 5500,
  shippingCost: 200,
  packagingCost: 100,
  handlingCost: 60,
  otherCosts: 40,
  returnRatePercent: 1.0,
  damageRatePercent: 0.3,
  customDutyPercent: 0,
  freightPercent: 2,

  currentSellingPrice: 11999,
  competitorPrices: [
    { name: 'NetBridge', price: 11500, dateChecked: '2024-11-15' },
    { name: 'DataLink Pro', price: 12500, dateChecked: '2024-11-10' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 5,
  marketplaceFeeFixed: 35,
  paymentFeePercent: 2,
  paymentFeeFixed: 5,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-08T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Enterprise-grade managed switch. 2% freight on purchase cost.',
});

const network2 = withEngineFields({
  id: generateId(9),
  sku: 'NET-AP-W6',
  name: 'AirWave Wi-Fi 6 Access Point',
  category: 'Network Equipment',
  brand: 'AirWave',
  description: 'Fictional Wi-Fi 6 (802.11ax) dual-band access point with MU-MIMO, OFDMA, and PoE support. Ceiling-mount design.',
  tags: ['network', 'wifi', 'access-point', 'wifi-6', 'poe', 'enterprise'],

  purchaseCost: 3800,
  shippingCost: 120,
  packagingCost: 65,
  handlingCost: 40,
  otherCosts: 25,
  returnRatePercent: 1.5,
  damageRatePercent: 0.5,
  customDutyPercent: 0,
  freightPercent: 1.5,

  currentSellingPrice: 7999,
  competitorPrices: [
    { name: 'NetBridge', price: 7500, dateChecked: '2024-11-15' },
    { name: 'SignalMax', price: 8200, dateChecked: '2024-11-10' },
    { name: 'DataLink Pro', price: 7800, dateChecked: '2024-11-12' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 5,
  marketplaceFeeFixed: 30,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 3,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-09T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Wi-Fi 6 AP with 1.5% freight on purchase cost.',
});

const network3 = withEngineFields({
  id: generateId(10),
  sku: 'NET-RTR-BIZ',
  name: 'LinkForge Business VPN Router',
  category: 'Network Equipment',
  brand: 'LinkForge',
  description: 'Fictional business-grade VPN router with dual-WAN, firewall, IPS/IDS, and 10G SFP+ uplink. Designed for SMEs.',
  tags: ['network', 'router', 'vpn', 'dual-wan', 'firewall', 'business'],

  purchaseCost: 8000,
  shippingCost: 300,
  packagingCost: 150,
  handlingCost: 80,
  otherCosts: 60,
  returnRatePercent: 0.8,
  damageRatePercent: 0.2,
  customDutyPercent: 0,
  freightPercent: 2.5,

  currentSellingPrice: 15999,
  competitorPrices: [
    { name: 'NetBridge', price: 16000, dateChecked: '2024-11-15' },
    { name: 'SecureRoute', price: 14500, dateChecked: '2024-11-10' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 4,
  marketplaceFeeFixed: 50,
  paymentFeePercent: 2,
  paymentFeeFixed: 5,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-10T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Business VPN router with 2.5% freight on purchase cost.',
});

// ============================================================
// Office Electronics
// ============================================================

const office1 = withEngineFields({
  id: generateId(11),
  sku: 'OFC-PRN-MFP',
  name: 'DocuPrint 4-in-1 MFP Printer',
  category: 'Office Electronics',
  brand: 'DocuPrint',
  description: 'Fictional multifunction printer (print, scan, copy, fax) with A3 support, auto-duplex, and network connectivity.',
  tags: ['printer', 'mfp', 'scanner', 'copier', 'a3', 'office'],

  purchaseCost: 15000,
  shippingCost: 500,
  packagingCost: 200,
  handlingCost: 150,
  otherCosts: 100,
  returnRatePercent: 2.0,
  damageRatePercent: 0.8,
  customDutyPercent: 0,
  freightPercent: 3,

  currentSellingPrice: 29999,
  competitorPrices: [
    { name: 'PrintMax', price: 32000, dateChecked: '2024-11-15' },
    { name: 'PaperFlow', price: 28000, dateChecked: '2024-11-10' },
    { name: 'OfficePro', price: 30500, dateChecked: '2024-11-12' },
  ],
  salesChannel: 'own-website' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 0,
  marketplaceFeeFixed: 0,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 5,
  shippingChargeToCustomer: 500,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-11T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Sold on own website (no marketplace fee). Customer pays ₹500 shipping. 3% freight on purchase.',
});

const office2 = withEngineFields({
  id: generateId(12),
  sku: 'OFC-PB-SHRED',
  name: 'ShredGuard Auto Paper Shredder',
  category: 'Office Electronics',
  brand: 'ShredGuard',
  description: 'Fictional cross-cut paper shredder with auto-feed, 20-sheet capacity, CD/credit card slot, and auto-reverse anti-jam.',
  tags: ['shredder', 'paper', 'cross-cut', 'office', 'security'],

  purchaseCost: 6500,
  shippingCost: 250,
  packagingCost: 120,
  handlingCost: 80,
  otherCosts: 50,
  returnRatePercent: 1.5,
  damageRatePercent: 0.5,
  customDutyPercent: 0,
  freightPercent: 1,

  currentSellingPrice: 12999,
  competitorPrices: [
    { name: 'CutPro', price: 13500, dateChecked: '2024-11-15' },
    { name: 'SafeShred', price: 12000, dateChecked: '2024-11-10' },
  ],
  salesChannel: 'online-marketplace' as SalesChannel,
  taxRatePercent: 18,
  taxTreatment: 'inclusive' as TaxTreatment,

  marketplaceFeePercent: 7,
  marketplaceFeeFixed: 40,
  paymentFeePercent: 2.5,
  paymentFeeFixed: 3,
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
  recommendedPrices: { breakEven: 0, minimum: 0, competitive: 0, balanced: 0, premium: 0, confidence: 'low' },

  createdAt: '2024-10-12T10:00:00Z',
  updatedAt: '2024-12-01T10:00:00Z',
  isApproved: false,
  notes: 'Fictional product. Cross-cut shredder with 1% freight on purchase cost.',
});

// ============================================================
// All Sample Products
// ============================================================

export const SAMPLE_PRODUCTS: Product[] = [
  cctvCamera1,
  cctvCamera2,
  cctvCamera3,
  biometric1,
  biometric2,
  headset1,
  headset2,
  network1,
  network2,
  network3,
  office1,
  office2,
];

/**
 * Sample pricing rules for demonstration.
 */
export const SAMPLE_PRICING_RULES: PricingRule[] = [
  {
    id: 'sample-rule-global',
    name: 'Global Default Rule',
    level: 'global',
    targetMarginPercent: 25,
    minimumMarginPercent: 10,
    maximumMarginPercent: 60,
    targetMarkupPercent: 33,
    roundingRule: 'end-in-99-whole',
    competitorStrategy: {
      mode: 'match-average',
      weightPercent: 30,
    },
    priority: 0,
    isActive: true,
    createdAt: '2024-10-01T10:00:00Z',
    updatedAt: '2024-12-01T10:00:00Z',
    notes: 'Fictional. Default global rule with end-in-99 rounding.',
  },
  {
    id: 'sample-rule-cctv',
    name: 'CCTV Camera Category Rule',
    level: 'category',
    targetCategory: 'CCTV Cameras',
    targetMarginPercent: 30,
    minimumMarginPercent: 15,
    maximumMarginPercent: 55,
    targetMarkupPercent: 43,
    roundingRule: 'end-in-99-whole',
    competitorStrategy: {
      mode: 'match-average',
      weightPercent: 40,
    },
    priority: 5,
    isActive: true,
    createdAt: '2024-10-02T10:00:00Z',
    updatedAt: '2024-12-01T10:00:00Z',
    notes: 'Fictional. CCTV cameras have higher margin targets due to longer sales cycles.',
  },
  {
    id: 'sample-rule-headset',
    name: 'Headset Category Rule',
    level: 'category',
    targetCategory: 'Headsets',
    targetMarginPercent: 20,
    minimumMarginPercent: 8,
    maximumMarginPercent: 45,
    targetMarkupPercent: 25,
    roundingRule: 'end-in-99',
    competitorStrategy: {
      mode: 'below-average',
      offsetPercent: 3,
      weightPercent: 50,
    },
    priority: 5,
    isActive: true,
    createdAt: '2024-10-03T10:00:00Z',
    updatedAt: '2024-12-01T10:00:00Z',
    notes: 'Fictional. Headsets are competitive market; price slightly below average.',
  },
  {
    id: 'sample-rule-linkforge',
    name: 'LinkForge Brand Rule',
    level: 'brand',
    targetBrand: 'LinkForge',
    targetMarginPercent: 35,
    minimumMarginPercent: 18,
    maximumMarginPercent: 65,
    targetMarkupPercent: 54,
    roundingRule: 'nearest-10',
    competitorStrategy: {
      mode: 'above-average',
      offsetPercent: 5,
      weightPercent: 25,
    },
    priority: 10,
    isActive: true,
    createdAt: '2024-10-04T10:00:00Z',
    updatedAt: '2024-12-01T10:00:00Z',
    notes: 'Fictional. LinkForge is positioned as premium brand; price slightly above competitors.',
  },
];


