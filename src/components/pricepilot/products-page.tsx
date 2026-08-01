'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Product, SalesChannel, PricingStatus, LifecycleStatus } from '@/lib/pricepilot/types';
import { buildNonEmptyOptions, UNCATEGORISED_FILTER, UNKNOWN_BRAND_FILTER, categoryMatchesFilter, brandMatchesFilter, categoryFilterLabel, brandFilterLabel } from '@/lib/pricepilot/safe-select';
import { safeLowerCase } from '@/lib/pricepilot/safe-product';
import { Package, FileUp, Plus, Search, Trash2, CheckCircle, Eye, MoreHorizontal, Pencil, ArrowLeftRight, SlidersHorizontal, Columns3, X, ChevronDown, ChevronUp, CheckCircle2, PencilLine } from 'lucide-react';
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
  const [editingPriceValue, setEditingPriceValue] = useState<string>('');
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

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
      <div className="flex flex-col items-center justify-center py-20">
        <div className="bg-gradient-to-br from-emerald-100 to-slate-100 rounded-full p-6 mb-6 animate-pulse">
          <Package className="h-20 w-20 text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">No products yet</h2>
        <p className="text-slate-500 mb-8 text-center max-w-md">Import your product spreadsheet or add your first product to get started.</p>
        <div className="flex gap-3">
          <Button
            onClick={() => setCurrentView('import')}
            className="rounded-lg shadow-sm hover:shadow-md bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200"
          >
            <FileUp className="h-4 w-4 mr-2" /> Import Products
          </Button>
          <Button variant="outline" onClick={() => { /* TODO: add product dialog */ }} className="rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
          <Button variant="outline" onClick={() => loadSampleData()} className="rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
            <MoreHorizontal className="h-4 w-4 mr-2" /> Try Sample Data
          </Button>
        </div>
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
    <div className="space-y-4">
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
                    <StatusBadge status={quickViewProduct.calculatedPricingStatus} />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingPriceId(quickViewProduct.id);
                      setEditingPriceValue(String(quickViewProduct.currentSellingPrice));
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

      {/* Bulk actions toolbar */}
      {hasSelection && (
        <Card className="shadow-md bg-emerald-50 border border-emerald-200">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <Badge className="bg-emerald-600 text-white rounded-lg px-2.5 py-0.5 text-sm font-semibold">
              {selectedProducts.length} selected
            </Badge>
            <Button size="sm" variant="outline" onClick={() => { approveSelectedProducts(); toast.success('Prices approved', { description: `${selectedProducts.length} product prices have been approved` }); }} className="rounded-lg border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-150">
              <CheckCircle className="h-3 w-3 mr-1" /> Approve Prices
            </Button>
            <Button size="sm" variant="outline" onClick={() => markSelectedForReview()} className="rounded-lg border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-150">
              <Eye className="h-3 w-3 mr-1" /> Mark for Review
            </Button>
            <Button size="sm" variant="outline" className="text-destructive rounded-lg border-emerald-200 hover:bg-red-50 hover:border-red-200 transition-colors duration-150" onClick={() => { deleteSelectedProducts(); toast.success('Products deleted', { description: `${selectedProducts.length} products have been removed` }); }}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedProducts([])} className="rounded-lg border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-150">
              Clear selection
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedProducts.length !== 2}
              onClick={() => setCompareIds([selectedProducts[0], selectedProducts[1]])}
              className={`rounded-lg transition-colors duration-150 ${
                selectedProducts.length === 2
                  ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 text-emerald-700'
                  : 'border-slate-200 text-slate-400 opacity-50'
              }`}
            >
              <ArrowLeftRight className="h-3 w-3 mr-1" /> Compare Products
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openBulkAdjustSelected}
              className="rounded-lg border-emerald-300 bg-emerald-100/70 text-emerald-800 hover:bg-emerald-200/70 hover:border-emerald-400 transition-colors duration-150 font-medium"
            >
              <SlidersHorizontal className="h-3 w-3 mr-1" /> Bulk Adjust
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search + filter bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, SKU, or category..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-9 bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(0); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Pricing Status filter */}
          <Select value={filterPricingStatus} onValueChange={v => { setFilterPricingStatus(v); setPage(0); }}>
            <SelectTrigger className="w-[150px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Pricing Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pricing Status</SelectItem>
              {PRICING_STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Lifecycle Status filter */}
          <Select value={filterLifecycleStatus} onValueChange={v => { setFilterLifecycleStatus(v); setPage(0); }}>
            <SelectTrigger className="w-[150px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Lifecycle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lifecycle</SelectItem>
              {LIFECYCLE_STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{categoryFilterLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Brand filter */}
          <Select value={filterBrand} onValueChange={v => { setFilterBrand(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{brandFilterLabel(b)}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Sort dropdown */}
          <Select value={sortBy} onValueChange={v => { setSortBy(v); setPage(0); }}>
            <SelectTrigger className="w-[130px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
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
            className="rounded-lg bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150 whitespace-nowrap"
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </Button>

          {/* Clear Filters button */}
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearAllFilters}
              className="rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors duration-150 whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear Filters
            </Button>
          )}

          {/* Bulk Adjust All */}
          <Button
            size="sm"
            variant="outline"
            onClick={openBulkAdjustAll}
            className="rounded-lg border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition-colors duration-150 font-medium shadow-sm whitespace-nowrap"
            title="Mass-adjust prices for all filtered products"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Bulk Adjust All
          </Button>
        </div>

        {/* Filter tabs + More Columns toggle + matching count */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap flex-1">
            {(['all', 'profitable', 'low-margin', 'loss-making', 'missing-cost', 'needs-review'] as FilterTab[]).map(tab => (
              <Button
                key={tab}
                size="sm"
                onClick={() => { setFilterTab(tab); setPage(0); }}
                className={`rounded-lg transition-all duration-200 gap-1 ${
                  filterTab === tab
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600 shadow-md shadow-emerald-500/20'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-sm'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'profitable' ? 'Profitable' : tab === 'low-margin' ? 'Low Margin' : tab === 'loss-making' ? 'Loss-making' : tab === 'missing-cost' ? 'Missing Cost' : 'Needs Review'}
                <Badge variant="secondary" className={`text-xs ml-1 ${
                  filterTab === tab
                    ? 'bg-emerald-500/30 text-white hover:bg-emerald-500/30'
                    : ''
                }`}>{tabCounts[tab]}</Badge>
              </Button>
            ))}
          </div>
          {/* Matching products count */}
          <div className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap mr-2">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{filtered.length}</span>
            {' '}of {products.length} products
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowMoreColumns(prev => !prev)}
            className={`rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 ${
              showMoreColumns
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:border-emerald-700 shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
            }`}
            title={showMoreColumns ? 'Hide extra columns' : 'Show extra columns: Brand, Sales Channel, Quantity, Monthly Units Sold, Break-even, Total Landed Cost, Last Updated'}
            aria-pressed={showMoreColumns}
          >
            <Columns3 className="h-3.5 w-3.5 mr-1" /> {showMoreColumns ? 'Fewer Columns' : 'More Columns'}
          </Button>
        </div>
      </div>

      {/* Data Table */}
      <Card className="shadow-md border-0 overflow-hidden bg-gradient-to-b from-white to-slate-50/20">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-slate-50 to-emerald-50/10 hover:bg-slate-50">
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
                  <TableRow><TableCell colSpan={showMoreColumns ? 19 : 12} className="text-center py-8 text-slate-400">No products match your filters</TableCell></TableRow>
                ) : (
                  pageData.map(p => (
                    <TableRow
                      key={p.id}
                      data-testid="product-row"
                      data-sku={p.sku}
                      className={`cursor-pointer transition-all duration-200 ${
                        selectedProducts.includes(p.id)
                          ? 'bg-emerald-50/50 border-l-3 border-l-emerald-500 hover:bg-emerald-50/70'
                          : selectedProduct === p.id
                          ? 'bg-emerald-50/30 border-l-3 border-l-emerald-400 hover:bg-emerald-50/50'
                          : 'hover:bg-gradient-to-r hover:from-emerald-50/10 hover:to-transparent border-l-3 border-l-transparent hover:border-l-emerald-300'
                      }`}
                      onClick={() => setSelectedProduct(p.id)}
                    >
                      <TableCell>
                        <Checkbox checked={selectedProducts.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell className="font-semibold text-slate-800 max-w-[280px] truncate" title={p.name}>{p.name}</TableCell>
                      <TableCell className="text-xs text-slate-500">{p.sku}</TableCell>
                      <TableCell className="text-xs text-slate-600">{p.category || '—'}</TableCell>
                      <TableCell className="max-w-[120px]">
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
                          <TableCell className="text-xs text-slate-700">{p.brand || '—'}</TableCell>
                          <TableCell className="text-xs text-slate-700">{channelLabel(p.salesChannel)}</TableCell>
                          <TableCell className="text-right text-slate-700 tabular-nums">{p.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-slate-700 tabular-nums">{p.monthlyUnitsSold.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-slate-700 tabular-nums">{formatCurrency(p.calculatedBreakEvenPrice, businessSettings.currencyCode)}</TableCell>
                          <TableCell className="text-right text-slate-700 tabular-nums">{formatCurrency(p.calculatedTotalLandedCost, businessSettings.currencyCode)}</TableCell>
                          <TableCell className="text-xs text-slate-500 whitespace-nowrap">{new Date(p.updatedAt).toLocaleDateString()}</TableCell>
                        </>
                      )}
                      <TableCell className="text-right text-slate-600">{formatCurrency(p.purchaseCost, businessSettings.currencyCode)}</TableCell>
                      <TableCell
                        className="text-right group relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingPriceId === p.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              ref={priceInputRef}
                              type="number"
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              onBlur={() => {
                                const newPrice = parseFloat(editingPriceValue);
                                if (!isNaN(newPrice) && newPrice >= 0) {
                                  updateProduct(p.id, { currentSellingPrice: newPrice });
                                  toast.success('Price updated', { description: `${p.name} price updated to ${formatCurrency(newPrice, businessSettings.currencyCode)}` });
                                }
                                setEditingPriceId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newPrice = parseFloat(editingPriceValue);
                                  if (!isNaN(newPrice) && newPrice >= 0) {
                                    updateProduct(p.id, { currentSellingPrice: newPrice });
                                    toast.success('Price updated', { description: `${p.name} price updated to ${formatCurrency(newPrice, businessSettings.currencyCode)}` });
                                  }
                                  setEditingPriceId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingPriceId(null);
                                }
                              }}
                              className="w-[100px] h-7 text-right text-sm border-emerald-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 cursor-pointer hover:text-emerald-700 transition-colors duration-150"
                            onClick={() => {
                              setEditingPriceId(p.id);
                              setEditingPriceValue(String(p.currentSellingPrice));
                            }}
                          >
                            {formatCurrency(p.currentSellingPrice, businessSettings.currencyCode)}
                            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 text-emerald-500 transition-opacity duration-150" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(p.recommendedPrices.balanced, businessSettings.currencyCode)}</TableCell>
                      <TableCell className={`text-right font-semibold ${p.calculatedProfitPerUnit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(p.calculatedProfitPerUnit, businessSettings.currencyCode)}
                      </TableCell>
                      <TableCell className="text-right text-slate-600 tabular-nums">{formatPercentage(p.calculatedMarginPercent)}</TableCell>
                      <TableCell className="text-right text-slate-600 tabular-nums">{formatPercentage(p.calculatedMarkupPercent)}</TableCell>
                      <TableCell><StatusBadge status={p.calculatedPricingStatus} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-100">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="w-[80px] h-8 text-xs bg-white border-slate-200 rounded-lg shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg hover:bg-slate-50 transition-all duration-150 disabled:opacity-40">Prev</Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.max(0, Math.min(totalPages - 5, page - 2)) + i;
                  if (p >= totalPages) return null;
                  return (
                    <Button
                      key={p}
                      size="sm"
                      onClick={() => setPage(p)}
                      className={`rounded-lg transition-all duration-150 ${
                        page === p
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      {p + 1}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="rounded-lg hover:bg-slate-50 transition-all duration-150 disabled:opacity-40">Next</Button>
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
