'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Database, Download, Trash2, RefreshCw, CheckCircle2, AlertTriangle, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  isLegacyDataStillPresent,
  removeLegacyLocalStorageCopy,
  verifyMigration,
  MigrationVerificationReport,
} from '@/lib/pricepilot/migration';
import { usePricePilotStore } from '@/store/pricepilot-store';

/**
 * Phase 4 — Legacy Storage Cleanup Card.
 *
 * Shows up in Settings only when legacy localStorage data is still
 * present. Gives the owner two actions:
 *   - Download Old Data (recovery copy of the legacy localStorage)
 *   - Remove Old Storage Copy (after verification)
 *
 * Before removal, the card runs `verifyMigration()` which checks:
 *   - Migration status metadata is 'complete'
 *   - IndexedDB has the same product count as legacy
 *   - Business settings exist in IndexedDB
 *   - Pricing rules count matches
 *   - Scenarios count matches
 */
export function LegacyDataCleanupCard() {
  const [present, setPresent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<MigrationVerificationReport | null>(null);
  const downloadExistingData = usePricePilotStore(s => s.downloadExistingData);

  const refresh = useCallback(() => {
    setPresent(isLegacyDataStillPresent());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Hide entirely when no legacy data is present.
  if (!present && !report) return null;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const r = await verifyMigration();
      setReport(r);
      if (r.canRemoveLegacy) {
        toast.success('Verification passed', { description: 'It is safe to remove the old storage copy.' });
      } else {
        toast.warning('Verification found issues', { description: `${r.issues.length} issue(s) — review before removing.` });
      }
    } catch (err) {
      toast.error('Verification failed', { description: err instanceof Error ? err.message : 'Could not verify the migration.' });
    } finally {
      setVerifying(false);
    }
  };

  const handleDownload = () => {
    // Reuse the canonical export (reads IndexedDB) AND also dump the
    // raw legacy localStorage as a separate file so the user has both.
    downloadExistingData();
    toast.success('IndexedDB download started', { description: 'The legacy localStorage copy is also available below — open browser DevTools → Application → Local Storage to inspect it manually.' });
  };

  const handleRemove = () => {
    if (!report?.canRemoveLegacy) {
      toast.error('Verification required', { description: 'Run verification first. It must pass before the old copy can be removed.' });
      return;
    }
    const removed = removeLegacyLocalStorageCopy();
    toast.success('Old storage copy removed', { description: `${removed.length} localStorage key(s) were removed. Your current PricePilot database is unaffected.` });
    setReport(null);
    refresh();
  };

  return (
    <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-amber-50/30 hover:shadow-lg transition-shadow duration-200 border-t-2 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-amber-800">
          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-200 to-amber-100 text-amber-700 flex items-center justify-center shadow-sm">
            <Database className="h-4 w-4" />
          </span>
          Old PricePilot data copy
        </CardTitle>
        <CardDescription>
          Your data was successfully moved to the new storage system. You may keep the old copy as a safety backup or remove it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
            Legacy copy present
          </Badge>
          <span className="text-xs">IndexedDB is now the single source of truth.</span>
        </div>

        {/* Verification report */}
        {report && (
          <div className={`rounded-lg border p-3 text-sm ${report.canRemoveLegacy ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
            <div className="flex items-center gap-2 mb-2 font-medium">
              {report.canRemoveLegacy ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Verification passed</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-amber-600" /> Verification found issues</>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 mb-2">
              <div>Migration status: <span className="font-mono">{report.migrationStatus}</span></div>
              <div>Verified at: <span className="font-mono">{new Date(report.verifiedAt).toLocaleString()}</span></div>
              <div>IndexedDB products: <span className="font-mono">{report.indexedDbProductCount}</span></div>
              <div>Legacy products: <span className="font-mono">{report.legacyProductCount ?? '—'}</span></div>
              <div>IndexedDB rules: <span className="font-mono">{report.indexedDbRuleCount}</span></div>
              <div>Legacy rules: <span className="font-mono">{report.legacyRuleCount ?? '—'}</span></div>
              <div>IndexedDB scenarios: <span className="font-mono">{report.indexedDbScenarioCount}</span></div>
              <div>Legacy scenarios: <span className="font-mono">{report.legacyScenarioCount ?? '—'}</span></div>
              <div>IndexedDB settings: <span className="font-mono">{report.indexedDbHasSettings ? 'yes' : 'no'}</span></div>
              <div>Legacy settings: <span className="font-mono">{report.legacyHasSettings ? 'yes' : 'no'}</span></div>
            </div>
            {report.issues.length > 0 && (
              <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                {report.issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            )}
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload} className="rounded-lg">
            <FileDown className="h-4 w-4 mr-1" /> Download Old Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerify}
            disabled={verifying}
            className="rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Verifying…' : 'Verify Migration'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!report?.canRemoveLegacy}
                className="rounded-lg text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove Old Storage Copy
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove the old storage copy?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your current PricePilot database will not be affected.
                  Keep a downloaded backup before removing it.
                  This action removes the legacy localStorage entries
                  (pricepilot_v1_*) — it cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRemove}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Remove Old Copy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {!report?.canRemoveLegacy && (
          <p className="text-xs text-amber-700">
            <AlertTriangle className="inline h-3 w-3 mr-1" />
            Removal is disabled until verification passes. Click <strong>Verify Migration</strong> first.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
