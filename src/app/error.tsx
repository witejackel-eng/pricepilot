'use client';

/**
 * PricePilot - Route-level Error Boundary
 *
 * Automatically invoked by Next.js App Router when any uncaught error
 * is thrown during rendering of the root route. We render the same
 * recovery UI as the in-app PricePilotErrorBoundary so the user
 * experience is consistent.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Home, RotateCcw, Download, AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log full details for developer debugging. This is hidden from
    // the business user.
    console.error('[PricePilot route error]', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    });
  }, [error]);

  const handleDownloadBackup = (): void => {
    // Best-effort — never throw into the error screen.
    import('@/store/pricepilot-store')
      .then(({ usePricePilotStore }) => {
        usePricePilotStore.getState().downloadBackup();
      })
      .catch((err) => {
        console.error('[PricePilot route error] Could not download backup.', err);
      });
  };

  const handleReturnHome = (): void => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-red-950 dark:via-slate-950 dark:to-red-950 px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-12 w-12 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20">
          <AlertTriangle className="h-6 w-6 text-white" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
            PricePilot could not complete this action.
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your existing catalogue has not been deleted.
          </p>
          {isDev && (
            <details className="text-left mt-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded p-2">
              <summary className="cursor-pointer font-medium">Developer details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{error.message}</pre>
              {error.stack && (
                <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] opacity-70">{error.stack}</pre>
              )}
            </details>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={handleReturnHome} className="bg-emerald-600 hover:bg-emerald-700">
            <Home className="h-4 w-4 mr-2" />
            Return Home
          </Button>
          <Button onClick={reset} variant="outline">
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button onClick={handleDownloadBackup} variant="ghost">
            <Download className="h-4 w-4 mr-2" />
            Download Backup
          </Button>
        </div>
      </div>
    </div>
  );
}
