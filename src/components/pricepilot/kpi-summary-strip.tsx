'use client';

/**
 * PricePilot — KPI Summary Strip (v1.8)
 *
 * A polished, animated horizontal strip of key business metrics displayed
 * prominently at the top of the Owner Home. Each KPI card features:
 *   - An icon with a gradient background
 *   - A large animated count-up value
 *   - A trend indicator (up/down/flat) with color coding
 *   - A subtle sparkline accent
 *
 * Metrics shown:
 *   1. Total Catalog Value  — sum of (currentSellingPrice × quantity)
 *   2. Avg Margin           — weighted average margin across products
 *   3. Products Tracked     — total product count
 *   4. Pricing Health       — aggregated health score (0–100)
 *   5. Profit Potential     — total extra profit available from suggestions
 */

import { useMemo, useEffect, useRef, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { safeNumberValue, formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import {
  IndianRupee,
  Percent,
  Package,
  HeartPulse,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
} from 'lucide-react';

// ============================================================
// Count-up hook — animates a number from 0 to target on mount
// ============================================================

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

// ============================================================
// Sparkline — tiny inline SVG line chart
// ============================================================

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 48;
  const h = 18;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="opacity-60" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================================
// KPI Card
// ============================================================

interface KpiCardProps {
  label: string;
  value: number;
  formattedValue: string;
  icon: React.ElementType;
  gradient: string;
  iconColor: string;
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  sparkData?: number[];
  sparkColor: string;
  delay: number;
}

function KpiCard({
  label,
  formattedValue,
  icon: Icon,
  gradient,
  iconColor,
  trend,
  trendLabel,
  sparkData,
  sparkColor,
  delay,
}: KpiCardProps) {
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-red-500 dark:text-red-400'
        : 'text-slate-400';

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 animate-kpi-strip-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Gradient accent bar at top */}
      <div className={`h-1 w-full ${gradient}`} />

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div
            className={`h-10 w-10 rounded-xl ${gradient} bg-opacity-15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}
          >
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          {sparkData && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <MiniSparkline data={sparkData} color={sparkColor} />
            </div>
          )}
        </div>

        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-tight">
          {formattedValue}
        </p>

        {trend && trendLabel && (
          <div className="flex items-center gap-1 mt-2">
            <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
            <span className={`text-xs font-medium ${trendColor}`}>{trendLabel}</span>
          </div>
        )}
      </div>

      {/* Decorative gradient glow on hover */}
      <div
        className={`pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full ${gradient} opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500`}
      />
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function KpiSummaryStrip() {
  const { products, businessSettings } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode || 'INR';

  const metrics = useMemo(() => {
    if (products.length === 0) {
      return {
        catalogValue: 0,
        avgMargin: 0,
        productCount: 0,
        healthScore: 0,
        profitPotential: 0,
        profitableCount: 0,
      };
    }

    let catalogValue = 0;
    let totalMargin = 0;
    let marginWeight = 0;
    let profitPotential = 0;
    let profitableCount = 0;
    let healthSum = 0;

    for (const p of products) {
      const price = safeNumberValue(p.currentSellingPrice, 0);
      const qty = safeNumberValue(p.quantity, 0);
      const cost =
        safeNumberValue(p.calculatedTotalLandedCost, 0) ||
        (safeNumberValue(p.purchaseCost, 0) +
          safeNumberValue(p.shippingCost, 0) +
          safeNumberValue(p.packagingCost, 0) +
          safeNumberValue(p.handlingCost, 0) +
          safeNumberValue(p.otherCosts, 0));

      catalogValue += price * qty;

      if (price > 0) {
        const margin = ((price - cost) / price) * 100;
        const weight = price * qty;
        totalMargin += margin * weight;
        marginWeight += weight;
        if (margin > 0) profitableCount++;
        healthSum += Math.max(0, Math.min(100, margin * 1.5));
      }

      // Profit potential: difference between recommended and current price
      const recPrice =
        p.selectedRecommendationMode === 'custom'
          ? safeNumberValue(p.customRecommendedPrice, 0)
          : safeNumberValue(p.recommendedPrices?.balanced, 0);
      if (recPrice > price && recPrice > 0) {
        const recMargin = cost > 0 ? ((recPrice - cost) / recPrice) * 100 : 0;
        const curMargin = price > 0 ? ((price - cost) / price) * 100 : 0;
        profitPotential += Math.max(0, (recMargin - curMargin) / 100) * recPrice * qty;
      }
    }

    const avgMargin = marginWeight > 0 ? totalMargin / marginWeight : 0;
    const healthScore = products.length > 0 ? Math.min(100, Math.round(healthSum / products.length)) : 0;

    return {
      catalogValue,
      avgMargin,
      productCount: products.length,
      healthScore,
      profitPotential,
      profitableCount,
    };
  }, [products]);

  // Count-up animated values
  const animCatalog = useCountUp(metrics.catalogValue);
  const animMargin = useCountUp(metrics.avgMargin);
  const animHealth = useCountUp(metrics.healthScore);
  const animProfit = useCountUp(metrics.profitPotential);

  // Sparkline data (simulated trend from health/margin)
  const marginSpark = useMemo(
    () => Array.from({ length: 8 }, (_, i) => metrics.avgMargin * (0.85 + i * 0.04 + Math.random() * 0.06)),
    [metrics.avgMargin],
  );
  const healthSpark = useMemo(
    () => Array.from({ length: 8 }, (_, i) => metrics.healthScore * (0.8 + i * 0.05 + Math.random() * 0.05)),
    [metrics.healthScore],
  );

  if (products.length === 0) return null;

  return (
    <section
      className="relative"
      aria-label="Key Performance Indicators"
      data-testid="kpi-summary-strip"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Business Overview
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard
          label="Catalog Value"
          value={metrics.catalogValue}
          formattedValue={formatCurrency(animCatalog, currencyCode)}
          icon={IndianRupee}
          gradient="bg-gradient-to-br from-emerald-400 to-teal-500"
          iconColor="text-white"
          sparkColor="#10b981"
          sparkData={marginSpark}
          trend="up"
          trendLabel={`${metrics.productCount} items`}
          delay={0}
        />
        <KpiCard
          label="Avg Margin"
          value={metrics.avgMargin}
          formattedValue={formatPercentage(animMargin)}
          icon={Percent}
          gradient="bg-gradient-to-br from-teal-400 to-cyan-500"
          iconColor="text-white"
          sparkColor="#14b8a6"
          sparkData={marginSpark}
          trend={metrics.avgMargin >= 20 ? 'up' : 'down'}
          trendLabel={metrics.avgMargin >= 20 ? 'Healthy' : 'Below target'}
          delay={80}
        />
        <KpiCard
          label="Products"
          value={metrics.productCount}
          formattedValue={`${metrics.productCount}`}
          icon={Package}
          gradient="bg-gradient-to-br from-violet-400 to-purple-500"
          iconColor="text-white"
          sparkColor="#a78bfa"
          trend="flat"
          trendLabel={`${metrics.profitableCount} profitable`}
          delay={160}
        />
        <KpiCard
          label="Health Score"
          value={metrics.healthScore}
          formattedValue={`${Math.round(animHealth)}/100`}
          icon={HeartPulse}
          gradient="bg-gradient-to-br from-rose-400 to-pink-500"
          iconColor="text-white"
          sparkColor="#f43f5e"
          sparkData={healthSpark}
          trend={metrics.healthScore >= 70 ? 'up' : 'down'}
          trendLabel={metrics.healthScore >= 70 ? 'Strong' : 'Needs work'}
          delay={240}
        />
        <KpiCard
          label="Profit Potential"
          value={metrics.profitPotential}
          formattedValue={formatCurrency(animProfit, currencyCode)}
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-amber-400 to-orange-500"
          iconColor="text-white"
          sparkColor="#f59e0b"
          trend="up"
          trendLabel="From suggestions"
          delay={320}
        />
      </div>
    </section>
  );
}
