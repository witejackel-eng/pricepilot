'use client';

/**
 * PricePilot - Owner Home (Father Level)
 *
 * Phase 12: Simplified to four clear tasks for a non-technical business
 * owner. Removed: potential revenue, potential profit, monthly
 * projections, top performers, health analytics, advanced charts,
 * detailed fee statistics. Those remain available in Advanced Mode.
 *
 * Language: simple, plain, accounting-jargon-free.
 *   - Purchase Cost
 *   - Current Selling Price
 *   - Suggested Selling Price
 *   - Expected Profit
 *   - Expected Margin
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FileUp,
  AlertTriangle,
  CheckCircle2,
  Download,
  HelpCircle,
  Undo2,
  Clock,
  Pencil,
  CheckCircle,
  Trash2,
  FileUp as ImportIcon,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Package,
  AlertCircle,
} from 'lucide-react';
import { formatPercentage, formatCurrency } from '@/lib/pricepilot/formatting';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { ProfitPotentialPanel } from './profit-potential-panel';
import { PriceChangeTimeline } from './price-change-timeline';
import { TopProductsLeaderboard } from './top-products-leaderboard';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Action type to icon mapping
const ACTION_ICONS: Record<string, React.ElementType> = {
  'price-approve': CheckCircle,
  'price-apply': CheckCircle2,
  'product-edit': Pencil,
  'bulk-approve': CheckCircle,
  'import': ImportIcon,
  'product-delete': Trash2,
};

const ACTION_COLORS: Record<string, string> = {
  'price-approve': 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400',
  'price-apply': 'text-teal-600 bg-teal-100 dark:bg-teal-900/40 dark:text-teal-400',
  'product-edit': 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400',
  'bulk-approve': 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400',
  'import': 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400',
  'product-delete': 'text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400',
};

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function OwnerHome() {
  const {
    businessSettings,
    products,
    undoHistory,
    undoLastAction,
    downloadBackup,
    setHelpPanelOpen,
    setCurrentView,
    setInitialFilterTab,
  } = usePricePilotStore();

  const businessName = businessSettings.businessName || 'there';

  // ===== Review group counts (father-level terminology) =====
  const counts = useMemo(() => {
    // Needs Information: missing purchase cost or critical tax/fee settings
    const needsInformation = products.filter(p =>
      p.lifecycleStatus === 'needs-review' ||
      p.calculatedPricingStatus === 'missing-data' ||
      !p.purchaseCost ||
      p.purchaseCost <= 0 ||
      p.recommendedPrices.confidence === 'low'
    ).length;

    // Ready to Review: has a trusted recommendation, not yet approved
    const readyToReview = products.filter(p =>
      p.priceApprovalStatus === 'none' &&
      p.purchaseCost > 0 &&
      p.recommendedPrices.confidence !== 'low' &&
      p.recommendedPrices.balanced > 0
    ).length;

    // Approved, Not Applied: approved but not yet applied to currentSellingPrice
    const approvedNotApplied = products.filter(p =>
      p.priceApprovalStatus === 'approved' &&
      p.finalApprovedPrice > 0 &&
      p.currentSellingPrice !== p.finalApprovedPrice
    ).length;

    // Applied: currentSellingPrice matches the approved price
    const applied = products.filter(p =>
      p.priceApprovalStatus === 'approved' &&
      p.finalApprovedPrice > 0 &&
      Math.abs(p.currentSellingPrice - p.finalApprovedPrice) < 0.01
    ).length;

    return { needsInformation, readyToReview, approvedNotApplied, applied };
  }, [products]);

  // ===== Pricing Summary Dashboard Widget =====
  const pricingSummary = useMemo(() => {
    if (products.length === 0) {
      return { total: 0, healthy: 0, needsReview: 0, belowBreakEven: 0, avgMargin: 0 };
    }

    const total = products.length;
    const healthy = products.filter(p =>
      p.calculatedPricingStatus === 'healthy' ||
      p.calculatedPricingStatus === 'high-margin' ||
      p.calculatedPricingStatus === 'approved'
    ).length;
    const needsReview = products.filter(p =>
      p.calculatedPricingStatus === 'low-margin' ||
      p.calculatedPricingStatus === 'needs-review' ||
      p.calculatedPricingStatus === 'missing-data'
    ).length;
    const belowBreakEven = products.filter(p =>
      p.calculatedPricingStatus === 'loss-making' ||
      p.calculatedPricingStatus === 'below-break-even'
    ).length;
    const avgMargin = products.reduce((sum, p) => sum + (p.calculatedMarginPercent || 0), 0) / total;

    return { total, healthy, needsReview, belowBreakEven, avgMargin };
  }, [products]);

  // Chart data for the pricing summary
  const chartData = useMemo(() => {
    if (pricingSummary.total === 0) return [];
    return [
      { name: 'Healthy', value: pricingSummary.healthy, color: '#10b981' },
      { name: 'Needs Review', value: pricingSummary.needsReview, color: '#f59e0b' },
      { name: 'Below Break-even', value: pricingSummary.belowBreakEven, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [pricingSummary]);

  const hasUndo = undoHistory.length > 0;

  const handleUndo = () => {
    if (undoHistory.length > 0) {
      undoLastAction();
      toast.success('Action undone', { description: undoHistory[0].description });
    }
  };

  // ===== Four action cards (father-level design) =====
  const actionCards = [
    {
      title: 'Upload Latest Price List',
      description: 'Import an Excel or CSV file from your supplier.',
      icon: FileUp,
      onClick: () => setCurrentView('import'),
      gradient: 'from-emerald-500 to-emerald-600',
      iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    {
      title: 'Fix Products Needing Information',
      description: counts.needsInformation === 1
        ? `${counts.needsInformation} product needs a cost or tax setting.`
        : `${counts.needsInformation} products need a cost or tax setting.`,
      icon: AlertTriangle,
      onClick: () => setCurrentView('review-prices'),
      gradient: 'from-amber-400 to-amber-500',
      iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      badge: counts.needsInformation > 0 ? counts.needsInformation : undefined,
      badgeColor: 'bg-red-500',
      disabled: counts.needsInformation === 0,
    },
    {
      title: 'Review Suggested Prices',
      description: counts.readyToReview === 1
        ? `${counts.readyToReview} product is ready for approval.`
        : `${counts.readyToReview} products are ready for approval.`,
      icon: CheckCircle2,
      onClick: () => setCurrentView('review-prices'),
      gradient: 'from-emerald-400 to-teal-500',
      iconBg: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
      badge: counts.readyToReview > 0 ? counts.readyToReview : undefined,
      badgeColor: 'bg-emerald-500',
      disabled: counts.readyToReview === 0,
    },
    {
      title: 'Download Updated Excel',
      description: counts.approvedNotApplied === 1
        ? `${counts.approvedNotApplied} approved price is ready.`
        : `${counts.approvedNotApplied} approved prices are ready.`,
      icon: Download,
      onClick: () => setCurrentView('export'),
      gradient: 'from-slate-500 to-slate-600',
      iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      badge: counts.approvedNotApplied > 0 ? counts.approvedNotApplied : undefined,
      badgeColor: 'bg-slate-600',
      disabled: counts.approvedNotApplied === 0 && counts.applied === 0,
    },
  ];

  // Get the last 5 actions for the activity feed
  const recentActivity = undoHistory.slice(0, 5);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-4" data-testid="owner-home">
      {/* Header with gradient banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 p-6 shadow-lg shadow-emerald-500/20">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-white/10 blur-xl" />
        <div className="relative space-y-1">
          <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
            {getGreeting()}
          </div>
          <h1 className="text-2xl font-bold text-white">
            {businessName}
          </h1>
          <p className="text-sm text-emerald-50/90">
            What would you like to do today?
          </p>
        </div>
      </div>

      {/* Four action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {actionCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <button
              key={idx}
              onClick={card.onClick}
              disabled={card.disabled}
              className={`text-left transition-all duration-200 group ${card.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg hover:-translate-y-1 active:translate-y-0'}`}
            >
              <Card className="overflow-hidden border-slate-200 dark:border-slate-800 h-full transition-colors group-hover:border-emerald-300 dark:group-hover:border-emerald-700 py-0 md:py-6">
                <CardContent className="p-0">
                  <div className="flex items-start gap-4 p-4 md:p-5">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${card.iconBg}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-50 min-w-0 break-words">
                          {card.title}
                        </h3>
                        {card.badge !== undefined && card.badge > 0 && (
                          <Badge className={`${card.badgeColor} text-white text-xs animate-pulse`}>
                            {card.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {card.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* v1.1: Profit Potential insights panel — shows how much more the
          owner could earn by applying suggested prices. Only renders when
          there are products to analyse (the component returns null
          otherwise). */}
      <ProfitPotentialPanel />

      {/* v1.2: Top Products Leaderboard — visual ranking of best/worst
          performers with a margin distribution mini-chart. */}
      <TopProductsLeaderboard />

      {/* Pricing Summary Dashboard Widget + Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pricing Summary Dashboard Widget */}
        {products.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Pricing Summary
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Overview of your product pricing health
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-slate-500" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">Total Products</span>
                  </div>
                  <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{pricingSummary.total}</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">Avg. Margin</span>
                  </div>
                  <div className={`text-xl font-bold ${pricingSummary.avgMargin >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>
                    {formatPercentage(pricingSummary.avgMargin)}
                  </div>
                </div>
              </div>

              {/* Progress bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Healthy margins
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">{pricingSummary.healthy}</span>
                  </div>
                  <Progress
                    value={pricingSummary.total > 0 ? (pricingSummary.healthy / pricingSummary.total) * 100 : 0}
                    className="h-2 bg-slate-200 dark:bg-slate-700 [&>div]:bg-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      Needs review
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{pricingSummary.needsReview}</span>
                  </div>
                  <Progress
                    value={pricingSummary.total > 0 ? (pricingSummary.needsReview / pricingSummary.total) * 100 : 0}
                    className="h-2 bg-slate-200 dark:bg-slate-700 [&>div]:bg-amber-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      Below break-even
                    </span>
                    <span className="font-semibold text-red-700 dark:text-red-400">{pricingSummary.belowBreakEven}</span>
                  </div>
                  <Progress
                    value={pricingSummary.total > 0 ? (pricingSummary.belowBreakEven / pricingSummary.total) * 100 : 0}
                    className="h-2 bg-slate-200 dark:bg-slate-700 [&>div]:bg-red-500"
                  />
                </div>
              </div>

              {/* Mini bar chart */}
              {chartData.length > 0 && (
                <div className="h-20 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Activity Feed */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-600" />
              Recent Activity
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Your latest actions and changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="text-center py-6">
                <Clock className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">No recent activity yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Actions you take will appear here</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((action, idx) => {
                  const Icon = ACTION_ICONS[action.type] || Pencil;
                  const colorClass = ACTION_COLORS[action.type] || 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400';
                  // Find the product name for this action
                  const productName = action.productId
                    ? products.find(p => p.id === action.productId)?.name || action.description
                    : action.description;

                  return (
                    <button
                      key={`${action.timestamp}-${idx}`}
                      className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                      onClick={() => {
                        if (action.productId) {
                          setInitialFilterTab(null);
                          setCurrentView('products');
                          // The product detail drawer will be opened via the products page
                        }
                      }}
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-700 dark:text-slate-300 truncate">
                          {action.type === 'price-approve' && 'Approved price'}
                          {action.type === 'price-apply' && 'Applied price'}
                          {action.type === 'product-edit' && 'Edited product'}
                          {action.type === 'bulk-approve' && 'Bulk approved'}
                          {action.type === 'import' && 'Imported products'}
                          {action.type === 'product-delete' && 'Deleted product'}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{productName}</div>
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                        {formatRelativeTime(action.timestamp)}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
            {undoHistory.length > 5 && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400"
                  onClick={() => setCurrentView('products')}
                >
                  View All Activity
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Price Change History Timeline — shows recent price approvals, applications, and edits */}
      <PriceChangeTimeline />

      {/* Review group summary — simple counts, no accounting jargon */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg">Your products at a glance</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            A quick summary of where your products stand right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ReviewGroupTile
              label="Needs Information"
              count={counts.needsInformation}
              tone="amber"
              onClick={() => setCurrentView('review-prices')}
            />
            <ReviewGroupTile
              label="Ready to Review"
              count={counts.readyToReview}
              tone="emerald"
              onClick={() => setCurrentView('review-prices')}
            />
            <ReviewGroupTile
              label="Approved, Not Applied"
              count={counts.approvedNotApplied}
              tone="teal"
              onClick={() => setCurrentView('review-prices')}
            />
            <ReviewGroupTile
              label="Applied"
              count={counts.applied}
              tone="slate"
              onClick={() => setCurrentView('products')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Footer actions: undo + help + backup */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={!hasUndo}
          data-testid="undo-button"
        >
          <Undo2 className="h-4 w-4 mr-2" />
          Undo last action
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHelpPanelOpen(true)}
        >
          <HelpCircle className="h-4 w-4 mr-2" />
          Help
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadBackup}
          data-testid="download-backup-button"
        >
          <Download className="h-4 w-4 mr-2" />
          Download backup
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Review Group Tile
// ============================================================

interface ReviewGroupTileProps {
  label: string;
  count: number;
  tone: 'amber' | 'emerald' | 'teal' | 'slate';
  onClick: () => void;
}

function ReviewGroupTile({ label, count, tone, onClick }: ReviewGroupTileProps) {
  const toneClasses = {
    amber: 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300',
    teal: 'bg-teal-50 border-teal-100 text-teal-700 dark:bg-teal-950/40 dark:border-teal-900 dark:text-teal-300',
    slate: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300',
  }[tone];

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-all hover:shadow-sm ${toneClasses}`}
    >
      <div className="text-2xl font-semibold leading-tight">{count}</div>
      <div className="text-xs mt-1 opacity-90">{label}</div>
    </button>
  );
}
