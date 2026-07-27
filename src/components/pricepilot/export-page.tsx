'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { ExportPreset } from '@/lib/pricepilot/types';
import { Download, FileSpreadsheet, FileText, AlertTriangle } from 'lucide-react';

const PRESETS: { value: ExportPreset; label: string; desc: string; columns: string[] }[] = [
  {
    value: 'full',
    label: 'Full Analysis',
    desc: 'Complete pricing analysis with all costs, margins, and recommendations',
    columns: ['name', 'sku', 'category', 'brand', 'purchaseCost', 'currentSellingPrice', 'recommendedPrice', 'profit', 'margin', 'markup', 'status', 'warnings'],
  },
  {
    value: 'summary',
    label: 'Simple Price List',
    desc: 'Product name, SKU, existing and recommended prices only',
    columns: ['name', 'sku', 'currentSellingPrice', 'recommendedPrice'],
  },
  {
    value: 'pricing-only',
    label: 'Pricing Only',
    desc: 'Only pricing-related columns: costs, prices, margins',
    columns: ['name', 'sku', 'purchaseCost', 'totalLandedCost', 'breakEven', 'currentSellingPrice', 'recommendedPrice', 'profit', 'margin'],
  },
  {
    value: 'cost-analysis',
    label: 'Cost Analysis',
    desc: 'Detailed cost breakdown for each product',
    columns: ['name', 'sku', 'purchaseCost', 'shippingCost', 'packagingCost', 'handlingCost', 'otherCosts', 'expectedReturnCost', 'expectedDamageCost', 'totalLandedCost'],
  },
  {
    value: 'competitor',
    label: 'Competitor Comparison',
    desc: 'Your prices vs competitor prices',
    columns: ['name', 'sku', 'currentSellingPrice', 'recommendedPrice', 'competitorLowest', 'competitorAverage', 'competitorHighest'],
  },
];

const ALL_COLUMNS = [
  { id: 'name', label: 'Product Name', group: 'Basic' },
  { id: 'sku', label: 'SKU', group: 'Basic' },
  { id: 'category', label: 'Category', group: 'Basic' },
  { id: 'brand', label: 'Brand', group: 'Basic' },
  { id: 'purchaseCost', label: 'Purchase Cost', group: 'Costs' },
  { id: 'shippingCost', label: 'Shipping Cost', group: 'Costs' },
  { id: 'packagingCost', label: 'Packaging Cost', group: 'Costs' },
  { id: 'handlingCost', label: 'Handling Cost', group: 'Costs' },
  { id: 'otherCosts', label: 'Other Costs', group: 'Costs' },
  { id: 'totalLandedCost', label: 'Total Landed Cost', group: 'Costs' },
  { id: 'breakEven', label: 'Break-even Price', group: 'Calculated' },
  { id: 'currentSellingPrice', label: 'Existing Price', group: 'Selling' },
  { id: 'recommendedPrice', label: 'Recommended Price', group: 'Selling' },
  { id: 'profit', label: 'Profit', group: 'Calculated' },
  { id: 'margin', label: 'Margin', group: 'Calculated' },
  { id: 'markup', label: 'Markup', group: 'Calculated' },
  { id: 'status', label: 'Status', group: 'Calculated' },
  { id: 'warnings', label: 'Warnings', group: 'Calculated' },
  { id: 'competitorLowest', label: 'Competitor Lowest', group: 'Market' },
  { id: 'competitorAverage', label: 'Competitor Average', group: 'Market' },
  { id: 'competitorHighest', label: 'Competitor Highest', group: 'Market' },
];

export function ExportPage() {
  const { products, businessSettings, selectedProducts } = usePricePilotStore();
  const cc = businessSettings.currencyCode;

  const [preset, setPreset] = useState<ExportPreset>('full');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [scope, setScope] = useState<'all' | 'filtered' | 'selected' | 'review' | 'approved'>('all');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(PRESETS.find(p => p.value === 'full')!.columns);

  // Filter products based on scope
  const getExportProducts = () => {
    switch (scope) {
      case 'selected': return products.filter(p => selectedProducts.includes(p.id));
      case 'review': return products.filter(p => p.calculatedPricingStatus === 'needs-review');
      case 'approved': return products.filter(p => p.isApproved);
      default: return products;
    }
  };

  const exportProducts = getExportProducts();

  const handlePresetChange = (value: ExportPreset) => {
    setPreset(value);
    const presetObj = PRESETS.find(p => p.value === value);
    if (presetObj) setSelectedColumns(presetObj.columns);
  };

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    if (exportProducts.length === 0) return;

    try {
      const XLSX = await import('xlsx');

      // Build data rows
      const rows = exportProducts.map(p => {
        const row: Record<string, string | number> = {};
        for (const col of selectedColumns) {
          switch (col) {
            case 'name': row['Product Name'] = p.name; break;
            case 'sku': row['SKU'] = p.sku; break;
            case 'category': row['Category'] = p.category; break;
            case 'brand': row['Brand'] = p.brand; break;
            case 'purchaseCost': row['Purchase Cost'] = p.purchaseCost; break;
            case 'shippingCost': row['Shipping Cost'] = p.shippingCost; break;
            case 'packagingCost': row['Packaging Cost'] = p.packagingCost; break;
            case 'handlingCost': row['Handling Cost'] = p.handlingCost; break;
            case 'otherCosts': row['Other Costs'] = p.otherCosts; break;
            case 'totalLandedCost': row['Total Landed Cost'] = p.calculatedTotalLandedCost; break;
            case 'breakEven': row['Break-even Price'] = p.calculatedBreakEvenPrice; break;
            case 'currentSellingPrice': row['Existing Price'] = p.currentSellingPrice; break;
            case 'recommendedPrice': row['Recommended Price'] = p.recommendedPrices.balanced; break;
            case 'profit': row['Profit'] = p.calculatedProfitPerUnit; break;
            case 'margin': row['Margin (%)'] = p.calculatedMarginPercent; break;
            case 'markup': row['Markup (%)'] = p.calculatedMarkupPercent; break;
            case 'status': row['Status'] = p.calculatedPricingStatus; break;
            case 'warnings': row['Warnings'] = p.calculatedProfitPerUnit < 0 ? 'Loss-making' : p.calculatedMarginPercent < businessSettings.defaultMinimumMarginPercent ? 'Low margin' : ''; break;
            case 'competitorLowest': row['Competitor Lowest'] = p.competitorPrices.length > 0 ? Math.min(...p.competitorPrices.map(c => c.price)) : 0; break;
            case 'competitorAverage': row['Competitor Average'] = p.competitorPrices.length > 0 ? p.competitorPrices.reduce((s, c) => s + c.price, 0) / p.competitorPrices.length : 0; break;
            case 'competitorHighest': row['Competitor Highest'] = p.competitorPrices.length > 0 ? Math.max(...p.competitorPrices.map(c => c.price)) : 0; break;
          }
        }
        return row;
      });

      if (format === 'csv') {
        // CSV export
        if (rows.length === 0) return;
        const headers = Object.keys(rows[0]);
        const csvLines = [
          headers.join(','),
          ...rows.map(row => headers.map(h => {
            const val = String(row[h] ?? '');
            // Escape commas and quotes
            if (val.includes(',') || val.includes('"')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(','))
        ];
        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pricepilot-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // XLSX export
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Products');

        // Add summary sheet
        const summaryData = [
          { Metric: 'Total Products', Value: exportProducts.length },
          { Metric: 'Total Inventory Cost', Value: exportProducts.reduce((s, p) => s + p.calculatedTotalLandedCost, 0) },
          { Metric: 'Total Revenue (Existing)', Value: exportProducts.reduce((s, p) => s + p.currentSellingPrice, 0) },
          { Metric: 'Total Revenue (Recommended)', Value: exportProducts.reduce((s, p) => s + p.recommendedPrices.balanced, 0) },
          { Metric: 'Loss-making Products', Value: exportProducts.filter(p => p.calculatedProfitPerUnit < 0).length },
          { Metric: 'Average Margin', Value: exportProducts.length > 0 ? exportProducts.reduce((s, p) => s + p.calculatedMarginPercent, 0) / exportProducts.length : 0 },
          { Metric: 'Export Date', Value: new Date().toISOString() },
          { Metric: 'Currency', Value: cc },
        ];
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // Products requiring review sheet
        const reviewProducts = exportProducts.filter(p => p.calculatedPricingStatus === 'needs-review' || p.calculatedPricingStatus === 'loss-making');
        if (reviewProducts.length > 0) {
          const reviewRows = reviewProducts.map(p => ({
            'Product Name': p.name,
            'SKU': p.sku,
            'Status': p.calculatedPricingStatus,
            'Current Price': p.currentSellingPrice,
            'Recommended Price': p.recommendedPrices.balanced,
            'Margin (%)': p.calculatedMarginPercent,
            'Profit': p.calculatedProfitPerUnit,
          }));
          const wsReview = XLSX.utils.json_to_sheet(reviewRows);
          XLSX.utils.book_append_sheet(wb, wsReview, 'Products Requiring Review');
        }

        XLSX.writeFile(wb, `pricepilot-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">No products to export</h2>
        <p className="text-muted-foreground">Import products first to be able to export pricing data.</p>
      </div>
    );
  }

  // Preview data
  const previewRows = exportProducts.slice(0, 5);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Export Data</h2>
          <p className="text-sm text-muted-foreground">Download your pricing analysis as a spreadsheet</p>
        </div>
      </div>

      {/* Export Scope */}
      <Card className="shadow-md border-0 rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-slate-700">Export Scope</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup value={scope} onValueChange={v => setScope(v as typeof scope)} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className={`flex items-center space-x-2 bg-white shadow-sm rounded-lg p-3 border cursor-pointer transition-all duration-200 ${scope === 'all' ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}>
              <RadioGroupItem value="all" id="all" />
              <Label htmlFor="all" className="cursor-pointer">All Products ({products.length})</Label>
            </div>
            <div className={`flex items-center space-x-2 bg-white shadow-sm rounded-lg p-3 border cursor-pointer transition-all duration-200 ${scope === 'selected' ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}>
              <RadioGroupItem value="selected" id="selected" />
              <Label htmlFor="selected" className="cursor-pointer">Selected ({selectedProducts.length})</Label>
            </div>
            <div className={`flex items-center space-x-2 bg-white shadow-sm rounded-lg p-3 border cursor-pointer transition-all duration-200 ${scope === 'review' ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}>
              <RadioGroupItem value="review" id="review" />
              <Label htmlFor="review" className="cursor-pointer">Needs Review ({products.filter(p => p.calculatedPricingStatus === 'needs-review').length})</Label>
            </div>
            <div className={`flex items-center space-x-2 bg-white shadow-sm rounded-lg p-3 border cursor-pointer transition-all duration-200 ${scope === 'approved' ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}>
              <RadioGroupItem value="approved" id="approved" />
              <Label htmlFor="approved" className="cursor-pointer">Approved ({products.filter(p => p.isApproved).length})</Label>
            </div>
          </RadioGroup>

          {scope === 'selected' && selectedProducts.length === 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> No products selected. Go to Products page and select some products first.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Format */}
      <Card className="shadow-md border-0 rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-slate-700">Export Format</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup value={format} onValueChange={v => setFormat(v as 'xlsx' | 'csv')} className="flex gap-4">
            <div className={`flex items-center space-x-3 bg-white shadow-sm rounded-lg p-3 border cursor-pointer transition-all duration-200 flex-1 ${format === 'xlsx' ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}>
              <RadioGroupItem value="xlsx" id="xlsx" />
              <Label htmlFor="xlsx" className="flex items-center gap-2 cursor-pointer">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">Excel (.xlsx)</span>
                <span className="text-xs text-muted-foreground">Multi-sheet workbook with summary</span>
              </Label>
            </div>
            <div className={`flex items-center space-x-3 bg-white shadow-sm rounded-lg p-3 border cursor-pointer transition-all duration-200 flex-1 ${format === 'csv' ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}>
              <RadioGroupItem value="csv" id="csv" />
              <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer">
                <FileText className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">CSV (.csv)</span>
                <span className="text-xs text-muted-foreground">Simple comma-separated values</span>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Preset */}
      <Card className="shadow-md border-0 rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-slate-700">Export Preset</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESETS.map(p => (
              <button
                key={p.value}
                className={`rounded-lg p-4 bg-white shadow-sm border text-left transition-all duration-200 cursor-pointer ${preset === p.value ? 'bg-emerald-50 border-emerald-300 shadow-md' : 'border-slate-100 hover:border-slate-200 hover:shadow'}`}
                onClick={() => handlePresetChange(p.value)}
              >
                <span className="font-medium text-slate-800">{p.label}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{p.desc}</span>
                <Badge variant="secondary" className="mt-2 text-xs">{p.columns.length} columns</Badge>
              </button>
            ))}
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium mb-3 block">Column Selection</Label>
            <div className="space-y-3">
              {['Basic', 'Costs', 'Selling', 'Calculated', 'Market'].map(group => {
                const groupCols = ALL_COLUMNS.filter(c => c.group === group);
                if (groupCols.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{group}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {groupCols.map(col => {
                        const isSelected = selectedColumns.includes(col.id);
                        return (
                          <div
                            key={col.id}
                            className={`flex items-center space-x-2 bg-white rounded-lg shadow-sm border px-3 py-2 transition-all duration-200 ${isSelected ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-100'}`}
                          >
                            <Checkbox
                              id={col.id}
                              checked={isSelected}
                              onCheckedChange={() => toggleColumn(col.id)}
                            />
                            <Label htmlFor={col.id} className="text-xs cursor-pointer">{col.label}</Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="shadow-md border-0 rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-700">Preview</CardTitle>
          <CardDescription>First {previewRows.length} of {exportProducts.length} products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  {selectedColumns.map(col => {
                    const colDef = ALL_COLUMNS.find(c => c.id === col);
                    return <TableHead key={col} className="text-xs whitespace-nowrap font-semibold text-slate-600">{colDef?.label || col}</TableHead>;
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((p, i) => (
                  <TableRow key={i}>
                    {selectedColumns.map(col => (
                      <TableCell key={col} className="text-xs">
                        {getCellValue(p, col, cc)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Download */}
      <div className="flex justify-end">
        <Button
          onClick={handleExport}
          disabled={exportProducts.length === 0 || selectedColumns.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-lg font-semibold text-lg px-6 py-3 transition-all duration-200"
        >
          <Download className="h-5 w-5 mr-2" /> Download {format === 'xlsx' ? 'Excel' : 'CSV'} ({exportProducts.length} products)
        </Button>
      </div>
    </div>
  );
}

function getCellValue(p: { name: string; sku: string; category: string; brand: string; purchaseCost: number; shippingCost: number; packagingCost: number; handlingCost: number; otherCosts: number; calculatedTotalLandedCost: number; calculatedBreakEvenPrice: number; currentSellingPrice: number; recommendedPrices: { balanced: number }; calculatedProfitPerUnit: number; calculatedMarginPercent: number; calculatedMarkupPercent: number; calculatedPricingStatus: string; competitorPrices: { price: number }[] }, col: string, cc: string): string {
  switch (col) {
    case 'name': return p.name;
    case 'sku': return p.sku;
    case 'category': return p.category;
    case 'brand': return p.brand;
    case 'purchaseCost': return formatCurrency(p.purchaseCost, cc);
    case 'shippingCost': return formatCurrency(p.shippingCost, cc);
    case 'packagingCost': return formatCurrency(p.packagingCost, cc);
    case 'handlingCost': return formatCurrency(p.handlingCost, cc);
    case 'otherCosts': return formatCurrency(p.otherCosts, cc);
    case 'totalLandedCost': return formatCurrency(p.calculatedTotalLandedCost, cc);
    case 'breakEven': return formatCurrency(p.calculatedBreakEvenPrice, cc);
    case 'currentSellingPrice': return formatCurrency(p.currentSellingPrice, cc);
    case 'recommendedPrice': return formatCurrency(p.recommendedPrices.balanced, cc);
    case 'profit': return formatCurrency(p.calculatedProfitPerUnit, cc);
    case 'margin': return formatPercentage(p.calculatedMarginPercent);
    case 'markup': return formatPercentage(p.calculatedMarkupPercent);
    case 'status': return p.calculatedPricingStatus;
    case 'warnings': return p.calculatedProfitPerUnit < 0 ? 'Loss-making' : '';
    case 'competitorLowest': return p.competitorPrices.length > 0 ? formatCurrency(Math.min(...p.competitorPrices.map(c => c.price)), cc) : '—';
    case 'competitorAverage': return p.competitorPrices.length > 0 ? formatCurrency(p.competitorPrices.reduce((s, c) => s + c.price, 0) / p.competitorPrices.length, cc) : '—';
    case 'competitorHighest': return p.competitorPrices.length > 0 ? formatCurrency(Math.max(...p.competitorPrices.map(c => c.price)), cc) : '—';
    default: return '';
  }
}

export default ExportPage;
