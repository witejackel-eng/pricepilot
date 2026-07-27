'use client';

import { useState, useMemo } from 'react';
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
import { Package, FileUp, Plus, Search, Trash2, CheckCircle, Eye, MoreHorizontal } from 'lucide-react';

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
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No products yet</h2>
        <p className="text-muted-foreground mb-6">Import your product spreadsheet or add your first product to get started.</p>
        <div className="flex gap-3">
          <Button onClick={() => setCurrentView('import')}>
            <FileUp className="h-4 w-4 mr-2" /> Import Products
          </Button>
          <Button variant="outline" onClick={() => { /* TODO: add product dialog */ }}>
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
          <Button variant="outline" onClick={() => loadSampleData()}>
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
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{selectedProducts.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => approveSelectedProducts()}>
              <CheckCircle className="h-3 w-3 mr-1" /> Approve Prices
            </Button>
            <Button size="sm" variant="outline" onClick={() => markSelectedForReview()}>
              <Eye className="h-3 w-3 mr-1" /> Mark for Review
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteSelectedProducts()}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedProducts([])}>
              Clear selection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search + filter tabs */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'profitable', 'low-margin', 'loss-making', 'missing-cost', 'needs-review'] as FilterTab).map(tab => (
            <Button key={tab} variant={filterTab === tab ? 'default' : 'outline'} size="sm" onClick={() => setFilterTab(tab)} className="gap-1">
              {tab === 'all' ? 'All' : tab === 'profitable' ? 'Profitable' : tab === 'low-margin' ? 'Low Margin' : tab === 'loss-making' ? 'Loss-making' : tab === 'missing-cost' ? 'Missing Cost' : 'Needs Review'}
              <Badge variant="secondary" className="text-xs ml-1">{tabCounts[tab]}</Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox checked={selectedProducts.length === pageData.length && pageData.length > 0} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>Product {sortIcon('name', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('sku')}>SKU {sortIcon('sku', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('category')}>Category {sortIcon('category', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('purchaseCost')}>Cost {sortIcon('purchaseCost', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('existingPrice')}>Existing Price {sortIcon('existingPrice', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('recommendedPrice')}>Recommended {sortIcon('recommendedPrice', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('profit')}>Profit {sortIcon('profit', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('margin')}>Margin {sortIcon('margin', sortBy, sortDir)}</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('markup')}>Markup {sortIcon('markup', sortBy, sortDir)}</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No products match your filters</TableCell></TableRow>
                ) : (
                  pageData.map(p => (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer hover:bg-slate-50 ${selectedProducts.includes(p.id) ? 'bg-emerald-50' : ''}`}
                      onClick={() => setSelectedProduct(p.id)}
                    >
                      <TableCell>
                        <Checkbox checked={selectedProducts.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.sku}</TableCell>
                      <TableCell className="text-xs">{p.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.purchaseCost, businessSettings.currencyCode)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.currentSellingPrice, businessSettings.currencyCode)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">{formatCurrency(p.recommendedPrices.balanced, businessSettings.currencyCode)}</TableCell>
                      <TableCell className={`text-right ${p.calculatedProfitPerUnit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(p.calculatedProfitPerUnit, businessSettings.currencyCode)}
                      </TableCell>
                      <TableCell className="text-right">{formatPercentage(p.calculatedMarginPercent)}</TableCell>
                      <TableCell className="text-right">{formatPercentage(p.calculatedMarkupPercent)}</TableCell>
                      <TableCell><StatusBadge status={p.calculatedPricingStatus} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="w-[70px] h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.max(0, Math.min(totalPages - 5, page - 2)) + i;
                  if (p >= totalPages) return null;
                  return <Button key={p} variant={page === p ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>{p + 1}</Button>;
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
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
  if (sortBy !== col) return '';
  return sortDir === 'asc' ? '↑' : '↓';
}

export default ProductsPage;
