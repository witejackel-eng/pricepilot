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
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              Opening your PricePilot workspace…
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Loading your products and pricing rules.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Failure state
  if (initialization.status === 'failed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-red-950 dark:via-slate-950 dark:to-red-950 px-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              PricePilot could not open your saved workspace.
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line">
              Your browser data has not been deleted.
            </p>
            {initialization.error && (
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 rounded p-2 mt-3">
                {initialization.error}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={retryInitialize} className="bg-emerald-600 hover:bg-emerald-700">
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={downloadExistingData} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Existing Data
            </Button>
            <Button onClick={startEmptyWorkspace} variant="ghost">
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
