'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { buildNonEmptyOptions, UNCATEGORISED_FILTER, UNKNOWN_BRAND_FILTER, categoryMatchesFilter, brandMatchesFilter, categoryFilterLabel, brandFilterLabel } from '@/lib/pricepilot/safe-select';
import { toast } from 'sonner';
import { Package, TrendingUp, TrendingDown, AlertTriangle, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Plus, FileUp, DollarSign, ShieldAlert, Target, RefreshCw, CheckCircle2, HeartPulse, Lightbulb } from 'lucide-react';
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  BarChart as RechartsBar,
  Bar,
  AreaChart as RechartsArea,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { PriceOutcome, PricingStatus } from '@/lib/pricepilot/types';

const COLORS = {
  lossMaking: '#ef4444',
  belowBreakEven: '#f97316',
  lowMargin: '#f59e0b',
  healthy: '#22c55e',
  highMargin: '#10b981',
  aboveMarket: '#3b82f6',
  missingData: '#94a3b8',
  needsReview: '#8b5cf6',
  approved: '#22c55e',
  increase: '#22c55e',
  noChange: '#94a3b8',
  decrease: '#ef4444',
  review: '#8b5cf6',
};

// Custom tooltip component for charts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white shadow-lg rounded-lg border border-slate-100 px-4 py-3">
      {label && <p className="text-xs font-semibold text-slate-500 mb-1.5">{label}</p>}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-800">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// Custom legend renderer
function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload) return null;
  return (
    <div className="flex items-center justify-center gap-4 pt-2 pb-1">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-xs font-medium text-slate-500">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// Custom tooltip for the margin distribution histogram (shows bucket range + count)
function MarginBucketTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; payload: { label: string; range: string; count: number } }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="bg-white shadow-lg rounded-lg border border-slate-100 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500 mb-1.5">{entry.payload.range ?? label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
        <span className="text-slate-600">Products:</span>
        <span className="font-semibold text-slate-800">{entry.value}</span>
      </div>
    </div>
  );
}

/**
 * Helper: Get the PriceOutcome for a product from stored data.
 * Falls back to stored calculated fields if PriceOutcome is not stored.
 */
function getOutcome(p: { calculatedPriceOutcome?: PriceOutcome; calculatedMarginPercent: number; calculatedProfitPerUnit: number; calculatedTotalLandedCost: number; currentSellingPrice: number }): {
  netProfit: number;
  effectiveMarginPercent: number;
  totalLandedCost: number;
  netSalesRevenue: number;
  customerPayableAmount: number;
  outputTax: number;
  totalSellingFees: number;
  confidence: string;
} {
  if (p.calculatedPriceOutcome) {
    return {
      netProfit: p.calculatedPriceOutcome.netProfit,
      effectiveMarginPercent: p.calculatedPriceOutcome.effectiveMarginPercent,
      totalLandedCost: p.calculatedPriceOutcome.totalLandedCost,
      netSalesRevenue: p.calculatedPriceOutcome.netSalesRevenue,
      customerPayableAmount: p.calculatedPriceOutcome.customerPayableAmount,
      outputTax: p.calculatedPriceOutcome.outputTax,
      totalSellingFees: p.calculatedPriceOutcome.totalSellingFees,
      confidence: p.calculatedPriceOutcome.confidence,
    };
  }
  // Fallback to stored calculated fields
  return {
    netProfit: p.calculatedProfitPerUnit,
    effectiveMarginPercent: p.calculatedMarginPercent,
    totalLandedCost: p.calculatedTotalLandedCost,
    netSalesRevenue: p.currentSellingPrice,
    customerPayableAmount: p.currentSellingPrice,
    outputTax: 0,
    totalSellingFees: 0,
    confidence: 'low',
  };
}

export function DashboardPage() {
  const { products, businessSettings, setCurrentView, loadSampleData, recentlyViewedIds, recalculateProducts, bulkApprovePrices, setInitialFilterTab, onboardingCompleted } = usePricePilotStore();
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const categories = buildNonEmptyOptions(products.map(p => p.category), UNCATEGORISED_FILTER);
  const brands = buildNonEmptyOptions(products.map(p => p.brand), UNKNOWN_BRAND_FILTER);

  const filtered = useMemo(() => products.filter(p => {
    if (filterCategory !== 'all' && !categoryMatchesFilter(p.category, filterCategory)) return false;
    if (filterBrand !== 'all' && !brandMatchesFilter(p.brand, filterBrand)) return false;
    return true;
  }), [products, filterCategory, filterBrand]);

  // ============================================================
  // Pricing Health Trends - chart data (memoized)
  // Computed BEFORE early returns so hook order is stable.
  // ============================================================
  const marginBuckets = useMemo(() => {
    const buckets = [
      { label: '< 0%', range: 'Loss-making (< 0%)', count: 0, color: '#ef4444' },
      { label: '0-10%', range: 'Very low (0-10%)', count: 0, color: '#f59e0b' },
      { label: '10-20%', range: 'Low (10-20%)', count: 0, color: '#f59e0b' },
      { label: '20-30%', range: 'Target (20-30%)', count: 0, color: '#10b981' },
      { label: '30-50%', range: 'Healthy (30-50%)', count: 0, color: '#10b981' },
      { label: '> 50%', range: 'Premium (> 50%)', count: 0, color: '#3b82f6' },
    ];
    filtered.forEach(p => {
      const margin = getOutcome(p).effectiveMarginPercent;
      if (margin < 0) buckets[0].count++;
      else if (margin < 10) buckets[1].count++;
      else if (margin < 20) buckets[2].count++;
      else if (margin < 30) buckets[3].count++;
      else if (margin < 50) buckets[4].count++;
      else buckets[5].count++;
    });
    return buckets;
  }, [filtered]);

  const statusBreakdown = useMemo(() => {
    const statusMeta: Record<string, { label: string; color: string; dot: string }> = {
      'healthy': { label: 'Healthy', color: '#10b981', dot: 'bg-emerald-500' },
      'high-margin': { label: 'High Margin', color: '#047857', dot: 'bg-emerald-700' },
      'low-margin': { label: 'Low Margin', color: '#f59e0b', dot: 'bg-amber-500' },
      'below-break-even': { label: 'Below Break-even', color: '#f97316', dot: 'bg-orange-500' },
      'loss-making': { label: 'Loss-making', color: '#ef4444', dot: 'bg-red-500' },
      'missing-data': { label: 'Missing Data', color: '#94a3b8', dot: 'bg-slate-400' },
      'needs-review': { label: 'Needs Review', color: '#d97706', dot: 'bg-amber-600' },
    };
    const counts = filtered.reduce<Record<string, number>>((acc, p) => {
      const status = p.calculatedPricingStatus;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(statusMeta).map(status => ({
      status,
      label: statusMeta[status].label,
      count: counts[status] || 0,
      color: statusMeta[status].color,
      dot: statusMeta[status].dot,
    }));
  }, [filtered]);

  const pricingHealthInsights = useMemo(() => {
    const profitableCount = filtered.filter(p => getOutcome(p).effectiveMarginPercent > 0).length;
    const profitablePct = filtered.length > 0 ? (profitableCount / filtered.length) * 100 : 0;
    const avgMargin = filtered.length > 0
      ? filtered.reduce((s, p) => s + getOutcome(p).effectiveMarginPercent, 0) / filtered.length
      : 0;
    const attentionStatuses = ['loss-making', 'below-break-even', 'low-margin', 'needs-review'];
    const needsAttention = filtered.filter(p => attentionStatuses.includes(p.calculatedPricingStatus)).length;
    const topPerformer = filtered.length > 0
      ? [...filtered].sort((a, b) => getOutcome(b).effectiveMarginPercent - getOutcome(a).effectiveMarginPercent)[0]
      : null;
    const topPerformerMargin = topPerformer ? getOutcome(topPerformer).effectiveMarginPercent : 0;
    return { profitableCount, profitablePct, avgMargin, needsAttention, topPerformer, topPerformerMargin };
  }, [filtered]);

  // Show skeleton placeholders on initial load
  if (showSkeleton && products.length === 0 && !onboardingCompleted) {
    return (
      <div className="space-y-8 bg-gradient-to-b from-slate-50/50 to-white min-h-screen p-1">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-40 bg-emerald-100/60" />
            <Skeleton className="h-4 w-64 mt-2 bg-emerald-50/60" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="shadow-md border-0 overflow-hidden bg-gradient-to-br from-emerald-50/40 via-emerald-25/20 to-white border-l-4 border-l-emerald-300">
              <div className="h-1 bg-gradient-to-r from-emerald-400 to-emerald-200" />
              <CardContent className="p-4 pt-3">
                <div className="flex items-center gap-3 mb-2">
                  <Skeleton className="h-10 w-10 rounded-full bg-emerald-200/70" />
                  <Skeleton className="h-4 w-28 bg-emerald-100/50" />
                </div>
                <Skeleton className="h-8 w-24 bg-emerald-100/40" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-emerald-50/20 to-white">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32 bg-emerald-100/50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[280px] w-full bg-emerald-50/30 rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 via-white to-slate-50 min-h-[400px]">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, #10b981 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        {/* Animated icon */}
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center shadow-md animate-[pulse_3s_ease-in-out_infinite]">
            <Package className="h-10 w-10 text-emerald-600" />
          </div>
          <div className="absolute -inset-2 rounded-3xl bg-emerald-200/20 animate-[ping_4s_ease-in-out_infinite]" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2 relative">No products yet</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md relative">Import your product spreadsheet or try sample data to see the dashboard in action.</p>
        <div className="flex gap-3 relative">
          <Button onClick={() => setCurrentView('import')} className="bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200">
            <FileUp className="h-4 w-4 mr-2" /> Import Products
          </Button>
          <Button variant="outline" onClick={() => loadSampleData()} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-all duration-200">
            <Plus className="h-4 w-4 mr-2" /> Try Sample Data
          </Button>
        </div>
      </div>
    );
  }

  // All data comes from stored PriceOutcome on each product
  const outcomeData = filtered.map(p => getOutcome(p));

  const totalProducts = filtered.length;
  const productsAnalysed = filtered.filter(p => p.calculatedPricingStatus !== 'missing-data').length;

  // Average existing margin from stored PriceOutcome data
  const avgExistingMargin = outcomeData.length > 0
    ? outcomeData.reduce((sum, o) => sum + o.effectiveMarginPercent, 0) / outcomeData.length : 0;

  // Average recommended margin: compute from stored recommended prices outcome data
  // For recommended price outcomes, we use the stored recommended prices and their
  // corresponding PriceOutcome data (which is stored for the current price only)
  // So we compute recommended margin from the stored recommendedPrices.balanced data
  const avgRecommendedMargin = outcomeData.length > 0
    ? filtered.reduce((sum, p) => {
        // Use stored margin data for balanced recommendation
        const recPrice = p.recommendedPrices.balanced;
        const tlc = p.calculatedTotalLandedCost;
        // For recommended price margin, we need outcome data
        // Since only current price outcome is stored, we approximate from stored data
        // Net profit at recommended = recPrice - tlc - estimated fees
        // Margin at recommended = netProfit / netSalesRevenue * 100
        const marginAtRec = recPrice > 0 ? ((recPrice - tlc) / recPrice) * 100 : 0;
        return sum + marginAtRec;
      }, 0) / outcomeData.length : 0;

  // Current estimated profit (per unit) from stored PriceOutcome
  const currentEstimatedProfitPerUnit = outcomeData.reduce((sum, o) => sum + o.netProfit, 0);
  // Recommended estimated profit (per unit) from stored recommended prices
  const recommendedEstimatedProfitPerUnit = filtered.reduce((sum, p) => {
    const recOutcome = getOutcome(p);
    // recommended profit per unit = recommended price - total landed cost
    return sum + (p.recommendedPrices.balanced - p.calculatedTotalLandedCost);
  }, 0);

  // Profit labels: use "per unit" since these are unit-level metrics
  const profitLabel = 'per unit';

  const potentialImprovement = recommendedEstimatedProfitPerUnit - currentEstimatedProfitPerUnit;
  const lossMaking = filtered.filter(p => p.calculatedPricingStatus === 'loss-making' || p.calculatedPricingStatus === 'below-break-even').length;

  // Feature 5: Average Health Score
  const avgHealthScore = filtered.length > 0
    ? Math.round(filtered.reduce((sum, p) => sum + p.calculatedHealthScore, 0) / filtered.length)
    : 0;

  // Profitability distribution for pie chart
  const statusGroups = filtered.reduce<Record<string, number>>((acc, p) => {
    const status = p.calculatedPricingStatus;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusGroups).map(([status, count]) => ({
    name: formatStatusLabel(status),
    value: count,
    color: COLORS[status as keyof typeof COLORS] || '#94a3b8',
  }));

  // Price recommendation distribution for bar chart
  const recDistribution = filtered.reduce<Record<string, number>>((acc, p) => {
    const diff = p.recommendedPrices.balanced - p.currentSellingPrice;
    if (diff > 50) acc['increase'] = (acc['increase'] || 0) + 1;
    else if (diff < -50) acc['decrease'] = (acc['decrease'] || 0) + 1;
    else if (Math.abs(diff) <= 50) acc['no-change'] = (acc['no-change'] || 0) + 1;
    else if (p.calculatedPricingStatus === 'needs-review') acc['review'] = (acc['review'] || 0) + 1;
    return acc;
  }, { increase: 0, decrease: 0, 'no-change': 0, review: 0 });

  const recBarData = [
    { name: 'Increase', value: recDistribution['increase'], fill: COLORS.increase },
    { name: 'No Change', value: recDistribution['no-change'], fill: COLORS.noChange },
    { name: 'Decrease', value: recDistribution['decrease'], fill: COLORS.decrease },
    { name: 'Review', value: recDistribution['review'], fill: COLORS.review },
  ];

  // Margin by category bar chart - uses stored PriceOutcome data
  const categoryMargins = categories.map(cat => {
    const catProducts = filtered.filter(p => p.category === cat);
    const catOutcomes = catProducts.map(p => getOutcome(p));
    const avgExist = catOutcomes.reduce((s, o) => s + o.effectiveMarginPercent, 0) / catOutcomes.length;
    const avgRec = catProducts.reduce((s, p) => {
      const recPrice = p.recommendedPrices.balanced;
      const tlc = p.calculatedTotalLandedCost;
      return s + (recPrice > 0 ? ((recPrice - tlc) / recPrice) * 100 : 0);
    }, 0) / catProducts.length;
    return { category: cat, existing: Math.round(avgExist * 10) / 10, recommended: Math.round(avgRec * 10) / 10 };
  });

  // Feature 3: Cost Breakdown Area Chart - aggregate costs by category
  const costBreakdownByCategory = categories.map(cat => {
    const catProducts = filtered.filter(p => p.category === cat);
    const totalPurchase = catProducts.reduce((s, p) => s + p.purchaseCost, 0);
    const totalShipping = catProducts.reduce((s, p) => s + p.shippingCost, 0);
    const totalPackaging = catProducts.reduce((s, p) => s + p.packagingCost, 0);
    const totalHandling = catProducts.reduce((s, p) => s + p.handlingCost, 0);
    const totalOther = catProducts.reduce((s, p) => s + p.otherCosts, 0);
    return {
      category: cat,
      PurchaseCost: Math.round(totalPurchase * 100) / 100,
      Shipping: Math.round(totalShipping * 100) / 100,
      Packaging: Math.round(totalPackaging * 100) / 100,
      Handling: Math.round(totalHandling * 100) / 100,
      OtherCosts: Math.round(totalOther * 100) / 100,
    };
  });

  // Top 5 improvement opportunities using stored PriceOutcome data
  const improvementOpps = [...filtered]
    .sort((a, b) => {
      const aRecProfit = a.recommendedPrices.balanced - a.calculatedTotalLandedCost;
      const bRecProfit = b.recommendedPrices.balanced - b.calculatedTotalLandedCost;
      const aCurrentProfit = getOutcome(a).netProfit;
      const bCurrentProfit = getOutcome(b).netProfit;
      return (bRecProfit - bCurrentProfit) - (aRecProfit - aCurrentProfit);
    })
    .slice(0, 5)
    .map(p => {
      const currentOutcome = getOutcome(p);
      const recommendedProfit = p.recommendedPrices.balanced - p.calculatedTotalLandedCost;
      return {
        name: p.name,
        sku: p.sku,
        currentProfit: currentOutcome.netProfit,
        recommendedProfit,
        improvement: recommendedProfit - currentOutcome.netProfit,
      };
    });

  // Highest risk products - uses stored PriceOutcome data
  const riskProducts = [...filtered]
    .sort((a, b) => getOutcome(a).effectiveMarginPercent - getOutcome(b).effectiveMarginPercent)
    .slice(0, 5);

  // Top 5 Most Profitable Products
  const mostProfitableProducts = [...filtered]
    .sort((a, b) => getOutcome(b).effectiveMarginPercent - getOutcome(a).effectiveMarginPercent)
    .slice(0, 5);

  // Top 5 Least Profitable Products (excluding loss-making, which is in riskProducts)
  const leastProfitableProducts = [...filtered]
    .filter(p => p.calculatedPricingStatus !== 'loss-making' && p.calculatedPricingStatus !== 'below-break-even')
    .sort((a, b) => getOutcome(a).effectiveMarginPercent - getOutcome(b).effectiveMarginPercent)
    .slice(0, 5);

  // Price Changes Summary
  const priceNeedsIncrease = filtered.filter(p => p.recommendedPrices.balanced > p.currentSellingPrice).length;
  const priceNeedsDecrease = filtered.filter(p => p.recommendedPrices.balanced < p.currentSellingPrice).length;
  const priceNoChange = filtered.filter(p => Math.abs(p.recommendedPrices.balanced - p.currentSellingPrice) < 1).length;

  return (
    <div className="space-y-8 bg-gradient-to-b from-slate-50/50 to-white min-h-screen p-1">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Overview of your pricing performance and optimization opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[160px] bg-white"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{categoryFilterLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[160px] bg-white"><SelectValue placeholder="All brands" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{brandFilterLabel(b)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Actions Toolbar */}
      {products.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => setCurrentView('import')}
            className="rounded-lg shadow-md hover:shadow-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white transition-all duration-200"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
          <Button
            onClick={() => setCurrentView('import')}
            className="rounded-lg shadow-md hover:shadow-lg bg-gradient-to-r from-slate-600 to-slate-500 hover:from-slate-700 hover:to-slate-600 text-white transition-all duration-200"
          >
            <FileUp className="h-4 w-4 mr-2" /> Import Data
          </Button>
          <Button
            onClick={() => { recalculateProducts(); toast.success('Recalculated', { description: 'All products have been recalculated with current settings' }); }}
            className="rounded-lg shadow-md hover:shadow-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-white transition-all duration-200"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Recalculate All
          </Button>
          <Button
            onClick={() => { bulkApprovePrices(products.map(p => p.id)); toast.success('All recommendations approved', { description: `${products.length} product prices have been approved` }); }}
            className="rounded-lg shadow-md hover:shadow-lg bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white transition-all duration-200"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" /> Approve All Recommendations
          </Button>
        </div>
      )}

      {/* Recently Viewed Products */}
      {recentlyViewedIds.length > 0 && (
        <div>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-800">Recently Viewed</h2>
            <p className="text-sm text-slate-500">Products you've recently inspected</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {recentlyViewedIds.map(id => {
              const p = products.find(prod => prod.id === id);
              if (!p) return null;
              return (
                <Button
                  key={id}
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentView('products')}
                  className="rounded-lg shadow-sm border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all duration-200 h-auto py-2 px-3"
                >
                  <Package className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                  <span className="font-medium text-slate-700 text-sm">{p.name}</span>
                  <Badge variant="secondary" className="text-xs ml-1.5">{p.sku}</Badge>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard title="Total Products" value={String(totalProducts)} icon={Package} color="slate" />
        <SummaryCard title="Products Analysed" value={String(productsAnalysed)} icon={BarChart3} color="emerald" />
        <SummaryCard title="Avg Existing Margin" value={formatPercentage(avgExistingMargin)} icon={TrendingUp} color={avgExistingMargin >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Avg Recommended Margin" value={formatPercentage(avgRecommendedMargin)} icon={Target} color="emerald" />
        <SummaryCard title={`Current Est. Profit (${profitLabel})`} value={formatCurrency(currentEstimatedProfitPerUnit, businessSettings.currencyCode, { compact: true })} icon={DollarSign} color={currentEstimatedProfitPerUnit >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title={`Recommended Est. Profit (${profitLabel})`} value={formatCurrency(recommendedEstimatedProfitPerUnit, businessSettings.currencyCode, { compact: true })} icon={TrendingUp} color="emerald" />
        <SummaryCard title={`Potential Improvement (${profitLabel})`} value={formatCurrency(potentialImprovement, businessSettings.currencyCode, { compact: true })} icon={potentialImprovement >= 0 ? ArrowUpRight : ArrowDownRight} color={potentialImprovement >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Loss-making Products" value={String(lossMaking)} icon={ShieldAlert} color={lossMaking > 0 ? 'red' : 'emerald'} />
        {/* Feature 5: Average Health Score */}
        {productsAnalysed > 0 && (
          <SummaryCard
            title="Avg Health Score"
            value={`${avgHealthScore}/100`}
            icon={HeartPulse}
            color={avgHealthScore >= 70 ? 'emerald' : avgHealthScore >= 40 ? 'amber' : 'red'}
          />
        )}
      </div>

      {/* Pricing Health Trends - Analytics Panel */}
      <div>
        <div className="mb-4 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center shadow-sm">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Pricing Health Trends</h2>
            <p className="text-sm text-slate-500">Margin distribution and pricing health breakdown of your catalog</p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-slate-50/20">
            <CardContent className="py-12 flex flex-col items-center justify-center text-center">
              <Package className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">No products to analyze</p>
              <p className="text-xs text-slate-400 mt-1">Adjust your filters or add products to see pricing health trends</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Card A: Margin Distribution Histogram */}
              <Card className="shadow-md border-0 overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-gradient-to-b from-white to-slate-50/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Margin Distribution
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">How your products are distributed across margin ranges</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <RechartsBar data={marginBuckets} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                      <Tooltip content={<MarginBucketTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                      <Bar dataKey="count" name="Products" radius={[4, 4, 0, 0]}>
                        {marginBuckets.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                      </Bar>
                    </RechartsBar>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Card B: Pricing Status Breakdown (Donut) */}
              <Card className="shadow-md border-0 overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-gradient-to-b from-white to-emerald-50/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-emerald-500" />
                    Pricing Status Breakdown
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">Current health distribution across your catalog</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPie>
                        <Pie
                          data={statusBreakdown}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          animationBegin={0}
                          animationDuration={800}
                          stroke="#fff"
                          strokeWidth={1}
                        >
                          {statusBreakdown.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </RechartsPie>
                    </ResponsiveContainer>
                    {/* Center label overlay */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-slate-800 leading-none">{filtered.length}</span>
                      <span className="text-xs text-slate-500 mt-1">Products</span>
                    </div>
                  </div>
                  {/* Legend below with color dots and counts */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 pt-3 border-t border-slate-100 mt-1">
                    {statusBreakdown.map(s => (
                      <div key={s.status} className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                        <span className="text-xs font-medium text-slate-600 truncate">{s.label}</span>
                        <span className="text-xs font-semibold text-slate-800 ml-auto">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Card C: Quick Insights */}
            <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-amber-50/20 mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Quick Insights
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">Auto-generated observations about your catalog pricing health</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {/* Insight 1: Profitable % */}
                {(() => {
                  const pct = pricingHealthInsights.profitablePct;
                  const tone = pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'red';
                  const toneClasses = {
                    emerald: { bg: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-600', text: 'text-emerald-700' },
                    amber: { bg: 'bg-amber-50 border-amber-100', icon: 'text-amber-600', text: 'text-amber-700' },
                    red: { bg: 'bg-red-50 border-red-100', icon: 'text-red-600', text: 'text-red-700' },
                  }[tone];
                  return (
                    <div className={`flex items-start gap-3 rounded-lg p-3 border ${toneClasses.bg}`}>
                      <div className={`mt-0.5 ${toneClasses.icon}`}><CheckCircle2 className="h-4 w-4" /></div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-500">Profitable Products</p>
                        <p className={`text-sm font-semibold ${toneClasses.text}`}>{formatPercentage(safeNumberValue(pct, 0), 0)} of your products are profitable</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Insight 2: Average margin */}
                {(() => {
                  const m = pricingHealthInsights.avgMargin;
                  const target = businessSettings.defaultTargetMarginPercent;
                  const diff = m - target;
                  const tone = diff >= 0 ? 'emerald' : m >= target * 0.5 ? 'amber' : 'red';
                  const toneClasses = {
                    emerald: { bg: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-600', text: 'text-emerald-700' },
                    amber: { bg: 'bg-amber-50 border-amber-100', icon: 'text-amber-600', text: 'text-amber-700' },
                    red: { bg: 'bg-red-50 border-red-100', icon: 'text-red-600', text: 'text-red-700' },
                  }[tone];
                  const cmpText = diff >= 0
                    ? `${formatPercentage(safeNumberValue(diff, 0), 1)} above target`
                    : `${formatPercentage(safeNumberValue(Math.abs(diff), 0), 1)} below target`;
                  return (
                    <div className={`flex items-start gap-3 rounded-lg p-3 border ${toneClasses.bg}`}>
                      <div className={`mt-0.5 ${toneClasses.icon}`}><Target className="h-4 w-4" /></div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-500">Average Margin</p>
                        <p className={`text-sm font-semibold ${toneClasses.text}`}>Average margin: {formatPercentage(m)} <span className="text-xs font-normal text-slate-500">({cmpText} of {formatPercentage(target)})</span></p>
                      </div>
                    </div>
                  );
                })()}

                {/* Insight 3: Needs attention (clickable) */}
                {(() => {
                  const n = pricingHealthInsights.needsAttention;
                  const tone = n === 0 ? 'emerald' : n <= 2 ? 'amber' : 'red';
                  const toneClasses = {
                    emerald: { bg: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-600', text: 'text-emerald-700' },
                    amber: { bg: 'bg-amber-50 border-amber-100', icon: 'text-amber-600', text: 'text-amber-700' },
                    red: { bg: 'bg-red-50 border-red-100', icon: 'text-red-600', text: 'text-red-700' },
                  }[tone];
                  return (
                    <button
                      type="button"
                      onClick={() => setCurrentView('review-prices')}
                      className={`flex items-start gap-3 rounded-lg p-3 border ${toneClasses.bg} text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300`}
                    >
                      <div className={`mt-0.5 ${toneClasses.icon}`}><AlertTriangle className="h-4 w-4" /></div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-500">Needs Attention</p>
                        <p className={`text-sm font-semibold ${toneClasses.text}`}>{n} product{n === 1 ? '' : 's'} need attention <span className="text-xs font-normal text-slate-500 underline decoration-dotted">Review Prices →</span></p>
                      </div>
                    </button>
                  );
                })()}

                {/* Insight 4: Top performer */}
                {pricingHealthInsights.topPerformer && (() => {
                  const p = pricingHealthInsights.topPerformer;
                  const m = pricingHealthInsights.topPerformerMargin;
                  return (
                    <div className="flex items-start gap-3 rounded-lg p-3 border bg-emerald-50 border-emerald-100">
                      <div className="mt-0.5 text-emerald-600"><TrendingUp className="h-4 w-4" /></div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-500">Top Performer</p>
                        <p className="text-sm font-semibold text-emerald-700">Top performer: {p.name} with {formatPercentage(m)} margin</p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts Section */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Analytics</h2>
          <p className="text-sm text-slate-500">Visual breakdown of profitability and pricing recommendations</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profitability distribution pie */}
          <Card className="shadow-md border-0 overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-gradient-to-b from-white to-slate-50/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Profitability Distribution</CardTitle>
              <CardDescription className="text-xs text-slate-400">Product count by pricing status</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" minHeight={280}>
                <RechartsPie>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    animationBegin={0}
                    animationDuration={800}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    onClick={(_, index) => {
                      const statusKeyMap: Record<string, PricingStatus> = {
                        'Loss-making': 'loss-making',
                        'Below break-even': 'below-break-even',
                        'Low margin': 'low-margin',
                        'Healthy': 'healthy',
                        'High margin': 'high-margin',
                        'Above market': 'above-market',
                        'Missing data': 'missing-data',
                        'Needs review': 'needs-review',
                        'Approved': 'approved',
                      };
                      const clickedEntry = pieData[index];
                      if (clickedEntry) {
                        const statusKey = statusKeyMap[clickedEntry.name];
                        if (statusKey) {
                          setInitialFilterTab(statusKey);
                          setCurrentView('products');
                        }
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {pieData.map((entry, index) => <Cell key={index} fill={entry.color} strokeWidth={1} stroke="#fff" />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend />} />
                </RechartsPie>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Margin comparison by category */}
          <Card className="shadow-md border-0 overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-gradient-to-b from-white to-emerald-50/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Existing vs Recommended Margin</CardTitle>
              <CardDescription className="text-xs text-slate-400">Average margin comparison by category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" minHeight={280}>
                <RechartsBar data={categoryMargins} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend />} />
                  <Bar dataKey="existing" name="Existing %" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recommended" name="Recommended %" fill="#059669" radius={[4, 4, 0, 0]} />
                </RechartsBar>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Price recommendation distribution */}
          <Card className="shadow-md border-0 overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-gradient-to-b from-white to-slate-50/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Price Recommendation Distribution</CardTitle>
              <CardDescription className="text-xs text-slate-400">How many products need price adjustments</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" minHeight={280}>
                <RechartsBar data={recBarData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={45} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Products" radius={[4, 4, 0, 0]}>
                    {recBarData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                  </Bar>
                </RechartsBar>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Feature 3: Cost Breakdown Area Chart */}
        {costBreakdownByCategory.length > 0 && (
          <Card className="shadow-md border-0 overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-gradient-to-b from-white to-emerald-50/20 mt-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Cost Breakdown by Category</CardTitle>
              <CardDescription className="text-xs text-slate-400">Stacked area chart showing cost composition per category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" minHeight={320}>
                <RechartsArea data={costBreakdownByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend />} />
                  <Area type="monotone" dataKey="PurchaseCost" name="Purchase Cost" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Shipping" name="Shipping" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Packaging" name="Packaging" stackId="1" stroke="#34d399" fill="#34d399" fillOpacity={0.4} />
                  <Area type="monotone" dataKey="Handling" name="Handling" stackId="1" stroke="#6ee7b7" fill="#6ee7b7" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="OtherCosts" name="Other Costs" stackId="1" stroke="#a7f3d0" fill="#a7f3d0" fillOpacity={0.2} />
                </RechartsArea>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Improvement Opportunities */}
      {improvementOpps.length > 0 && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Highest Improvement Opportunities</h2>
            <p className="text-sm text-slate-500">Top products with the largest profit improvement potential (per unit)</p>
          </div>
          <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-emerald-50/10">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-slate-50 to-emerald-50/20 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">SKU</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Current Profit/Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Recommended Profit/Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Improvement/Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {improvementOpps.map(item => (
                    <TableRow key={item.sku} className="hover:bg-emerald-50/30 transition-colors">
                      <TableCell className="font-medium text-slate-800">{item.name}</TableCell>
                      <TableCell className="text-slate-500">{item.sku}</TableCell>
                      <TableCell className="text-right text-slate-700">{formatCurrency(item.currentProfit, businessSettings.currencyCode)}</TableCell>
                      <TableCell className="text-right text-slate-700">{formatCurrency(item.recommendedProfit, businessSettings.currencyCode)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        <span className="inline-flex items-center gap-1 animate-pulse">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          {formatCurrency(item.improvement, businessSettings.currencyCode)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Highest Risk Products */}
      {riskProducts.length > 0 && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Highest-risk Products</h2>
            <p className="text-sm text-slate-500">Products with negative profit, low margins, or high fees</p>
          </div>
          <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-red-50/10">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-slate-50 to-red-50/20 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">SKU</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Margin</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Profit/Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskProducts.map(p => {
                    const outcome = getOutcome(p);
                    return (
                      <TableRow
                        key={p.id}
                        className={`transition-colors ${
                          outcome.effectiveMarginPercent < 0
                            ? 'bg-red-50/40 hover:bg-red-50/60'
                            : outcome.effectiveMarginPercent < 10
                              ? 'bg-amber-50/30 hover:bg-amber-50/50'
                              : 'hover:bg-emerald-50/30'
                        }`}
                      >
                        <TableCell className="font-medium text-slate-800">{p.name}</TableCell>
                        <TableCell className="text-slate-500">{p.sku}</TableCell>
                        <TableCell className={`text-right font-semibold ${outcome.effectiveMarginPercent < 0 ? 'text-red-600' : outcome.effectiveMarginPercent < 10 ? 'text-amber-600' : 'text-slate-700'}`}>
                          {formatPercentage(outcome.effectiveMarginPercent)}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${outcome.netProfit < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                          {formatCurrency(outcome.netProfit, businessSettings.currencyCode)}
                        </TableCell>
                        <TableCell><StatusBadge status={p.calculatedPricingStatus} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Products Insights */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Top Products Insights</h2>
          <p className="text-sm text-slate-500">Profitability leaders and pricing change overview</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top 5 Most Profitable */}
          {mostProfitableProducts.length > 0 && (
            <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-emerald-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Top 5 Most Profitable
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">Products with highest margins</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-emerald-50/30 hover:bg-emerald-50/30">
                      <TableHead className="text-xs font-semibold text-slate-500">Product</TableHead>
                      <TableHead className="text-xs font-semibold text-right text-slate-500">Margin</TableHead>
                      <TableHead className="text-xs font-semibold text-right text-slate-500">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mostProfitableProducts.map(p => {
                      const outcome = getOutcome(p);
                      return (
                        <TableRow key={p.id} className="hover:bg-emerald-50/30 transition-colors">
                          <TableCell className="font-medium text-slate-800 text-sm">{p.name}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600">{formatPercentage(outcome.effectiveMarginPercent)}</TableCell>
                          <TableCell className="text-right text-emerald-700">{formatCurrency(outcome.netProfit, businessSettings.currencyCode)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Top 5 Least Profitable */}
          {leastProfitableProducts.length > 0 && (
            <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-amber-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-500" />
                  Top 5 Least Profitable
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">Products with lowest margins (excluding loss-making)</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-amber-50/30 hover:bg-amber-50/30">
                      <TableHead className="text-xs font-semibold text-slate-500">Product</TableHead>
                      <TableHead className="text-xs font-semibold text-right text-slate-500">Margin</TableHead>
                      <TableHead className="text-xs font-semibold text-right text-slate-500">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leastProfitableProducts.map(p => {
                      const outcome = getOutcome(p);
                      return (
                        <TableRow key={p.id} className="hover:bg-amber-50/30 transition-colors">
                          <TableCell className="font-medium text-slate-800 text-sm">{p.name}</TableCell>
                          <TableCell className="text-right font-semibold text-amber-600">{formatPercentage(outcome.effectiveMarginPercent)}</TableCell>
                          <TableCell className="text-right text-amber-700">{formatCurrency(outcome.netProfit, businessSettings.currencyCode)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Price Changes Summary */}
          <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-slate-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                Price Changes Summary
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">How many products need price adjustments vs recommended</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-emerald-50/60 rounded-lg p-4 border border-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-xs text-emerald-600 font-medium">Need Price Increase</div>
                    <div className="text-2xl font-bold text-emerald-700">{priceNeedsIncrease}</div>
                  </div>
                </div>
                <div className="text-xs text-emerald-500 mt-1">Products where recommended price is higher than current</div>
              </div>
              <div className="bg-red-50/60 rounded-lg p-4 border border-red-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                    <ArrowDownRight className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <div className="text-xs text-red-600 font-medium">Need Price Decrease</div>
                    <div className="text-2xl font-bold text-red-700">{priceNeedsDecrease}</div>
                  </div>
                </div>
                <div className="text-xs text-red-500 mt-1">Products where recommended price is lower than current</div>
              </div>
              <div className="bg-slate-50/60 rounded-lg p-4 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <Target className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">No Significant Change</div>
                    <div className="text-2xl font-bold text-slate-700">{priceNoChange}</div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 mt-1">Products within ±1 of recommended price</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ElementType; color: string }) {
  const Icon = icon;

  const themeConfig: Record<string, {
    bg: string;
    iconBg: string;
    iconColor: string;
    accent: string;
    valueColor: string;
    gradient: string;
    borderAccent: string;
  }> = {
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-50/80 via-emerald-25/30 to-white',
      iconBg: 'bg-gradient-to-br from-emerald-200 to-emerald-100',
      iconColor: 'text-emerald-600',
      accent: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
      valueColor: 'text-emerald-700',
      gradient: 'from-emerald-50 to-white',
      borderAccent: 'border-l-emerald-500',
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50/80 via-red-25/30 to-white',
      iconBg: 'bg-gradient-to-br from-red-200 to-red-100',
      iconColor: 'text-red-600',
      accent: 'bg-gradient-to-r from-red-600 to-red-400',
      valueColor: 'text-red-600',
      gradient: 'from-red-50 to-white',
      borderAccent: 'border-l-red-500',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50/80 via-amber-25/30 to-white',
      iconBg: 'bg-gradient-to-br from-amber-200 to-amber-100',
      iconColor: 'text-amber-600',
      accent: 'bg-gradient-to-r from-amber-600 to-amber-400',
      valueColor: 'text-amber-700',
      gradient: 'from-amber-50 to-white',
      borderAccent: 'border-l-amber-500',
    },
    slate: {
      bg: 'bg-gradient-to-br from-slate-50/80 via-slate-25/30 to-white',
      iconBg: 'bg-gradient-to-br from-slate-200 to-slate-100',
      iconColor: 'text-slate-600',
      accent: 'bg-gradient-to-r from-slate-500 to-slate-400',
      valueColor: 'text-slate-800',
      gradient: 'from-slate-50 to-white',
      borderAccent: 'border-l-slate-400',
    },
  };

  const theme = themeConfig[color] || themeConfig.slate;

  return (
    <Card className={`shadow-md border-0 overflow-hidden transition-all duration-200 hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 border-l-4 ${theme.borderAccent} ${theme.bg}`}>
      {/* Accent strip */}
      <div className={`h-1 ${theme.accent}`} />
      <CardContent className="p-4 pt-3">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-10 w-10 rounded-full ${theme.iconBg} flex items-center justify-center shadow-sm`}>
            <Icon className={`h-5 w-5 ${theme.iconColor}`} />
          </div>
          <span className="text-sm font-medium text-slate-500">{title}</span>
        </div>
        <p className={`text-2xl font-bold ${theme.valueColor}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function formatStatusLabel(status: string): string {
  const map: Record<string, string> = {
    'loss-making': 'Loss-making',
    'below-break-even': 'Below break-even',
    'low-margin': 'Low margin',
    'healthy': 'Healthy',
    'high-margin': 'High margin',
    'above-market': 'Above market',
    'missing-data': 'Missing data',
    'needs-review': 'Needs review',
    'approved': 'Approved',
  };
  return map[status] || status;
}

export default DashboardPage;
