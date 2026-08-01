'use client';

import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarginTrendBadgeProps {
  /** Current margin %. */
  current: number;
  /** Previous margin % (if available). */
  previous?: number | null;
  /** History of margin values (oldest first) for trend calculation. */
  history?: number[];
  /** Size variant. */
  size?: 'sm' | 'md' | 'lg';
  /** Show label text. */
  showLabel?: boolean;
  /** className override. */
  className?: string;
}

type Trend = 'up' | 'down' | 'flat' | 'unknown';

/**
 * A badge that shows margin trend with an arrow icon.
 * Green = improving, Red = declining, Gray = stable.
 */
export function MarginTrendBadge({
  current,
  previous,
  history,
  size = 'sm',
  showLabel = false,
  className,
}: MarginTrendBadgeProps) {
  const trend: Trend = (() => {
    // Prefer explicit previous value
    if (typeof previous === 'number' && !isNaN(previous)) {
      const diff = current - previous;
      if (Math.abs(diff) < 0.5) return 'flat';
      return diff > 0 ? 'up' : 'down';
    }
    // Fall back to history
    if (history && history.length >= 2) {
      const recent = history.slice(-3);
      if (recent.length < 2) return 'unknown';
      const first = recent[0];
      const last = recent[recent.length - 1];
      const diff = last - first;
      if (Math.abs(diff) < 0.5) return 'flat';
      return diff > 0 ? 'up' : 'down';
    }
    return 'unknown';
  })();

  const change = (() => {
    if (typeof previous === 'number' && !isNaN(previous)) {
      return current - previous;
    }
    if (history && history.length >= 2) {
      return history[history.length - 1] - history[0];
    }
    return null;
  })();

  const config = {
    up: {
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/50',
      border: 'border-emerald-200 dark:border-emerald-800',
      label: 'Improving',
    },
    down: {
      icon: TrendingDown,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/50',
      border: 'border-red-200 dark:border-red-800',
      label: 'Declining',
    },
    flat: {
      icon: Minus,
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-50 dark:bg-gray-900/50',
      border: 'border-gray-200 dark:border-gray-800',
      label: 'Stable',
    },
    unknown: {
      icon: ArrowRight,
      color: 'text-muted-foreground',
      bg: 'bg-muted/50',
      border: 'border-border',
      label: 'New',
    },
  }[trend];

  const Icon = config.icon;
  const sizeClasses = {
    sm: 'h-5 px-1.5 text-[10px] gap-0.5',
    md: 'h-6 px-2 text-xs gap-1',
    lg: 'h-7 px-2.5 text-sm gap-1',
  }[size];

  const iconSize = {
    sm: 10,
    md: 12,
    lg: 14,
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        config.color,
        config.bg,
        config.border,
        sizeClasses,
        className,
      )}
      title={change !== null ? `${change > 0 ? '+' : ''}${change.toFixed(1)}% margin` : config.label}
    >
      <Icon size={iconSize} className={trend === 'up' ? 'animate-pulse' : ''} />
      {showLabel && <span>{config.label}</span>}
      {change !== null && !showLabel && (
        <span className="tabular-nums">
          {change > 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      )}
    </span>
  );
}
