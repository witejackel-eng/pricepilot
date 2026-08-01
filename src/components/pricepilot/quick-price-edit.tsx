'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Product } from '@/lib/pricepilot/types';
import { Check, X, Pencil, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Margin Color Logic
// ============================================================

type MarginLevel = 'healthy' | 'low' | 'loss';

function getMarginLevel(
  newMarginPercent: number,
  targetMarginPercent: number,
  minimumMarginPercent: number,
  breakEvenPrice: number,
  newPrice: number,
): MarginLevel {
  if (newPrice < breakEvenPrice) return 'loss';
  if (newMarginPercent < minimumMarginPercent) return 'low';
  if (newMarginPercent < targetMarginPercent) return 'low';
  return 'healthy';
}

function getMarginColor(level: MarginLevel): string {
  switch (level) {
    case 'healthy': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'low': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'loss': return 'bg-red-100 text-red-800 border-red-200';
  }
}

function getMarginDotColor(level: MarginLevel): string {
  switch (level) {
    case 'healthy': return 'bg-emerald-500';
    case 'low': return 'bg-amber-500';
    case 'loss': return 'bg-red-500';
  }
}

// ============================================================
// Component Props
// ============================================================

interface QuickPriceEditProps {
  product: Product;
  currencyCode: string;
  /** When true, the component enters edit mode (external trigger) */
  forceEdit?: boolean;
  /** Called when the component exits edit mode — parent should clear forceEdit */
  onEditEnd?: () => void;
  /** Called after the price has been saved — allows parent to e.g. close edit mode */
  onSaved?: () => void;
}

// ============================================================
// Component
// ============================================================

export function QuickPriceEdit({ product, currencyCode, forceEdit, onEditEnd, onSaved }: QuickPriceEditProps) {
  const { updateProduct, businessSettings } = usePricePilotStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived values from the product
  const currentPrice = safeNumberValue(product.currentSellingPrice, 0);
  const purchaseCost = safeNumberValue(product.purchaseCost, 0);
  const breakEvenPrice = safeNumberValue(product.calculatedBreakEvenPrice, 0);
  const currentMarginPercent = safeNumberValue(product.calculatedMarginPercent, 0);
  const currentProfitPerUnit = safeNumberValue(product.calculatedProfitPerUnit, 0);

  // Target margins from business settings
  const targetMarginPercent = safeNumberValue(businessSettings?.defaultTargetMarginPercent, 25);
  const minimumMarginPercent = safeNumberValue(businessSettings?.defaultMinimumMarginPercent, 10);

  // Parse the current edit value
  const parsedPrice = parseFloat(editValue);
  const isValidNumber = !isNaN(parsedPrice) && isFinite(parsedPrice) && parsedPrice >= 0;

  // Calculate live margin feedback
  const newMarginPercent = isValidNumber && parsedPrice > 0
    ? ((parsedPrice - purchaseCost) / parsedPrice) * 100
    : 0;
  const newProfitPerUnit = isValidNumber ? parsedPrice - purchaseCost : 0;
  const marginChange = isValidNumber ? newMarginPercent - currentMarginPercent : 0;
  const marginLevel = isValidNumber && parsedPrice > 0
    ? getMarginLevel(newMarginPercent, targetMarginPercent, minimumMarginPercent, breakEvenPrice, parsedPrice)
    : 'loss';

  // ============================================================
  // Handlers
  // ============================================================

  // Respond to external forceEdit trigger
  useEffect(() => {
    if (forceEdit && !isEditing) {
      setEditValue(String(currentPrice));
      setIsEditing(true);
    }
  }, [forceEdit, currentPrice, isEditing]);

  const startEditing = useCallback(() => {
    setEditValue(String(currentPrice));
    setIsEditing(true);
  }, [currentPrice]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
    onEditEnd?.();
  }, [onEditEnd]);

  const savePrice = useCallback(async () => {
    if (!isValidNumber) return;

    const newPrice = parsedPrice;
    // Don't save if unchanged
    if (Math.abs(newPrice - currentPrice) < 0.01) {
      cancelEditing();
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateProduct(product.id, { currentSellingPrice: newPrice });
      if (result.success) {
        toast.success('Price updated', {
          description: `${product.name} price updated to ${formatCurrency(newPrice, currencyCode)}`,
        });
        setIsEditing(false);
        setEditValue('');
        onEditEnd?.();
        onSaved?.();
      } else {
        toast.error('Failed to update price', {
          description: result.message || 'An error occurred while saving.',
        });
      }
    } catch {
      toast.error('Failed to update price', {
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [isValidNumber, parsedPrice, currentPrice, updateProduct, product.id, product.name, currencyCode, cancelEditing, onSaved]);

  const resetPrice = useCallback(() => {
    setEditValue(String(currentPrice));
    inputRef.current?.focus();
  }, [currentPrice]);

  // Auto-focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      savePrice();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  }, [savePrice, cancelEditing]);

  // ============================================================
  // Render: Display Mode
  // ============================================================

  if (!isEditing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 cursor-pointer hover:text-emerald-700 transition-colors duration-150 group/price"
            onClick={startEditing}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startEditing();
              }
            }}
            aria-label={`Edit price for ${product.name}. Current: ${formatCurrency(currentPrice, currencyCode)}`}
          >
            {formatCurrency(currentPrice, currencyCode)}
            <Pencil className="h-3 w-3 opacity-0 group-hover/price:opacity-60 text-emerald-500 transition-opacity duration-150" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Click to edit price</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // ============================================================
  // Render: Edit Mode
  // ============================================================

  const isPriceChanged = isValidNumber && Math.abs(parsedPrice - currentPrice) >= 0.01;

  return (
    <div className="flex flex-col gap-1.5 min-w-[160px] animate-in fade-in-0 slide-in-from-top-1 duration-200">
      {/* Input row */}
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-[100px] h-7 text-right text-sm border-emerald-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 tabular-nums"
          aria-label={`New selling price for ${product.name}`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={savePrice}
          disabled={!isValidNumber || isSaving || !isPriceChanged}
          aria-label="Apply new price"
          title="Apply (Enter)"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          onClick={resetPrice}
          disabled={isSaving}
          aria-label="Reset to current price"
          title="Reset"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Live margin feedback */}
      {isValidNumber && parsedPrice > 0 && isPriceChanged && (
        <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 space-y-1">
          {/* Margin indicator badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Badge
                  variant="outline"
                  className={`${getMarginColor(marginLevel)} text-[10px] px-1.5 py-0 gap-1 cursor-default`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${getMarginDotColor(marginLevel)}`} />
                  {formatPercentage(newMarginPercent, 1)} margin
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs space-y-0.5 max-w-[220px]">
              <div className="font-semibold">Margin Details</div>
              <div>Target margin: {formatPercentage(targetMarginPercent, 1)}</div>
              <div>Minimum margin: {formatPercentage(minimumMarginPercent, 1)}</div>
              <div>Break-even price: {formatCurrency(breakEvenPrice, currencyCode)}</div>
              <div>Profit/unit: {formatCurrency(newProfitPerUnit, currencyCode)}</div>
              {marginLevel === 'loss' && (
                <div className="text-red-300 font-medium">Below break-even!</div>
              )}
              {marginLevel === 'low' && (
                <div className="text-amber-300 font-medium">Below target margin</div>
              )}
              {marginLevel === 'healthy' && (
                <div className="text-emerald-300 font-medium">Meets target margin</div>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Margin change + profit per unit */}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              {marginChange > 0.05 ? (
                <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
              ) : marginChange < -0.05 ? (
                <TrendingDown className="h-2.5 w-2.5 text-red-500" />
              ) : (
                <Minus className="h-2.5 w-2.5 text-slate-400" />
              )}
              <span className={marginChange > 0.05 ? 'text-emerald-600' : marginChange < -0.05 ? 'text-red-600' : 'text-slate-400'}>
                {marginChange >= 0 ? '+' : ''}{formatPercentage(marginChange, 1)}
              </span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="tabular-nums">
              Profit: <span className={newProfitPerUnit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {formatCurrency(newProfitPerUnit, currencyCode, { showSymbol: false })}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Invalid input warning */}
      {editValue !== '' && !isValidNumber && (
        <div className="animate-in fade-in-0 duration-150 text-[10px] text-red-500">
          Enter a valid price
        </div>
      )}
    </div>
  );
}
