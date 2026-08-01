'use client';

/**
 * PricePilot — Competitor Price Tracking Page (v1.5)
 *
 * A dedicated page that lets the owner track competitor prices for each
 * product, see at a glance how their pricing compares to the market, and
 * spot opportunities to undercut or premium-position their catalog.
 *
 * Key features:
 *   1. Gradient header banner with title, subtitle, and help tooltip
 *   2. Three summary cards: products with competitor data, avg. price gap,
 *      and count of products priced above/below competitors
 *   3. Searchable + filterable table of products that have competitor prices
 *      (columns: Product, Your Price, Competitor Prices, Avg. Competitor Price,
 *       Price Gap, Best Competitor, Actions)
 *   4. Add/Edit dialog with dynamic competitor rows (name + price + url)
 *   5. Friendly empty state when no products have competitor data
 *   6. Polished emerald/teal styling matching the rest of the app
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency, formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { Product, CompetitorPrice } from '@/lib/pricepilot/types';
import { safeLowerCase } from '@/lib/pricepilot/safe-product';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Trophy,
  Store,
  Package,
  HelpCircle,
  Sparkles,
  ArrowRight,
  X,
  BarChart3,
  Target,
  Crown,
  Info,
  ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Constants
// ============================================================

/** Within ±5% of competitor average, the price is considered "on par" (amber). */
const PRICE_GAP_TIE_THRESHOLD_PERCENT = 5;

type PriceGapTone = 'cheaper' | 'on-par' | 'more-expensive';

type FilterValue = 'all' | 'above-competitors' | 'below-competitors' | 'no-data';

interface CompetitorRow {
  name: string;
  price: string;
  url: string;
}

// ============================================================
// Pure helpers
// ============================================================

/** Returns true if a product has at least one usable competitor price. */
function hasCompetitorData(product: Product): boolean {
  if (!Array.isArray(product.competitorPrices)) return false;
  return product.competitorPrices.some(
    (c) => c && typeof c === 'object' && safeNumberValue(c.price, 0) > 0 && c.name?.trim(),
  );
}

/** Compute the average competitor price for a product (returns 0 if none). */
function avgCompetitorPrice(product: Product): number {
  const valid = (product.competitorPrices || []).filter(
    (c) => c && safeNumberValue(c.price, 0) > 0,
  );
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, c) => acc + safeNumberValue(c.price, 0), 0);
  return sum / valid.length;
}

/** Find the cheapest competitor for a product (returns null if none). */
function bestCompetitor(product: Product): CompetitorPrice | null {
  const valid = (product.competitorPrices || []).filter(
    (c) => c && safeNumberValue(c.price, 0) > 0,
  );
  if (valid.length === 0) return null;
  return valid.reduce((best, c) =>
    safeNumberValue(c.price, 0) < safeNumberValue(best.price, 0) ? c : best,
  );
}

/** Compute the price gap (your price - avg competitor price) as a percentage. */
function priceGapPercent(product: Product): number | null {
  const avg = avgCompetitorPrice(product);
  if (avg <= 0) return null;
  const yourPrice = safeNumberValue(product.currentSellingPrice, 0);
  return ((yourPrice - avg) / avg) * 100;
}

/** Classify a product's price gap into a tone. */
function classifyGap(product: Product): PriceGapTone | null {
  const pct = priceGapPercent(product);
  if (pct === null) return null;
  if (pct < -PRICE_GAP_TIE_THRESHOLD_PERCENT) return 'cheaper';
  if (pct > PRICE_GAP_TIE_THRESHOLD_PERCENT) return 'more-expensive';
  return 'on-par';
}

/** Tone → tailwind classes for the gap badge. */
const GAP_TONE_CLASSES: Record<PriceGapTone, string> = {
  cheaper:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'on-par':
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'more-expensive':
    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
};

const GAP_TONE_ICONS: Record<PriceGapTone, React.ElementType> = {
  cheaper: TrendingDown,
  'on-par': Target,
  'more-expensive': TrendingUp,
};

const GAP_TONE_LABELS: Record<PriceGapTone, string> = {
  cheaper: 'Cheaper',
  'on-par': 'On par',
  'more-expensive': 'Priced above',
};

// ============================================================
// Main component
// ============================================================

export function CompetitorTrackingPage() {
  const {
    products,
    businessSettings,
    updateProduct,
    setSelectedProductId,
    setCurrentView,
  } = usePricePilotStore();

  const currencyCode = businessSettings.currencyCode || 'INR';

  // ---- Filter / search state ----
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');

  // ---- Dialog state ----
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProductId, setDialogProductId] = useState<string | null>(null);
  const [rows, setRows] = useState<CompetitorRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ---- Derived data ----

  // All products that have competitor data (regardless of current filter)
  const productsWithCompetitors = useMemo(
    () => products.filter(hasCompetitorData),
    [products],
  );

  // Products that don't have competitor data (used for "no-data" filter)
  const productsWithoutCompetitors = useMemo(
    () => products.filter((p) => !hasCompetitorData(p)),
    [products],
  );

  // Summary stats
  const stats = useMemo(() => {
    const withData = productsWithCompetitors.length;

    // Average price gap (% across products with competitor data)
    const gaps = productsWithCompetitors
      .map((p) => priceGapPercent(p))
      .filter((g): g is number => g !== null);
    const avgGap =
      gaps.length === 0 ? 0 : gaps.reduce((a, b) => a + b, 0) / gaps.length;

    // Priced above vs below counts (outside tie threshold)
    let aboveCount = 0;
    let belowCount = 0;
    for (const p of productsWithCompetitors) {
      const tone = classifyGap(p);
      if (tone === 'more-expensive') aboveCount++;
      else if (tone === 'cheaper') belowCount++;
    }

    return { withData, avgGap, aboveCount, belowCount };
  }, [productsWithCompetitors]);

  // Filtered + searched product list
  const filteredProducts = useMemo(() => {
    let base: Product[];
    if (filter === 'no-data') {
      base = productsWithoutCompetitors;
    } else {
      base = productsWithCompetitors;
      if (filter === 'above-competitors') {
        base = base.filter((p) => classifyGap(p) === 'more-expensive');
      } else if (filter === 'below-competitors') {
        base = base.filter((p) => classifyGap(p) === 'cheaper');
      }
    }

    if (!search.trim()) return base;

    const q = search.toLowerCase();
    return base.filter(
      (p) =>
        safeLowerCase(p.name).includes(q) ||
        safeLowerCase(p.sku).includes(q) ||
        safeLowerCase(p.category).includes(q) ||
        safeLowerCase(p.brand).includes(q),
    );
  }, [products, productsWithCompetitors, productsWithoutCompetitors, filter, search]);

  const hasActiveFilters = search !== '' || filter !== 'all';

  const clearFilters = useCallback(() => {
    setSearch('');
    setFilter('all');
  }, []);

  // ---- Click handlers ----

  const handleProductClick = useCallback(
    (productId: string) => {
      setSelectedProductId(productId);
      setCurrentView('products');
    },
    [setSelectedProductId, setCurrentView],
  );

  // Open dialog for a specific product (or "add new" if id is null)
  const openDialog = useCallback(
    (productId: string | null) => {
      setDialogProductId(productId);
      if (productId) {
        const product = products.find((p) => p.id === productId);
        const existing = product?.competitorPrices || [];
        if (existing.length > 0) {
          setRows(
            existing.map((c) => ({
              name: c.name || '',
              price: c.price != null ? String(c.price) : '',
              url: c.url || '',
            })),
          );
        } else {
          setRows([{ name: '', price: '', url: '' }]);
        }
      } else {
        setRows([{ name: '', price: '', url: '' }]);
      }
      setDialogOpen(true);
    },
    [products],
  );

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogProductId(null);
    setRows([]);
  }, []);

  const updateRow = useCallback((index: number, field: keyof CompetitorRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { name: '', price: '', url: '' }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!dialogProductId) return;
    const product = products.find((p) => p.id === dialogProductId);
    if (!product) {
      toast.error('Product not found', {
        description: 'The selected product could not be located. Please try again.',
      });
      return;
    }

    // Validate and build the cleaned competitor list
    const cleaned: CompetitorPrice[] = [];
    for (const [i, r] of rows.entries()) {
      const name = r.name.trim();
      const price = safeNumberValue(parseFloat(r.price), 0);
      const url = r.url.trim();
      if (!name && price === 0 && !url) continue; // skip fully-empty rows
      if (!name) {
        toast.error('Missing competitor name', {
          description: `Row ${i + 1}: please enter a competitor name.`,
        });
        return;
      }
      if (price <= 0) {
        toast.error('Invalid price', {
          description: `Row ${i + 1}: competitor "${name}" needs a price greater than zero.`,
        });
        return;
      }
      cleaned.push({ name, price, url: url || undefined, dateChecked: new Date().toISOString() });
    }

    setIsSaving(true);
    try {
      const result = await updateProduct(dialogProductId, { competitorPrices: cleaned });
      if (result.success) {
        toast.success('Competitor prices saved', {
          description:
            cleaned.length === 0
              ? `${product.name}: all competitor prices cleared.`
              : `${product.name}: ${cleaned.length} competitor price${cleaned.length === 1 ? '' : 's'} saved.`,
        });
        closeDialog();
      } else {
        toast.error('Failed to save', {
          description: result.message || 'Something went wrong. Please try again.',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Failed to save competitor prices', { description: message });
    } finally {
      setIsSaving(false);
    }
  }, [dialogProductId, products, rows, updateProduct, closeDialog]);

  // Close dialog on Escape (extra safety beyond what Radix does)
  useEffect(() => {
    if (!dialogOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialogOpen, closeDialog]);

  // ---- Render: dialog (so it's stable across empty / non-empty states) ----

  const dialogProduct = dialogProductId
    ? products.find((p) => p.id === dialogProductId) || null
    : null;

  const renderDialog = () => (
    <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <Store className="h-5 w-5 text-emerald-600" />
            {dialogProduct ? 'Edit Competitor Prices' : 'Add Competitor Prices'}
          </DialogTitle>
          <DialogDescription>
            {dialogProduct
              ? `Track competitor prices for "${dialogProduct.name}" so you can see how your pricing compares to the market.`
              : 'Select a product and add one or more competitor entries. Prices are used to compute the average competitor price and your price gap.'}
          </DialogDescription>
        </DialogHeader>

        {/* Product selector (only when no product is pre-selected) */}
        {!dialogProduct && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Product
            </Label>
            <Select
              value={dialogProductId || ''}
              onValueChange={(v) => setDialogProductId(v)}
            >
              <SelectTrigger className="w-full bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors rounded-xl h-10">
                <SelectValue placeholder="Select a product..." />
              </SelectTrigger>
              <SelectContent>
                {products.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No products available
                  </SelectItem>
                ) : (
                  products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-slate-400 ml-2">({p.sku})</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Selected product banner */}
        {dialogProduct && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium text-sm text-emerald-800 dark:text-emerald-300 truncate">
                {dialogProduct.name}
              </span>
              <Badge variant="outline" className="text-xs bg-white/70 dark:bg-slate-800/70 border-emerald-200 dark:border-emerald-700">
                {dialogProduct.sku}
              </Badge>
            </div>
            <Badge variant="outline" className="text-xs bg-white/70 dark:bg-slate-800/70 border-emerald-200 dark:border-emerald-700 whitespace-nowrap">
              Your price: {formatCurrency(dialogProduct.currentSellingPrice, currencyCode)}
            </Badge>
          </div>
        )}

        {/* Competitor rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Competitor entries
            </Label>
            <span className="text-xs text-slate-400">{rows.length} row{rows.length === 1 ? '' : 's'}</span>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
              No competitor rows. Click "Add competitor" to start.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1 competitor-rows-scroll">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto] gap-2 items-end rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Competitor name
                    </Label>
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(i, 'name', e.target.value)}
                      placeholder="e.g. Amazon, Flipkart"
                      className="h-9 bg-white shadow-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/30 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Price ({currencyCode})
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) => updateRow(i, 'price', e.target.value)}
                      placeholder="0.00"
                      className="h-9 bg-white shadow-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/30 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      URL (optional)
                    </Label>
                    <Input
                      value={row.url}
                      onChange={(e) => updateRow(i, 'url', e.target.value)}
                      placeholder="https://..."
                      className="h-9 bg-white shadow-sm border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/30 rounded-lg text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="h-9 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={rows.length === 1 ? 'At least one row is required' : 'Remove this competitor'}
                    aria-label="Remove competitor row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="rounded-xl border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-all duration-150 w-full"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add competitor
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={closeDialog}
            disabled={isSaving}
            className="rounded-xl border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !dialogProductId}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <span className="h-3.5 w-3.5 mr-1.5 inline-block animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Save competitor prices
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ---- Render: empty state (no products at all OR none with competitor data) ----

  if (products.length === 0) {
    return (
      <div className="space-y-4 pb-20">
        <GradientHeader
          onAddClick={() => openDialog(null)}
          addDisabled
          addTooltip="Add products first to start tracking competitor prices"
        />
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add or import products first, then come back here to track competitor prices."
        />
        {renderDialog()}
      </div>
    );
  }

  if (productsWithCompetitors.length === 0) {
    return (
      <div className="space-y-4 pb-20">
        <GradientHeader onAddClick={() => openDialog(null)} />
        <SummaryCards stats={stats} currencyCode={currencyCode} />
        <EmptyState
          icon={Store}
          title="No competitor prices tracked yet"
          description={'Click "Add competitor prices" and select a product to start tracking how your prices compare to the competition. PricePilot will compute the average competitor price, your price gap, and the cheapest competitor automatically.'}
          actionLabel="Add competitor prices"
          onAction={() => openDialog(null)}
        />
        {renderDialog()}
      </div>
    );
  }

  // ---- Render: main page ----

  return (
    <div className="space-y-4 pb-20">
      {/* Gradient header banner */}
      <GradientHeader onAddClick={() => openDialog(null)} />

      {/* Summary cards */}
      <SummaryCards stats={stats} currencyCode={currencyCode} />

      {/* Filter bar */}
      <Card className="shadow-sm border-slate-200 dark:border-slate-800 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: '60ms' }}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, SKU, category, or brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9 bg-white shadow-sm border-slate-200 hover:border-emerald-300 focus:border-emerald-400 focus:ring-emerald-400/20 transition-all duration-200 h-10 rounded-xl text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as FilterValue)}
            >
              <SelectTrigger className="w-full sm:w-[240px] bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors rounded-xl h-10 text-sm">
                <SelectValue placeholder="Filter by price position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="above-competitors">Priced above competitors</SelectItem>
                <SelectItem value="below-competitors">Priced below competitors</SelectItem>
                <SelectItem value="no-data">No competitor data</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap h-10"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main table card */}
      <Card
        className="shadow-md border-0 overflow-hidden rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={{ animationDelay: '120ms' }}
      >
        <CardContent className="p-0">
          {/* Row count indicator */}
          <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Showing{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {filteredProducts.length}
              </span>{' '}
              of <span className="font-semibold">{products.length}</span> products
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <Info className="h-3 w-3" />
                <span>Filters active</span>
              </div>
            )}
          </div>

          {/* Scrollable table */}
          {filteredProducts.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                No matches found
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Try adjusting your search or filters to find the products you're looking for.
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-4 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" /> Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto competitor-table-scroll">
              <div className="max-h-96 overflow-y-auto competitor-table-scroll-inner">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-slate-50 to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/20 hover:bg-slate-50 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-4">
                        Product
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Your Price
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Competitor Prices
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Avg. Competitor
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Price Gap
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Best Competitor
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right pr-4">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product, idx) => {
                      const yourPrice = safeNumberValue(product.currentSellingPrice, 0);
                      const avg = avgCompetitorPrice(product);
                      const best = bestCompetitor(product);
                      const gapPct = priceGapPercent(product);
                      const tone = classifyGap(product);
                      const hasData = hasCompetitorData(product);
                      const isStriped = idx % 2 === 1;

                      return (
                        <TableRow
                          key={product.id}
                          className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${
                            isStriped
                              ? 'bg-slate-50/40 dark:bg-slate-900/20'
                              : 'bg-white dark:bg-slate-950'
                          } hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20`}
                        >
                          {/* Product */}
                          <TableCell className="pl-4 py-3">
                            <button
                              onClick={() => handleProductClick(product.id)}
                              className="group flex flex-col items-start text-left max-w-[260px] focus:outline-none"
                            >
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate w-full">
                                {product.name}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                <span className="font-mono">{product.sku || '—'}</span>
                                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </span>
                            </button>
                          </TableCell>

                          {/* Your Price */}
                          <TableCell className="py-3">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {formatCurrency(yourPrice, currencyCode)}
                            </span>
                          </TableCell>

                          {/* Competitor Prices (badges) */}
                          <TableCell className="py-3">
                            {hasData ? (
                              <div className="flex flex-wrap gap-1 max-w-[280px]">
                                {(product.competitorPrices || [])
                                  .filter((c) => c && safeNumberValue(c.price, 0) > 0)
                                  .slice(0, 3)
                                  .map((c, i) => (
                                    <Badge
                                      key={i}
                                      variant="outline"
                                      className="text-[10px] font-medium bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5"
                                      title={c.url ? `Open ${c.url}` : undefined}
                                    >
                                      {c.url ? (
                                        <a
                                          href={c.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <span className="truncate max-w-[80px]">{c.name}</span>
                                          <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                      ) : (
                                        <span className="truncate max-w-[80px]">{c.name}</span>
                                      )}
                                      <span className="ml-1 font-bold">
                                        {formatCurrency(c.price, currencyCode)}
                                      </span>
                                    </Badge>
                                  ))}
                                {(product.competitorPrices || []).length > 3 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5"
                                  >
                                    +{(product.competitorPrices || []).length - 3} more
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                                No data
                              </span>
                            )}
                          </TableCell>

                          {/* Avg Competitor Price */}
                          <TableCell className="py-3">
                            {avg > 0 ? (
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {formatCurrency(avg, currencyCode)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">—</span>
                            )}
                          </TableCell>

                          {/* Price Gap */}
                          <TableCell className="py-3">
                            {tone && gapPct !== null ? (
                              <Badge
                                variant="outline"
                                className={`text-xs font-semibold border px-2 py-0.5 ${GAP_TONE_CLASSES[tone]}`}
                              >
                                {(() => {
                                  const Icon = GAP_TONE_ICONS[tone];
                                  return <Icon className="h-3 w-3 mr-1" />;
                                })()}
                                {gapPct > 0 ? '+' : ''}
                                {formatPercentage(gapPct)}
                                <span className="ml-1 opacity-70 text-[10px] font-normal">
                                  {GAP_TONE_LABELS[tone]}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400 italic">—</span>
                            )}
                          </TableCell>

                          {/* Best Competitor */}
                          <TableCell className="py-3">
                            {best ? (
                              <div className="flex items-center gap-1.5">
                                <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                                    {best.name}
                                  </span>
                                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    {formatCurrency(best.price, currencyCode)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">—</span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="py-3 pr-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDialog(product.id)}
                              className="rounded-lg border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 transition-colors h-8 text-xs"
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              {hasData ? 'Edit' : 'Add'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {renderDialog()}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

/** Gradient header banner with title, subtitle, and add button. */
function GradientHeader({
  onAddClick,
  addDisabled,
  addTooltip,
}: {
  onAddClick: () => void;
  addDisabled?: boolean;
  addTooltip?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 p-5 shadow-lg shadow-emerald-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
            <ShoppingCart className="h-3.5 w-3.5" />
            Market intelligence
          </div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">Competitor Price Tracking</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  aria-label="How competitor tracking works"
                >
                  <HelpCircle className="h-3 w-3 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs bg-slate-900 text-white border-slate-700 text-xs leading-relaxed"
              >
                <div className="space-y-1.5">
                  <div className="font-semibold text-emerald-300">How it works</div>
                  <div>
                    1. Add competitor prices for any product (name + price + optional URL).
                  </div>
                  <div>
                    2. PricePilot computes the <span className="font-medium">average competitor price</span> and your <span className="font-medium">price gap</span>.
                  </div>
                  <div>
                    3. Green = you&apos;re cheaper, amber = within ±5%, red = you&apos;re priced above competitors.
                  </div>
                  <div>
                    4. Click a product name to open its detail drawer.
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-emerald-50/80">
            Monitor how your prices compare to the competition and spot opportunities to adjust.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {addDisabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    disabled
                    className="rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/30 cursor-not-allowed opacity-70"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add competitor prices
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-slate-900 text-white border-slate-700 text-xs">
                {addTooltip || 'Add competitor prices'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              size="sm"
              onClick={onAddClick}
              className="rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30 hover:border-white/50 transition-all duration-200 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add competitor prices
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Three summary cards: products with data, avg gap, above/below counts. */
function SummaryCards({
  stats,
  currencyCode,
}: {
  stats: { withData: number; avgGap: number; aboveCount: number; belowCount: number };
  currencyCode: string;
}) {
  // unused but kept for future use; currencyCode is reserved for richer tooltips
  void currencyCode;

  const cards = [
    {
      label: 'Products with competitor data',
      value: String(stats.withData),
      sub: 'tracked products',
      icon: Store,
      gradient: 'from-emerald-500 to-teal-500',
      ring: 'ring-emerald-200/40',
      iconBg: 'bg-white/20',
    },
    {
      label: 'Avg. price gap vs competitors',
      value:
        stats.avgGap === 0
          ? '0.0%'
          : `${stats.avgGap > 0 ? '+' : ''}${formatPercentage(stats.avgGap)}`,
      sub:
        stats.avgGap > PRICE_GAP_TIE_THRESHOLD_PERCENT
          ? 'priced above market'
          : stats.avgGap < -PRICE_GAP_TIE_THRESHOLD_PERCENT
            ? 'priced below market'
            : 'on par with market',
      icon: stats.avgGap > 0 ? TrendingUp : stats.avgGap < 0 ? TrendingDown : Target,
      gradient:
        stats.avgGap > PRICE_GAP_TIE_THRESHOLD_PERCENT
          ? 'from-red-500 to-rose-500'
          : stats.avgGap < -PRICE_GAP_TIE_THRESHOLD_PERCENT
            ? 'from-emerald-500 to-teal-500'
            : 'from-amber-500 to-orange-500',
      ring:
        stats.avgGap > PRICE_GAP_TIE_THRESHOLD_PERCENT
          ? 'ring-red-200/40'
          : stats.avgGap < -PRICE_GAP_TIE_THRESHOLD_PERCENT
            ? 'ring-emerald-200/40'
            : 'ring-amber-200/40',
      iconBg: 'bg-white/20',
    },
    {
      label: 'Priced above / below',
      value: `${stats.aboveCount} / ${stats.belowCount}`,
      sub: 'above / below competitors',
      icon: BarChart3,
      gradient: 'from-teal-500 to-emerald-500',
      ring: 'ring-teal-200/40',
      iconBg: 'bg-white/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.label}
            className={`relative overflow-hidden rounded-2xl border-0 shadow-md ring-1 ${card.ring} bg-gradient-to-br ${card.gradient} transition-all hover:shadow-lg hover:-translate-y-0.5 duration-200 animate-in fade-in slide-in-from-bottom-2`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <CardContent className="p-6">
              <div className="absolute top-0 right-0 -mt-6 -mr-6 h-20 w-20 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wider text-white/80 mb-1">
                    {card.label}
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums">
                    {card.value}
                  </div>
                  <div className="text-xs text-white/70 mt-0.5">{card.sub}</div>
                </div>
                <div className={`shrink-0 rounded-xl ${card.iconBg} backdrop-blur-sm p-2.5`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Friendly empty state. */
function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 shadow-md rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-emerald-200/40 dark:bg-emerald-900/30 blur-xl animate-pulse" />
            <div className="relative h-16 w-16 rounded-full bg-white dark:bg-slate-900 shadow-md ring-1 ring-emerald-100 dark:ring-emerald-900 flex items-center justify-center">
              <Icon className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
            {title}
          </h3>
          <p className="text-sm text-emerald-700/80 dark:text-emerald-400/70 max-w-md">
            {description}
          </p>
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              className="mt-5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> {actionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
