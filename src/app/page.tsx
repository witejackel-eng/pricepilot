'use client';

import { useEffect } from 'react';
import { usePricePilotStore, resetInitializationGuard } from '@/store/pricepilot-store';
import { OnboardingFlow } from '@/components/pricepilot/onboarding-flow';
import { AppShell } from '@/components/pricepilot/app-shell';
import { InitializationScreen } from '@/components/pricepilot/initialization-screen';
import { toast } from 'sonner';

export default function Home() {
  const {
    onboardingCompleted,
    initialization,
    initialize,
  } = usePricePilotStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Listen for E2E reset events. When Playwright's resetPricePilotState()
  // dispatches the 'pricepilot:reset-init' custom event, we reset the
  // initialization guard so the next page load can start fresh.
  useEffect(() => {
    const handleResetInit = () => {
      resetInitializationGuard();
    };
    window.addEventListener('pricepilot:reset-init', handleResetInit);
    return () => {
      window.removeEventListener('pricepilot:reset-init', handleResetInit);
    };
  }, []);

  // Phase 4: surface a toast when initialization succeeds (with or
  // without warnings) so the owner knows the workspace is ready.
  // This must run before any early return so the hook order is stable.
  useEffect(() => {
    if (initialization.status === 'ready-with-warnings' && initialization.message) {
      toast.warning('PricePilot opened successfully', {
        description: `${initialization.needsReviewCount} ${initialization.needsReviewCount === 1 ? 'product needs' : 'products need'} review because some saved values could not be understood.`,
        duration: 8000,
      });
    } else if (initialization.status === 'ready') {
      toast.success('PricePilot opened successfully', {
        duration: 2500,
      });
    }
  }, [initialization.status, initialization.message, initialization.needsReviewCount]);

  // Phase 4 (WebKit reliability): Independent safety net so the app
  // can NEVER remain indefinitely on the "Opening your workspace…"
  // loader. The store already has a 15s init-timeout guard, but on
  // some browsers (notably WebKit/iPhone Safari) a blocked IndexedDB
  // operation can prevent even that guard from surfacing. This
  // component-level timer is completely independent of the store's
  // promise machinery: if the app is still in `idle` or `loading`
  // after 25 seconds, we force the store to the `failed` state so
  // the owner sees the recovery screen (Retry / Download / Start
  // Empty) instead of a permanent spinner.
  //
  // 25s is chosen so it fires AFTER the store's 15s timeout (giving
  // the store first attempt) but BEFORE the 30s Playwright test
  // timeout, so tests see a clear `app-initialization-failed` marker
  // rather than an opaque timeout.
  useEffect(() => {
    if (initialization.status !== 'idle' && initialization.status !== 'loading') {
      return;
    }
    const SAFETY_NET_MS = 25_000;
    const timer = setTimeout(() => {
      const current = usePricePilotStore.getState().initialization;
      if (current.status === 'idle' || current.status === 'loading') {
        console.error(
          '[PricePilot] Initialization safety net: still loading after 25s. Forcing recovery screen.',
        );
        usePricePilotStore.setState({
          initialization: {
            status: 'failed',
            successfulCount: 0,
            needsReviewCount: 0,
            failedCount: 0,
            message: 'PricePilot could not open your saved workspace.\n\nYour browser data has not been deleted.',
            error: 'Initialization did not complete within 25 seconds. This usually means a blocked storage operation. Try refreshing the page.',
          },
        });
      }
    }, SAFETY_NET_MS);
    return () => clearTimeout(timer);
  }, [initialization.status]);

  // Never briefly render onboarding while initialization is still in
  // flight. The owner sees "Opening your PricePilot workspace…"
  // instead of a flash of the onboarding wizard.
  if (
    initialization.status === 'idle' ||
    initialization.status === 'loading'
  ) {
    return <div data-testid="app-initialization-loading"><InitializationScreen /></div>;
  }

  if (initialization.status === 'failed') {
    return <div data-testid="app-initialization-failed"><InitializationScreen /></div>;
  }

  if (!onboardingCompleted) {
    return <OnboardingFlow />;
  }

  return <div data-testid="app-initialization-ready"><AppShell /></div>;
}
