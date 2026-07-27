'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

export function DashboardPage() {
  const { products, businessSettings, setCurrentView, loadSampleData } = usePricePilotStore();
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

  // Summary metrics
  const totalProducts = filtered.length;
  const productsAnalysed = filtered.filter(p => p.calculatedPricingStatus !== 'missing-data').length;
  const avgExistingMargin = filtered.length > 0
    ? filtered.reduce((sum, p) => sum + p.calculatedMarginPercent, 0) / filtered.length : 0;
  const avgRecommendedMargin = filtered.length > 0
    ? filtered.reduce((sum, p) => sum + ((p.recommendedPrices.balanced - p.calculatedTotalLandedCost) / p.recommendedPrices.balanced * 100), 0) / filtered.length : 0;
  const currentEstimatedProfit = filtered.reduce((sum, p) => sum + p.calculatedProfitPerUnit, 0);
  const recommendedEstimatedProfit = filtered.reduce((sum, p) => sum + (p.recommendedPrices.balanced - p.calculatedTotalLandedCost), 0);
  const potentialImprovement = recommendedEstimatedProfit - currentEstimatedProfit;
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

  // Margin by category bar chart
  const categoryMargins = categories.map(cat => {
    const catProducts = filtered.filter(p => p.category === cat);
    const avgExist = catProducts.reduce((s, p) => s + p.calculatedMarginPercent, 0) / catProducts.length;
    const avgRec = catProducts.reduce((s, p) => s + ((p.recommendedPrices.balanced - p.calculatedTotalLandedCost) / p.recommendedPrices.balanced * 100), 0) / catProducts.length;
    return { category: cat, existing: Math.round(avgExist * 10) / 10, recommended: Math.round(avgRec * 10) / 10 };
  });

  // Top 5 improvement opportunities
  const improvementOpps = [...filtered]
    .sort((a, b) => (b.recommendedPrices.balanced - b.calculatedTotalLandedCost) - (a.recommendedPrices.balanced - a.calculatedTotalLandedCost) - b.calculatedProfitPerUnit + a.calculatedProfitPerUnit)
    .slice(0, 5)
    .map(p => ({
      name: p.name,
      sku: p.sku,
      currentProfit: p.calculatedProfitPerUnit,
      recommendedProfit: p.recommendedPrices.balanced - p.calculatedTotalLandedCost,
      improvement: (p.recommendedPrices.balanced - p.calculatedTotalLandedCost) - p.calculatedProfitPerUnit,
    }));

  // Highest risk products
  const riskProducts = [...filtered]
    .sort((a, b) => a.calculatedMarginPercent - b.calculatedMarginPercent)
    .slice(0, 5);

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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard title="Total Products" value={String(totalProducts)} icon={Package} color="slate" />
        <SummaryCard title="Products Analysed" value={String(productsAnalysed)} icon={BarChart3} color="emerald" />
        <SummaryCard title="Avg Existing Margin" value={formatPercentage(avgExistingMargin)} icon={TrendingUp} color={avgExistingMargin >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Avg Recommended Margin" value={formatPercentage(avgRecommendedMargin)} icon={Target} color="emerald" />
        <SummaryCard title="Current Est. Profit" value={formatCurrency(currentEstimatedProfit, businessSettings.currencyCode, { compact: true })} icon={DollarSign} color={currentEstimatedProfit >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Recommended Est. Profit" value={formatCurrency(recommendedEstimatedProfit, businessSettings.currencyCode, { compact: true })} icon={TrendingUp} color="emerald" />
        <SummaryCard title="Potential Improvement" value={formatCurrency(potentialImprovement, businessSettings.currencyCode, { compact: true })} icon={potentialImprovement >= 0 ? ArrowUpRight : ArrowDownRight} color={potentialImprovement >= 0 ? 'emerald' : 'red'} />
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
          <Card className="shadow-md border-0 overflow-hidden">
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
          <Card className="shadow-md border-0 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Existing vs Recommended Margin</CardTitle>
              <CardDescription className="text-xs text-slate-400">Average margin comparison by category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" minHeight={280}>
                <RechartsBar data={categoryMargins} barSize={40} animationBegin={0} animationDuration={800}>
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
          <Card className="shadow-md border-0 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Price Recommendation Distribution</CardTitle>
              <CardDescription className="text-xs text-slate-400">How many products need price adjustments</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" minHeight={280}>
                <RechartsBar data={recBarData} barSize={40} animationBegin={0} animationDuration={800}>
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
            <p className="text-sm text-slate-500">Top products with the largest profit improvement potential</p>
          </div>
          <Card className="shadow-md border-0 overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">SKU</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Current Profit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Recommended Profit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Improvement</TableHead>
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
                        <span className="inline-flex items-center gap-1">
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
          <Card className="shadow-md border-0 overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">SKU</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Margin</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Profit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskProducts.map(p => (
                    <TableRow
                      key={p.id}
                      className={`transition-colors ${
                        p.calculatedMarginPercent < 0
                          ? 'bg-red-50/40 hover:bg-red-50/60'
                          : p.calculatedMarginPercent < 10
                            ? 'bg-amber-50/30 hover:bg-amber-50/50'
                            : 'hover:bg-emerald-50/30'
                      }`}
                    >
                      <TableCell className="font-medium text-slate-800">{p.name}</TableCell>
                      <TableCell className="text-slate-500">{p.sku}</TableCell>
                      <TableCell className={`text-right font-semibold ${p.calculatedMarginPercent < 0 ? 'text-red-600' : p.calculatedMarginPercent < 10 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {formatPercentage(p.calculatedMarginPercent)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${p.calculatedProfitPerUnit < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatCurrency(p.calculatedProfitPerUnit, businessSettings.currencyCode)}
                      </TableCell>
                      <TableCell><StatusBadge status={p.calculatedPricingStatus} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
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
  }> = {
    emerald: {
      bg: 'bg-gradient-to-b from-emerald-50 to-white',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      accent: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
      valueColor: 'text-emerald-700',
      gradient: 'from-emerald-50 to-white',
    },
    red: {
      bg: 'bg-gradient-to-b from-red-50 to-white',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      accent: 'bg-gradient-to-r from-red-500 to-red-400',
      valueColor: 'text-red-600',
      gradient: 'from-red-50 to-white',
    },
    amber: {
      bg: 'bg-gradient-to-b from-amber-50 to-white',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      accent: 'bg-gradient-to-r from-amber-500 to-amber-400',
      valueColor: 'text-amber-700',
      gradient: 'from-amber-50 to-white',
    },
    slate: {
      bg: 'bg-gradient-to-b from-slate-50 to-white',
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-600',
      accent: 'bg-gradient-to-r from-slate-400 to-slate-300',
      valueColor: 'text-slate-800',
      gradient: 'from-slate-50 to-white',
    },
  };

  const theme = themeConfig[color] || themeConfig.slate;

  return (
    <Card className={`shadow-md border-0 overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5 ${theme.bg}`}>
      {/* Accent strip */}
      <div className={`h-1 ${theme.accent}`} />
      <CardContent className="p-4 pt-3">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-10 w-10 rounded-full ${theme.iconBg} flex items-center justify-center`}>
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
