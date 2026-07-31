'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'N'], description: 'Add new product', category: 'Actions' },
  { keys: ['Ctrl', 'K'], description: 'Search products', category: 'Actions' },
  { keys: ['Ctrl', 'I'], description: 'Go to Import page', category: 'Navigation' },
  { keys: ['Ctrl', 'E'], description: 'Go to Export page', category: 'Navigation' },
  { keys: ['Ctrl', 'S'], description: 'Save current state as scenario', category: 'Actions' },
  { keys: ['Ctrl', 'R'], description: 'Recalculate all products', category: 'Actions' },
  { keys: ['1'], description: 'Dashboard', category: 'Views' },
  { keys: ['2'], description: 'Products', category: 'Views' },
  { keys: ['3'], description: 'Import Products', category: 'Views' },
  { keys: ['4'], description: 'Pricing Rules', category: 'Views' },
  { keys: ['5'], description: 'Price Simulator', category: 'Views' },
  { keys: ['6'], description: 'Saved Scenarios', category: 'Views' },
  { keys: ['7'], description: 'Export', category: 'Views' },
  { keys: ['8'], description: 'Settings', category: 'Views' },
  { keys: ['?', 'or', 'Ctrl', '/'], description: 'Show this shortcuts panel', category: 'Help' },
];

const VIEW_MAP: Record<string, string> = {
  '1': 'dashboard',
  '2': 'products',
  '3': 'import',
  '4': 'pricing-rules',
  '5': 'price-simulator',
  '6': 'scenarios',
  '7': 'export',
  '8': 'settings',
};

export function KeyboardShortcuts({
  onNavigate,
  onAddProduct,
  onSaveScenario,
  onRecalculate,
  onSearch,
}: {
  onNavigate: (view: string) => void;
  onAddProduct: () => void;
  onSaveScenario: () => void;
  onRecalculate: () => void;
  onSearch?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Show shortcuts overlay on '?' or Ctrl+/
    if (e.key === '?' || (e.ctrlKey && e.key === '/')) {
      e.preventDefault();
      setOpen(prev => !prev);
      return;
    }

    // Don't trigger shortcuts when user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Ctrl+N: Add new product
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      onAddProduct();
      return;
    }

    // Ctrl+K: Search
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      onSearch?.();
      return;
    }

    // Ctrl+I: Go to Import
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      onNavigate('import');
      return;
    }

    // Ctrl+E: Go to Export
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      onNavigate('export');
      return;
    }

    // Ctrl+S: Save scenario
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      onSaveScenario();
      return;
    }

    // Ctrl+R: Recalculate
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      onRecalculate();
      return;
    }

    // Number keys 1-8 for view navigation
    if (VIEW_MAP[e.key]) {
      e.preventDefault();
      onNavigate(VIEW_MAP[e.key]);
      return;
    }
  }, [onNavigate, onAddProduct, onSaveScenario, onRecalculate, onSearch]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const categories = [...new Set(SHORTCUTS.map(s => s.category))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-emerald-600" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{cat}</h3>
              <div className="space-y-1.5">
                {SHORTCUTS.filter(s => s.category === cat).map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, ki) => (
                        ki > 0 && shortcut.keys[ki - 1] === 'or' ? null :
                        key === 'or' ? (
                          <span key={ki} className="text-xs text-slate-400 mx-1">or</span>
                        ) : (
                          <Badge key={ki} variant="outline" className="text-xs font-mono bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 min-w-[28px] text-center">
                            {key}
                          </Badge>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Floating help button component
export function FloatingHelpButton({ onClick }: { onClick: () => void }) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Show a brief tooltip on first render
  useEffect(() => {
    const timer = setTimeout(() => setShowTooltip(true), 2000);
    const hideTimer = setTimeout(() => setShowTooltip(false), 6000);
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-2">
      {/* Tooltip */}
      {showTooltip && (
        <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs rounded-lg px-3 py-2 shadow-lg animate-fade-in whitespace-nowrap">
          Press <kbd className="bg-slate-700 dark:bg-slate-600 px-1.5 py-0.5 rounded text-xs font-mono">?</kbd> for shortcuts
        </div>
      )}
      {/* Button */}
      <button
        onClick={onClick}
        aria-label="Open keyboard shortcuts help"
        title="Keyboard Shortcuts (?)"
        className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 hover:shadow-xl hover:scale-105 active:scale-95"
      >
        <span className="text-lg font-bold leading-none">?</span>
      </button>
    </div>
  );
}

export default KeyboardShortcuts;
