'use client';

import { useState, useEffect } from 'react';
import { usePricePilotStore, AppView } from '@/store/pricepilot-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Home, FileUp, ClipboardCheck, CheckCircle2, Download, X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  targetView: AppView;
  color: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Home',
    description: 'Start here whenever you open PricePilot. See your business health at a glance and choose what to do today.',
    icon: Home,
    targetView: 'owner-home',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    title: 'Import Your Price List',
    description: 'Upload the latest supplier Excel or CSV file. PricePilot will detect columns and guide you through mapping.',
    icon: FileUp,
    targetView: 'import',
    color: 'from-blue-500 to-blue-600',
  },
  {
    title: 'Review Products',
    description: 'PricePilot groups products that need your attention — missing costs, low margins, or loss-making prices.',
    icon: ClipboardCheck,
    targetView: 'review-prices',
    color: 'from-amber-500 to-amber-600',
  },
  {
    title: 'Approve Suggested Prices',
    description: 'Review the Recommended Selling Price for each product. Approving does not change your current price until you apply it.',
    icon: CheckCircle2,
    targetView: 'review-prices',
    color: 'from-teal-500 to-teal-600',
  },
  {
    title: 'Download Updated Excel',
    description: 'Export the approved prices to an Excel file. Use it in your business systems or share with your team.',
    icon: Download,
    targetView: 'export',
    color: 'from-slate-600 to-slate-700',
  },
];

export function GuidedTour() {
  const { appSettings, updateAppSettings, setCurrentView } = usePricePilotStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Show tour if onboarding completed, tour not yet completed, and not previously dismissed this session
  useEffect(() => {
    // Only auto-show on first load if tour hasn't been completed
    if (!appSettings.tourCompleted) {
      // Small delay to let the app settle
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [appSettings.tourCompleted]);

  if (!isVisible) return null;

  const currentStep = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (isLastStep) {
      handleFinish();
    } else {
      setStepIndex(stepIndex + 1);
      setCurrentView(TOUR_STEPS[stepIndex + 1].targetView);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      setCurrentView(TOUR_STEPS[stepIndex - 1].targetView);
    }
  };

  const handleSkip = () => {
    updateAppSettings({ tourCompleted: true });
    setIsVisible(false);
  };

  const handleFinish = () => {
    updateAppSettings({ tourCompleted: true });
    setIsVisible(false);
    // Return to home after tour
    setCurrentView('owner-home');
  };

  const handleRestart = () => {
    setStepIndex(0);
    setCurrentView(TOUR_STEPS[0].targetView);
    setIsVisible(true);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={handleSkip}
      />

      {/* Tour card */}
      <div className="fixed bottom-6 right-6 z-[61] max-w-sm animate-fade-in">
        <Card className="shadow-2xl border-0 rounded-2xl overflow-hidden bg-white">
          {/* Header with gradient */}
          <div className={`bg-gradient-to-r ${currentStep.color} p-4 text-white relative`}>
            <button
              onClick={handleSkip}
              className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-sm">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium text-white/80 uppercase tracking-wider">
                  Tour · Step {stepIndex + 1} of {TOUR_STEPS.length}
                </div>
                <div className="text-base font-bold">{currentStep.title}</div>
              </div>
            </div>
          </div>

          <CardContent className="p-4 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">{currentStep.description}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2">
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setStepIndex(i);
                    setCurrentView(TOUR_STEPS[i].targetView);
                  }}
                  className={`h-2 rounded-full transition-all ${
                    i === stepIndex ? 'w-8 bg-emerald-500' : 'w-2 bg-slate-300 hover:bg-slate-400'
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-slate-500 hover:text-slate-700 text-xs"
              >
                Skip Tour
              </Button>
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBack}
                    className="rounded-lg border-slate-200 text-xs"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" /> Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  className={`bg-gradient-to-r ${currentStep.color} text-white rounded-lg shadow-md text-xs`}
                >
                  {isLastStep ? (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" /> Finish Tour
                    </>
                  ) : (
                    <>
                      Next <ChevronRight className="h-3 w-3 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Restart hint (only on first step) */}
        {stepIndex === 0 && (
          <div className="mt-2 text-center text-xs text-slate-500">
            You can restart this tour anytime from Settings
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Button to manually restart the guided tour from Settings or Help Panel.
 */
export function RestartTourButton() {
  const { updateAppSettings, setCurrentView } = usePricePilotStore();

  const handleRestart = () => {
    updateAppSettings({ tourCompleted: false });
    setCurrentView('owner-home');
    // The GuidedTour component will auto-show when tourCompleted becomes false
    // Force a small delay then re-set to trigger the effect
    setTimeout(() => {
      updateAppSettings({ tourCompleted: false });
    }, 100);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRestart}
      className="rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50"
    >
      <Sparkles className="h-4 w-4 mr-1" /> Restart Tour
    </Button>
  );
}

export default GuidedTour;
