'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

/**
 * Non-blocking tour invitation banner.
 * Shows after onboarding if the user hasn't completed or dismissed the tour.
 * Does NOT block any page interaction.
 */
export function TourInvitation() {
  const { appSettings, updateAppSettings, startGuidedTour } = usePricePilotStore();

  // Don't show if tour completed or dismissed
  if (appSettings.tourCompleted || appSettings.tourDismissed) return null;

  const handleStartTour = () => {
    startGuidedTour();
  };

  const handleDismiss = () => {
    updateAppSettings({ tourDismissed: true });
  };

  return (
    <div
      data-testid="tour-invitation"
      className="fixed bottom-4 right-4 z-40 max-w-xs animate-fade-in"
      role="complementary"
      aria-label="Guided tour invitation"
    >
      <Card className="shadow-lg border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                New to PricePilot?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Take a 2-minute guided tour.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              data-testid="start-tour-button"
              onClick={handleStartTour}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg text-xs"
            >
              Start Tour
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="dismiss-tour-button"
              onClick={handleDismiss}
              className="text-slate-500 hover:text-slate-700 text-xs"
            >
              Not Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Guided Tour modal dialog.
 * Only shown when the user explicitly starts the tour.
 * Uses proper dialog accessibility.
 */
export function GuidedTour() {
  const { appSettings, updateAppSettings, setCurrentView, guidedTourOpen, setGuidedTourOpen } = usePricePilotStore();
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startTourButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleClose = useCallback(() => {
    setGuidedTourOpen(false);
    updateAppSettings({ tourCompleted: true });
    setCurrentView('owner-home');
    // Restore focus
    setTimeout(() => {
      startTourButtonRef.current?.focus();
    }, 100);
  }, [setGuidedTourOpen, updateAppSettings, setCurrentView]);

  // Store the element that triggered the tour for focus restoration
  useEffect(() => {
    if (guidedTourOpen) {
      startTourButtonRef.current = document.activeElement as HTMLButtonElement;
    }
  }, [guidedTourOpen]);

  // Focus trap: focus the dialog when it opens
  useEffect(() => {
    if (guidedTourOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [guidedTourOpen]);

  // Close on Escape
  useEffect(() => {
    if (!guidedTourOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [guidedTourOpen, stepIndex, handleClose]);

  if (!guidedTourOpen) return null;

  const currentStep = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (isLastStep) {
      handleClose();
    } else {
      const nextIndex = stepIndex + 1;
      setStepIndex(nextIndex);
      setCurrentView(TOUR_STEPS[nextIndex].targetView);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      const prevIndex = stepIndex - 1;
      setStepIndex(prevIndex);
      setCurrentView(TOUR_STEPS[prevIndex].targetView);
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  return (
    <>
      {/* Backdrop — only shown when user explicitly opened the tour */}
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={handleSkip}
        aria-hidden="true"
      />

      {/* Tour dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="PricePilot Guided Tour"
        aria-describedby="guided-tour-description"
        data-testid="guided-tour-dialog"
        tabIndex={-1}
        className="fixed bottom-6 right-6 z-[61] max-w-sm animate-fade-in outline-none"
      >
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
            <p id="guided-tour-description" className="text-sm text-slate-600 leading-relaxed">{currentStep.description}</p>

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
  const { updateAppSettings, startGuidedTour } = usePricePilotStore();

  const handleRestart = () => {
    updateAppSettings({ tourCompleted: false, tourDismissed: false });
    startGuidedTour();
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
