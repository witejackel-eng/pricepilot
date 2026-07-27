'use client';

import { useState, useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/pricepilot/formatting';
import { Product } from '@/lib/pricepilot/types';
import { SlidersHorizontal, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';

type AdjustmentType =
  | 'percent-increase'
  | 'percent-decrease'
  | 'fixed-add'
  | 'fixed-subtract'
  | 'set-to-recommended'
  | 'round-to-nearest';

type TargetField = 'currentSellingPrice';

interface BulkAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already-resolved list of products to adjust (either selected or filtered set). */
  products: Product[];
  /** Human-friendly scope label shown in the dialog header (e.g. "3 selected products" / "all 12 filtered products"). */
  scopeLabel: string;
  currencyCode: string;
}

const ADJUSTMENT_OPTIONS: { value: AdjustmentType; label: string; needsValue: boolean; valueLabel: string; valuePlaceholder: string }[] = [
  { value: 'percent-increase',  label: 'Percentage increase',  needsValue: true,  valueLabel: 'Increase by (%)',   valuePlaceholder: 'e.g. 10' },
  { value: 'percent-decrease',  label: 'Percentage decrease',  needsValue: true,  valueLabel: 'Decrease by (%)',   valuePlaceholder: 'e.g. 5' },
  { value: 'fixed-add',         label: 'Fixed amount add',     needsValue: true,  valueLabel: 'Add amount',        valuePlaceholder: 'e.g. 25' },
  { value: 'fixed-subtract',    label: 'Fixed amount subtract',needsValue: true,  valueLabel: 'Subtract amount',   valuePlaceholder: 'e.g. 25' },
  { value: 'set-to-recommended',label: 'Set to recommended',   needsValue: false, valueLabel: '',                  valuePlaceholder: '' },
  { value: 'round-to-nearest',  label: 'Round to nearest',     needsValue: true,  valueLabel: 'Round to nearest',  valuePlaceholder: 'e.g. 5 / 10 / 100' },
];

function computeNewPrice(product: Product, type: AdjustmentType, value: number): number {
  const current = product.currentSellingPrice;
  let next = current;
  switch (type) {
    case 'percent-increase':   next = current * (1 + value / 100); break;
    case 'percent-decrease':   next = current * (1 - value / 100); break;
    case 'fixed-add':          next = current + value; break;
    case 'fixed-subtract':     next = current - value; break;
    case 'set-to-recommended': next = product.recommendedPrices.balanced; break;
    case 'round-to-nearest':
      if (!isFinite(value) || value <= 0) return current;
      next = Math.round(current / value) * value;
      break;
    default: return current;
  }
  // Never allow negative prices
  if (!isFinite(next) || next < 0) next = 0;
  // Round to 2 decimals to keep currency sane
  return Math.round(next * 100) / 100;
}

export function BulkAdjustDialog({ open, onOpenChange, products, scopeLabel, currencyCode }: BulkAdjustDialogProps) {
  const { updateProduct, recalculateProducts } = usePricePilotStore();

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('percent-increase');
  const [valueInput, setValueInput] = useState<string>('10');
  const [targetField, setTargetField] = useState<TargetField>('currentSellingPrice');
  const [isApplying, setIsApplying] = useState(false);

  const numericValue = parseFloat(valueInput);
  const isValidValue = !ADJUSTMENT_OPTIONS.find(o => o.value === adjustmentType)?.needsValue || (!isNaN(numericValue) && numericValue >= 0);

  // Compute preview rows for the first 5 affected products
  const previewRows = useMemo(() => {
    if (!isValidValue) return [];
    return products.slice(0, 5).map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      oldPrice: p.currentSellingPrice,
      newPrice: computeNewPrice(p, adjustmentType, numericValue),
    }));
  }, [products, adjustmentType, numericValue, isValidValue]);

  const totalAffected = products.length;
  const canApply = totalAffected > 0 && isValidValue && !isApplying;

  const handleApply = () => {
    if (!canApply) return;
    setIsApplying(true);
    try {
      let applied = 0;
      for (const p of products) {
        const newPrice = computeNewPrice(p, adjustmentType, numericValue);
        // Skip no-op updates to keep undo history clean
        if (Math.abs(newPrice - p.currentSellingPrice) < 0.005) continue;
        updateProduct(p.id, { [targetField]: newPrice } as Partial<Product>);
        applied++;
      }
      // Refresh computed fields across the catalog (in case fee bases / statuses need recompute)
      recalculateProducts();
      toast.success(`Adjusted prices for ${applied} product${applied === 1 ? '' : 's'}`, {
        description: `${ADJUSTMENT_OPTIONS.find(o => o.value === adjustmentType)?.label} applied to ${scopeLabel}`,
      });
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            Bulk Adjust Prices
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Mass-adjust prices for <span className="font-medium text-emerald-700">{scopeLabel}</span>. {totalAffected} product{totalAffected === 1 ? '' : 's'} will be affected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Adjustment Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-adjust-type" className="text-slate-700">Adjustment type</Label>
              <Select value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}>
                <SelectTrigger id="bulk-adjust-type" className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-adjust-target" className="text-slate-700">Target field</Label>
              <Select value={targetField} onValueChange={(v) => setTargetField(v as TargetField)}>
                <SelectTrigger id="bulk-adjust-target" className="bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="currentSellingPrice">Current Selling Price</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Value */}
          {ADJUSTMENT_OPTIONS.find(o => o.value === adjustmentType)?.needsValue && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-adjust-value" className="text-slate-700">
                {ADJUSTMENT_OPTIONS.find(o => o.value === adjustmentType)?.valueLabel}
              </Label>
              <Input
                id="bulk-adjust-value"
                type="number"
                min={0}
                step="any"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                placeholder={ADJUSTMENT_OPTIONS.find(o => o.value === adjustmentType)?.valuePlaceholder}
                className="bg-white border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              {!isValidValue && (
                <p className="text-xs text-red-600">Please enter a valid non-negative number.</p>
              )}
            </div>
          )}

          {/* Hint for set-to-recommended */}
          {adjustmentType === 'set-to-recommended' && (
            <p className="text-xs text-slate-500 bg-emerald-50/60 border border-emerald-100 rounded-md px-3 py-2">
              Each product&apos;s Current Selling Price will be set to its <span className="font-medium text-emerald-700">Recommended (balanced)</span> price.
            </p>
          )}

          {/* Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-700">Preview (first {Math.min(5, totalAffected)} of {totalAffected})</Label>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                Old → New
              </Badge>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Old Price</TableHead>
                    <TableHead className="w-[24px]"></TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">New Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-slate-400 text-sm">
                        No products to preview.
                      </TableCell>
                    </TableRow>
                  ) : (
                    previewRows.map(row => {
                      const diff = row.newPrice - row.oldPrice;
                      return (
                        <TableRow key={row.id} className="bg-white">
                          <TableCell className="text-sm text-slate-700">
                            <div className="font-medium text-slate-800 truncate max-w-[220px]">{row.name}</div>
                            <div className="text-xs text-slate-500">{row.sku}</div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-slate-600 tabular-nums">
                            {formatCurrency(row.oldPrice, currencyCode)}
                          </TableCell>
                          <TableCell className="text-center">
                            <ArrowRight className="h-3 w-3 text-slate-400 inline" />
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            <span className={diff > 0 ? 'text-emerald-700 font-semibold' : diff < 0 ? 'text-red-600 font-semibold' : 'text-slate-700 font-semibold'}>
                              {formatCurrency(row.newPrice, currencyCode)}
                            </span>
                            {diff !== 0 && (
                              <span className={`ml-1 text-xs ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                ({diff > 0 ? '+' : ''}{formatCurrency(diff, currencyCode)})
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {totalAffected > 5 && (
              <p className="text-xs text-slate-500">+ {totalAffected - 5} more product{totalAffected - 5 === 1 ? '' : 's'} will be adjusted.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-lg" disabled={isApplying}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleApply}
            disabled={!canApply}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-sm disabled:opacity-50"
          >
            {isApplying ? (
              <>
                <span className="inline-block h-3 w-3 mr-2 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Applying...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" /> Apply to {totalAffected} product{totalAffected === 1 ? '' : 's'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkAdjustDialog;
