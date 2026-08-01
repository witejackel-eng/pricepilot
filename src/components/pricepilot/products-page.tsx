'use client';

import { useState, useMemo, useEffect } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './status-badge';
import { ProductDetailDrawer } from './product-detail-drawer';
import { ProductComparisonDrawer } from './product-comparison-drawer';
import { BulkAdjustDialog } from './bulk-adjust-dialog';
import { PricePilotErrorBoundary } from './error-boundary';
import { QuickPriceEdit } from './quick-price-edit';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Product, SalesChannel, PricingStatus, LifecycleStatus } from '@/lib/pricepilot/types';
import { buildNonEmptyOptions, UNCATEGORISED_FILTER, UNKNOWN_BRAND_FILTER, categoryMatchesFilter, brandMatchesFilter, categoryFilterLabel, brandFilterLabel } from '@/lib/pricepilot/safe-select';
import { safeLowerCase } from '@/lib/pricepilot/safe-product';
import { Package, FileUp, Plus, Search, Trash2, CheckCircle, Eye, MoreHorizontal, ArrowLeftRight, SlidersHorizontal, Columns3, X, ChevronDown, ChevronUp, CheckCircle2, PencilLine, TrendingUp, Sparkles, ArrowUpDown, Filter, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

// Display labels for the SalesChannel union type
const CHANNEL_LABELS: Record<SalesChannel, string> = {
  'online-marketplace': 'Online Marketplace',
  'own-website': 'Own Website',
  'retail-store': 'Retail Store',
  'wholesale': 'Wholesale',
  'distributor': 'Distributor',
  'offline': 'Offline',
  'other': 'Other',
};

function channelLabel(ch: SalesChannel): string {
  return CHANNEL_LABELS[ch] || String(ch);
}

// Pricing status labels for filter dropdown
const PRICING_STATUS_OPTIONS: { value: PricingStatus; label: string }[] = [
  { value: 'loss-making', label: 'Loss-making' },
  { value: 'below-break-even', label: 'Below break-even' },
  { value: 'low-margin', label: 'Low margin' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'high-margin', label: 'High margin' },
  { value: 'above-market', label: 'Above market' },
  { value: 'missing-data', label: 'Missing data' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
];

// Lifecycle status labels for filter dropdown
const LIFECYCLE_STATUS_OPTIONS: { value: LifecycleStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'missing-data', label: 'Missing Data' },
  { value: 'needs-review', label: 'Needs Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
];

// Sort options
const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'existingPrice', label: 'Price' },
  { value: 'margin', label: 'Margin' },
  { value: 'date', label: 'Date' },
  { value: 'sku', label: 'SKU' },
  { value: 'category', label: 'Category' },
  { value: 'purchaseCost', label: 'Cost' },
  { value: 'recommendedPrice', label: 'Recommended' },
  { value: 'profit', label: 'Profit' },
  { value: 'markup', label: 'Markup' },
] as const;

type FilterTab = 'all' | 'profitable' | 'low-margin' | 'loss-making' | 'missing-cost' | 'needs-review';

export function ProductsPage() {
  const { products, businessSettings, setCurrentView, loadSampleData, selectedProducts, setSelectedProducts, deleteSelectedProducts, approveSelectedProducts, markSelectedForReview, updateProduct, approveProductPrice, applyApprovedPrice, initialFilterTab, setInitialFilterTab } = usePricePilotStore();

  // Map pricing status to FilterTab for chart click-through
  const statusToTab: Record<string, FilterTab> = {
    'healthy': 'profitable',
    'high-margin': 'profitable',
    'approved': 'profitable',
    'low-margin': 'low-margin',
    'loss-making': 'loss-making',
    'below-break-even': 'loss-making',
    'missing-data': 'missing-cost',
    'needs-review': 'needs-review',
  };

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>(() => {
    if (initialFilterTab) {
      return statusToTab[initialFilterTab] || 'all';
    }
    return 'all';
  });
  // Clear the initialFilterTab after it's been consumed
  useEffect(() => {
    if (initialFilterTab) {
      setInitialFilterTab(null);
    }
  }, [initialFilterTab, setInitialFilterTab]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [filterPricingStatus, setFilterPricingStatus] = useState<string>('all');
  const [filterLifecycleStatus, setFilterLifecycleStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);

  // Quick view card state
  const [quickViewOpen, setQuickViewOpen] = useState(true);

  // Bulk adjust dialog state
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [bulkAdjustProducts, setBulkAdjustProducts] = useState<Product[]>([]);
  const [bulkAdjustScopeLabel, setBulkAdjustScopeLabel] = useState<string>('');

  // Show more columns toggle
  const [showMoreColumns, setShowMoreColumns] = useState(false);

  const categories = buildNonEmptyOptions(products.map(p => p.category), UNCATEGORISED_FILTER);
  const brands = buildNonEmptyOptions(products.map(p => p.brand), UNKNOWN_BRAND_FILTER);
  const channels = [...new Set(products.map(p => p.salesChannel))];
  const allTags = [...new Set(products.flatMap(p => p.tags || []))].filter(t => t && t.trim()).sort();

  // Check if any filters are active (beyond defaults)
  const hasActiveFilters = search !== '' || filterTab !== 'all' || filterCategory !== 'all' || filterBrand !== 'all' || filterChannel !== 'all' || filterTag !== 'all' || filterPricingStatus !== 'all' || filterLifecycleStatus !== 'all';

  const clearAllFilters = () => {
    setSearch('');
    setFilterTab('all');
    setFilterCategory('all');
    setFilterBrand('all');
    setFilterChannel('all');
    setFilterTag('all');
    setFilterPricingStatus('all');
    setFilterLifecycleStatus('all');
    setSortBy('name');
    setSortDir('asc');
    setPage(0);
  };

  const filtered = useMemo(() => {
    let result = [...products];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => safeLowerCase(p.name).includes(q) || safeLowerCase(p.sku).includes(q) || safeLowerCase(p.category).includes(q) || safeLowerCase(p.brand).includes(q));
    }

    // Tab filter
    switch (filterTab) {
      case 'profitable': result = result.filter(p => p.calculatedPricingStatus === 'healthy' || p.calculatedPricingStatus === 'high-margin' || p.calculatedPricingStatus === 'approved'); break;
      case 'low-margin': result = result.filter(p => p.calculatedPricingStatus === 'low-margin'); break;
      case 'loss-making': result = result.filter(p => p.calculatedPricingStatus === 'loss-making' || p.calculatedPricingStatus === 'below-break-even'); break;
      case 'missing-cost': result = result.filter(p => p.calculatedPricingStatus === 'missing-data'); break;
      case 'needs-review': result = result.filter(p => p.calculatedPricingStatus === 'needs-review'); break;
    }

    // Category/Brand/Channel filters
    if (filterCategory !== 'all') result = result.filter(p => categoryMatchesFilter(p.category, filterCategory));
    if (filterBrand !== 'all') result = result.filter(p => brandMatchesFilter(p.brand, filterBrand));
    if (filterChannel !== 'all') result = result.filter(p => p.salesChannel === filterChannel);

    // Tag filter
    if (filterTag !== 'all') result = result.filter(p => (p.tags || []).includes(filterTag));

    // Pricing status filter
    if (filterPricingStatus !== 'all') result = result.filter(p => p.calculatedPricingStatus === filterPricingStatus);

    // Lifecycle status filter
    if (filterLifecycleStatus !== 'all') result = result.filter(p => p.lifecycleStatus === filterLifecycleStatus);

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (sortBy) {
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'sku': aVal = a.sku; bVal = b.sku; break;
        case 'category': aVal = a.category; bVal = b.category; break;
        case 'purchaseCost': aVal = a.purchaseCost; bVal = b.purchaseCost; break;
        case 'existingPrice': aVal = a.currentSellingPrice; bVal = b.currentSellingPrice; break;
        case 'recommendedPrice': aVal = a.recommendedPrices.balanced; bVal = b.recommendedPrices.balanced; break;
        case 'profit': aVal = a.calculatedProfitPerUnit; bVal = b.calculatedProfitPerUnit; break;
        case 'margin': aVal = a.calculatedMarginPercent; bVal = b.calculatedMarginPercent; break;
        case 'markup': aVal = a.calculatedMarkupPercent; bVal = b.calculatedMarkupPercent; break;
        case 'date': aVal = a.updatedAt; bVal = b.updatedAt; break;
        default: aVal = a.name; bVal = b.name;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [products, search, filterTab, filterCategory, filterBrand, filterChannel, filterTag, filterPricingStatus, filterLifecycleStatus, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const hasSelection = selectedProducts.length > 0;

  // Get the selected product for quick view
  const quickViewProduct = useMemo(() => {
    if (!selectedProduct) return null;
    return products.find(p => p.id === selectedProduct) || null;
  }, [selectedProduct, products]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === pageData.length && pageData.length > 0) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(pageData.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedProducts.includes(id)) {
      setSelectedProducts(selectedProducts.filter(x => x !== id));
    } else {
      setSelectedProducts([...selectedProducts, id]);
    }
  };

  const openBulkAdjustSelected = () => {
    const selected = products.filter(p => selectedProducts.includes(p.id));
    if (selected.length === 0) {
      toast.error('No products selected', { description: 'Select one or more products first, or use "Adjust All" to act on all filtered products.' });
      return;
    }
    setBulkAdjustProducts(selected);
    setBulkAdjustScopeLabel(`${selected.length} selected product${selected.length === 1 ? '' : 's'}`);
    setBulkAdjustOpen(true);
  };

  const openBulkAdjustAll = () => {
    if (filtered.length === 0) {
      toast.error('No products to adjust', { description: 'Adjust your filters first — there are no products matching the current view.' });
      return;
    }
    setBulkAdjustProducts(filtered);
    setBulkAdjustScopeLabel(`all ${filtered.length} filtered product${filtered.length === 1 ? '' : 's'}`);
    setBulkAdjustOpen(true);
  };

  // Empty state
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        {/* Gradient banner background */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-8 mb-8 w-full max-w-lg shadow-lg shadow-emerald-500/20">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-white/10 blur-xl" />
          <div className="relative flex flex-col items-center text-center">
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 mb-4">
              <Package className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">No products yet</h2>
            <p className="text-emerald-50/90 text-sm">Your product catalog is empty. Start by importing a spreadsheet or adding products manually.</p>
          </div>
        </div>
        {/* Glass-morphism action card */}
        <Card className="w-full max-w-lg border-emerald-100/50 bg-white/70 backdrop-blur-md shadow-xl rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700">Get started</span>
            </div>
            <div className="space-y-3">
              <Button
                onClick={() => setCurrentView('import')}
                className="w-full rounded-xl shadow-sm hover:shadow-md bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 h-11"
              >
                <FileUp className="h-4 w-4 mr-2" /> Import Products from Excel
              </Button>
              <Button variant="outline" onClick={() => { /* TODO: add product dialog */ }} className="w-full rounded-xl shadow-sm hover:shadow-md transition-all duration-200 h-11 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300">
                <Plus className="h-4 w-4 mr-2" /> Add Product Manually
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400">or</span>
                </div>
              </div>
              <Button variant="outline" onClick={() => loadSampleData()} className="w-full rounded-xl shadow-sm hover:shadow-md transition-all duration-200 h-11 border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50">
                <Sparkles className="h-4 w-4 mr-2 text-amber-500" /> Try Sample Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabCounts: Record<string, number> = {
    all: products.length,
    profitable: products.filter(p => ['healthy', 'high-margin', 'approved'].includes(p.calculatedPricingStatus)).length,
    'low-margin': products.filter(p => p.calculatedPricingStatus === 'low-margin').length,
    'loss-making': products.filter(p => ['loss-making', 'below-break-even'].includes(p.calculatedPricingStatus)).length,
    'missing-cost': products.filter(p => p.calculatedPricingStatus === 'missing-data').length,
    'needs-review': products.filter(p => p.calculatedPricingStatus === 'needs-review').length,
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Gradient Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 p-5 shadow-lg shadow-emerald-500/20">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-white/10 blur-xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium uppercase tracking-wider mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
              Product Catalog
            </div>
            <h1 className="text-xl font-bold text-white mb-1">
              {products.length} Product{products.length !== 1 ? 's' : ''}
            </h1>
            <p className="text-sm text-emerald-50/80">
              Manage pricing, margins, and product details
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => setCurrentView('import')}
              className="rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30 hover:border-white/50 transition-all duration-200 shadow-sm"
            >
              <FileUp className="h-3.5 w-3.5 mr-1.5" /> Import
            </Button>
            <Button
              size="sm"
              onClick={openBulkAdjustAll}
              className="rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30 hover:border-white/50 transition-all duration-200 shadow-sm"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" /> Bulk Adjust
            </Button>
          </div>
        </div>
        {/* Inline search bar inside header */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-300" />
          <Input
            placeholder="Search by name, SKU, or category..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 bg-white/15 backdrop-blur-sm border-white/20 text-white placeholder:text-emerald-100/60 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-200 h-10 rounded-xl"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(0); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-100 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Product Quick View Card */}
      {quickViewProduct && (
        <Collapsible open={quickViewOpen} onOpenChange={setQuickViewOpen}>
          <Card className="shadow-md border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 dark:border-emerald-800">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-2 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 transition-colors rounded-t-lg">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-sm text-emerald-800 dark:text-emerald-300 truncate max-w-[300px]">{quickViewProduct.name}</span>
                  <Badge variant="outline" className="text-xs bg-white/80 dark:bg-slate-800/80 border-emerald-200 dark:border-emerald-700">{quickViewProduct.sku}</Badge>
                  <Badge variant="outline" className="text-xs bg-white/80 dark:bg-slate-800/80 border-emerald-200 dark:border-emerald-700">{quickViewProduct.category}</Badge>
                </div>
                {quickViewOpen ? <ChevronUp className="h-4 w-4 text-emerald-600" /> : <ChevronDown className="h-4 w-4 text-emerald-600" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-4 pb-4 pt-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Current Price</div>
                    <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(quickViewProduct.currentSellingPrice, businessSettings.currencyCode)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Recommended Price</div>
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(quickViewProduct.recommendedPrices.balanced, businessSettings.currencyCode)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Margin</div>
                    <div className={`text-lg font-bold ${quickViewProduct.calculatedMarginPercent < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatPercentage(quickViewProduct.calculatedMarginPercent)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Status</div>
                    <StatusBadge status={quickViewProduct.calculatedPricingStatus} pulse={quickViewProduct.calculatedPricingStatus === 'needs-review' || quickViewProduct.calculatedPricingStatus === 'low-margin' || quickViewProduct.calculatedPricingStatus === 'loss-making' || quickViewProduct.calculatedPricingStatus === 'below-break-even'} />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingPriceId(quickViewProduct.id);
                    }}
                    className="rounded-lg border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-150"
                  >
                    <PencilLine className="h-3 w-3 mr-1" /> Edit Price
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      approveProductPrice(quickViewProduct.id, quickViewProduct.selectedRecommendationMode || 'balanced');
                      toast.success('Price approved', { description: `${quickViewProduct.name} price has been approved` });
                    }}
                    disabled={quickViewProduct.priceApprovalStatus === 'approved'}
                    className="rounded-lg border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-150"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      applyApprovedPrice(quickViewProduct.id);
                      toast.success('Price applied', { description: `${quickViewProduct.name} approved price has been applied` });
                    }}
                    disabled={quickViewProduct.priceApprovalStatus !== 'approved' || Math.abs(quickViewProduct.currentSellingPrice - quickViewProduct.finalApprovedPrice) < 0.01}
                    className="rounded-lg border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-150"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-lg text-slate-500 hover:text-slate-700 transition-colors duration-150"
                  >
                    <X className="h-3 w-3 mr-1" /> Close
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Bulk actions toolbar — floating glass-morphism bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-emerald-200/50 dark:border-emerald-700/50 rounded-2xl shadow-2xl shadow-emerald-500/10 px-4 py-3 flex items-center gap-2 flex-wrap max-w-[95vw]">
            <Badge className="bg-emerald-600 text-white rounded-full px-3 py-1 text-sm font-semibold shadow-sm">
              {selectedProducts.length} selected
            </Badge>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <Button size="sm" variant="ghost" onClick={() => { approveSelectedProducts(); toast.success('Prices approved', { description: `${selectedProducts.length} product prices have been approved` }); }} className="rounded-xl hover:bg-emerald-50 hover:text-emerald-700 transition-colors duration-150">
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => markSelectedForReview()} className="rounded-xl hover:bg-amber-50 hover:text-amber-700 transition-colors duration-150">
              <Eye className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl text-destructive hover:bg-red-50 hover:text-red-700 transition-colors duration-150" onClick={() => { deleteSelectedProducts(); toast.success('Products deleted', { description: `${selectedProducts.length} products have been removed` }); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedProducts.length < 2 || selectedProducts.length > 4}
              onClick={() => setCompareIds(selectedProducts.slice(0, 4))}
              className="rounded-xl hover:bg-emerald-50 hover:text-emerald-700 transition-colors duration-150 disabled:opacity-40"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Compare{selectedProducts.length > 2 ? ` (${selectedProducts.length})` : ''}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={openBulkAdjustSelected}
              className="rounded-xl hover:bg-emerald-50 hover:text-emerald-700 transition-colors duration-150 font-medium"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Bulk Adjust
            </Button>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <Button size="sm" variant="ghost" onClick={() => setSelectedProducts([])} className="rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors duration-150">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-wider">Filters</span>
          </div>

          {/* Pricing Status filter */}
          <Select value={filterPricingStatus} onValueChange={v => { setFilterPricingStatus(v); setPage(0); }}>
            <SelectTrigger className="w-[150px] bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors duration-150 rounded-xl h-8 text-xs">
              <SelectValue placeholder="Pricing Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pricing Status</SelectItem>
              {PRICING_STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Lifecycle Status filter */}
          <Select value={filterLifecycleStatus} onValueChange={v => { setFilterLifecycleStatus(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors duration-150 rounded-xl h-8 text-xs">
              <SelectValue placeholder="Lifecycle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lifecycle</SelectItem>
              {LIFECYCLE_STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(0); }}>
            <SelectTrigger className="w-[130px] bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors duration-150 rounded-xl h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{categoryFilterLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Brand filter */}
          <Select value={filterBrand} onValueChange={v => { setFilterBrand(v); setPage(0); }}>
            <SelectTrigger className="w-[130px] bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors duration-150 rounded-xl h-8 text-xs">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{brandFilterLabel(b)}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Sort dropdown */}
          <Select value={sortBy} onValueChange={v => { setSortBy(v); setPage(0); }}>
            <SelectTrigger className="w-[120px] bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors duration-150 rounded-xl h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Sort direction toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="rounded-xl bg-white shadow-sm border-slate-200 hover:border-emerald-300 transition-colors duration-150 whitespace-nowrap h-8 text-xs"
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            <ArrowUpDown className="h-3 w-3 mr-1" /> {sortDir === 'asc' ? 'Asc' : 'Desc'}
          </Button>

          {/* Clear Filters button */}
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearAllFilters}
              className="rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors duration-150 whitespace-nowrap h-8 text-xs"
            >
              <X className="h-3 w-3 mr-1" /> Clear All
            </Button>
          )}

          {/* Compare Products */}
          <Button
            size="sm"
            variant="outline"
            disabled={selectedProducts.length < 2 || selectedProducts.length > 4}
            onClick={() => setCompareIds(selectedProducts.slice(0, 4))}
            className={`rounded-xl transition-colors duration-150 whitespace-nowrap h-8 text-xs ${
              selectedProducts.length >= 2 && selectedProducts.length <= 4
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 font-medium shadow-sm'
                : 'border-slate-200 text-slate-400 opacity-50'
            }`}
            title={selectedProducts.length >= 2 && selectedProducts.length <= 4 ? `Compare ${selectedProducts.length} selected products` : 'Select 2-4 products to compare'}
          >
            <ArrowLeftRight className="h-3 w-3 mr-1" /> Compare{selectedProducts.length >= 2 ? ` (${selectedProducts.length})` : ''}
          </Button>
        </div>

        {/* Filter tabs — pill-style chips + More Columns toggle + matching count */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap flex-1">
            {(['all', 'profitable', 'low-margin', 'loss-making', 'missing-cost', 'needs-review'] as FilterTab[]).map(tab => {
              const isActive = filterTab === tab;
              const tabLabel = tab === 'all' ? 'All' : tab === 'profitable' ? 'Profitable' : tab === 'low-margin' ? 'Low Margin' : tab === 'loss-making' ? 'Loss-making' : tab === 'missing-cost' ? 'Missing Cost' : 'Needs Review';
              const tabIcon = tab === 'all' ? Package : tab === 'profitable' ? TrendingUp : tab === 'low-margin' ? AlertTriangle : tab === 'loss-making' ? XCircle : tab === 'missing-cost' ? HelpCircle : Eye;
              const TabIcon = tabIcon;
              return (
                <button
                  key={tab}
                  onClick={() => { setFilterTab(tab); setPage(0); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20 scale-[1.02]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 hover:shadow-sm'
                  }`}
                >
                  <TabIcon className="h-3 w-3" />
                  {tabLabel}
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                    isActive
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tabCounts[tab]}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Matching products count */}
          <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap mr-2 flex items-center gap-1">
            <Package className="h-3 w-3" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{filtered.length}</span>
            {' '}of {products.length}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowMoreColumns(prev => !prev)}
            className={`rounded-xl transition-all duration-200 whitespace-nowrap shrink-0 h-8 text-xs ${
              showMoreColumns
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:border-emerald-700 shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
            }`}
            title={showMoreColumns ? 'Hide extra columns' : 'Show extra columns: Brand, Sales Channel, Quantity, Monthly Units Sold, Break-even, Total Landed Cost, Last Updated'}
            aria-pressed={showMoreColumns}
          >
            <Columns3 className="h-3 w-3 mr-1" /> {showMoreColumns ? 'Fewer' : 'More Columns'}
          </Button>
        </div>
      </div>

      {/* Data Table */}
      <Card className="shadow-md border-0 overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          {/* Row count indicator */}
          <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Package className="h-3 w-3" />
              Showing <span className="font-semibold text-emerald-700 dark:text-emerald-400">{pageData.length}</span> of <span className="font-semibold">{filtered.length}</span> products
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <Filter className="h-3 w-3" />
                <span>Filters active</span>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-slate-50 to-emerald-50/10 hover:bg-slate-50 border-b border-slate-200">
                  <TableHead className="w-[40px] sticky top-0 bg-slate-50">
                    <Checkbox checked={selectedProducts.length === pageData.length && pageData.length > 0} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="cursor-pointer sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('name')}>Product {sortIcon('name', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('sku')}>SKU {sortIcon('sku', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('category')}>Category {sortIcon('category', sortBy, sortDir)}</TableHead>
                  <TableHead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Tags</TableHead>
                  {showMoreColumns && (
                    <>
                      <TableHead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Brand</TableHead>
                      <TableHead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Sales Channel</TableHead>
                      <TableHead className="text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Quantity</TableHead>
                      <TableHead className="text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Units</TableHead>
                      <TableHead className="text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Break-even</TableHead>
                      <TableHead className="text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Total Landed</TableHead>
                      <TableHead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Last Updated</TableHead>
                    </>
                  )}
                  <TableHead className="cursor-pointer text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('purchaseCost')}>Cost {sortIcon('purchaseCost', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('existingPrice')}>Existing Price {sortIcon('existingPrice', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('recommendedPrice')}>Recommended {sortIcon('recommendedPrice', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('profit')}>Profit {sortIcon('profit', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('margin')}>Margin {sortIcon('margin', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500" onClick={() => toggleSort('markup')}>Markup {sortIcon('markup', sortBy, sortDir)}</TableHead>
                  <TableHead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showMoreColumns ? 19 : 12} className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <div className="bg-slate-100 rounded-full p-4 mb-3">
                          <Search className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No products match your filters</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter criteria</p>
                        {hasActiveFilters && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={clearAllFilters}
                            className="mt-3 rounded-xl text-xs border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                          >
                            <X className="h-3 w-3 mr-1" /> Clear All Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pageData.map((p, rowIdx) => {
                    const isEven = rowIdx % 2 === 0;
                    const needsAttention = p.calculatedPricingStatus === 'needs-review' || p.calculatedPricingStatus === 'low-margin' || p.calculatedPricingStatus === 'loss-making' || p.calculatedPricingStatus === 'below-break-even';
                    return (
                      <TableRow
                        key={p.id}
                        data-testid="product-row"
                        data-sku={p.sku}
                        className={`cursor-pointer transition-all duration-200 group ${
                          selectedProducts.includes(p.id)
                            ? 'bg-emerald-50/70 border-l-[3px] border-l-emerald-500 hover:bg-emerald-50/90'
                            : selectedProduct === p.id
                            ? 'bg-emerald-50/40 border-l-[3px] border-l-emerald-400 hover:bg-emerald-50/60'
                            : isEven
                            ? 'bg-white border-l-[3px] border-l-transparent hover:border-l-emerald-400 hover:bg-emerald-50/30'
                            : 'bg-slate-50/40 border-l-[3px] border-l-transparent hover:border-l-emerald-400 hover:bg-emerald-50/30'
                        }`}
                        onClick={() => setSelectedProduct(p.id)}
                      >
                        <TableCell className="py-3">
                          <Checkbox checked={selectedProducts.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
                        </TableCell>
                        <TableCell data-testid="product-name-cell" className="font-semibold text-slate-800 max-w-[280px] truncate py-3" title={p.name}>
                          <div className="flex items-center gap-2">
                            {needsAttention && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                            {p.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 py-3">{p.sku}</TableCell>
                        <TableCell className="text-xs text-slate-600 py-3">{p.category || '—'}</TableCell>
                        <TableCell className="max-w-[120px] py-3">
                          <div className="flex gap-1 flex-wrap">
                            {(p.tags || []).slice(0, 3).map(tag => (
                              <Badge key={tag} variant="secondary" className="rounded-md text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                            {(p.tags || []).length > 3 && (
                              <Badge variant="secondary" className="rounded-md text-xs bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0">
                                +{p.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {showMoreColumns && (
                          <>
                            <TableCell className="text-xs text-slate-700 py-3">{p.brand || '—'}</TableCell>
                            <TableCell className="text-xs text-slate-700 py-3">{channelLabel(p.salesChannel)}</TableCell>
                            <TableCell className="text-right text-slate-700 tabular-nums py-3">{p.quantity.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-slate-700 tabular-nums py-3">{p.monthlyUnitsSold.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-slate-700 tabular-nums py-3">{formatCurrency(p.calculatedBreakEvenPrice, businessSettings.currencyCode)}</TableCell>
                            <TableCell className="text-right text-slate-700 tabular-nums py-3">{formatCurrency(p.calculatedTotalLandedCost, businessSettings.currencyCode)}</TableCell>
                            <TableCell className="text-xs text-slate-500 whitespace-nowrap py-3">{new Date(p.updatedAt).toLocaleDateString()}</TableCell>
                          </>
                        )}
                        <TableCell className="text-right text-slate-600 py-3">{formatCurrency(p.purchaseCost, businessSettings.currencyCode)}</TableCell>
                        <TableCell
                          className="text-right py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <QuickPriceEdit
                            product={p}
                            currencyCode={businessSettings.currencyCode}
                            forceEdit={editingPriceId === p.id}
                            onEditEnd={() => setEditingPriceId(null)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 py-3">{formatCurrency(p.recommendedPrices.balanced, businessSettings.currencyCode)}</TableCell>
                        <TableCell className={`text-right font-semibold py-3 ${p.calculatedProfitPerUnit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatCurrency(p.calculatedProfitPerUnit, businessSettings.currencyCode)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 tabular-nums py-3">{formatPercentage(p.calculatedMarginPercent)}</TableCell>
                        <TableCell className="text-right text-slate-600 tabular-nums py-3">{formatPercentage(p.calculatedMarkupPercent)}</TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={p.calculatedPricingStatus} pulse={needsAttention} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-100 rounded-b-2xl">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="text-xs">Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="w-[80px] h-8 text-xs bg-white border-slate-200 rounded-xl shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-xl hover:bg-slate-50 transition-all duration-150 disabled:opacity-40 text-xs">Prev</Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.max(0, Math.min(totalPages - 5, page - 2)) + i;
                  if (p >= totalPages) return null;
                  return (
                    <Button
                      key={p}
                      size="sm"
                      onClick={() => setPage(p)}
                      className={`rounded-xl transition-all duration-150 text-xs ${
                        page === p
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      {p + 1}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="rounded-xl hover:bg-slate-50 transition-all duration-150 disabled:opacity-40 text-xs">Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Detail Drawer */}
      <PricePilotErrorBoundary
        boundaryName="Product Detail Drawer"
        contextProductId={selectedProduct ?? undefined}
        onReturnHome={() => setSelectedProduct(null)}
      >
        <ProductDetailDrawer productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      </PricePilotErrorBoundary>

      {/* Product Comparison Drawer */}
      <ProductComparisonDrawer productIds={compareIds} onClose={() => setCompareIds(null)} />

      {/* Bulk Adjust Dialog */}
      <BulkAdjustDialog
        open={bulkAdjustOpen}
        onOpenChange={setBulkAdjustOpen}
        products={bulkAdjustProducts}
        scopeLabel={bulkAdjustScopeLabel}
        currencyCode={businessSettings.currencyCode}
      />
    </div>
  );
}

function sortIcon(col: string, sortBy: string, sortDir: 'asc' | 'desc') {
  if (sortBy !== col) return null;
  return (
    <span className="text-emerald-600 ml-0.5 font-bold">
      {sortDir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

export default ProductsPage;
