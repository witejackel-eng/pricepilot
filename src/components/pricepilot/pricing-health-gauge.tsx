'use client';

/**
 * PricePilot — Pricing Health Gauge (v1.3)
 *
 * A circular SVG gauge that visualises the overall pricing health of
 * the product catalog as a single 0–100 score. The score is a weighted
 * blend of:
 *   - Profitability (40%): % of products with positive margin
 *   - Margin health (30%): average margin vs target
 *   - Coverage (20%): % of products with complete cost data
 *   - Action rate (10%): % of products approved/applied
 *
 * Renders on the Owner Home above the action cards.
 *
 * v1.3 feature.
 */

import { useMemo } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { safeNumberValue, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  HeartPulse,
  TrendingUp,
  ShieldCheck,
  Target,
  Activity,
} from 'lucide-react';

interface ScoreBreakdown {
  profitability: number;
  marginHealth: number;
  coverage: number;
  actionRate: number;
  total: number;
}

function getScoreColor(score: number): { stroke: string; bg: string; text: string; label: string } {
  if (score >= 80) return { stroke: '#10b981', bg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40', text: 'text-emerald-600 dark:text-emerald-400', label: 'Excellent' };
  if (score >= 60) return { stroke: '#22c55e', bg: 'from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40', text: 'text-green-600 dark:text-green-400', label: 'Good' };
  if (score >= 40) return { stroke: '#f59e0b', bg: 'from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40', text: 'text-amber-600 dark:text-amber-400', label: 'Fair' };
  if (score >= 20) return { stroke: '#f97316', bg: 'from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40', text: 'text-orange-600 dark:text-orange-400', label: 'Needs Work' };
  return { stroke: '#ef4444', bg: 'from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/40', text: 'text-red-600 dark:text-red-400', label: 'Critical' };
}

export function PricingHealthGauge() {
  const { products, businessSettings } = usePricePilotStore();

  const breakdown = useMemo<ScoreBreakdown>(() => {
    if (products.length === 0) {
      return { profitability: 0, marginHealth: 0, coverage: 0, actionRate: 0, total: 0 };
    }

    const total = products.length;

    // 1. Profitability: % of products with positive margin
    const profitable = products.filter((p) => {
      const cost =
        safeNumberValue(p.purchaseCost, 0) +
        safeNumberValue(p.shippingCost, 0) +
        safeNumberValue(p.packagingCost, 0) +
        safeNumberValue(p.handlingCost, 0);
      const price = safeNumberValue(p.currentSellingPrice, 0);
      return price > 0 && price > cost;
    }).length;
    const profitability = (profitable / total) * 100;

    // 2. Margin health: avg margin vs target margin (from business settings)
    const targetMargin = safeNumberValue(businessSettings.defaultTargetMarginPercent, 25);
    const avgMargin = products.reduce((sum, p) => {
      const cost =
        safeNumberValue(p.purchaseCost, 0) +
        safeNumberValue(p.shippingCost, 0) +
        safeNumberValue(p.packagingCost, 0) +
        safeNumberValue(p.handlingCost, 0);
      const price = safeNumberValue(p.currentSellingPrice, 0);
      return sum + (price > 0 ? ((price - cost) / price) * 100 : 0);
    }, 0) / total;
    // Score: 100 if avg >= target, scaled down if below
    const marginHealth = Math.min(100, (avgMargin / targetMargin) * 100);

    // 3. Coverage: % with complete cost data (purchase cost > 0)
    const withCost = products.filter((p) => safeNumberValue(p.purchaseCost, 0) > 0).length;
    const coverage = (withCost / total) * 100;

    // 4. Action rate: % approved
    const acted = products.filter(
      (p) => p.priceApprovalStatus === 'approved'
    ).length;
    const actionRate = (acted / total) * 100;

    // Weighted total
    const score = Math.round(
      profitability * 0.4 + marginHealth * 0.3 + coverage * 0.2 + actionRate * 0.1
    );

    return {
      profitability: Math.round(profitability),
      marginHealth: Math.round(marginHealth),
      coverage: Math.round(coverage),
      actionRate: Math.round(actionRate),
      total: score,
    };
  }, [products, businessSettings.defaultTargetMarginPercent]);

  if (products.length === 0) return null;

  const colors = getScoreColor(breakdown.total);

  // SVG gauge geometry
  const size = 140;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (breakdown.total / 100) * circumference;

  // Breakdown items
  const items = [
    { label: 'Profitability', value: breakdown.profitability, icon: TrendingUp, weight: '40%' },
    { label: 'Margin Health', value: breakdown.marginHealth, icon: Target, weight: '30%' },
    { label: 'Data Coverage', value: breakdown.coverage, icon: ShieldCheck, weight: '20%' },
    { label: 'Action Rate', value: breakdown.actionRate, icon: Activity, weight: '10%' },
  ];

  return (
    <Card className={`border-slate-200 dark:border-slate-800 overflow-hidden bg-gradient-to-br ${colors.bg}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center">
            <HeartPulse className={`h-4 w-4 ${colors.text}`} />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Pricing Health Score
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Overall catalog wellness at a glance
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {/* Circular gauge */}
          <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
              {/* Background ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-slate-200 dark:text-slate-800"
              />
              {/* Progress ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </svg>
            {/* Center score */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold tabular-nums ${colors.text} animate-score-count`}>
                {breakdown.total}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-medium">
                / 100
              </span>
            </div>
          </div>

          {/* Breakdown + label */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                className={`text-xs font-semibold ${colors.text} bg-white/80 dark:bg-slate-800/80 border-0`}
              >
                {colors.label}
              </Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {products.length} products
              </span>
            </div>
            {/* Breakdown bars */}
            <div className="space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-2">
                    <Icon className="h-3 w-3 text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 w-24 flex-shrink-0">
                      {item.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${item.value}%`,
                          backgroundColor: colors.stroke,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 w-8 text-right">
                      {item.value}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
