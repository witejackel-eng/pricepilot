'use client';

/**
 * PricePilot — Price Elasticity Analysis Page (v1.6 / Task 4)
 *
 * A dedicated analytics page that estimates the price elasticity of demand
 * for each product in the catalog, visualises the distribution, and lets
 * the owner run interactive what-if scenarios.
 *
 * Since PricePilot does not yet have longitudinal sales data, elasticity
 * is ESTIMATED via a heuristic model that combines:
 *   1. Product category       — electronics tend to be more elastic, essentials inelastic
 *   2. Price position         — premium products within a category are more elastic
 *   3. Margin level           — high-margin products have more room to adjust
 *   4. Competitor proximity   — more competitors → more elastic
 *
 * Layout (top → bottom):
 *   1. Gradient header bar (emerald → teal) with title + subtitle + help tooltip
 *   2. Elasticity model card with 4 factor chips
 *   3. Summary stats grid (4 gradient cards: avg elasticity / elastic count /
 *      inelastic count / revenue opportunity)
 *   4. Elasticity distribution BarChart (5 colour-coded buckets)
 *   5. Filters bar (search + category + elasticity-type)
 *   6. Products table (Product, Category, Price, Margin, Elasticity, Demand
 *      Sensitivity bar, Recommendation, Est. Revenue Impact, Confidence)
 *      — striped rows, hover emerald tint, sticky header, max-h-96 + custom
 *      scrollbar
 *   7. Scenario simulator card (product dropdown + price slider + current vs
 *      projected comparison + mini BarChart + verdict)
 *   8. Friendly animated empty state when no products exist
 *
 * This component is self-contained. The main agent will mount it inside
 * the app-shell; no other files are modified.
 */

import { useMemo, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Product } from '@/lib/pricepilot/types';
import {
  formatCurrency,
  formatPercentage,
  safeNumberValue,
} from '@/lib/pricepilot/formatting';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  Search,
  Filter,
  Gauge,
  Tag,
  Percent,
  Users,
  Package,
  Target,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  X,
  Info,
  Lightbulb,
  Layers,
  Zap,
  Scale,
  CircleDollarSign,
  Wand2,
} from 'lucide-react';

// ============================================================
// Constants & Types
// ============================================================

type ElasticityTone = 'elastic' | 'inelastic' | 'unit';

type ElasticityFilter = 'all' | 'elastic' | 'inelastic' | 'unit';

interface DistributionBucket {
  label: string;
  range: string;
  count: number;
  /** Tailwind-independent hex colour used by recharts <Cell>. */
  color: string;
}

interface ScenarioProjection {
  currentPrice: number;
  newPrice: number;
  currentVolume: number;
  newVolume: number;
  currentRevenue: number;
  newRevenue: number;
  currentMarginPct: number;
  newMarginPct: number;
  currentProfit: number;
  newProfit: number;
  revenueDelta: number;
  profitDelta: number;
  verdict: 'recommended' | 'caution' | 'not-advised';
}

// 5 elasticity buckets: Highly Inelastic → Highly Elastic
const DISTRIBUTION_BUCKETS: Omit<DistributionBucket, 'count'>[] = [
  { label: 'Highly Inelastic', range: '< 0.5', color: '#ef4444' }, // red-500
  { label: 'Inelastic', range: '0.5 – 1.0', color: '#f97316' }, // orange-500
  { label: 'Unit Elastic', range: '1.0 – 1.5', color: '#f59e0b' }, // amber-500
  { label: 'Elastic', range: '1.5 – 2.5', color: '#10b981' }, // emerald-500
  { label: 'Highly Elastic', range: '> 2.5', color: '#14b8a6' }, // teal-500
];

// Model factor chips config
const MODEL_FACTORS: {
  Icon: React.ElementType;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    Icon: Tag,
    title: 'Category',
    description:
      'Electronics & luxury tend to be highly elastic; essentials are inelastic.',
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    Icon: Scale,
    title: 'Price Position',
    description:
      'Products priced above their category average are more sensitive to changes.',
    accent: 'from-teal-500 to-cyan-500',
  },
  {
    Icon: Percent,
    title: 'Margin',
    description:
      'High-margin products have more room to move — elasticity is amplified.',
    accent: 'from-amber-500 to-yellow-500',
  },
  {
    Icon: Users,
    title: 'Competition',
    description:
      'More tracked competitors mean buyers can easily switch → higher elasticity.',
    accent: 'from-rose-500 to-pink-500',
  },
];

// ============================================================
// Pure helpers
// ============================================================

/**
 * Estimate the price elasticity of demand for a product using a heuristic
 * model based on category, price position, margin, and competitor proximity.
 *
 * Returns a positive number; |e| > 1 ⇒ elastic, |e| < 1 ⇒ inelastic.
 */
function estimateElasticity(product: Product, allProducts: Product[]): number {
  // Base elasticity by category (heuristics)
  const categoryBase: Record<string, number> = {
    electronics: 1.8,
    accessories: 1.4,
    clothing: 1.5,
    food: 0.6,
    essentials: 0.5,
    luxury: 2.2,
  };
  const cat = (product.category || '').toLowerCase();
  let base = 1.2; // default
  for (const [key, val] of Object.entries(categoryBase)) {
    if (cat.includes(key)) {
      base = val;
      break;
    }
  }
  // Adjust for price position (above category average = more elastic)
  const catProducts = allProducts.filter((p) => p.category === product.category);
  if (catProducts.length > 1) {
    const avgPrice =
      catProducts.reduce((s, p) => s + p.currentSellingPrice, 0) /
      catProducts.length;
    if (avgPrice > 0) {
      const priceRatio = product.currentSellingPrice / avgPrice;
      base *= 0.7 + priceRatio * 0.5; // premium products slightly more elastic
    }
  }
  // Adjust for margin (high margin = more room = slightly more elastic)
  if (product.calculatedMarginPercent > 30) base *= 1.1;
  if (product.calculatedMarginPercent < 10) base *= 0.9;
  // Adjust for competitor proximity
  const compCount = product.competitorPrices?.length || 0;
  if (compCount > 3) base *= 1.15;
  else if (compCount === 0) base *= 0.95;
  // Clamp to reasonable range
  return Math.max(0.2, Math.min(3.5, base));
}

/** Classify an elasticity value into one of three tones. */
function getElasticityTone(e: number): ElasticityTone {
  if (e > 1.15) return 'elastic';
  if (e < 0.85) return 'inelastic';
  return 'unit';
}

/** Tailwind classes for the elasticity badge pill. */
const ELASTICITY_BADGE_CLASSES: Record<ElasticityTone, string> = {
  elastic:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  inelastic:
    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
  unit:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

const ELASTICITY_LABEL: Record<ElasticityTone, string> = {
  elastic: 'Elastic',
  inelastic: 'Inelastic',
  unit: 'Unit',
};

/**
 * Demand-sensitivity percentage on a 0–100 scale, derived from |e|.
 * |e|=0.2 → ~6%, |e|=1 → ~29%, |e|=3.5 → 100%.
 */
function getDemandSensitivityPercent(e: number): number {
  const pct = (Math.abs(e) / 3.5) * 100;
  return Math.max(2, Math.min(100, Math.round(pct)));
}

/** Compute a price recommendation label based on elasticity + margin. */
function getPriceRecommendation(product: Product, e: number): {
  label: 'Lower price' | 'Raise price' | 'Maintain';
  Icon: React.ElementType;
  tone: 'green' | 'amber' | 'rose';
} {
  const margin = safeNumberValue(product.calculatedMarginPercent, 0);
  if (e > 1.15 && margin > 10) {
    return { label: 'Lower price', Icon: ArrowDownRight, tone: 'green' };
  }
  if (e < 0.85) {
    return { label: 'Raise price', Icon: ArrowUpRight, tone: 'rose' };
  }
  return { label: 'Maintain', Icon: Target, tone: 'amber' };
}

/** Estimate monthly units to use for revenue calculations. */
function effectiveMonthlyUnits(product: Product): number {
  const expected = safeNumberValue(product.expectedMonthlyUnits, 0);
  if (expected > 0) return expected;
  return safeNumberValue(product.monthlyUnitsSold, 0);
}

/**
 * Estimate the monthly revenue uplift achievable by moving the price in the
 * elasticity-optimal direction by a small adjustment (~5%).
 *
 *   Elastic products   → lower price 5%  → volume rises by e × 5%
 *   Inelastic products → raise price 5%  → volume drops by e × 5%
 *   Unit elastic       → no move → 0
 */
function estimateRevenueImpact(product: Product, e: number): number {
  const volume = effectiveMonthlyUnits(product);
  if (volume <= 0) return 0;
  const price = safeNumberValue(product.currentSellingPrice, 0);
  if (price <= 0) return 0;
  const currentRevenue = price * volume;
  const ADJ = 0.05;
  let newPrice = price;
  let newVolume = volume;
  if (e > 1.15) {
    newPrice = price * (1 - ADJ);
    newVolume = volume * (1 + e * ADJ);
  } else if (e < 0.85) {
    newPrice = price * (1 + ADJ);
    newVolume = volume * (1 - e * ADJ);
  } else {
    return 0;
  }
  const newRevenue = newPrice * newVolume;
  return newRevenue - currentRevenue;
}

/**
 * Confidence in the elasticity estimate, based on data completeness.
 *   - Has cost data (landed cost > 0)
 *   - Has volume data (expected or sold units > 0)
 *   - Has competitor data
 *
 * 3/3 → High, 2/3 → Medium, else → Low
 */
function getConfidence(product: Product): {
  level: 'High' | 'Medium' | 'Low';
  tone: 'green' | 'amber' | 'rose';
} {
  let score = 0;
  if (safeNumberValue(product.calculatedTotalLandedCost, 0) > 0) score++;
  if (effectiveMonthlyUnits(product) > 0) score++;
  if ((product.competitorPrices?.length || 0) > 0) score++;
  if (score >= 3) return { level: 'High', tone: 'green' };
  if (score === 2) return { level: 'Medium', tone: 'amber' };
  return { level: 'Low', tone: 'rose' };
}

/**
 * Project the effect of a price change on volume, revenue, margin, and
 * profit, given an elasticity estimate.
 *
 *   ΔQ% = -e × ΔP%     (volume moves opposite to price, scaled by elasticity)
 */
function simulateScenario(
  product: Product,
  e: number,
  deltaPercent: number,
): ScenarioProjection {
  const currentPrice = safeNumberValue(product.currentSellingPrice, 0);
  const currentVolume = effectiveMonthlyUnits(product);
  const cost = safeNumberValue(product.calculatedTotalLandedCost, 0);

  const currentRevenue = currentPrice * currentVolume;
  const currentProfitPerUnit = currentPrice - cost;
  const currentProfit = currentProfitPerUnit * currentVolume;
  const currentMarginPct =
    currentPrice > 0
      ? (currentProfitPerUnit / currentPrice) * 100
      : safeNumberValue(product.calculatedMarginPercent, 0);

  const factor = 1 + deltaPercent / 100;
  const newPrice = currentPrice * factor;
  // Volume moves opposite to price (the negative sign in the formula below).
  const volumeChangePct = -e * (deltaPercent / 100);
  const newVolume = Math.max(0, currentVolume * (1 + volumeChangePct));

  const newRevenue = newPrice * newVolume;
  const newProfitPerUnit = newPrice - cost;
  const newProfit = newProfitPerUnit * newVolume;
  const newMarginPct = newPrice > 0 ? (newProfitPerUnit / newPrice) * 100 : 0;

  const revenueDelta = newRevenue - currentRevenue;
  const profitDelta = newProfit - currentProfit;

  // Verdict: combine revenue + profit signals.
  let verdict: ScenarioProjection['verdict'];
  const revUp = revenueDelta > 0.01;
  const profitUp = profitDelta > 0.01;
  const revDown = revenueDelta < -0.01;
  const profitDown = profitDelta < -0.01;
  if (revUp && profitUp) {
    verdict = 'recommended';
  } else if (revDown && profitDown) {
    verdict = 'not-advised';
  } else {
    verdict = 'caution';
  }

  return {
    currentPrice,
    newPrice,
    currentVolume,
    newVolume,
    currentRevenue,
    newRevenue,
    currentMarginPct,
    newMarginPct,
    currentProfit,
    newProfit,
    revenueDelta,
    profitDelta,
    verdict,
  };
}

// ============================================================
// Sub-components
// ============================================================

interface StatCardProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  sublabel?: string;
  Icon: React.ElementType;
  /** Tailwind gradient background class for the card. */
  gradient: string;
  /** Animation entrance delay in ms. */
  delay?: number;
}

function StatCard({
  label,
  value,
  decimals = 0,
  prefix,
  suffix,
  sublabel,
  Icon,
  gradient,
  delay = 0,
}: StatCardProps) {
  const formatted = useMemo(() => {
    const v = Number.isFinite(value) ? value : 0;
    return v.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }, [value, decimals]);

  return (
    <div
      className={cn(
        'group animate-in fade-in slide-in-from-bottom-4 duration-500',
        'relative overflow-hidden rounded-2xl p-6',
        'shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300',
        'border border-white/20 dark:border-white/10',
        gradient,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Decorative glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/20 blur-2xl opacity-60 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
      {/* 2px gradient top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400 opacity-80"
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/80 dark:text-white/70">
            {label}
          </div>
          <div className="mt-2 text-3xl font-bold text-white dark:text-white drop-shadow-sm tabular-nums">
            {prefix}
            {formatted}
            {suffix}
          </div>
          {sublabel && (
            <div className="mt-1 text-xs text-white/70 dark:text-white/60">
              {sublabel}
            </div>
          )}
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            'bg-white/25 dark:bg-white/15 backdrop-blur-sm ring-2 ring-white/30',
          )}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

/** Small chip describing one of the elasticity model factors. */
function FactorChip({
  Icon,
  title,
  description,
  accent,
  delay = 0,
}: {
  Icon: React.ElementType;
  title: string;
  description: string;
  accent: string;
  delay?: number;
}) {
  return (
    <div
      className={cn(
        'animate-in fade-in slide-in-from-bottom-4 duration-500',
        'group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700',
        'bg-white dark:bg-slate-800/60 p-4 transition-all hover:shadow-md hover:-translate-y-0.5',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r',
          accent,
        )}
        aria-hidden="true"
      />
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm',
            accent,
          )}
        >
          <Icon className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
          {title}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

/** Coloured pill showing the elasticity tone for a product. */
function ElasticityBadge({ e }: { e: number }) {
  const tone = getElasticityTone(e);
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[11px] h-5 px-1.5 font-medium border',
        ELASTICITY_BADGE_CLASSES[tone],
      )}
    >
      {e.toFixed(2)}
      <span className="opacity-70 ml-1">{ELASTICITY_LABEL[tone]}</span>
    </Badge>
  );
}

/** Visual demand-sensitivity bar (0–100%, gradient red → amber → green). */
function DemandBar({ e }: { e: number }) {
  const pct = getDemandSensitivityPercent(e);
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="relative flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background:
              'linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #10b981 100%)',
          }}
        />
      </div>
      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

/** Custom tooltip for the elasticity distribution BarChart. */
function DistributionTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DistributionBucket }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: d.color }}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {d.label}
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Range: <span className="font-mono">{d.range}</span>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Products: <span className="font-semibold text-slate-700 dark:text-slate-200">{d.count}</span>
      </div>
    </div>
  );
}

/** Custom tooltip for the scenario mini BarChart. */
function ScenarioTooltipContent({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { label: string; current: number; projected: number } }>;
  currencyCode: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-md">
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {p.label}
      </div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Current: <span className="font-mono">{formatCurrency(p.current, currencyCode)}</span>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        Projected: <span className="font-mono">{formatCurrency(p.projected, currencyCode)}</span>
      </div>
    </div>
  );
}

/** Animated empty-state illustration when no products exist. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="relative mb-6 h-32 w-32">
        {/* Outer pulsing ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-emerald-200 dark:border-emerald-900/60 animate-ping opacity-30"
          style={{ animationDuration: '2.4s' }}
          aria-hidden="true"
        />
        {/* Floating chart card back */}
        <div
          className="absolute left-3 top-7 h-20 w-24 rounded-xl bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40 border border-teal-200 dark:border-teal-800 shadow-sm"
          style={{ animation: 'float-icon 3s ease-in-out infinite' }}
          aria-hidden="true"
        />
        {/* Floating chart card front */}
        <div
          className="absolute right-3 top-3 h-20 w-24 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 border border-emerald-200 dark:border-emerald-800 shadow-md"
          style={{
            animation: 'float-icon 3s ease-in-out infinite',
            animationDelay: '0.4s',
          }}
          aria-hidden="true"
        />
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
            <Activity className="h-7 w-7 text-white" />
          </div>
        </div>
      </div>
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        No products to analyse yet
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Add products to your catalog to see elasticity estimates, demand
        sensitivity, and revenue-impact simulations.
      </p>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function PriceElasticityPage() {
  const { products, businessSettings, setSelectedProductId, setCurrentView } =
    usePricePilotStore();

  const currencyCode = businessSettings?.currencyCode || 'INR';

  // ----- Filters -----
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [elasticityFilter, setElasticityFilter] =
    useState<ElasticityFilter>('all');

  // ----- Scenario simulator state -----
  const [simProductId, setSimProductId] = useState<string | null>(
    products[0]?.id ?? null,
  );
  const [priceDelta, setPriceDelta] = useState<number>(0);

  // ----- Derived: products with elasticity -----
  const productsWithElasticity = useMemo(() => {
    return products.map((p) => ({
      product: p,
      elasticity: estimateElasticity(p, products),
    }));
  }, [products]);

  // ----- Derived: summary stats -----
  const stats = useMemo(() => {
    if (productsWithElasticity.length === 0) {
      return {
        avgElasticity: 0,
        avgTone: 'unit' as ElasticityTone,
        elasticCount: 0,
        inelasticCount: 0,
        revenueOpportunity: 0,
      };
    }
    let sum = 0;
    let elasticCount = 0;
    let inelasticCount = 0;
    let revenueOpportunity = 0;
    for (const { product, elasticity } of productsWithElasticity) {
      sum += elasticity;
      if (elasticity > 1.15) elasticCount++;
      else if (elasticity < 0.85) inelasticCount++;
      revenueOpportunity += estimateRevenueImpact(product, elasticity);
    }
    const avg = sum / productsWithElasticity.length;
    return {
      avgElasticity: avg,
      avgTone: getElasticityTone(avg),
      elasticCount,
      inelasticCount,
      revenueOpportunity,
    };
  }, [productsWithElasticity]);

  // ----- Derived: distribution buckets -----
  const distribution = useMemo<DistributionBucket[]>(() => {
    const counts = DISTRIBUTION_BUCKETS.map(() => 0);
    for (const { elasticity } of productsWithElasticity) {
      if (elasticity < 0.5) counts[0]++;
      else if (elasticity < 1.0) counts[1]++;
      else if (elasticity < 1.5) counts[2]++;
      else if (elasticity < 2.5) counts[3]++;
      else counts[4]++;
    }
    return DISTRIBUTION_BUCKETS.map((b, i) => ({ ...b, count: counts[i] }));
  }, [productsWithElasticity]);

  // ----- Derived: category list for filter -----
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // ----- Derived: filtered product rows -----
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productsWithElasticity.filter(({ product, elasticity }) => {
      // Category filter
      if (categoryFilter !== 'all' && product.category !== categoryFilter) {
        return false;
      }
      // Elasticity filter
      if (elasticityFilter !== 'all') {
        const tone = getElasticityTone(elasticity);
        if (tone !== elasticityFilter) return false;
      }
      // Search
      if (term) {
        const hay = `${product.name} ${product.sku} ${product.category} ${product.brand}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [productsWithElasticity, search, categoryFilter, elasticityFilter]);

  const hasActiveFilters =
    search.trim() !== '' ||
    categoryFilter !== 'all' ||
    elasticityFilter !== 'all';

  const handleClearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setElasticityFilter('all');
  };

  // ----- Product click → open drawer in products view -----
  const handleProductClick = (productId: string) => {
    setSelectedProductId(productId);
    setCurrentView('products');
    toast.info('Opening product details…');
  };

  // ----- Scenario simulator: keep selection valid -----
  const simProduct: Product | null = useMemo(() => {
    if (!simProductId) return products[0] ?? null;
    return products.find((p) => p.id === simProductId) ?? products[0] ?? null;
  }, [simProductId, products]);

  const simElasticity = useMemo(
    () => (simProduct ? estimateElasticity(simProduct, products) : 1),
    [simProduct, products],
  );

  const projection = useMemo<ScenarioProjection | null>(() => {
    if (!simProduct) return null;
    return simulateScenario(simProduct, simElasticity, priceDelta);
  }, [simProduct, simElasticity, priceDelta]);

  const verdictConfig: Record<
    ScenarioProjection['verdict'],
    { label: string; tone: string; Icon: React.ElementType }
  > = {
    recommended: {
      label: 'Recommended',
      tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      Icon: CheckCircle2,
    },
    caution: {
      label: 'Caution',
      tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      Icon: AlertTriangle,
    },
    'not-advised': {
      label: 'Not advised',
      tone: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
      Icon: AlertTriangle,
    },
  };

  const hasProducts = products.length > 0;

  // ----- Render -----
  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 p-6 shadow-md">
        {/* Decorative dot pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
          aria-hidden="true"
        />
        {/* Shimmer sweep */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
            animation: 'greeting-shimmer 4s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white drop-shadow-sm">
                Price Elasticity Analysis
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-white/85 dark:text-white/80">
              Understand how price changes affect demand and revenue
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="What is price elasticity?"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors"
              >
                <HelpCircle className="h-5 w-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-xs bg-slate-900 text-white border-slate-700 dark:bg-slate-800"
            >
              <p className="leading-relaxed">
                <strong>Price elasticity</strong> = % change in quantity ÷ %
                change in price. |e| &gt; 1 ⇒ elastic (lower price can lift
                revenue). |e| &lt; 1 ⇒ inelastic (raise price safely).
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ===== Elasticity model card ===== */}
      <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500"
          aria-hidden="true"
        />
        <CardContent className="p-6">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
              <Lightbulb className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Estimation Model
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Elasticity is approximated from four factors. Estimates are
                directional — use the simulator below to test specific scenarios.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MODEL_FACTORS.map((f, i) => (
              <FactorChip
                key={f.title}
                Icon={f.Icon}
                title={f.title}
                description={f.description}
                accent={f.accent}
                delay={i * 80}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ===== Summary stats ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Avg. Elasticity"
          value={stats.avgElasticity}
          decimals={2}
          sublabel={ELASTICITY_LABEL[stats.avgTone]}
          Icon={Gauge}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          delay={0}
        />
        <StatCard
          label="Elastic Products"
          value={stats.elasticCount}
          sublabel="|e| > 1"
          Icon={TrendingUp}
          gradient="bg-gradient-to-br from-teal-500 to-teal-600"
          delay={80}
        />
        <StatCard
          label="Inelastic Products"
          value={stats.inelasticCount}
          sublabel="|e| < 1"
          Icon={TrendingDown}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          delay={160}
        />
        <StatCard
          label="Revenue Opportunity"
          value={stats.revenueOpportunity}
          prefix={currencyCode === 'INR' ? '₹' : ''}
          suffix=""
          sublabel="Monthly uplift, est."
          Icon={CircleDollarSign}
          gradient="bg-gradient-to-br from-rose-500 to-rose-600"
          delay={240}
        />
      </div>

      {/* ===== Elasticity distribution chart ===== */}
      <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500"
          aria-hidden="true"
        />
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
                <Layers className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  Elasticity Distribution
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Product count across sensitivity ranges
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30"
            >
              <Package className="h-3 w-3" />
              {products.length} products
            </Badge>
          </div>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distribution}
                margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-700"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-slate-500 dark:text-slate-400"
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-slate-500 dark:text-slate-400"
                  width={32}
                />
                <RechartsTooltip
                  content={<DistributionTooltipContent />}
                  cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={72}>
                  {distribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Range legend */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {distribution.map((b) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: b.color }}
                  aria-hidden="true"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {b.label}{' '}
                  <span className="font-mono opacity-70">({b.range})</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ===== Filters bar ===== */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search by name, SKU, category, or brand…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                aria-label="Search products"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v)}
            >
              <SelectTrigger className="w-full md:w-[180px]" aria-label="Filter by category">
                <Filter className="h-4 w-4 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={elasticityFilter}
              onValueChange={(v) => setElasticityFilter(v as ElasticityFilter)}
            >
              <SelectTrigger className="w-full md:w-[160px]" aria-label="Filter by elasticity">
                <Gauge className="h-4 w-4 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Elasticity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="elastic">Elastic</SelectItem>
                <SelectItem value="inelastic">Inelastic</SelectItem>
                <SelectItem value="unit">Unit elastic</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
          {hasProducts && (
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Showing{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {filteredRows.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {products.length}
              </span>{' '}
              products
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Products table ===== */}
      <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 z-10"
          aria-hidden="true"
        />
        <CardContent className="p-0">
          {!hasProducts ? (
            <EmptyState />
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Search className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No products match your filters
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try adjusting your search or clearing filters.
              </p>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="mt-3 text-emerald-700 dark:text-emerald-400"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm">
                  <TableRow className="border-slate-200 dark:border-slate-700">
                    <TableHead className="min-w-[200px]">Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead>Elasticity</TableHead>
                    <TableHead className="min-w-[140px]">Demand Sensitivity</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead className="text-right">Revenue Impact</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ product, elasticity }, idx) => {
                    const margin = safeNumberValue(
                      product.calculatedMarginPercent,
                      0,
                    );
                    const rec = getPriceRecommendation(product, elasticity);
                    const impact = estimateRevenueImpact(product, elasticity);
                    const confidence = getConfidence(product);
                    return (
                      <TableRow
                        key={product.id}
                        className={cn(
                          'table-row-hover table-row-striped border-slate-100 dark:border-slate-800 transition-colors',
                          'animate-in fade-in slide-in-from-bottom-2 duration-300',
                        )}
                        style={{ animationDelay: `${Math.min(idx, 18) * 30}ms` }}
                      >
                        <TableCell className="py-3">
                          <button
                            type="button"
                            onClick={() => handleProductClick(product.id)}
                            className="group flex flex-col items-start text-left"
                            title={`Open ${product.name}`}
                          >
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                              {product.name || 'Unnamed product'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {product.sku || '—'}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {product.category || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span className="text-sm font-mono text-slate-800 dark:text-slate-100">
                            {formatCurrency(product.currentSellingPrice, currencyCode)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span
                            className={cn(
                              'text-xs font-mono',
                              margin >= 20
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : margin >= 5
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400',
                            )}
                          >
                            {formatPercentage(margin)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <ElasticityBadge e={elasticity} />
                        </TableCell>
                        <TableCell className="py-3">
                          <DemandBar e={elasticity} />
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px] h-5 px-1.5 font-medium border gap-0.5',
                              rec.tone === 'green' &&
                                'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                              rec.tone === 'amber' &&
                                'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                              rec.tone === 'rose' &&
                                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
                            )}
                          >
                            <rec.Icon className="h-3 w-3" />
                            {rec.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span
                            className={cn(
                              'text-sm font-mono tabular-nums',
                              impact > 0.5
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : impact < -0.5
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-slate-500 dark:text-slate-400',
                            )}
                          >
                            {impact > 0 ? '+' : ''}
                            {formatCurrency(impact, currencyCode)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px] h-5 px-1.5 font-medium border',
                              confidence.tone === 'green' &&
                                'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                              confidence.tone === 'amber' &&
                                'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                              confidence.tone === 'rose' &&
                                'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
                            )}
                          >
                            {confidence.level}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Scenario simulator ===== */}
      <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500"
          aria-hidden="true"
        />
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
                <Sliders className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  Scenario Simulator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Drag the slider to project how a price change affects revenue and profit
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30"
            >
              <Wand2 className="h-3 w-3" />
              What-if
            </Badge>
          </div>

          {!hasProducts || !simProduct || !projection ? (
            <div className="mt-6 flex flex-col items-center justify-center py-10 text-center">
              <Sparkles className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No products available for simulation
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Add products to your catalog to run elasticity scenarios.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left: controls */}
              <div className="lg:col-span-2 space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Product
                  </Label>
                  <Select
                    value={simProduct.id}
                    onValueChange={(v) => setSimProductId(v)}
                  >
                    <SelectTrigger className="w-full" aria-label="Select product to simulate">
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="truncate">
                            {p.name || 'Unnamed'} · {p.sku || '—'}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Price change
                    </Label>
                    <span
                      className={cn(
                        'text-sm font-mono font-semibold tabular-nums px-2 py-0.5 rounded-md',
                        priceDelta === 0
                          ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          : priceDelta > 0
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                      )}
                    >
                      {priceDelta > 0 ? '+' : ''}
                      {priceDelta}%
                    </span>
                  </div>
                  <Slider
                    value={[priceDelta]}
                    min={-30}
                    max={30}
                    step={1}
                    onValueChange={(vals) => setPriceDelta(vals[0] ?? 0)}
                    className="[&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-emerald-500 [&_[data-slot=slider-range]]:to-teal-500 [&_[data-slot=slider-thumb]]:border-emerald-500"
                    aria-label="Price change percentage"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    <span>-30%</span>
                    <button
                      type="button"
                      onClick={() => setPriceDelta(0)}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      reset
                    </button>
                    <span>+30%</span>
                  </div>
                </div>

                {/* Verdict */}
                {(() => {
                  const cfg = verdictConfig[projection.verdict];
                  return (
                    <div
                      className={cn(
                        'rounded-xl border p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300',
                        cfg.tone,
                      )}
                    >
                      <cfg.Icon className="h-5 w-5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{cfg.label}</div>
                        <div className="text-xs opacity-80 leading-snug">
                          {projection.verdict === 'recommended' &&
                            'Both revenue and profit improve under this scenario.'}
                          {projection.verdict === 'caution' &&
                            'Mixed signal — one of revenue or profit moves against you.'}
                          {projection.verdict === 'not-advised' &&
                            'Both revenue and profit decline under this scenario.'}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Right: comparison + chart */}
              <div className="lg:col-span-3 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Price */}
                  <ComparisonRow
                    label="Price"
                    currencyCode={currencyCode}
                    current={projection.currentPrice}
                    projected={projection.newPrice}
                    format="currency"
                  />
                  {/* Volume */}
                  <ComparisonRow
                    label="Volume / month"
                    currencyCode={currencyCode}
                    current={projection.currentVolume}
                    projected={projection.newVolume}
                    format="number"
                  />
                  {/* Revenue */}
                  <ComparisonRow
                    label="Revenue / month"
                    currencyCode={currencyCode}
                    current={projection.currentRevenue}
                    projected={projection.newRevenue}
                    format="currency"
                    highlight
                  />
                  {/* Margin */}
                  <ComparisonRow
                    label="Margin %"
                    currencyCode={currencyCode}
                    current={projection.currentMarginPct}
                    projected={projection.newMarginPct}
                    format="percent"
                  />
                </div>

                {/* Mini BarChart: current vs projected */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Current vs Projected
                    </span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                          aria-hidden="true"
                        />
                        Current
                      </span>
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-teal-500"
                          aria-hidden="true"
                        />
                        Projected
                      </span>
                    </div>
                  </div>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          {
                            label: 'Revenue',
                            current: projection.currentRevenue,
                            projected: projection.newRevenue,
                          },
                          {
                            label: 'Profit',
                            current: projection.currentProfit,
                            projected: projection.newProfit,
                          },
                        ]}
                        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                        barGap={4}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          className="text-slate-200 dark:text-slate-700"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          stroke="currentColor"
                          className="text-slate-500 dark:text-slate-400"
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          stroke="currentColor"
                          className="text-slate-500 dark:text-slate-400"
                          width={48}
                          tickFormatter={(v: number) =>
                            Math.abs(v) >= 1000
                              ? `${(v / 1000).toFixed(1)}k`
                              : String(v)
                          }
                        />
                        <RechartsTooltip
                          content={
                            <ScenarioTooltipContent currencyCode={currencyCode} />
                          }
                          cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                        />
                        <Bar
                          dataKey="current"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={48}
                        />
                        <Bar
                          dataKey="projected"
                          fill="#14b8a6"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={48}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Delta summary */}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <DeltaPill
                      label="Revenue Δ"
                      value={projection.revenueDelta}
                      currencyCode={currencyCode}
                    />
                    <DeltaPill
                      label="Profit Δ"
                      value={projection.profitDelta}
                      currencyCode={currencyCode}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Small presentational sub-components used inside the simulator
// ============================================================

function ComparisonRow({
  label,
  current,
  projected,
  format,
  currencyCode,
  highlight = false,
}: {
  label: string;
  current: number;
  projected: number;
  format: 'currency' | 'number' | 'percent';
  currencyCode: string;
  highlight?: boolean;
}) {
  const fmt = (v: number) => {
    if (format === 'currency') return formatCurrency(v, currencyCode);
    if (format === 'percent') return formatPercentage(v);
    return Math.round(v).toLocaleString();
  };
  const delta = projected - current;
  const deltaPct = current !== 0 ? (delta / Math.abs(current)) * 100 : 0;
  const isUp = delta > 0.01;
  const isDown = delta < -0.01;
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        highlight
          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40',
      )}
    >
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
        <span className="text-xs text-slate-500 dark:text-slate-400 line-through tabular-nums">
          {fmt(current)}
        </span>
        <ArrowRightTiny className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            highlight
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-800 dark:text-slate-100',
          )}
        >
          {fmt(projected)}
        </span>
      </div>
      <div
        className={cn(
          'mt-0.5 text-[11px] font-medium tabular-nums',
          isUp
            ? 'text-emerald-600 dark:text-emerald-400'
            : isDown
              ? 'text-red-600 dark:text-red-400'
              : 'text-slate-400 dark:text-slate-500',
        )}
      >
        {isUp ? '+' : ''}
        {format === 'percent'
          ? `${delta.toFixed(1)} pp`
          : formatCurrency(delta, currencyCode)}
        {current !== 0 && ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`}
      </div>
    </div>
  );
}

function DeltaPill({
  label,
  value,
  currencyCode,
}: {
  label: string;
  value: number;
  currencyCode: string;
}) {
  const isUp = value > 0.01;
  const isDown = value < -0.01;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2',
        isUp
          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
          : isDown
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40',
      )}
    >
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span
        className={cn(
          'flex items-center gap-1 text-sm font-mono font-semibold tabular-nums',
          isUp
            ? 'text-emerald-700 dark:text-emerald-400'
            : isDown
              ? 'text-red-700 dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {value >= 0 ? '+' : ''}
        {formatCurrency(value, currencyCode)}
      </span>
    </div>
  );
}

/** Inline right-arrow icon (avoids pulling another lucide icon). */
function ArrowRightTiny({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

/** Re-exported Minus icon used by DeltaPill when delta ≈ 0. */
function Minus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  );
}
