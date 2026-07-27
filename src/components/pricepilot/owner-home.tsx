'use client';

import { useState, useMemo } from 'react';
import { usePricePilotStore, AppView } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  FileUp,
  AlertTriangle,
  CheckCircle2,
  Download,
  BarChart3,
  Package,
  TrendingUp,
  ArrowRight,
  HelpCircle,
  Undo2,
  Sparkles,
  Wallet,
  Trophy,
  Crown,
  Medal,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function OwnerHome() {
  const {
    businessSettings,
    products,
    appSettings,
    setCurrentView,
    undoHistory,
    undoLastAction,
    loadDemoSampleData,
    removeDemoSampleData,
    downloadBackup,
    setHelpPanelOpen,
  } = usePricePilotStore();

  const currencyCode = businessSettings.currencyCode;

  // Computed metrics
  const totalProducts = products.length;
  const productsNeedingAttention = useMemo(() =>
    products.filter(p =>
      p.calculatedPricingStatus === 'loss-making' ||
      p.calculatedPricingStatus === 'below-break-even' ||
      p.calculatedPricingStatus === 'missing-data' ||
      p.calculatedPricingStatus === 'needs-review' ||
      p.calculatedPricingStatus === 'low-margin' ||
      !p.purchaseCost ||
      !p.currentSellingPrice ||
      p.recommendedPrices.balanced === 0 ||
      p.recommendedPrices.confidence === 'low'
    ).length, [products]);

  const productsReadyForApproval = useMemo(() =>
    products.filter(p =>
      p.priceApprovalStatus === 'none' &&
      p.purchaseCost > 0 &&
      p.currentSellingPrice > 0 &&
      p.recommendedPrices.confidence !== 'low' &&
      p.calculatedPricingStatus !== 'loss-making' &&
      p.calculatedPricingStatus !== 'missing-data'
    ).length, [products]);

  const averageMargin = useMemo(() => {
    if (products.length === 0) return 0;
    const validProducts = products.filter(p => p.calculatedMarginPercent > 0);
    if (validProducts.length === 0) return 0;
    return validProducts.reduce((sum, p) => sum + p.calculatedMarginPercent, 0) / validProducts.length;
  }, [products]);

  const estimatedProfitImprovement = useMemo(() => {
    // Calculate per-unit profit change if all products adopt recommended prices.
    // profitAtPrice = netSalesRevenue - totalLandedCost - totalSellingFees
    // For simplicity we approximate using current per-unit profit vs.
    // recommended price net of percentage fees and fixed fees.
    const improvable = products.filter(p =>
      p.purchaseCost > 0 &&
      p.recommendedPrices.balanced > 0 &&
      p.priceApprovalStatus !== 'approved' &&
      p.currentSellingPrice > 0
    );
    if (improvable.length === 0) return 0;

    const totalDelta = improvable.reduce((sum, p) => {
      const recommendedPrice = p.recommendedPrices.balanced;
      const currentPrice = p.currentSellingPrice;
      // Per-unit profit delta = (priceDelta) * (1 - totalPctFees/100) - fixedFees change (0 here)
      // Both prices share the same fixed fees, so they cancel out.
      const priceDelta = recommendedPrice - currentPrice;
      const feeMultiplier = 1 - (p.calculatedTotalPercentageFees || 0) / 100;
      const profitDelta = priceDelta * feeMultiplier;
      // Only count positive deltas (we want upside potential)
      return sum + Math.max(0, profitDelta);
    }, 0);

    // Round to whole currency unit for cleaner display
    return Math.round(Math.max(0, totalDelta));
  }, [products]);

  const hasUndo = undoHistory.length > 0;
  const isSampleData = appSettings.sampleDataLoaded;
  const approvedCount = useMemo(() => products.filter(p => p.priceApprovalStatus === 'approved').length, [products]);

  // ===== Monthly Projection & Top Performers =====
  const monthlyProjection = useMemo(() => {
    const validProducts = products.filter(p => p.purchaseCost > 0 && p.currentSellingPrice > 0);
    const monthlyUnits = (p: { monthlyUnitsSold?: number }) => p.monthlyUnitsSold ?? 0;

    const currentRevenue = validProducts.reduce((s, p) => s + p.currentSellingPrice * monthlyUnits(p), 0);
    const currentProfit = validProducts.reduce((s, p) => s + (p.calculatedProfitPerUnit ?? 0) * monthlyUnits(p), 0);

    // Potential: if all products adopt recommended balanced price
    const potentialProducts = validProducts.filter(p => p.recommendedPrices?.balanced > 0);
    const potentialRevenue = potentialProducts.reduce((s, p) => s + p.recommendedPrices.balanced * monthlyUnits(p), 0);
    // Approx potential profit per unit = (recommendedPrice - currentPrice) * feeMultiplier + currentProfitPerUnit
    const potentialProfit = potentialProducts.reduce((s, p) => {
      const feeMultiplier = 1 - (p.calculatedTotalPercentageFees ?? 0) / 100;
      const priceDelta = p.recommendedPrices.balanced - p.currentSellingPrice;
      const newProfitPerUnit = (p.calculatedProfitPerUnit ?? 0) + priceDelta * feeMultiplier;
      return s + Math.max(0, newProfitPerUnit) * monthlyUnits(p);
    }, 0);

    return {
      currentRevenue: Math.round(currentRevenue),
      currentProfit: Math.round(currentProfit),
      potentialRevenue: Math.round(potentialRevenue),
      potentialProfit: Math.round(potentialProfit),
      profitUplift: Math.round(Math.max(0, potentialProfit - currentProfit)),
      totalUnits: validProducts.reduce((s, p) => s + monthlyUnits(p), 0),
    };
  }, [products]);

  const topPerformers = useMemo(() => {
    return products
      .filter(p => p.purchaseCost > 0 && p.currentSellingPrice > 0 && p.calculatedMarginPercent > 0)
      .sort((a, b) => b.calculatedMarginPercent - a.calculatedMarginPercent)
      .slice(0, 3);
  }, [products]);

  const handleUndo = () => {
    if (undoHistory.length > 0) {
      undoLastAction();
      toast.success('Action undone', { description: undoHistory[0].description });
    }
  };

  // Action cards
  const actionCards = [
    {
      title: 'Import a new price list',
      description: 'Upload an Excel or CSV file with your products',
      icon: FileUp,
      onClick: () => setCurrentView('import'),
      gradient: 'from-emerald-500 to-emerald-600',
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
    {
      title: 'Review products needing attention',
      description: `${productsNeedingAttention} products need your review`,
      icon: AlertTriangle,
      onClick: () => setCurrentView('review-prices'),
      gradient: 'from-amber-400 to-amber-500',
      iconBg: 'bg-amber-100 text-amber-600',
      badge: productsNeedingAttention > 0 ? productsNeedingAttention : undefined,
      badgeColor: 'bg-red-500',
    },
    {
      title: 'Approve suggested prices',
      description: `${productsReadyForApproval} products ready for approval`,
      icon: CheckCircle2,
      onClick: () => setCurrentView('review-prices'),
      gradient: 'from-emerald-400 to-teal-500',
      iconBg: 'bg-teal-100 text-teal-600',
      badge: productsReadyForApproval > 0 ? productsReadyForApproval : undefined,
      badgeColor: 'bg-emerald-500',
    },
    {
      title: 'Download updated Excel',
      description: 'Export your approved prices as an Excel file',
      icon: Download,
      onClick: () => setCurrentView('export'),
      gradient: 'from-slate-500 to-slate-600',
      iconBg: 'bg-slate-100 text-slate-600',
    },
  ];

  // Health metrics
  const healthMetrics = [
    { label: 'Total products', value: totalProducts, icon: Package, color: 'text-emerald-600' },
    { label: 'Products needing attention', value: productsNeedingAttention, icon: AlertTriangle, color: productsNeedingAttention > 0 ? 'text-amber-600' : 'text-emerald-600' },
    { label: 'Ready for approval', value: productsReadyForApproval, icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Average margin', value: formatPercentage(averageMargin), icon: TrendingUp, color: averageMargin >= 15 ? 'text-emerald-600' : 'text-amber-600' },
    { label: 'Est. profit improvement', value: formatCurrency(estimatedProfitImprovement, currencyCode), icon: TrendingUp, color: 'text-emerald-600' },
  ];

  // Greeting name fallback — graceful handling when no business name is set
  const greetingName = businessSettings.businessName?.trim() || '';
  if (totalProducts === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        {/* Sample data banner */}
        {isSampleData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-amber-700 font-medium">You are viewing sample data</span>
            <Button variant="ghost" size="sm" className="ml-auto text-amber-600 hover:text-amber-700" onClick={removeDemoSampleData}>
              Remove Sample Data
            </Button>
          </div>
        )}

        <Card className="shadow-lg border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">
              {greetingName ? `${getGreeting()}, ${greetingName}` : `${getGreeting()}! Welcome to PricePilot`}
            </CardTitle>
            <CardDescription className="text-base">
              What would you like to do today?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {actionCards.map(card => {
                const Icon = card.icon;
                return (
                  <Card
                    key={card.title}
                    className="cursor-pointer hover:shadow-md transition-all duration-200 border-0 rounded-xl bg-gradient-to-br from-white to-emerald-50/10 group"
                    onClick={card.onClick}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{card.title}</h3>
                          {card.badge && (
                            <span className={`h-5 w-5 rounded-full ${card.badgeColor} text-white text-[10px] font-bold flex items-center justify-center`}>
                              {card.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all shrink-0" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Demo data offer for empty workspace */}
            {!isSampleData && (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5 text-center">
                <h3 className="font-semibold text-sm text-emerald-700 mb-1">No products yet?</h3>
                <p className="text-xs text-emerald-600 mb-3">Try PricePilot with sample products to see how it works.</p>
                <Button
                  onClick={loadDemoSampleData}
                  className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-md rounded-lg"
                >
                  <Sparkles className="h-4 w-4 mr-1" /> Try with Sample Products
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Undo button */}
        {hasUndo && (
          <div className="mt-4 flex items-center justify-center">
            <Button variant="outline" size="sm" onClick={handleUndo} className="rounded-lg shadow-sm">
              <Undo2 className="h-4 w-4 mr-1" /> Undo Last Action
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Sample data banner */}
      {isSampleData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm text-amber-700 font-medium">You are viewing sample data</span>
          <Button variant="ghost" size="sm" className="ml-auto text-amber-600 hover:text-amber-700" onClick={removeDemoSampleData}>
            Remove Sample Data
          </Button>
        </div>
      )}

      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          {greetingName ? `${getGreeting()}, ${greetingName} 👋` : `${getGreeting()}! 👋`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">What would you like to do today?</p>
      </div>

      {/* Workflow strip - 4 step process state derived from data */}
      <Card className="mb-6 shadow-sm border-0 rounded-xl bg-gradient-to-r from-emerald-50 via-white to-teal-50/50 dark:from-emerald-900/20 dark:via-slate-800 dark:to-teal-900/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Your Pricing Workflow</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Step 1: Import */}
            <button
              onClick={() => setCurrentView('import')}
              className="text-left p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${totalProducts > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {totalProducts > 0 ? '✓' : '1'}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Import</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {totalProducts > 0 ? `${totalProducts} products loaded` : 'Not started'}
              </p>
            </button>

            {/* Step 2: Check Problems */}
            <button
              onClick={() => setCurrentView('review-prices')}
              className="text-left p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  productsNeedingAttention === 0 && totalProducts > 0 ? 'bg-emerald-100 text-emerald-700' :
                  productsNeedingAttention > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  {productsNeedingAttention === 0 && totalProducts > 0 ? '✓' : '2'}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Problems</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {totalProducts === 0 ? 'Not started' :
                  productsNeedingAttention === 0 ? 'All resolved' :
                  `${productsNeedingAttention} need attention`}
              </p>
            </button>

            {/* Step 3: Approve */}
            <button
              onClick={() => setCurrentView('review-prices')}
              className="text-left p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  productsReadyForApproval === 0 && approvedCount > 0 ? 'bg-emerald-100 text-emerald-700' :
                  productsReadyForApproval > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  {productsReadyForApproval === 0 && approvedCount > 0 ? '✓' : '3'}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Approval</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {totalProducts === 0 ? 'Not started' :
                  productsReadyForApproval > 0 ? `${productsReadyForApproval} ready` :
                  approvedCount > 0 ? `${approvedCount} approved` : 'None ready'}
              </p>
            </button>

            {/* Step 4: Download */}
            <button
              onClick={() => setCurrentView('export')}
              className="text-left p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${approvedCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {approvedCount > 0 ? '✓' : '4'}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Download</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {approvedCount > 0 ? `${approvedCount} ready to export` : 'Nothing to export'}
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Undo button */}
      {hasUndo && (
        <div className="mb-4">
          <Button variant="outline" size="sm" onClick={handleUndo} className="rounded-lg shadow-sm">
            <Undo2 className="h-4 w-4 mr-1" /> Undo: {undoHistory[0].description}
          </Button>
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 items-stretch">
        {actionCards.map(card => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-0 rounded-xl bg-gradient-to-br from-white to-emerald-50/10 group flex card-sheen"
              onClick={card.onClick}
            >
              <CardContent className="p-4 flex items-center gap-3 w-full">
                <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{card.title}</h3>
                    {card.badge && (
                      <span className={`h-5 min-w-5 px-1 rounded-full ${card.badgeColor} text-white text-[10px] font-bold flex items-center justify-center animate-pulse`}>
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all shrink-0" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Monthly Projection & Top Performers */}
      {monthlyProjection.totalUnits > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Monthly Projection Card (spans 2 cols) */}
          <Card className="lg:col-span-2 shadow-md border-0 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-teal-50/30 dark:from-emerald-900/15 dark:via-slate-800 dark:to-teal-900/10 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm">
                  <Wallet className="h-4 w-4 text-white" />
                </div>
                Monthly Projection
              </CardTitle>
              <CardDescription className="text-xs">
                Based on {monthlyProjection.totalUnits.toLocaleString()} units/month across {products.filter(p => p.purchaseCost > 0 && p.currentSellingPrice > 0).length} active products
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-2 gap-3">
                {/* Current Revenue */}
                <div className="bg-white/70 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Current Revenue</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">{formatCurrency(monthlyProjection.currentRevenue, currencyCode, { compact: true })}</p>
                </div>
                {/* Current Profit */}
                <div className="bg-white/70 dark:bg-slate-800/50 rounded-lg p-3 border border-emerald-100 dark:border-emerald-900/40">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Current Profit</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatCurrency(monthlyProjection.currentProfit, currencyCode, { compact: true })}</p>
                </div>
                {/* Potential Revenue */}
                <div className="bg-white/70 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Potential Revenue</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">{formatCurrency(monthlyProjection.potentialRevenue, currencyCode, { compact: true })}</p>
                </div>
                {/* Potential Profit */}
                <div className="bg-gradient-to-br from-emerald-100 to-teal-100/70 dark:from-emerald-900/30 dark:to-teal-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800/50">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" /> Potential Profit
                  </p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatCurrency(monthlyProjection.potentialProfit, currencyCode, { compact: true })}</p>
                </div>
              </div>
              {/* Uplift banner */}
              {monthlyProjection.profitUplift > 0 && (
                <div className="mt-3 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg p-3 text-white shadow-sm">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Profit uplift potential</span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold leading-none">+{formatCurrency(monthlyProjection.profitUplift, currencyCode, { compact: true })}</p>
                    <p className="text-[10px] text-emerald-100 mt-0.5">per month if all prices adopted</p>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('review-prices')}
                className="mt-3 text-emerald-600 hover:text-emerald-700 p-0 h-auto text-xs font-medium"
              >
                Review prices to capture uplift <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* Top Performers Card */}
          <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-amber-50/20 dark:from-slate-800 dark:to-amber-900/10 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
                  <Trophy className="h-4 w-4 text-white" />
                </div>
                Top Performers
              </CardTitle>
              <CardDescription className="text-xs">Highest margin products this month</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {topPerformers.length === 0 ? (
                <div className="text-center py-6">
                  <Trophy className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No performer data yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topPerformers.map((p, idx) => {
                    const Icon = idx === 0 ? Crown : idx === 1 ? Medal : Trophy;
                    const colorClass = idx === 0
                      ? 'from-amber-400 to-yellow-500 text-white'
                      : idx === 1
                        ? 'from-slate-300 to-slate-400 text-white'
                        : 'from-orange-400 to-amber-600 text-white';
                    const rankBadge = idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700';
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          usePricePilotStore.getState().setSelectedProductId(p.id);
                          usePricePilotStore.getState().setCurrentView('products');
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group"
                      >
                        <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center shrink-0 shadow-sm`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-emerald-600 transition-colors">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{p.sku}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${rankBadge}`}>
                            {formatPercentage(p.calculatedMarginPercent)}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(p.currentSellingPrice, currencyCode, { compact: true })}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Business health summary */}
      <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Business Health Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {healthMetrics.map(metric => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="bg-emerald-50/50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                  <Icon className={`h-4 w-4 mx-auto mb-1 ${metric.color}`} />
                  <p className="text-lg font-semibold">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('dashboard')}
              className="text-emerald-600 hover:text-emerald-700"
            >
              View detailed dashboard <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default OwnerHome;
