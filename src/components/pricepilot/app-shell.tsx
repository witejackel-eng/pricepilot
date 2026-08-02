'use client';

import { useState, useEffect } from 'react';
import { usePricePilotStore, AppView } from '@/store/pricepilot-store';
import { ApplicationMode } from '@/lib/pricepilot/types';
import { formatPercentage, safeNumberValue } from '@/lib/pricepilot/formatting';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  LayoutDashboard,
  Package,
  FileUp,
  Scale,
  Calculator,
  Bookmark,
  Download,
  Settings,
  Menu,
  ShieldCheck,
  Upload,
  Home,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Undo2,
  HelpCircle,
  Search,
  User,
  Command,
  Sparkles,
  ArrowRightLeft,
  Users,
  History,
  Crown,
  TrendingUpDown,
  Bell,
} from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/pricepilot/types';
import { DashboardPage } from './dashboard-page';
import { OwnerHome } from './owner-home';
import { ReviewPricesPage } from './review-prices-page';
import { ProductsPage } from './products-page';
import { ImportFlow } from './import-flow';
import { PricePilotErrorBoundary } from './error-boundary';
import { PricingRulesPage } from './pricing-rules-page';
import { PriceSimulator } from './price-simulator';
import { ScenariosPage } from './scenarios-page';
import { ExportPage } from './export-page';
import { SettingsPage } from './settings-page';
import { AddProductDialog } from './add-product-dialog';
import { KeyboardShortcuts, FloatingHelpButton } from './keyboard-shortcuts';
import { HelpPanel } from './help-panel';
import { GuidedTour, TourInvitation } from './guided-tour';
import { CommandPalette } from './command-palette';
import { CurrencyConverterWidget } from './currency-converter-widget';
import { MarginAlertsPanel } from './margin-alerts-panel';
import { NotificationCenter } from './notification-center';
import { CSVExportButton } from './csv-export-button';
import { CompetitorTrackingPage } from './competitor-tracking-page';
import { PriceHistoryPage } from './price-history-page';
import { PriceElasticityPage } from './price-elasticity-page';
import { PriceAlertsPage } from './price-alerts-page';
import { toast } from 'sonner';

// Owner mode navigation items.
const OWNER_NAV_ITEMS: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'owner-home', label: 'Home', icon: Home },
  { view: 'products', label: 'Products', icon: Package },
  { view: 'import', label: 'Import Price List', icon: FileUp },
  { view: 'review-prices', label: 'Review Prices', icon: ClipboardCheck },
  { view: 'competitor-tracking', label: 'Competitor Tracking', icon: Users },
  { view: 'price-elasticity', label: 'Elasticity', icon: TrendingUpDown },
  { view: 'price-alerts', label: 'Price Alerts', icon: Bell },
  { view: 'export', label: 'Download Excel', icon: Download },
  { view: 'price-history', label: 'Price History', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings },
];

// Advanced mode navigation items
const ADVANCED_NAV_ITEMS: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'products', label: 'Products', icon: Package },
  { view: 'import', label: 'Import Products', icon: FileUp },
  { view: 'pricing-rules', label: 'Pricing Rules', icon: Scale },
  { view: 'price-simulator', label: 'Price Simulator', icon: Calculator },
  { view: 'scenarios', label: 'Saved Scenarios', icon: Bookmark },
  { view: 'competitor-tracking', label: 'Competitor Tracking', icon: Users },
  { view: 'price-elasticity', label: 'Elasticity', icon: TrendingUpDown },
  { view: 'price-alerts', label: 'Price Alerts', icon: Bell },
  { view: 'export', label: 'Export', icon: Download },
  { view: 'price-history', label: 'Price History', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings },
];

// Advanced tools section for owner mode
const ADVANCED_TOOLS_ITEMS: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'pricing-rules', label: 'Pricing Rules', icon: Scale },
  { view: 'price-simulator', label: 'Price Simulator', icon: Calculator },
  { view: 'scenarios', label: 'Saved Scenarios', icon: Bookmark },
];

const VIEW_LABELS: Record<AppView, string> = {
  'owner-home': 'Home',
  'review-prices': 'Review Prices',
  'dashboard': 'Dashboard',
  'products': 'Products',
  'import': 'Import',
  'pricing-rules': 'Pricing Rules',
  'price-simulator': 'Price Simulator',
  'scenarios': 'Saved Scenarios',
  'export': 'Export',
  'settings': 'Settings',
  'competitor-tracking': 'Competitor Tracking',
  'price-history': 'Price History',
  'price-elasticity': 'Price Elasticity',
  'price-alerts': 'Price Alerts',
};

// Mobile bottom nav items (owner mode) — show top 5 most important
const OWNER_MOBILE_NAV: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'owner-home', label: 'Home', icon: Home },
  { view: 'products', label: 'Products', icon: Package },
  { view: 'review-prices', label: 'Review', icon: ClipboardCheck },
  { view: 'export', label: 'Export', icon: Download },
  { view: 'settings', label: 'Settings', icon: Settings },
];

// Mobile bottom nav items (advanced mode)
const ADVANCED_MOBILE_NAV: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'products', label: 'Products', icon: Package },
  { view: 'pricing-rules', label: 'Rules', icon: Scale },
  { view: 'export', label: 'Export', icon: Download },
  { view: 'settings', label: 'Settings', icon: Settings },
];

// Mode switcher component with animated toggle
function ModeSwitcher({ currentMode, onModeChange }: { currentMode: ApplicationMode; onModeChange: (mode: ApplicationMode) => void }) {
  const isOwner = currentMode === 'owner';
  return (
    <div className="flex items-center gap-1 bg-emerald-800/50 rounded-lg p-1">
      <button
        onClick={() => onModeChange('owner')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
          isOwner
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-900/30'
            : 'text-slate-200 hover:text-white'
        }`}
      >
        <Home className="h-3 w-3" />
        Owner
      </button>
      <button
        onClick={() => onModeChange('advanced')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
          !isOwner
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-900/30'
            : 'text-slate-200 hover:text-white'
        }`}
      >
        <LayoutDashboard className="h-3 w-3" />
        Advanced
      </button>
    </div>
  );
}

function SidebarContent({ currentView, setCurrentView, businessSettings, resetApplication, onNavClick, lossMakingCount, inactiveRulesCount, applicationMode, onModeChange }: {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  businessSettings: { businessName: string };
  resetApplication: () => void;
  onNavClick?: () => void;
  lossMakingCount: number;
  inactiveRulesCount: number;
  applicationMode: ApplicationMode;
  onModeChange: (mode: ApplicationMode) => void;
}) {
  const { undoHistory, undoLastAction } = usePricePilotStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const navItems = applicationMode === 'owner' ? OWNER_NAV_ITEMS : ADVANCED_NAV_ITEMS;

  return (
    <div className="flex flex-col h-full">
      {/* Logo area with subtle animation */}
      <div className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-700/30 relative overflow-hidden group shimmer-logo">
          <span className="relative z-10">P</span>
          {/* Subtle shine animation */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
        <div>
          <h2 className="font-semibold text-sm leading-tight text-white flex items-center gap-1.5">
            PricePilot
            <Sparkles className="h-3 w-3 text-emerald-300 opacity-60" />
          </h2>
          <p className="text-xs text-emerald-200 truncate max-w-[140px]">{businessSettings.businessName || 'My Workspace'}</p>
        </div>
      </div>

      <Separator className="my-2 mx-3 bg-emerald-700/50" />

      {/* Mode switcher */}
      <div className="px-3 pb-2">
        <ModeSwitcher currentMode={applicationMode} onModeChange={onModeChange} />
      </div>

      {/* Undo button */}
      {undoHistory.length > 0 && (
        <div className="px-3 pb-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-emerald-300/70 hover:text-emerald-200 transition-colors duration-200 text-xs rounded-lg bg-emerald-800/30">
            <Undo2 className="h-3 w-3" />
            Undo: {undoHistory[0].description.slice(0, 30)}...
          </Button>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          // Notification badge counts
          const badgeCount = item.view === 'products' ? lossMakingCount : item.view === 'pricing-rules' ? inactiveRulesCount : item.view === 'review-prices' ? lossMakingCount : 0;
          const badgeColor = item.view === 'products' || item.view === 'review-prices' ? 'bg-red-500' : 'bg-amber-500';
          return (
            <Button
              key={item.view}
              variant="ghost"
              title={item.label}
              data-testid={`nav-${item.view}`}
              className={`w-full justify-start gap-3 rounded-lg transition-all duration-200 relative overflow-hidden ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500/40 to-teal-500/25 text-white font-medium shadow-lg shadow-emerald-900/30 border-l-[3px] border-emerald-400 before:absolute before:inset-0 before:bg-gradient-to-r before:from-emerald-500/15 before:to-transparent before:pointer-events-none nav-active-gradient-border'
                  : 'text-emerald-100/80 hover:bg-emerald-700/40 hover:text-white hover:translate-x-0.5'
              }`}
              onClick={() => { setCurrentView(item.view); if (onNavClick) onNavClick(); }}
            >
              <span className="relative">
                {isActive ? (
                  <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/40 shadow-inner shadow-emerald-400/20">
                    <Icon className="h-4 w-4 text-emerald-200" />
                  </span>
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {badgeCount > 0 && (
                  <span className={`absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full ${badgeColor} text-white text-[10px] font-bold flex items-center justify-center animate-pulse badge-pulse-glow`}>{badgeCount > 9 ? '9+' : badgeCount}</span>
                )}
              </span>
              {item.label}
            </Button>
          );
        })}

        {/* Owner mode: Advanced Tools collapsible section */}
        {applicationMode === 'owner' && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" data-testid="nav-advanced-tools" className="w-full justify-start gap-2 text-slate-200 hover:text-white text-xs rounded-lg mt-2 transition-colors duration-200">
                {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Advanced Tools
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-2">
              {ADVANCED_TOOLS_ITEMS.map(item => {
                const Icon = item.icon;
                const isActive = currentView === item.view;
                return (
                  <Button
                    key={item.view}
                    variant="ghost"
                    title={item.label}
                    data-testid={`nav-${item.view}`}
                    className={`w-full justify-start gap-3 rounded-lg transition-all duration-200 text-xs ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/20 text-white font-medium border-l-[3px] border-emerald-400'
                        : 'text-emerald-200/60 hover:bg-emerald-700/30 hover:text-emerald-200 hover:translate-x-0.5'
                    }`}
                    onClick={() => { setCurrentView(item.view); if (onNavClick) onNavClick(); }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Button>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>

      <Separator className="my-2 mx-3 bg-emerald-700/50" />

      {/* User avatar area */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-emerald-800/40 hover:bg-emerald-800/60 transition-colors duration-200 cursor-default">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
            {businessSettings.businessName ? businessSettings.businessName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-emerald-100 truncate">{businessSettings.businessName || 'My Workspace'}</p>
            <p className="text-[10px] text-emerald-300/60">{applicationMode === 'owner' ? 'Owner Mode' : 'Advanced Mode'}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Privacy badge */}
        <div className="rounded-lg bg-emerald-800/40 p-2.5 flex items-center gap-2 text-xs text-emerald-100 border border-emerald-700/30">
          <ShieldCheck className="h-4 w-4 text-emerald-300 shrink-0" />
          <span className="truncate">Your data stays local</span>
        </div>
        {/* Reset Application only shown in advanced mode sidebar */}
        {applicationMode === 'advanced' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-emerald-300/70 hover:text-red-400 transition-colors duration-200">
                Reset Application
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Entire Application?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your products, pricing rules, scenarios, and settings. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => resetApplication()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Reset Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// Mobile bottom navigation bar
function MobileBottomNav({ currentView, setCurrentView, applicationMode, lossMakingCount }: {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  applicationMode: ApplicationMode;
  lossMakingCount: number;
}) {
  const navItems = applicationMode === 'owner' ? OWNER_MOBILE_NAV : ADVANCED_MOBILE_NAV;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/60 dark:border-slate-800/60 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          const badgeCount = (item.view === 'products' || item.view === 'review-prices') ? lossMakingCount : 0;
          return (
            <button
              key={item.view}
              onClick={() => setCurrentView(item.view)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-lg transition-all duration-200 min-w-[56px] relative ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 mobile-active-indicator'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <span className="relative">
                <Icon className={`h-5 w-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3.5 min-w-3.5 px-1 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell() {
  const { currentView, setCurrentView, businessSettings, updateBusinessSettings, products, pricingRules, resetApplication, lastSaved, recalculateProducts, addScenario, appSettings, isCalculating, undoHistory, undoLastAction, helpPanelOpen, setHelpPanelOpen } = usePricePilotStore();
  const applicationMode = appSettings.applicationMode || 'owner';

  // Compute badge counts
  const lossMakingCount = products.filter(p => p.calculatedPricingStatus === 'loss-making' || p.calculatedPricingStatus === 'below-break-even').length;
  const inactiveRulesCount = pricingRules.filter(r => !r.isActive).length;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Feature 1: Dark mode toggle - apply dark class to document.documentElement
  useEffect(() => {
    const applyTheme = () => {
      if (appSettings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (appSettings.theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // system: check prefers-color-scheme
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    applyTheme();

    // Listen for system theme changes when in 'system' mode
    if (appSettings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [appSettings.theme]);

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [currencyConverterOpen, setCurrencyConverterOpen] = useState(false);

  // Cmd+K / Ctrl+K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleModeChange = (mode: ApplicationMode) => {
    const store = usePricePilotStore.getState();
    store.updateAppSettings({ applicationMode: mode });
    // If switching to owner mode and current view is advanced-only, switch to owner-home
    if (mode === 'owner' && !['owner-home', 'products', 'import', 'review-prices', 'export', 'settings'].includes(currentView)) {
      setCurrentView('owner-home');
    }
    // If switching to advanced mode and current view is owner-home, switch to dashboard
    if (mode === 'advanced' && currentView === 'owner-home') {
      setCurrentView('dashboard');
    }
    toast.success(`Switched to ${mode === 'owner' ? 'Owner' : 'Advanced'} mode`);
  };

  const renderView = () => {
    switch (currentView) {
      case 'owner-home': return <OwnerHome />;
      case 'review-prices': return <ReviewPricesPage />;
      case 'dashboard': return <DashboardPage />;
      case 'products': return <ProductsPage />;
      case 'import':
        // Phase 5: wrap the import flow in an error boundary so a
        // single thrown error during import (e.g. malformed spreadsheet)
        // does not blank the whole app.
        return (
          <PricePilotErrorBoundary boundaryName="Import Flow">
            <ImportFlow />
          </PricePilotErrorBoundary>
        );
      case 'pricing-rules': return <PricingRulesPage />;
      case 'price-simulator': return <PriceSimulator />;
      case 'scenarios': return <ScenariosPage />;
      case 'export': return <ExportPage />;
      case 'competitor-tracking': return <CompetitorTrackingPage />;
      case 'price-history': return <PriceHistoryPage />;
      case 'price-elasticity': return <PriceElasticityPage />;
      case 'price-alerts': return <PriceAlertsPage />;
      case 'settings': return <SettingsPage />;
      default: return applicationMode === 'owner' ? <OwnerHome /> : <DashboardPage />;
    }
  };

  const handleSaveScenario = () => {
    addScenario({
      id: `scenario-${Date.now()}`,
      name: `Quick Save ${new Date().toLocaleDateString()}`,
      description: 'Saved via keyboard shortcut',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenarioType: 'catalogue',
      snapshotProducts: [...products],
      snapshotPricingRules: [...usePricePilotStore.getState().pricingRules],
      snapshotBusinessSettings: { ...businessSettings },
      isBaseline: false,
    });
    toast.success('Scenario saved', { description: 'Current state has been saved as a scenario' });
  };

  const handleRecalculate = () => {
    recalculateProducts();
    toast.success('Recalculated', { description: 'All product prices have been recalculated' });
  };

  const handleUndo = () => {
    if (undoHistory.length > 0) {
      undoLastAction();
      toast.success('Action undone', { description: undoHistory[0].description });
    }
  };

  // Owner mode: header shows Home/Import/Export buttons, Help button
  // Advanced mode: header shows Import/Export as before
  const isOwnerMode = applicationMode === 'owner';

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="app-initialization-ready">
      {/* Add Product Dialog */}
      <AddProductDialog open={addProductOpen} onOpenChange={setAddProductOpen} />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onAddProduct={() => setAddProductOpen(true)}
      />

      {/* Multi-Currency Converter Widget (v1.2) */}
      <CurrencyConverterWidget
        open={currencyConverterOpen}
        onOpenChange={setCurrencyConverterOpen}
        defaultFrom={businessSettings.currencyCode}
      />

      {/* Keyboard Shortcuts */}
      <KeyboardShortcuts
        onNavigate={(view) => setCurrentView(view as AppView)}
        onAddProduct={() => setAddProductOpen(true)}
        onSaveScenario={handleSaveScenario}
        onRecalculate={handleRecalculate}
        onSearch={() => setCurrentView('products')}
      />

      {/* Help Panel */}
      <HelpPanel open={helpPanelOpen} onOpenChange={setHelpPanelOpen} />

      {/* Non-blocking tour invitation */}
      <TourInvitation />
      {/* Guided Tour modal (only shown when explicitly started) */}
      <GuidedTour />

      {/* Desktop layout */}
      {/* min-w-0: allow this row to shrink below its content's
          min-width so wide page content (tables, grids) is contained
          by main's overflow-auto instead of overflowing the viewport. */}
      <div className="flex flex-1 min-w-0">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 border-r bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-700 h-screen sticky top-0 shadow-lg">
          <SidebarContent currentView={currentView} setCurrentView={setCurrentView} businessSettings={businessSettings} resetApplication={resetApplication} lossMakingCount={lossMakingCount} inactiveRulesCount={inactiveRulesCount} applicationMode={applicationMode} onModeChange={handleModeChange} />
        </aside>

        {/* Floating Help button — bottom-right, always visible (hidden on mobile since we have bottom nav) */}
        <FloatingHelpButton onClick={() => setHelpPanelOpen(true)} />

        {/* Main area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          {/* Header */}
          <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 shadow-sm px-4 py-2 flex items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-3">
              {/* Mobile menu */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden min-h-[44px] min-w-[44px]" data-testid="mobile-navigation-trigger">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-700" data-testid="mobile-navigation-drawer">
                  <SheetTitle className="px-4 pt-4 pb-2 text-sm font-semibold text-emerald-200">Navigation</SheetTitle>
                  <SidebarContent currentView={currentView} setCurrentView={(v) => { setCurrentView(v); setMobileOpen(false); }} businessSettings={businessSettings} resetApplication={resetApplication} lossMakingCount={lossMakingCount} inactiveRulesCount={inactiveRulesCount} onNavClick={() => setMobileOpen(false)} applicationMode={applicationMode} onModeChange={handleModeChange} />
                </SheetContent>
              </Sheet>
              <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 text-balance tracking-tight">{VIEW_LABELS[currentView]}</h1>
              {products.length > 0 && (
                <Badge className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700">{products.length} products</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Command Palette trigger button with ⌘K hint */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCommandPaletteOpen(true)}
                className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200 rounded-xl border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                title="Open Command Palette (⌘K)"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search...</span>
                <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded flex items-center gap-0.5">
                  <Command className="h-2.5 w-2.5" />K
                </kbd>
              </Button>

              {/* Undo button in header */}
              {undoHistory.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleUndo} className="hidden sm:flex transition-colors duration-200 text-xs rounded-xl">
                  <Undo2 className="h-3 w-3 mr-1" /> Undo
                </Button>
              )}
              {isOwnerMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('import')} className="hidden sm:flex transition-colors duration-200 rounded-xl">
                    <Upload className="h-4 w-4 mr-1" /> Import
                  </Button>
                  <CSVExportButton label="Download" onExportExcel={() => setCurrentView('export')} className="hidden sm:flex" />
                  <NotificationCenter />
                  <MarginAlertsPanel />
                  <Button variant="ghost" size="sm" onClick={() => setHelpPanelOpen(true)} className="transition-colors duration-200 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-xl">
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setCurrentView('import')} className="hidden sm:flex transition-colors duration-200 rounded-xl">
                    <Upload className="h-4 w-4 mr-1" /> Import
                  </Button>
                  <CSVExportButton label="Export" onExportExcel={() => setCurrentView('export')} className="hidden sm:flex" />
                  <NotificationCenter />
                  <MarginAlertsPanel />
                </>
              )}
              <Select value={businessSettings.currencyCode} onValueChange={v => updateBusinessSettings({ currencyCode: v })}>
                <SelectTrigger className="w-[80px] h-8 text-xs shadow-sm rounded-xl min-h-[44px] sm:min-h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrencyConverterOpen(true)}
                className="h-8 px-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 group min-h-[44px] sm:min-h-8"
                title="Open currency converter"
                aria-label="Open currency converter"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:rotate-180 transition-transform duration-500" />
              </Button>
            </div>
          </header>

          {/* Content */}
          {/* min-w-0 + overflow-auto: wide page content (e.g. product
              tables) scrolls inside main instead of pushing the layout
              wider than the viewport (fixes mobile horizontal overflow). */}
          <main className="flex-1 min-h-0 min-w-0 p-6 lg:p-8 overflow-auto bg-slate-50/30 dark:bg-slate-900/30 relative">
            <div key={currentView} className="animate-fade-in">
              {renderView()}
            </div>
            {/* Feature 2: Animated Loading Overlay */}
            {isCalculating && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-emerald-900/10 dark:bg-emerald-900/30 backdrop-blur-sm transition-opacity duration-300 animate-fade-in">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 border border-emerald-200 dark:border-emerald-700">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full border-4 border-emerald-200 dark:border-emerald-700" />
                    <div className="absolute inset-0 h-10 w-10 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Recalculating...</span>
                </div>
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="bg-gradient-to-r from-emerald-100 to-slate-100 px-4 py-2 mt-auto border-t-2 border-emerald-300/60 dark:bg-gradient-to-r dark:from-slate-900 dark:to-slate-800 dark:border-slate-700 hidden lg:block">
            {products.length > 0 && (
              <div className="bg-emerald-200/40 dark:bg-emerald-900/30 rounded-md px-3 py-1.5 mb-2">
                <div className="flex items-center justify-center gap-4 text-xs text-emerald-800 dark:text-emerald-200 pb-1 border-b border-emerald-300/50 dark:border-emerald-700/40">
                  <span className="font-medium">{products.length} products</span>
                  <span className="text-emerald-400 dark:text-emerald-600">•</span>
                  <span>{(() => {
                    const avg = products.length > 0
                      ? products.reduce((sum, p) => sum + safeNumberValue(p.calculatedMarginPercent, 0), 0) / products.length
                      : 0;
                    return formatPercentage(avg, 1);
                  })()}</span>
                  <span className="text-emerald-400 dark:text-emerald-600">•</span>
                  <span className="text-amber-700 dark:text-amber-400 font-medium">{products.filter(p => p.calculatedPricingStatus === 'loss-making' || p.calculatedPricingStatus === 'below-break-even' || p.calculatedPricingStatus === 'missing-data' || p.calculatedPricingStatus === 'needs-review' || p.calculatedPricingStatus === 'low-margin' || p.recommendedPrices.confidence === 'low').length} need attention</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-medium">All data stored locally in your browser. Nothing is sent to any server.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="last-saved-indicator">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 save-indicator-pulse" />
                  {lastSaved ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}` : 'Not saved yet'}
                </span>
                <span className="text-emerald-700 dark:text-emerald-300 font-mono border border-emerald-300/50 dark:border-emerald-700/50 rounded px-1.5 py-0.5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40">v1.9.0</span>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Mobile bottom navigation bar */}
      <MobileBottomNav
        currentView={currentView}
        setCurrentView={setCurrentView}
        applicationMode={applicationMode}
        lossMakingCount={lossMakingCount}
      />
    </div>
  );
}

export default AppShell;
