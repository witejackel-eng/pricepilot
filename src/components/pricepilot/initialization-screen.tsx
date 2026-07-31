'use client';

/**
 * PricePilot - Initialization Screen
 *
 * Shown while the store is loading data from storage and running the
 * initial recalculation. Also renders the recovery UI if storage
 * initialization fails entirely.
 *
 * The screen is intentionally simple — no charts, no animations, no
 * distractions. It exists to prevent the onboarding flicker bug and to
 * give the owner clear recovery options when storage fails.
 */

import { usePricePilotStore } from '@/store/pricepilot-store';
import { Button } from '@/components/ui/button';
import { Download, RotateCcw, FolderOpen, AlertTriangle, Loader2 } from 'lucide-react';

export function InitializationScreen() {
  const { initialization, retryInitialize, startEmptyWorkspace, downloadExistingData } = usePricePilotStore();

  // Loading state
  if (initialization.status === 'loading' || initialization.status === 'idle') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-emerald-950 dark:via-slate-950 dark:to-emerald-950 px-6">
        <div className="max-w-md w-full text-center space-y-8">
          {/* Brand mark */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-emerald-500/30">
                P
              </div>
              {/* Pulse ring around the brand mark */}
              <div className="absolute inset-0 h-16 w-16 rounded-2xl bg-emerald-400/20 animate-ping" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">PricePilot</h1>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Product Pricing & Profit Optimiser</p>
            </div>
          </div>

          {/* Loading indicator */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
              {/* Subtle pulse behind the spinner */}
              <div className="absolute inset-0 h-8 w-8 rounded-full bg-emerald-200/50 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Opening your workspace…
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Loading your products and pricing rules.
              </p>
            </div>
          </div>

          {/* Subtle decorative dots */}
          <div className="flex items-center justify-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // Failure state
  if (initialization.status === 'failed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-red-950 dark:via-slate-950 dark:to-red-950 px-6">
        <div className="max-w-md w-full text-center space-y-8">
          {/* Brand mark with error state */}
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-400 to-red-700 flex items-center justify-center text-white shadow-xl shadow-red-500/20">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">PricePilot</h1>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Could not open your saved workspace
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line">
              Your browser data has not been deleted.
            </p>
            {initialization.error && (
              <div className="text-xs text-slate-400 dark:text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 rounded-xl p-3 mt-3 text-left overflow-auto max-h-32">
                {initialization.error}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <Button onClick={retryInitialize} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-500/20 transition-all duration-200 hover:shadow-lg">
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={downloadExistingData} variant="outline" className="rounded-xl transition-all duration-200 hover:shadow-sm">
              <Download className="h-4 w-4 mr-2" />
              Download Existing Data
            </Button>
            <Button onClick={startEmptyWorkspace} variant="ghost" className="rounded-xl transition-colors duration-200">
              <FolderOpen className="h-4 w-4 mr-2" />
              Start Empty Workspace
            </Button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &ldquo;Start Empty Workspace&rdquo; does not delete your old data.
          </p>
        </div>
      </div>
    );
  }

  // Ready or ready-with-warnings — render a brief confirmation toast.
  // The actual app shell takes over from here.
  return null;
}
