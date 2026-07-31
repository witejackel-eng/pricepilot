'use client';

/**
 * PricePilotErrorBoundary
 *
 * A reusable React error boundary that catches any uncaught exception
 * thrown by its children and shows a friendly recovery screen.
 *
 * CRITICAL: this boundary NEVER exposes a raw stack trace to the
 * business user. In development, the error details are logged to the
 * console for debugging; in production, the user sees:
 *
 *   "PricePilot could not complete this action.
 *    Your existing catalogue has not been deleted."
 *
 * with three actions: Return Home, Try Again, Download Backup.
 */

import { Component, ReactNode, ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { Home, RotateCcw, Download, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional context label, e.g. "Product Drawer" or "Import Flow". */
  boundaryName?: string;
  /** Optional: productId being edited when the error occurred. */
  contextProductId?: string;
  /** Optional: import row that triggered the error. */
  contextImportRow?: Record<string, unknown>;
  /** Custom action — typically a function that closes the drawer/dialog. */
  onReturnHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class PricePilotErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for development debugging. This is intentionally
    // verbose — it includes the component stack, the boundary name,
    // the active product ID, and the import row (if relevant) so
    // engineers can reproduce the issue. Production builds hide this
    // from the user.
    console.error('[PricePilotErrorBoundary] Caught error:', {
      boundaryName: this.props.boundaryName ?? 'unnamed',
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      contextProductId: this.props.contextProductId,
      contextImportRow: this.props.contextImportRow,
    });
    this.setState({ errorInfo });
  }

  handleReturnHome = (): void => {
    // Reset the boundary first so children remount cleanly.
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReturnHome) {
      this.props.onReturnHome();
    } else {
      // Best-effort navigation — the global store typically handles
      // view switching, but as a fallback we reload the route.
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  };

  handleTryAgain = (): void => {
    // Simply reset the boundary; the children will re-render and
    // (hopefully) succeed on the next attempt.
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleDownloadBackup = (): void => {
    // Best-effort backup download. We import the store lazily to
    // avoid a circular dependency at module load time.
    import('@/store/pricepilot-store')
      .then(({ usePricePilotStore }) => {
        usePricePilotStore.getState().downloadBackup();
      })
      .catch((err) => {
        console.error('[PricePilotErrorBoundary] Could not download backup.', err);
      });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const error = this.state.error;
    const isDev = process.env.NODE_ENV === 'development';

    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-red-950 dark:via-slate-950 dark:to-red-950 px-6 py-8 rounded-lg border border-red-100 dark:border-red-900">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              PricePilot could not complete this action.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your existing catalogue has not been deleted.
            </p>
            {this.props.boundaryName && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Area: {this.props.boundaryName}
              </p>
            )}
            {isDev && error && (
              <details className="text-left mt-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded p-2">
                <summary className="cursor-pointer font-medium">Developer details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">{error.message}</pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] opacity-70">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={this.handleReturnHome} className="bg-emerald-600 hover:bg-emerald-700">
              <Home className="h-4 w-4 mr-2" />
              Return Home
            </Button>
            <Button onClick={this.handleTryAgain} variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={this.handleDownloadBackup} variant="ghost">
              <Download className="h-4 w-4 mr-2" />
              Download Backup
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
