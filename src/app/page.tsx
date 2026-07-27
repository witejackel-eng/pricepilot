'use client';

import { useEffect } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { OnboardingFlow } from '@/components/pricepilot/onboarding-flow';
import { AppShell } from '@/components/pricepilot/app-shell';

export default function Home() {
  const { onboardingCompleted, initialize } = usePricePilotStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!onboardingCompleted) {
    return <OnboardingFlow />;
  }

  return <AppShell />;
}
