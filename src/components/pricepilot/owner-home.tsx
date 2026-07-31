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
import {
  FileUp,
  AlertTriangle,
  CheckCircle2,
  Download,
  HelpCircle,
  Undo2,
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
    undoHistory,
    undoLastAction,
    downloadBackup,
    setHelpPanelOpen,
    setCurrentView,
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {getGreeting()}, {businessName}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          What would you like to do today?
        </p>
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
              className={`text-left transition-all ${card.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5'}`}
            >
              <Card className="overflow-hidden border-slate-200 dark:border-slate-800 h-full">
                <CardContent className="p-0">
                  <div className="flex items-start gap-4 p-5">
                    <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                          {card.title}
                        </h3>
                        {card.badge !== undefined && card.badge > 0 && (
                          <Badge className={`${card.badgeColor} text-white text-xs`}>
                            {card.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

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
