'use client';

import { useState } from 'react';
import { usePricePilotStore, AppView } from '@/store/pricepilot-store';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
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
  LogOut,
} from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/pricepilot/types';
import { DashboardPage } from './dashboard-page';
import { ProductsPage } from './products-page';
import { ImportFlow } from './import-flow';
import { PricingRulesPage } from './pricing-rules-page';
import { PriceSimulator } from './price-simulator';
import { ScenariosPage } from './scenarios-page';
import { ExportPage } from './export-page';
import { SettingsPage } from './settings-page';

const NAV_ITEMS: { view: AppView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'products', label: 'Products', icon: Package },
  { view: 'import', label: 'Import Products', icon: FileUp },
  { view: 'pricing-rules', label: 'Pricing Rules', icon: Scale },
  { view: 'price-simulator', label: 'Price Simulator', icon: Calculator },
  { view: 'scenarios', label: 'Saved Scenarios', icon: Bookmark },
  { view: 'export', label: 'Export', icon: Download },
  { view: 'settings', label: 'Settings', icon: Settings },
];

const VIEW_LABELS: Record<AppView, string> = {
  'dashboard': 'Dashboard',
  'products': 'Products',
  'import': 'Import Products',
  'pricing-rules': 'Pricing Rules',
  'price-simulator': 'Price Simulator',
  'scenarios': 'Saved Scenarios',
  'export': 'Export',
  'settings': 'Settings',
};

function SidebarContent({ currentView, setCurrentView, businessSettings, resetApplication, onNavClick }: {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  businessSettings: { businessName: string };
  resetApplication: () => void;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-xl shadow-sm">P</div>
        <div>
          <h2 className="font-semibold text-sm leading-tight">PricePilot</h2>
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">{businessSettings.businessName || 'My Workspace'}</p>
        </div>
      </div>

      <Separator className="my-2 mx-3" />

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          return (
            <Button
              key={item.view}
              variant="ghost"
              className={`w-full justify-start gap-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 font-medium border-l-3 border-emerald-500'
                  : 'hover:bg-slate-50 hover:text-slate-700'
              }`}
              onClick={() => { setCurrentView(item.view); if (onNavClick) onNavClick(); }}
            >
              {isActive ? (
                <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-100">
                  <Icon className="h-4 w-4" />
                </span>
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {item.label}
            </Button>
          );
        })}
      </nav>

      <Separator className="my-2 mx-3" />

      <div className="p-4 space-y-3">
        <div className="rounded bg-emerald-50/50 p-2 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Your data stays local</span>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-destructive/70 hover:text-destructive transition-colors duration-200">
              <LogOut className="h-3 w-3" />
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
      </div>
    </div>
  );
}

export function AppShell() {
  const { currentView, setCurrentView, businessSettings, updateBusinessSettings, products, resetApplication, lastSaved } = usePricePilotStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardPage />;
      case 'products': return <ProductsPage />;
      case 'import': return <ImportFlow />;
      case 'pricing-rules': return <PricingRulesPage />;
      case 'price-simulator': return <PriceSimulator />;
      case 'scenarios': return <ScenariosPage />;
      case 'export': return <ExportPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Desktop layout */}
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 border-r bg-gradient-to-b from-white to-slate-50/30 h-screen sticky top-0 shadow-sm">
          <SidebarContent currentView={currentView} setCurrentView={setCurrentView} businessSettings={businessSettings} resetApplication={resetApplication} />
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Header */}
          <header className="sticky top-0 z-30 bg-white shadow-sm px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile menu */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetTitle className="px-4 pt-4 pb-2 text-sm font-semibold text-slate-700">Navigation</SheetTitle>
                  <SidebarContent currentView={currentView} setCurrentView={setCurrentView} businessSettings={businessSettings} resetApplication={resetApplication} onNavClick={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <h1 className="text-xl font-semibold text-slate-800">{VIEW_LABELS[currentView]}</h1>
              {products.length > 0 && (
                <Badge className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">{products.length} products</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentView('import')} className="hidden sm:flex transition-colors duration-200">
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentView('export')} className="hidden sm:flex transition-colors duration-200">
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
              <Select value={businessSettings.currencyCode} onValueChange={v => updateBusinessSettings({ currencyCode: v })}>
                <SelectTrigger className="w-[80px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-6 lg:p-8 overflow-auto bg-slate-50/30">
            {renderView()}
          </main>

          {/* Footer */}
          <footer className="border-t border-slate-200 bg-slate-50/50 px-4 py-2 mt-auto">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                <span>All data stored locally in your browser. Nothing is sent to any server.</span>
              </div>
              <div>
                {lastSaved ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}` : 'Not saved yet'}
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
