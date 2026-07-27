'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Package, TrendingUp, TrendingDown, AlertTriangle, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Plus, FileUp, DollarSign, ShieldAlert, Target } from 'lucide-react';
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { PriceOutcome } from '@/lib/pricepilot/types';

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
  const { products, businessSettings, setCurrentView, loadSampleData, recentlyViewedIds } = usePricePilotStore();
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');

  const categories = [...new Set(products.map(p => p.category))];
  const brands = [...new Set(products.map(p => p.brand))];

  const filtered = products.filter(p => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterBrand !== 'all' && p.brand !== filterBrand) return false;
    return true;
  });

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No products yet</h2>
        <p className="text-muted-foreground mb-6">Import your product spreadsheet or try sample data to see the dashboard.</p>
        <div className="flex gap-3">
          <Button onClick={() => setCurrentView('import')}>
            <FileUp className="h-4 w-4 mr-2" /> Import Products
          </Button>
          <Button variant="outline" onClick={() => loadSampleData()}>
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
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[160px] bg-white"><SelectValue placeholder="All brands" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

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
