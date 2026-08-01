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
    return <div data-testid="app-initialization-ready"><OnboardingFlow /></div>;
  }

  return <div data-testid="app-initialization-ready"><AppShell /></div>;
}
