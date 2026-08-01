'use client';

import { useMemo } from 'react';
import { PriceHistoryRecord } from '@/lib/pricepilot/database';

/**
 * Hook to load price history for a specific product.
 * Returns the history sorted oldest-first (for sparkline rendering)
 * and a derived array of price values for the sparkline.
 *
 * This hook derives its data purely from the `allHistory` array passed
 * in (typically the store's `priceHistory` slice) using useMemo — no
 * effect or setState, so it never triggers cascading renders.
 */
export function usePriceHistoryForProduct(
  productId: string | null,
  allHistory: PriceHistoryRecord[],
): {
  history: PriceHistoryRecord[];
  pricePoints: number[];
  marginPoints: number[];
  previousPrice: number | null;
  previousMargin: number | null;
} {
  const history = useMemo(() => {
    if (!productId) return [];
    // Filter and sort oldest-first (reverse of the store's desc order).
    return allHistory
      .filter(h => h.productId === productId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [productId, allHistory]);

  // Derive price points: include the current selling price as the last
  // point so the sparkline always shows the full trajectory.
  const pricePoints = useMemo(
    () => history
      .filter(h => h.newPrice !== null && h.newPrice !== undefined)
      .map(h => h.newPrice as number),
    [history],
  );

  const marginPoints = useMemo(
    () => history
      .filter(h => h.newMargin !== null && h.newMargin !== undefined)
      .map(h => h.newMargin as number),
    [history],
  );

  // The previous price/margin is the value before the most recent change.
  const previousPrice =
    history.length >= 2 ? history[history.length - 2].newPrice : null;
  const previousMargin =
    history.length >= 2 ? history[history.length - 2].newMargin : null;

  return { history, pricePoints, marginPoints, previousPrice, previousMargin };
}
