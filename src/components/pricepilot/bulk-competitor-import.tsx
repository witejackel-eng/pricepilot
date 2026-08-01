'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileJson, FileSpreadsheet, Users, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Product, CompetitorPrice } from '@/lib/pricepilot/types';
import { formatCurrency } from '@/lib/pricepilot/formatting';

interface BulkCompetitorImportProps {
  children?: React.ReactNode;
}

interface ParsedRow {
  sku: string;
  productName?: string;
  competitorName: string;
  price: number;
  url?: string;
  matchedProductId?: string;
  matchStatus: 'matched' | 'no-match' | 'ambiguous';
}

/**
 * v1.6: Bulk Competitor Price Import dialog.
 * Accepts CSV or JSON input mapping competitor prices to products by SKU.
 * Shows a preview with match status before applying.
 */
export function BulkCompetitorImport({ children }: BulkCompetitorImportProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const { products, updateProduct } = usePricePilotStore();

  // CSV template for download
  const csvTemplate = `SKU,Competitor Name,Price,URL
ABC-001,Amazon,1299.00,https://example.com/p1
ABC-001,Flipkart,1349.00,https://example.com/p2
XYZ-002,Amazon,899.00,https://example.com/p3`;

  const jsonTemplate = `[
  { "sku": "ABC-001", "competitor": "Amazon", "price": 1299.00, "url": "https://example.com/p1" },
  { "sku": "ABC-001", "competitor": "Flipkart", "price": 1349.00, "url": "https://example.com/p2" },
  { "sku": "XYZ-002", "competitor": "Amazon", "price": 899.00 }
]`;

  const parseCSV = useCallback((text: string): ParsedRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('code'));
    const nameIdx = headers.findIndex(h => h.includes('competitor') || h.includes('name'));
    const priceIdx = headers.findIndex(h => h.includes('price'));
    const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('link'));
    const prodNameIdx = headers.findIndex(h => h.includes('product') && !h.includes('price'));

    if (skuIdx === -1 || nameIdx === -1 || priceIdx === -1) {
      throw new Error('CSV must have columns: SKU, Competitor Name, Price (URL optional)');
    }

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 3) continue;
      const sku = parts[skuIdx];
      const competitorName = parts[nameIdx];
      const priceStr = parts[priceIdx].replace(/[₹,$]/g, '');
      const price = parseFloat(priceStr);
      if (!sku || !competitorName || isNaN(price)) continue;
      rows.push({
        sku,
        productName: prodNameIdx >= 0 ? parts[prodNameIdx] : undefined,
        competitorName,
        price,
        url: urlIdx >= 0 ? parts[urlIdx] : undefined,
        matchStatus: 'no-match',
      });
    }
    return rows;
  }, []);

  const parseJSON = useCallback((text: string): ParsedRow[] => {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON must be an array of objects');
    return data.map((item: Record<string, unknown>) => {
      const sku = String(item.sku || item.code || item.sku_code || '');
      const competitorName = String(item.competitor || item.competitorName || item.name || item.competitor_name || '');
      const price = Number(item.price || item.competitorPrice || 0);
      const url = item.url || item.link ? String(item.url || item.link) : undefined;
      const productName = item.product || item.productName ? String(item.product || item.productName) : undefined;
      return { sku, competitorName, price, url, productName, matchStatus: 'no-match' as const };
    }).filter(r => r.sku && r.competitorName && !isNaN(r.price));
  }, []);

  const matchRows = useCallback((rows: ParsedRow[], allProducts: Product[]): ParsedRow[] => {
    return rows.map(row => {
      // Match by SKU (case-insensitive, trimmed)
      const matches = allProducts.filter(p =>
        p.sku.trim().toLowerCase() === row.sku.trim().toLowerCase()
      );
      if (matches.length === 1) {
        return { ...row, matchedProductId: matches[0].id, matchStatus: 'matched' as const };
      } else if (matches.length > 1) {
        return { ...row, matchStatus: 'ambiguous' as const };
      }
      return { ...row, matchStatus: 'no-match' as const };
    });
  }, []);

  const handleParse = useCallback(() => {
    try {
      const rows = format === 'csv' ? parseCSV(input) : parseJSON(input);
      if (rows.length === 0) {
        toast.error('No valid rows found in input');
        return;
      }
      const matched = matchRows(rows, products);
      setParsedRows(matched);
      setHasParsed(true);
      const matchCount = matched.filter(r => r.matchStatus === 'matched').length;
      toast.success(`Parsed ${rows.length} rows`, {
        description: `${matchCount} matched, ${matched.filter(r => r.matchStatus === 'no-match').length} unmatched, ${matched.filter(r => r.matchStatus === 'ambiguous').length} ambiguous`,
      });
    } catch (err) {
      toast.error('Failed to parse input', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [format, input, parseCSV, parseJSON, matchRows, products]);

  const handleApply = useCallback(async () => {
    const matched = parsedRows.filter(r => r.matchStatus === 'matched' && r.matchedProductId);
    if (matched.length === 0) {
      toast.error('No matched rows to import');
      return;
    }

    // Group by product ID
    const byProduct = new Map<string, ParsedRow[]>();
    for (const row of matched) {
      if (!row.matchedProductId) continue;
      if (!byProduct.has(row.matchedProductId)) {
        byProduct.set(row.matchedProductId, []);
      }
      byProduct.get(row.matchedProductId)!.push(row);
    }

    let successCount = 0;
    let failCount = 0;

    for (const [productId, rows] of byProduct) {
      const product = products.find(p => p.id === productId);
      if (!product) { failCount += rows.length; continue; }
      // Merge new competitor prices with existing ones (replace if same competitor name)
      const existingByName = new Map(product.competitorPrices.map(c => [c.name.toLowerCase(), c]));
      for (const row of rows) {
        existingByName.set(row.competitorName.toLowerCase(), {
          name: row.competitorName,
          price: row.price,
          url: row.url,
          dateChecked: new Date().toISOString(),
        });
      }
      const mergedCompetitors = Array.from(existingByName.values());
      const result = await updateProduct(productId, { competitorPrices: mergedCompetitors });
      if (result.success) {
        successCount += rows.length;
      } else {
        failCount += rows.length;
      }
    }

    toast.success(`Imported ${successCount} competitor price${successCount !== 1 ? 's' : ''}`, {
      description: failCount > 0 ? `${failCount} failed to save` : `Updated ${byProduct.size} product${byProduct.size !== 1 ? 's' : ''}`,
    });

    // Reset and close
    setInput('');
    setParsedRows([]);
    setHasParsed(false);
    setOpen(false);
  }, [parsedRows, products, updateProduct]);

  const handleDownloadTemplate = useCallback(() => {
    const content = format === 'csv' ? csvTemplate : jsonTemplate;
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `competitor-prices-template.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Template downloaded (${format.toUpperCase()})`);
  }, [format, csvTemplate, jsonTemplate]);

  const handleReset = useCallback(() => {
    setInput('');
    setParsedRows([]);
    setHasParsed(false);
  }, []);

  const matchedCount = parsedRows.filter(r => r.matchStatus === 'matched').length;
  const noMatchCount = parsedRows.filter(r => r.matchStatus === 'no-match').length;
  const ambiguousCount = parsedRows.filter(r => r.matchStatus === 'ambiguous').length;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="rounded-xl border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300">
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import Competitors
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-2 rounded-lg text-white shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            Bulk Import Competitor Prices
          </DialogTitle>
          <DialogDescription>
            Import competitor prices in bulk by matching product SKUs. Supports CSV and JSON formats.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <Tabs value={format} onValueChange={(v) => setFormat(v as 'csv' | 'json')}>
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="csv" className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </TabsTrigger>
              <TabsTrigger value="json" className="gap-1.5">
                <FileJson className="h-3.5 w-3.5" /> JSON
              </TabsTrigger>
            </TabsList>
            <TabsContent value="csv" className="mt-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">CSV format:</p>
                <p>Columns: <code className="bg-slate-100 px-1 rounded">SKU, Competitor Name, Price, URL</code></p>
                <p className="mt-1 text-slate-500">URL is optional. Price supports ₹ and , characters.</p>
              </div>
            </TabsContent>
            <TabsContent value="json" className="mt-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">JSON format:</p>
                <p>Array of objects with keys: <code className="bg-slate-100 px-1 rounded">sku, competitor, price, url</code></p>
                <p className="mt-1 text-slate-500">url is optional. Also accepts code/sku_code, name/competitorName.</p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDownloadTemplate} className="text-xs">
              <Download className="h-3 w-3 mr-1" /> Download {format.toUpperCase()} Template
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInput(format === 'csv' ? csvTemplate : jsonTemplate)}
              className="text-xs"
            >
              Load Example
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="competitor-input" className="text-xs font-medium text-slate-600">
              Paste {format.toUpperCase()} data here:
            </Label>
            <Textarea
              id="competitor-input"
              value={input}
              onChange={(e) => { setInput(e.target.value); setHasParsed(false); }}
              placeholder={format === 'csv' ? 'SKU,Competitor Name,Price,URL\n...' : '[{ "sku": "...", "competitor": "...", "price": 0 }]\n...'}
              className="font-mono text-xs min-h-[120px] resize-y rounded-xl"
            />
          </div>

          <Button onClick={handleParse} disabled={!input.trim()} className="rounded-xl self-start">
            <Upload className="h-4 w-4 mr-2" />
            Parse & Preview
          </Button>

          {hasParsed && parsedRows.length > 0 && (
            <div className="border-t border-slate-100 pt-3 flex flex-col gap-2 flex-1 overflow-hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> {matchedCount} matched
                </Badge>
                {noMatchCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200">
                    <XCircle className="h-3 w-3 mr-1" /> {noMatchCount} no match
                  </Badge>
                )}
                {ambiguousCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {ambiguousCount} ambiguous
                  </Badge>
                )}
              </div>
              <ScrollArea className="flex-1 max-h-[250px] rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-500 uppercase">SKU</th>
                      <th className="text-left p-2 font-semibold text-slate-500 uppercase">Competitor</th>
                      <th className="text-right p-2 font-semibold text-slate-500 uppercase">Price</th>
                      <th className="text-center p-2 font-semibold text-slate-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 100).map((row, i) => (
                      <tr key={i} className={`border-t border-slate-50 ${row.matchStatus === 'matched' ? 'bg-emerald-50/30' : row.matchStatus === 'ambiguous' ? 'bg-amber-50/30' : 'bg-red-50/20'}`}>
                        <td className="p-2 font-mono text-slate-700">{row.sku}</td>
                        <td className="p-2 text-slate-700">{row.competitorName}</td>
                        <td className="p-2 text-right tabular-nums text-slate-700">{formatCurrency(row.price, 'INR')}</td>
                        <td className="p-2 text-center">
                          {row.matchStatus === 'matched' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                          ) : row.matchStatus === 'ambiguous' ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-400 inline" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              {parsedRows.length > 100 && (
                <p className="text-[10px] text-slate-400 text-center">Showing first 100 of {parsedRows.length} rows</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!hasParsed || matchedCount === 0}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Import {matchedCount > 0 ? `${matchedCount} ` : ''}Competitor Price{matchedCount !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
