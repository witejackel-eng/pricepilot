'use client';

/**
 * PricePilot — Multi-Currency Quick Converter Widget
 *
 * A floating, collapsible currency converter that lets the user quickly
 * convert any amount between all supported currencies (INR, USD, EUR,
 * GBP, AED). Uses indicative reference rates (last updated date shown).
 *
 * v1.2 feature.
 */

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeftRight,
  X,
  Calculator,
  Info,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/pricepilot/types';
import { toast } from 'sonner';

// ------------------------------------------------------------
// Indicative reference rates relative to 1 USD.
// These are static, indicative rates for offline conversion.
// In production these would be fetched from a live FX feed.
// ------------------------------------------------------------
const REFERENCE_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  INR: 83.25,   // 1 USD ≈ 83.25 INR
  EUR: 0.92,    // 1 USD ≈ 0.92 EUR
  GBP: 0.79,    // 1 USD ≈ 0.79 GBP
  AED: 3.67,    // 1 USD ≈ 3.67 AED
};

const RATES_LAST_UPDATED = 'Aug 2026';

interface ConversionRow {
  code: string;
  symbol: string;
  name: string;
  amount: number;
  rateUsed: number;
}

/** Convert an amount from one currency to another. */
function convert(amount: number, from: string, to: string): number {
  if (!amount || isNaN(amount)) return 0;
  const fromRate = REFERENCE_RATES_TO_USD[from];
  const toRate = REFERENCE_RATES_TO_USD[to];
  if (!fromRate || !toRate) return 0;
  // amount_in_USD = amount / fromRate; then convert to target
  const usd = amount / fromRate;
  return usd * toRate;
}

/** Quick-pick common amounts by currency. */
const QUICK_AMOUNTS: Record<string, number[]> = {
  INR: [100, 500, 1000, 5000],
  USD: [10, 50, 100, 500],
  EUR: [10, 50, 100, 500],
  GBP: [10, 50, 100, 500],
  AED: [50, 100, 500, 1000],
};

export function CurrencyConverterWidget({
  open,
  onOpenChange,
  defaultFrom = 'INR',
  defaultAmount = 100,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFrom?: string;
  defaultAmount?: number;
}) {
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [fromCurrency, setFromCurrency] = useState<string>(defaultFrom);
  const [toCurrency, setToCurrency] = useState<string>('USD');

  // Reset amount + source currency when the dialog is (re)opened.
  // Uses the render-phase "adjust state when prop changes" pattern
  // recommended by React docs (avoids setState-in-effect cascades).
  const [prevOpen, setPrevOpen] = useState<boolean>(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmount(String(defaultAmount));
      setFromCurrency(defaultFrom);
    }
  }

  const numericAmount = useMemo(() => {
    const n = parseFloat(amount);
    return isNaN(n) ? 0 : n;
  }, [amount]);

  const converted = useMemo(
    () => convert(numericAmount, fromCurrency, toCurrency),
    [numericAmount, fromCurrency, toCurrency]
  );

  // All conversions for the detail view
  const allConversions = useMemo<ConversionRow[]>(() => {
    return SUPPORTED_CURRENCIES.filter((c) => c.code !== fromCurrency).map((c) => ({
      code: c.code,
      symbol: c.symbol,
      name: c.name,
      amount: convert(numericAmount, fromCurrency, c.code),
      rateUsed: REFERENCE_RATES_TO_USD[c.code] / REFERENCE_RATES_TO_USD[fromCurrency],
    }));
  }, [numericAmount, fromCurrency]);

  const fromInfo = SUPPORTED_CURRENCIES.find((c) => c.code === fromCurrency);
  const toInfo = SUPPORTED_CURRENCIES.find((c) => c.code === toCurrency);

  const swap = useCallback(() => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  }, [fromCurrency, toCurrency]);

  const formatAmount = (value: number, decimals: number) => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const copyResult = useCallback(() => {
    if (!toInfo) return;
    const text = `${toInfo.symbol}${formatAmount(converted, toInfo.decimals)} ${toInfo.code}`;
    navigator.clipboard?.writeText(text);
    toast.success('Copied to clipboard', { description: text });
  }, [converted, toInfo]);

  const directRate = useMemo(() => {
    if (fromCurrency === toCurrency) return 1;
    return convert(1, fromCurrency, toCurrency);
  }, [fromCurrency, toCurrency]);

  const rateTrend = useMemo(() => {
    // Synthetic "trend" indicator based on rate vs 1
    if (directRate > 1) return 'up';
    if (directRate < 1) return 'down';
    return 'flat';
  }, [directRate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden gap-0">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-5 text-white">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Currency Converter
                </DialogTitle>
                <DialogDescription className="text-emerald-50/90 text-xs">
                  Quick indicative FX conversion
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Amount input + from currency */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Amount
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 text-lg font-semibold tabular-nums"
                placeholder="0.00"
              />
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="w-[130px] font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{c.symbol}</span>
                        <span>{c.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Quick amounts */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(QUICK_AMOUNTS[fromCurrency] || []).map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(String(amt))}
                  className="quick-amount-btn text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors font-medium"
                >
                  {fromInfo?.symbol}{amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Swap button */}
          <div className="flex justify-center -my-1">
            <button
              onClick={swap}
              className="currency-swap-btn h-9 w-9 rounded-full bg-white dark:bg-slate-900 border-2 border-emerald-200 dark:border-emerald-800 flex items-center justify-center hover:border-emerald-400 text-emerald-600 dark:text-emerald-400 shadow-sm"
              aria-label="Swap currencies"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          {/* Result + to currency */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Converted to
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800">
                <div className="text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                  {toInfo?.symbol}{formatAmount(converted, toInfo?.decimals ?? 2)}
                </div>
                <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                  {numericAmount > 0 && (
                    <>
                      1 {fromCurrency} = {directRate.toFixed(4)} {toCurrency}
                      {rateTrend === 'up' && <TrendingUp className="inline h-3 w-3 ml-1 text-emerald-500" />}
                      {rateTrend === 'down' && <TrendingDown className="inline h-3 w-3 ml-1 text-red-500" />}
                      {rateTrend === 'flat' && <Minus className="inline h-3 w-3 ml-1 text-slate-400" />}
                    </>
                  )}
                </div>
              </div>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="w-[130px] font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{c.symbol}</span>
                        <span>{c.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={copyResult}
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={numericAmount <= 0}
            >
              Copy result
            </Button>
          </div>

          <Separator />

          {/* All conversions table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                All rates
              </label>
              <Badge variant="outline" className="text-[10px] font-normal text-slate-400">
                <Info className="h-3 w-3 mr-1" />
                Indicative
              </Badge>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              {allConversions.map((row, idx) => (
                <div
                  key={row.code}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${
                    idx !== allConversions.length - 1
                      ? 'border-b border-slate-100 dark:border-slate-800'
                      : ''
                  } ${
                    row.code === toCurrency
                      ? 'bg-emerald-50 dark:bg-emerald-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  } transition-colors cursor-pointer`}
                  onClick={() => setToCurrency(row.code)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500 dark:text-slate-400 w-5 text-center">
                      {row.symbol}
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {row.code}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {row.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                      1 = {row.rateUsed.toFixed(4)}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100 min-w-[90px] text-right">
                      {formatAmount(row.amount, SUPPORTED_CURRENCIES.find((c) => c.code === row.code)?.decimals ?? 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5 pt-1">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>
              Indicative reference rates (as of {RATES_LAST_UPDATED}) for offline use only.
              Actual transaction rates may differ. Not for financial advice.
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Floating action button that opens the converter. Renders a compact
 * pill-style trigger suitable for the header or a floating position.
 */
export function CurrencyConverterTrigger({
  onOpen,
  currencyCode,
}: {
  onOpen: () => void;
  currencyCode: string;
}) {
  const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
  return (
    <Button
      onClick={onOpen}
      variant="ghost"
      size="sm"
      className="gap-1.5 h-8 px-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 group"
      title="Open currency converter"
    >
      <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:rotate-180 transition-transform duration-500" />
      <span className="text-xs font-medium tabular-nums">
        {info?.symbol}{currencyCode}
      </span>
    </Button>
  );
}
