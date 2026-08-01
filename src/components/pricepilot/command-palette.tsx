'use client';

/**
 * PricePilot — Command Palette (Cmd+K / Ctrl+K)
 *
 * A quick-access command palette that allows users to:
 * - Navigate to any view
 * - Search products by name or SKU
 * - Execute common actions (import, export, add product)
 * - Access settings
 *
 * Opens with Cmd+K (Mac) or Ctrl+K (Windows/Linux).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { usePricePilotStore, AppView } from '@/store/pricepilot-store';
import {
  Home,
  Package,
  FileUp,
  ClipboardCheck,
  Download,
  Settings,
  Scale,
  Calculator,
  Bookmark,
  LayoutDashboard,
  Search,
  Plus,
  Upload,
  Undo2,
  Sparkles,
} from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct?: () => void;
}

export function CommandPalette({ open, onOpenChange, onAddProduct }: CommandPaletteProps) {
  const { setCurrentView, products, undoLastAction, undoHistory, startGuidedTour } = usePricePilotStore();
  const [search, setSearch] = useState('');

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      // Use a microtask to avoid setState during render
      Promise.resolve().then(() => setSearch(''));
    }
  }, [open]);

  // Navigation items
  const navItems = useMemo(() => [
    { view: 'owner-home' as AppView, label: 'Home', icon: Home, shortcut: 'G H' },
    { view: 'products' as AppView, label: 'Products', icon: Package, shortcut: 'G P' },
    { view: 'import' as AppView, label: 'Import Price List', icon: FileUp, shortcut: 'G I' },
    { view: 'review-prices' as AppView, label: 'Review Prices', icon: ClipboardCheck, shortcut: 'G R' },
    { view: 'export' as AppView, label: 'Download Excel', icon: Download, shortcut: 'G E' },
    { view: 'pricing-rules' as AppView, label: 'Pricing Rules', icon: Scale, shortcut: 'G L' },
    { view: 'price-simulator' as AppView, label: 'Price Simulator', icon: Calculator, shortcut: 'G S' },
    { view: 'scenarios' as AppView, label: 'Saved Scenarios', icon: Bookmark, shortcut: 'G C' },
    { view: 'dashboard' as AppView, label: 'Dashboard', icon: LayoutDashboard, shortcut: 'G D' },
    { view: 'settings' as AppView, label: 'Settings', icon: Settings, shortcut: 'G T' },
  ], []);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    const query = search.toLowerCase();
    return products
      .filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [products, search]);

  const handleNavigate = (view: AppView) => {
    setCurrentView(view);
    onOpenChange(false);
  };

  const handleAddProduct = () => {
    if (onAddProduct) {
      onAddProduct();
    }
    onOpenChange(false);
  };

  const handleUndo = () => {
    if (undoHistory.length > 0) {
      undoLastAction();
    }
    onOpenChange(false);
  };

  const handleStartTour = () => {
    startGuidedTour();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search products..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        {!search.trim() && (
          <CommandGroup heading="Quick Actions">
            {onAddProduct && (
              <CommandItem onSelect={handleAddProduct}>
                <Plus className="mr-2 h-4 w-4" />
                <span>Add New Product</span>
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={() => handleNavigate('import')}>
              <Upload className="mr-2 h-4 w-4" />
              <span>Import Products</span>
              <CommandShortcut>I</CommandShortcut>
            </CommandItem>
            {undoHistory.length > 0 && (
              <CommandItem onSelect={handleUndo}>
                <Undo2 className="mr-2 h-4 w-4" />
                <span>Undo Last Action</span>
                <CommandShortcut>⌘Z</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={handleStartTour}>
              <Sparkles className="mr-2 h-4 w-4" />
              <span>Start Guided Tour</span>
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Product Search Results */}
        {filteredProducts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Products">
              {filteredProducts.map((product) => (
                <CommandItem
                  key={product.id}
                  onSelect={() => {
                    setCurrentView('products');
                    onOpenChange(false);
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  <span className="font-medium">{product.name || 'Unnamed'}</span>
                  {product.sku && (
                    <span className="ml-2 text-xs text-slate-400">{product.sku}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Navigation */}
        {!search.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.view}
                    onSelect={() => handleNavigate(item.view)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{item.label}</span>
                    <CommandShortcut>{item.shortcut}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
