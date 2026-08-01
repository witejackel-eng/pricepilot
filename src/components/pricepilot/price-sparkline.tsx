'use client';

import { useMemo } from 'react';

interface PriceSparklineProps {
  /** Price data points (oldest first). */
  data: number[];
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** Stroke width. */
  strokeWidth?: number;
  /** Custom color (defaults to emerald-500). */
  color?: string;
  /** Fill area under the line (default true). */
  fill?: boolean;
  /** Show the last point as a dot. */
  showLastDot?: boolean;
  /** className for the container. */
  className?: string;
}

/**
 * A lightweight SVG sparkline for showing price trends.
 * Renders a smooth line chart with optional gradient fill.
 * Used in the products table to show price history at a glance.
 */
export function PriceSparkline({
  data,
  width = 80,
  height = 28,
  strokeWidth = 1.5,
  color,
  fill = true,
  showLastDot = true,
  className,
}: PriceSparklineProps) {
  const { pathD, areaD, lastDot, isUp, strokeColor, gradientId } = useMemo(() => {
    if (!data || data.length < 2) {
      return { pathD: '', areaD: '', lastDot: null, isUp: true, strokeColor: '#10b981', gradientId: '' };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = strokeWidth + 1;
    const usableHeight = height - padding * 2;
    const usableWidth = width - padding * 2;

    const points = data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * usableWidth;
      const y = padding + usableHeight - ((value - min) / range) * usableHeight;
      return { x, y };
    });

    // Build smooth path using simple line segments (sparklines don't need curves)
    const pathD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    // Build area path
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(2)} ${height - padding} L ${points[0].x.toFixed(2)} ${height - padding} Z`;

    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    const isUp = data[data.length - 1] >= data[0];

    // Color based on trend
    const strokeColor = color || (isUp ? '#10b981' : '#ef4444');
    const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 9)}`;

    return {
      pathD,
      areaD,
      lastDot: lastPoint,
      isUp,
      strokeColor,
      gradientId,
    };
  }, [data, width, height, strokeWidth, color]);

  if (!data || data.length < 2) {
    return (
      <div
        className={`inline-flex items-center justify-center text-[10px] text-muted-foreground ${className || ''}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Price trend: ${isUp ? 'increasing' : 'decreasing'}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {fill && <path d={areaD} fill={`url(#${gradientId})`} />}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLastDot && lastDot && (
        <circle
          cx={lastDot.x}
          cy={lastDot.y}
          r={strokeWidth + 0.5}
          fill={strokeColor}
          stroke="white"
          strokeWidth="0.5"
        />
      )}
    </svg>
  );
}
