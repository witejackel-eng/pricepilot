/**
 * PricePilot - Application Initialization State
 *
 * Provides an explicit lifecycle for app startup so the UI never shows
 * onboarding prematurely (which causes the "flicker" bug) and never
 * blanks the screen when storage fails.
 *
 * States:
 *   idle              — before initialize() has been called
 *   loading           — initialize() is running
 *   ready             — initialization succeeded with no warnings
 *   ready-with-warnings — initialization succeeded but some products
 *                          were kept as needs-review
 *   failed            — storage threw and could not be recovered
 */

export type AppInitializationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'ready-with-warnings'
  | 'failed';

export interface AppInitializationSummary {
  status: AppInitializationStatus;
  /** Number of products that loaded successfully. */
  successfulCount: number;
  /** Number of products kept as needs-review placeholders. */
  needsReviewCount: number;
  /** Number of products that hard-failed and could not be kept. */
  failedCount: number;
  /** Human-readable summary message shown to the owner. */
  message: string;
  /** Raw error message if status === 'failed'. */
  error?: string;
}

export function makeIdleSummary(): AppInitializationSummary {
  return {
    status: 'idle',
    successfulCount: 0,
    needsReviewCount: 0,
    failedCount: 0,
    message: '',
  };
}

export function makeLoadingSummary(): AppInitializationSummary {
  return {
    status: 'loading',
    successfulCount: 0,
    needsReviewCount: 0,
    failedCount: 0,
    message: 'Opening your PricePilot workspace…',
  };
}

export function makeReadySummary(
  successfulCount: number,
  needsReviewCount: number
): AppInitializationSummary {
  if (needsReviewCount === 0) {
    return {
      status: 'ready',
      successfulCount,
      needsReviewCount,
      failedCount: 0,
      message: 'PricePilot opened successfully.',
    };
  }
  return {
    status: 'ready-with-warnings',
    successfulCount,
    needsReviewCount,
    failedCount: 0,
    message: `PricePilot opened successfully.\n\n${needsReviewCount} ${needsReviewCount === 1 ? 'product needs' : 'products need'} review because some saved values could not be understood.`,
  };
}

export function makeFailedSummary(error: unknown): AppInitializationSummary {
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'Unknown error';
  return {
    status: 'failed',
    successfulCount: 0,
    needsReviewCount: 0,
    failedCount: 0,
    message: 'PricePilot could not open your saved workspace.\n\nYour browser data has not been deleted.',
    error: errorMessage,
  };
}
