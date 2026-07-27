'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Package, TrendingUp, TrendingDown, AlertTriangle, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Plus, FileUp } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, BarChart as RechartsBar, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBrand} onValueChange={setFilterBrand}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All brands" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard title="Total Products" value={String(totalProducts)} icon={Package} color="slate" />
        <SummaryCard title="Products Analysed" value={String(productsAnalysed)} icon={BarChart3} color="emerald" />
        <SummaryCard title="Avg Existing Margin" value={formatPercentage(avgExistingMargin)} icon={TrendingUp} color={avgExistingMargin >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Avg Recommended Margin" value={formatPercentage(avgRecommendedMargin)} icon={TrendingUp} color="emerald" />
        <SummaryCard title="Current Est. Profit" value={formatCurrency(currentEstimatedProfit, businessSettings.currencyCode, { compact: true })} icon={TrendingUp} color={currentEstimatedProfit >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Recommended Est. Profit" value={formatCurrency(recommendedEstimatedProfit, businessSettings.currencyCode, { compact: true })} icon={ArrowUpRight} color="emerald" />
        <SummaryCard title="Potential Improvement" value={formatCurrency(potentialImprovement, businessSettings.currencyCode, { compact: true })} icon={potentialImprovement >= 0 ? ArrowUpRight : ArrowDownRight} color={potentialImprovement >= 0 ? 'emerald' : 'red'} />
        <SummaryCard title="Loss-making Products" value={String(lossMaking)} icon={AlertTriangle} color={lossMaking > 0 ? 'red' : 'emerald'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profitability distribution pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Profitability Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RechartsPie>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </RechartsPie>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Margin comparison by category */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Existing vs Recommended Margin</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RechartsBar data={categoryMargins}>
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="existing" name="Existing %" fill="#64748b" />
                <Bar dataKey="recommended" name="Recommended %" fill="#10b981" />
              </RechartsBar>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Price recommendation distribution */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Price Recommendation Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RechartsBar data={recBarData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" name="Products">
                  {recBarData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                </Bar>
              </RechartsBar>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Improvement Opportunities */}
      {improvementOpps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Highest Improvement Opportunities</CardTitle>
            <CardDescription>Top products with the largest profit improvement potential</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Current Profit</TableHead>
                  <TableHead className="text-right">Recommended Profit</TableHead>
                  <TableHead className="text-right">Improvement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {improvementOpps.map(item => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.currentProfit, businessSettings.currencyCode)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.recommendedProfit, businessSettings.currencyCode)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(item.improvement, businessSettings.currencyCode)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Highest Risk Products */}
      {riskProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Highest-risk Products</CardTitle>
            <CardDescription>Products with negative profit, low margins, or high fees</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskProducts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.sku}</TableCell>
                    <TableCell className="text-right">{formatPercentage(p.calculatedMarginPercent)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.calculatedProfitPerUnit, businessSettings.currencyCode)}</TableCell>
                    <TableCell><StatusBadge status={p.calculatedPricingStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ElementType; color: string }) {
  const Icon = icon;
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    slate: 'text-slate-600',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${colorMap[color] || colorMap.slate}`} />
          <span className="text-xs text-muted-foreground">{title}</span>
        </div>
        <p className="text-lg font-semibold">{value}</p>
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
