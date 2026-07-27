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
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Package, FileUp, Plus, Search, Trash2, CheckCircle, Eye, MoreHorizontal, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type FilterTab = 'all' | 'profitable' | 'low-margin' | 'loss-making' | 'missing-cost' | 'needs-review';

export function ProductsPage() {
  const { products, businessSettings, setCurrentView, loadSampleData, selectedProducts, setSelectedProducts, deleteSelectedProducts, approveSelectedProducts, markSelectedForReview, updateProduct } = usePricePilotStore();
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>('');
  const priceInputRef = useRef<HTMLInputElement>(null);

  const categories = [...new Set(products.map(p => p.category))];
  const brands = [...new Set(products.map(p => p.brand))];
  const channels = [...new Set(products.map(p => p.salesChannel))];

  const filtered = useMemo(() => {
    let result = [...products];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
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
    if (filterCategory !== 'all') result = result.filter(p => p.category === filterCategory);
    if (filterBrand !== 'all') result = result.filter(p => p.brand === filterBrand);
    if (filterChannel !== 'all') result = result.filter(p => p.salesChannel === filterChannel);

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
        default: aVal = a.name; bVal = b.name;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [products, search, filterTab, filterCategory, filterBrand, filterChannel, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const hasSelection = selectedProducts.length > 0;

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
          </CardContent>
        </Card>
      )}

      {/* Search + filter tabs */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white shadow-sm border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-200"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[140px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="w-[140px] bg-white shadow-sm border-slate-200 hover:border-slate-300 transition-colors duration-150">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'profitable', 'low-margin', 'loss-making', 'missing-cost', 'needs-review'] as FilterTab[]).map(tab => (
            <Button
              key={tab}
              size="sm"
              onClick={() => setFilterTab(tab)}
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
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">No products match your filters</TableCell></TableRow>
                ) : (
                  pageData.map(p => (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer transition-all duration-200 ${
                        selectedProducts.includes(p.id)
                          ? 'bg-emerald-50/50 border-l-3 border-l-emerald-500 hover:bg-emerald-50/70'
                          : 'hover:bg-gradient-to-r hover:from-emerald-50/10 hover:to-transparent border-l-3 border-l-transparent hover:border-l-emerald-300'
                      }`}
                      onClick={() => setSelectedProduct(p.id)}
                    >
                      <TableCell>
                        <Checkbox checked={selectedProducts.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell className="font-semibold text-slate-800 max-w-[200px] truncate">{p.name}</TableCell>
                      <TableCell className="text-xs text-slate-500">{p.sku}</TableCell>
                      <TableCell className="text-xs text-slate-600">{p.category}</TableCell>
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
      <ProductDetailDrawer productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
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
