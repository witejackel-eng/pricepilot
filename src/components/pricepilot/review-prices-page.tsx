'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Product, PricingStatus } from '@/lib/pricepilot/types';
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  CheckCheck,
  X,
  Layers,
  ClipboardCheck,
  Sparkles,
  CircleCheck,
  Zap,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

type TabKey = 'action-required' | 'ready-to-approve' | 'recently-approved' | 'all';

function getStatusLabel(status: PricingStatus): string {
  switch (status) {
    case 'loss-making': return 'Loss-making';
    case 'below-break-even': return 'Below break-even';
    case 'missing-data': return 'Missing data';
    case 'needs-review': return 'Needs review';
    case 'low-margin': return 'Low margin';
    case 'healthy': return 'Healthy';
    case 'high-margin': return 'High margin';
    case 'above-market': return 'Above market';
    case 'approved': return 'Approved';
    default: return status;
  }
}

function getProblemDescription(product: Product): string {
  if (!product.purchaseCost) return 'Missing purchase cost — cannot calculate pricing';
  if (!product.currentSellingPrice) return 'Missing selling price';
  if (product.recommendedPrices.balanced === 0) return 'Recommendation unavailable — pricing target is impossible under current costs and fees';
  if (product.calculatedPricingStatus === 'loss-making') return `Selling at a loss — profit is ${formatCurrency(product.calculatedProfitPerUnit, 'INR')}`;
  if (product.calculatedPricingStatus === 'below-break-even') return 'Below break-even — not covering costs + minimum margin';
  if (product.calculatedPricingStatus === 'low-margin') return `Low margin (${formatPercentage(product.calculatedMarginPercent)}) — below your minimum threshold`;
  if (product.calculatedPricingStatus === 'missing-data') return 'Critical data missing for pricing calculation';
  if (product.calculatedPricingStatus === 'needs-review') return 'Flagged for manual review';
  if (product.recommendedPrices.confidence === 'low') return 'Low confidence recommendation — verify product data';
  return 'Needs your attention';
}

// Map pricing status to a problem-specific badge label (not the raw calculated status)
function getProblemBadgeLabel(product: Product): { label: string; color: string; dotColor: string } {
  if (!product.purchaseCost) return { label: 'Needs Cost', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (!product.currentSellingPrice) return { label: 'Missing Price', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (product.recommendedPrices.balanced === 0) return { label: 'Impossible', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (product.calculatedPricingStatus === 'loss-making') return { label: 'Losing Money', color: 'text-red-700 border-red-300 bg-red-100', dotColor: 'bg-red-500' };
  if (product.calculatedPricingStatus === 'below-break-even') return { label: 'Below Break-even', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  if (product.calculatedPricingStatus === 'low-margin') return { label: 'Low Profit', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  if (product.calculatedPricingStatus === 'missing-data') return { label: 'Missing Data', color: 'text-slate-700 border-slate-300 bg-slate-100', dotColor: 'bg-slate-400' };
  if (product.calculatedPricingStatus === 'needs-review') return { label: 'Needs Review', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  if (product.recommendedPrices.confidence === 'low') return { label: 'Low Confidence', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
  return { label: 'Needs Attention', color: 'text-amber-800 border-amber-300 bg-amber-100', dotColor: 'bg-amber-500' };
}

function hasProductProblems(p: Product): boolean {
  return (
    !p.purchaseCost ||
    !p.currentSellingPrice ||
    p.calculatedPricingStatus === 'loss-making' ||
    p.calculatedPricingStatus === 'below-break-even' ||
    p.calculatedPricingStatus === 'missing-data' ||
    p.calculatedPricingStatus === 'needs-review' ||
    p.calculatedPricingStatus === 'low-margin' ||
    p.recommendedPrices.balanced === 0 ||
    p.recommendedPrices.confidence === 'low'
  );
}

function priceChange(current: number, recommended: number): number {
  if (current <= 0) return 0;
  return ((recommended - current) / current) * 100;
}

// Tab icon mapping
function getTabIcon(key: TabKey) {
  switch (key) {
    case 'action-required': return AlertTriangle;
    case 'ready-to-approve': return CircleCheck;
    case 'recently-approved': return CheckCircle2;
    case 'all': return Layers;
  }
}

// Margin gauge component — a small semicircular arc gauge
function MarginGauge({ margin, targetMargin, size = 48 }: { margin: number; targetMargin: number; size?: number }) {
  const clampedMargin = Math.max(0, Math.min(100, margin));
  const clampedTarget = Math.max(0, Math.min(100, targetMargin));
  const isAbove = margin >= targetMargin;
  const isLow = margin < targetMargin && margin > 0;
  const isNegative = margin <= 0;

  // Arc calculations
  const radius = (size / 2) - 4;
  const cx = size / 2;
  const cy = size / 2 + 2;
  const startAngle = Math.PI;
  const endAngle = 0;

  // Background arc
  const bgX1 = cx + radius * Math.cos(startAngle);
  const bgY1 = cy + radius * Math.sin(startAngle);
  const bgX2 = cx + radius * Math.cos(endAngle);
  const bgY2 = cy + radius * Math.sin(endAngle);

  // Value arc
  const valueAngle = startAngle + (endAngle - startAngle) * (clampedMargin / 100);
  const valX = cx + radius * Math.cos(valueAngle);
  const valY = cy + radius * Math.sin(valueAngle);

  // Target arc indicator
  const targetAngle = startAngle + (endAngle - startAngle) * (clampedTarget / 100);
  const targetX = cx + (radius + 3) * Math.cos(targetAngle);
  const targetY = cy + (radius + 3) * Math.sin(targetAngle);

  const color = isNegative ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-500';
  const strokeColor = isNegative ? '#ef4444' : isLow ? '#f59e0b' : '#10b981';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <svg width={size} height={size / 2 + 6} className="inline-block">
            {/* Background arc */}
            <path
              d={`M ${bgX1} ${bgY1} A ${radius} ${radius} 0 0 1 ${bgX2} ${bgY2}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className="text-slate-200 dark:text-slate-700"
              strokeLinecap="round"
            />
            {/* Value arc */}
            <path
              d={`M ${bgX1} ${bgY1} A ${radius} ${radius} 0 ${clampedMargin > 50 ? 0 : 0} 1 ${valX} ${valY}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth={3}
              strokeLinecap="round"
            />
            {/* Target indicator */}
            <circle cx={targetX} cy={targetY} r={2} fill="#6366f1" opacity={0.7} />
            {/* Center text */}
            <text x={cx} y={cy - 2} textAnchor="middle" className={`text-[8px] font-bold ${color}`} fill="currentColor">
              {margin.toFixed(0)}%
            </text>
          </svg>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p>Margin: {formatPercentage(margin)}</p>
            <p>Target: {formatPercentage(targetMargin)}</p>
            <p className={isAbove ? 'text-emerald-500' : isLow ? 'text-amber-500' : 'text-red-500'}>
              {isAbove ? '✓ Above target' : isLow ? '⚠ Below target' : '✗ Negative margin'}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Price comparison bar — visual bar showing current vs recommended
function PriceComparisonBar({ current, recommended, currencyCode }: { current: number; recommended: number; currencyCode: string }) {
  if (current <= 0 && recommended <= 0) return null;
  const maxVal = Math.max(current, recommended, 1);
  const currentPct = Math.min((current / maxVal) * 100, 100);
  const recommendedPct = Math.min((recommended / maxVal) * 100, 100);
  const change = priceChange(current, recommended);
  const isIncrease = change > 0;
  const isDecrease = change < 0;

  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-14 shrink-0">Current</span>
        <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-400 dark:bg-slate-500 rounded-full transition-all duration-500"
            style={{ width: `${currentPct}%` }}
          />
        </div>
        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 w-16 text-right">{formatCurrency(current, currencyCode)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-14 shrink-0">Recommended</span>
        <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isIncrease ? 'bg-gradient-to-r from-emerald-400 to-teal-500' :
              isDecrease ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
              'bg-emerald-500'
            }`}
            style={{ width: `${recommendedPct}%` }}
          />
        </div>
        <span className={`text-[10px] font-medium w-16 text-right ${isIncrease ? 'text-emerald-600' : isDecrease ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300'}`}>
          {formatCurrency(recommended, currencyCode)}
        </span>
      </div>
      {change !== 0 && (
        <div className="flex items-center gap-1 pl-16">
          {isIncrease ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-amber-500" />
          )}
          <span className={`text-[10px] font-medium ${isIncrease ? 'text-emerald-600' : 'text-amber-600'}`}>
            {isIncrease ? '+' : ''}{formatPercentage(change)} {isIncrease ? 'increase' : 'decrease'}
          </span>
        </div>
      )}
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  isSelected: boolean;
  onToggleSelect: () => void;
  currencyCode: string;
  isOwnerMode: boolean;
  targetMargin: number;
  onApprove: (productId: string, mode: 'balanced' | 'minimum' | 'premium') => void;
  onApply: (productId: string) => void;
  onReview: () => void;
}

function ProductCard({
  product,
  isSelected,
  onToggleSelect,
  currencyCode,
  isOwnerMode,
  targetMargin,
  onApprove,
  onApply,
  onReview,
}: ProductCardProps) {
  const recommended = product.recommendedPrices.balanced;
  const change = priceChange(product.currentSellingPrice, recommended);
  const isApproved = product.priceApprovalStatus === 'approved';
  const isApplied = isApproved && product.currentSellingPrice === product.finalApprovedPrice;
  const hasProblems = hasProductProblems(product);
  const problemBadge = getProblemBadgeLabel(product);
  const [showComparison, setShowComparison] = useState(false);

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border p-4 transition-all duration-300 relative group ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-200 dark:border-emerald-500 dark:ring-emerald-900/40 shadow-emerald-100/50 dark:shadow-emerald-900/20 shadow-md'
          : 'border-slate-100 dark:border-slate-700 hover:shadow-lg hover:border-slate-200 dark:hover:border-slate-600 hover:-translate-y-0.5'
      }`}
    >
      {/* Checkbox at top-right corner */}
      <div className="absolute top-3 right-3 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${product.name || 'product'}`}
          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white"
        />
      </div>

      {/* Left accent bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full transition-all duration-300 ${
        isSelected ? 'bg-emerald-500' :
        hasProblems ? 'bg-amber-400' :
        isApproved ? 'bg-teal-400' :
        'bg-slate-200 dark:bg-slate-600 group-hover:bg-emerald-300'
      }`} />

      <div className="flex items-start gap-3 pl-3 pr-8">
        {/* Margin gauge */}
        <div className="shrink-0 pt-1 hidden sm:block">
          <MarginGauge
            margin={product.calculatedMarginPercent}
            targetMargin={targetMargin}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-medium text-sm">{product.name || 'Unnamed product'}</span>
            {product.sku && <span className="text-xs text-muted-foreground font-mono">{product.sku}</span>}
            {isApproved ? (
              <Badge variant="outline" className="text-xs text-teal-600 border-teal-200 bg-teal-50 dark:bg-teal-900/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
              </Badge>
            ) : hasProblems ? (
              <Badge variant="outline" className={`text-xs ${problemBadge.color} flex items-center gap-1`}>
                <span className={`h-1.5 w-1.5 rounded-full ${problemBadge.dotColor} animate-pulse`} />
                {problemBadge.label}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30">
                {getStatusLabel(product.calculatedPricingStatus)}
              </Badge>
            )}
            {isApplied && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                <CircleCheck className="h-3 w-3 mr-1" /> Applied
              </Badge>
            )}
            {product.recommendedPrices.confidence === 'medium' && !isApproved && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/30">Medium confidence</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Some data may be estimated. Verify before approving.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Problem description for action-required products */}
          {hasProblems && !isApproved && (
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {getProblemDescription(product)}
            </p>
          )}

          {/* Price comparison row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
            <div>
              <p className="text-muted-foreground">{isOwnerMode ? 'Current price' : 'Current selling price'}</p>
              <p className="font-semibold">{formatCurrency(product.currentSellingPrice, currencyCode)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{isApproved ? (isOwnerMode ? 'Approved price' : 'Final approved price') : (isOwnerMode ? 'Recommended price' : 'Balanced recommendation')}</p>
              <p className={`font-semibold ${isApproved ? 'text-teal-600' : 'text-emerald-600'}`}>
                {formatCurrency(isApproved ? product.finalApprovedPrice : recommended, currencyCode)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{isOwnerMode ? 'Expected profit' : 'Projected net profit'}</p>
              <p className={`font-semibold ${product.calculatedProfitPerUnit > 0 ? 'text-emerald-600' : product.calculatedProfitPerUnit < 0 ? 'text-red-600' : ''}`}>
                {formatCurrency(product.calculatedProfitPerUnit, currencyCode)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Change</p>
              <p className={`font-semibold flex items-center gap-1 ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : change < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                {formatPercentage(Math.abs(change))}
              </p>
            </div>
          </div>

          {/* Toggle comparison bar */}
          {!isApproved && product.currentSellingPrice > 0 && recommended > 0 && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-[10px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center gap-1 mb-1 transition-colors"
            >
              <BarChart3 className="h-3 w-3" />
              {showComparison ? 'Hide' : 'Show'} price comparison
            </button>
          )}

          {/* Visual price comparison bar */}
          {showComparison && !isApproved && (
            <PriceComparisonBar
              current={product.currentSellingPrice}
              recommended={recommended}
              currencyCode={currencyCode}
            />
          )}
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-2 mt-3 pl-3 flex-wrap">
        {isApproved ? (
          !isApplied && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-200/50 dark:shadow-teal-900/30 rounded-lg text-xs h-7 hover:shadow-lg transition-all duration-200">
                  <Zap className="h-3 w-3 mr-1" /> Apply Price
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply approved price?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Change the selling price from {formatCurrency(product.currentSellingPrice, currencyCode)} to {formatCurrency(product.finalApprovedPrice, currencyCode)} for {product.name || 'this product'}?
                    This will update the current selling price used in all calculations.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onApply(product.id)} className="bg-teal-600 text-white">
                    Apply Price
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        ) : hasProblems ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg shadow-sm text-xs h-7 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all duration-200"
            onClick={onReview}
          >
            <Eye className="h-3 w-3 mr-1" /> Review
          </Button>
        ) : (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-200/50 dark:shadow-emerald-900/30 rounded-lg text-xs h-7 hover:shadow-lg transition-all duration-200">
                  Review & Approve
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve recommended price?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Approve {formatCurrency(recommended, currencyCode)} for {product.name || 'this product'}?
                    Current price: {formatCurrency(product.currentSellingPrice, currencyCode)}.
                    {change > 0 ? ` This is a ${formatPercentage(change)} increase.` : change < 0 ? ` This is a ${formatPercentage(Math.abs(change))} decrease.` : ' No change.'}
                    The approved price will NOT automatically replace your current selling price. You can apply it separately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onApprove(product.id, 'balanced')} className="bg-emerald-600 text-white">
                    Approve Price
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {/* Quick approve button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs h-7 border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all duration-200"
                    onClick={() => onApprove(product.id, 'balanced')}
                  >
                    <Zap className="h-3 w-3 mr-1" /> Quick Approve
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Approve at recommended price without confirmation</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 hover:text-emerald-600 transition-colors duration-200"
          onClick={onReview}
        >
          <Eye className="h-3 w-3 mr-1" /> Details
        </Button>
      </div>
    </div>
  );
}

// "All caught up!" empty state component with checkmark animation
function AllCaughtUpState({ tabLabel }: { tabLabel: string }) {
  return (
    <Card className="shadow-md border-0 rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-900/20 dark:via-teal-900/20 dark:to-cyan-900/20 p-8 text-center relative">
        {/* Decorative blur circles */}
        <div className="absolute top-4 left-8 w-16 h-16 bg-emerald-200/40 dark:bg-emerald-600/10 rounded-full blur-xl" />
        <div className="absolute bottom-4 right-8 w-20 h-20 bg-teal-200/40 dark:bg-teal-600/10 rounded-full blur-xl" />

        {/* Animated checkmark */}
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-800/40 dark:to-teal-800/40 flex items-center justify-center animate-[scaleIn_0.5s_ease-out]">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-emerald-200 to-teal-200 dark:from-emerald-700/50 dark:to-teal-700/50 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 animate-[checkBounce_0.6s_ease-out_0.2s_both]" />
            </div>
          </div>
          {/* Sparkle accents */}
          <Sparkles className="h-4 w-4 text-emerald-400 absolute -top-1 -right-1 animate-pulse" />
          <Sparkles className="h-3 w-3 text-teal-400 absolute -bottom-1 -left-2 animate-pulse delay-300" />
        </div>

        <h3 className="font-bold text-xl mb-2 text-emerald-800 dark:text-emerald-200">All caught up! 🎉</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          No products in the <span className="font-semibold text-emerald-700 dark:text-emerald-300">{tabLabel}</span> tab.
          {tabLabel === 'Action Required' && ' All your prices are looking good!'}
          {tabLabel === 'Ready to Approve' && ' Products will appear here when they have recommendations ready.'}
          {tabLabel === 'Recently Approved' && ' Approved products will appear here after you review them.'}
        </p>
      </div>
    </Card>
  );
}

export function ReviewPricesPage() {
  const {
    products,
    businessSettings,
    appSettings,
    approveProductPrice,
    applyApprovedPrice,
    updateProduct,
    setSelectedProductId,
    setCurrentView,
  } = usePricePilotStore();

  const currencyCode = businessSettings.currencyCode;
  const isOwnerMode = appSettings.applicationMode === 'owner';

  const [activeTab, setActiveTab] = useState<TabKey>('action-required');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Categorize products into tabs
  const actionRequired = useMemo(
    () => products.filter(p => hasProductProblems(p)),
    [products],
  );

  const readyToApprove = useMemo(
    () =>
      products.filter(
        p =>
          p.purchaseCost > 0 &&
          p.currentSellingPrice > 0 &&
          p.recommendedPrices.balanced > 0 &&
          p.priceApprovalStatus === 'none' &&
          p.recommendedPrices.confidence !== 'low' &&
          p.calculatedPricingStatus !== 'loss-making' &&
          p.calculatedPricingStatus !== 'missing-data' &&
          p.calculatedPricingStatus !== 'needs-review' &&
          p.calculatedPricingStatus !== 'below-break-even',
      ),
    [products],
  );

  const approvedProducts = useMemo(
    () => products.filter(p => p.priceApprovalStatus === 'approved'),
    [products],
  );

  const tabsConfig: { key: TabKey; label: string; items: Product[] }[] = [
    { key: 'action-required', label: 'Action Required', items: actionRequired },
    { key: 'ready-to-approve', label: 'Ready to Approve', items: readyToApprove },
    { key: 'recently-approved', label: 'Recently Approved', items: approvedProducts },
    { key: 'all', label: 'All', items: products },
  ];

  const activeTabItems = useMemo<Product[]>(() => {
    switch (activeTab) {
      case 'action-required': return actionRequired;
      case 'ready-to-approve': return readyToApprove;
      case 'recently-approved': return approvedProducts;
      case 'all': return products;
      default: return [];
    }
  }, [activeTab, actionRequired, readyToApprove, approvedProducts, products]);
  const selectedCount = selectedProductIds.size;
  const currentTabSelectedCount = activeTabItems.filter(p => selectedProductIds.has(p.id)).length;
  const allCurrentTabSelected = useMemo(
    () => activeTabItems.length > 0 && currentTabSelectedCount === activeTabItems.length,
    [activeTabItems, currentTabSelectedCount],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      activeTabItems.forEach(p => next.add(p.id));
      return next;
    });
  }, [activeTabItems]);

  const toggleSelectAllInTab = useCallback(() => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (allCurrentTabSelected) {
        activeTabItems.forEach(p => next.delete(p.id));
      } else {
        activeTabItems.forEach(p => next.add(p.id));
      }
      return next;
    });
  }, [activeTabItems, allCurrentTabSelected]);

  const clearSelection = useCallback(() => setSelectedProductIds(new Set()), []);

  const handleApproveSingle = (productId: string, mode: 'balanced' | 'minimum' | 'premium' = 'balanced') => {
    approveProductPrice(productId, mode);
    toast.success('Price approved', {
      description: 'The recommended price has been approved. You can apply it when ready.',
    });
  };

  const handleApplySingle = (productId: string) => {
    applyApprovedPrice(productId);
    toast.success('Price applied', { description: 'The approved price is now your selling price.' });
  };

  const approveAtRecommended = () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    const n = ids.length;
    ids.forEach(id => approveProductPrice(id, 'balanced'));
    clearSelection();
    toast.success(`Approved ${n} products`, {
      description: 'Prices have been approved and are ready for export',
    });
  };

  const approveAtCurrent = () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    const n = ids.length;
    const now = new Date().toISOString();
    ids.forEach(id => {
      const p = products.find(pr => pr.id === id);
      if (!p) return;
      updateProduct(id, {
        finalApprovedPrice: p.currentSellingPrice,
        priceApprovalStatus: 'approved',
        approvedAt: now,
        lifecycleStatus: 'approved',
        isApproved: true,
      });
    });
    clearSelection();
    toast.success(`Approved ${n} products`, {
      description: 'Current selling prices have been approved and are ready for export',
    });
  };

  const handleReview = (productId: string) => {
    setSelectedProductId(productId);
    setCurrentView('products');
  };

  const handleReviewAll = () => {
    if (actionRequired.length > 0) {
      setActiveTab('action-required');
      selectAllVisible();
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Gradient header card */}
      <div className="relative rounded-2xl overflow-hidden mb-6 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30">
        {/* Decorative blur circles */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/30 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-1/4 w-24 h-24 bg-teal-300/20 rounded-full blur-xl" />

        <div className="relative p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <ClipboardCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Review Prices</h2>
              <p className="text-emerald-100 text-sm mt-0.5">
                {actionRequired.length > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                    </span>
                    {actionRequired.length} product{actionRequired.length !== 1 ? 's' : ''} need{actionRequired.length === 1 ? 's' : ''} your attention
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    All prices are reviewed
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actionRequired.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 border-0 rounded-xl shadow-sm transition-all duration-200"
                onClick={handleReviewAll}
              >
                <Eye className="h-4 w-4 mr-1.5" /> Review All
              </Button>
            )}
            {readyToApprove.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-white/90 text-emerald-700 hover:bg-white rounded-xl shadow-sm transition-all duration-200"
                  >
                    <CheckCheck className="h-4 w-4 mr-1.5" /> Approve {readyToApprove.length} Ready
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve all ready products?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve the balanced recommended price for {readyToApprove.length} product{readyToApprove.length !== 1 ? 's' : ''}.
                      The approved prices will NOT automatically replace your current selling prices.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        readyToApprove.forEach(p => approveProductPrice(p.id, 'balanced'));
                        toast.success(`Approved ${readyToApprove.length} products`);
                      }}
                      className="bg-emerald-600 text-white"
                    >
                      Approve All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Pill-style filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {tabsConfig.map(tab => {
          const Icon = getTabIcon(tab.key);
          const isActive = activeTab === tab.key;
          const tabSelectedCount = tab.items.filter(p => selectedProductIds.has(p.id)).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-emerald-500 shadow-md shadow-emerald-200/50 dark:shadow-emerald-900/30 scale-[1.02]'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-300'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : ''}`} />
              <span>{tab.label}</span>
              <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold ${
                isActive
                  ? 'bg-white/25 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {tab.items.length}
              </span>
              {tabSelectedCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                  {tabSelectedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {(() => {
        const tab = tabsConfig.find(t => t.key === activeTab);
        if (!tab) return null;
        const tabSelectedCount = tab.items.filter(p => selectedProductIds.has(p.id)).length;
        const allSelectedInTab =
          tab.items.length > 0 && tab.items.every(p => selectedProductIds.has(p.id));

        return (
          <div className="mt-4">
            {/* Tab header with select-all checkbox */}
            {tab.items.length > 0 && (
              <div className="flex items-center justify-between mb-3 px-1 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelectedInTab}
                    onCheckedChange={() => {
                      setSelectedProductIds(prev => {
                        const next = new Set(prev);
                        if (allSelectedInTab) {
                          tab.items.forEach(p => next.delete(p.id));
                        } else {
                          tab.items.forEach(p => next.add(p.id));
                        }
                        return next;
                      });
                    }}
                    aria-label={`Select all in ${tab.label}`}
                    className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white"
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all in {tab.label.toLowerCase()}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {tabSelectedCount} of {tab.items.length} selected
                </span>
              </div>
            )}

            {tab.items.length === 0 ? (
              <AllCaughtUpState tabLabel={tab.label} />
            ) : (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
                {tab.items.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isSelected={selectedProductIds.has(product.id)}
                    onToggleSelect={() => toggleSelect(product.id)}
                    currencyCode={currencyCode}
                    isOwnerMode={isOwnerMode}
                    targetMargin={businessSettings.defaultTargetMarginPercent ?? 25}
                    onApprove={handleApproveSingle}
                    onApply={handleApplySingle}
                    onReview={() => handleReview(product.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Hint when items are selected but none in the current tab are selected */}
      {selectedCount > 0 && currentTabSelectedCount === 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 text-xs text-muted-foreground bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 shadow-lg">
          No items selected in this tab — switch tabs to see them, or use the actions below.
        </div>
      )}

      {/* Floating batch-action bar with glass-morphism */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-emerald-200/30 dark:shadow-emerald-900/20 rounded-2xl px-5 py-3 flex items-center gap-3 transition-all duration-300 animate-[slideUp_0.3s_ease-out] max-w-[calc(100vw-2rem)] flex-wrap justify-center">
          <span className="text-emerald-600 font-bold text-sm whitespace-nowrap flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {selectedCount} selected
          </span>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
            className="h-8 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all duration-200"
            title="Select all products in the current tab"
          >
            <Layers className="h-3.5 w-3.5 mr-1" /> Select All Visible
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 rounded-lg hover:text-red-600 transition-colors duration-200">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <Button
            variant="outline"
            size="sm"
            onClick={approveAtCurrent}
            className="h-8 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 transition-all duration-200"
            title="Approve at each product's current selling price"
          >
            Approve {selectedCount} at Current
          </Button>
          <Button
            size="sm"
            onClick={approveAtRecommended}
            className="h-8 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-700 hover:to-teal-600 shadow-md shadow-emerald-200/50 dark:shadow-emerald-900/30 rounded-lg transition-all duration-200"
            title="Approve at balanced recommended price for each product"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" /> Approve {selectedCount} at Recommended
          </Button>
        </div>
      )}
    </div>
  );
}

export default ReviewPricesPage;
