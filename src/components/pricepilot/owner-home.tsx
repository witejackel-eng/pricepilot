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
      !p.purchaseCost ||
      !p.currentSellingPrice
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
    // Calculate how much profit could improve if all products adopt recommended prices
    const improvable = products.filter(p =>
      p.purchaseCost > 0 &&
      p.recommendedPrices.balanced > 0 &&
      p.priceApprovalStatus !== 'approved' &&
      p.currentSellingPrice > 0
    );
    if (improvable.length === 0) return 0;
    const currentProfit = improvable.reduce((sum, p) => sum + p.calculatedProfitPerUnit, 0);
    const potentialProfit = improvable.reduce((sum, p) => {
      const recommendedPrice = p.recommendedPrices.balanced;
      // Approximate profit improvement based on price change
      const priceDiff = recommendedPrice - p.currentSellingPrice;
      return sum + Math.max(0, priceDiff * (1 - p.calculatedTotalPercentageFees / 100));
    }, 0);
    return Math.max(0, potentialProfit);
  }, [products]);

  const hasUndo = undoHistory.length > 0;
  const isSampleData = appSettings.sampleDataLoaded;

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
              {getGreeting()}, {businessSettings.businessName || 'there'}
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
          {getGreeting()}, {businessSettings.businessName || 'there'} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">What would you like to do today?</p>
      </div>

      {/* Undo button */}
      {hasUndo && (
        <div className="mb-4">
          <Button variant="outline" size="sm" onClick={handleUndo} className="rounded-lg shadow-sm">
            <Undo2 className="h-4 w-4 mr-1" /> Undo: {undoHistory[0].description}
          </Button>
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
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
                      <span className={`h-5 w-5 rounded-full ${card.badgeColor} text-white text-[10px] font-bold flex items-center justify-center animate-pulse`}>
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
