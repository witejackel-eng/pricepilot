'use client';

import { useState, useCallback } from 'react';
import { usePricePilotStore, AutoBackup } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/pricepilot/formatting';
import { parseExcelFile, parseCSVFile, detectColumnMappings, cleanImportData, rebuildSheetFromHeadingRow, rebuildCSVFromHeadingRow } from '@/lib/pricepilot/excel';
import {
  Product,
  ColumnMapping,
  ImportStep,
  CleaningOptions,
  CleanImportResult,
  ImportedProductDraft,
  PercentFormat,
  DuplicateHandling,
  createDefaultProduct,
  createDefaultCleaningOptions,
} from '@/lib/pricepilot/types';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Eye,
  Columns3,
  Brush,
  CheckCircle,
  X,
  AlertCircle,
  Info,
  Download,
  History,
  RotateCcw,
  Save,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const CSV_TEMPLATE_HEADERS = [
  'Product Name',
  'SKU',
  'Category',
  'Brand',
  'Purchase Cost',
  'Shipping Cost',
  'Packaging Cost',
  'Handling Cost',
  'Other Costs',
  'Current Selling Price',
  'Return Rate (%)',
  'Damage Rate (%)',
  'Marketplace Fee (%)',
  'Payment Fee (%)',
  'Tax Rate (%)',
  'Description',
  'Quantity',
  'Monthly Units Sold',
];

const STEPS: ImportStep[] = ['upload', 'preview', 'mapping', 'cleaning', 'confirmation'];
const STEP_LABELS = ['Upload', 'Preview', 'Mapping', 'Cleaning', 'Confirm'];

const MAX_FILE_SIZE_MB = 20;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.tsv'];

const FIELD_OPTIONS = [
  { value: 'name', label: 'Product Name', required: true },
  { value: 'sku', label: 'SKU', required: true },
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
  { value: 'purchaseCost', label: 'Purchase Cost', required: true },
  { value: 'currentSellingPrice', label: 'Current Selling Price' },
  { value: 'shippingCost', label: 'Shipping Cost' },
  { value: 'packagingCost', label: 'Packaging Cost' },
  { value: 'handlingCost', label: 'Handling Cost' },
  { value: 'otherCosts', label: 'Other Costs' },
  { value: 'returnRatePercent', label: 'Return Rate (%)' },
  { value: 'damageRatePercent', label: 'Damage Rate (%)' },
  { value: 'marketplaceFeePercent', label: 'Marketplace Fee (%)' },
  { value: 'paymentFeePercent', label: 'Payment Fee (%)' },
  { value: 'taxRatePercent', label: 'Tax Rate (%)' },
  { value: 'description', label: 'Description' },
  { value: 'quantity', label: 'Quantity / Stock' },
  { value: 'monthlyUnitsSold', label: 'Monthly Units Sold' },
  { value: 'competitorPrices', label: 'Competitor Price' },
  { value: '__skip__', label: '-- Skip this column --' },
];

export function ImportFlow() {
  const { businessSettings, importProducts, setCurrentView, autoBackups, restoreBackup, createAutoBackup } = usePricePilotStore();
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  const [sheets, setSheets] = useState<Array<{ name: string; headers: string[]; rows: Record<string, string>[]; rawRows?: string[][] }>>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[] | null>(null); // original CSV lines — kept so we can re-parse with a different heading row
  const [isCsvFile, setIsCsvFile] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [cleaningResult, setCleaningResult] = useState<CleanImportResult | null>(null);
  const [previewProducts, setPreviewProducts] = useState<Partial<Product>[]>([]);
  const [error, setError] = useState('');
  const [headingRow, setHeadingRow] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    added: number;
    needingAttention: number;
    duplicates: number;
    skipped: number;
  } | null>(null);

  // Backup history UI state
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<AutoBackup | null>(null);

  // Cleaning options state
  const [cleaningOptions, setCleaningOptions] = useState<CleaningOptions>(createDefaultCleaningOptions());

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  /**
   * When the heading row changes, re-parse the file data using the new header row index.
   * Works for both CSV (using stored original lines) and Excel (using stored raw 2D rows).
   */
  const applyHeadingRow = useCallback((newHeadingRow: number) => {
    if (isCsvFile && csvRawRows) {
      const rebuilt = rebuildCSVFromHeadingRow(csvRawRows, newHeadingRow);
      if (rebuilt.headers.length === 0) {
        setError(`Row ${newHeadingRow} could not be parsed as headers. Pick a row between 0 and ${Math.max(0, csvRawRows.length - 1)}.`);
        return;
      }
      setFileData(rebuilt);
      setTotalRows(rebuilt.rows.length);
      setMappings(detectColumnMappings(rebuilt.headers));
      setError('');
    } else if (sheets.length > 0) {
      const sheet = sheets[selectedSheet];
      if (!sheet?.rawRows) return;
      const rebuilt = rebuildSheetFromHeadingRow(sheet.rawRows, newHeadingRow);
      if (rebuilt.headers.length === 0) {
        setError(`Row ${newHeadingRow} could not be parsed as headers. Pick a row between 0 and ${Math.max(0, sheet.rawRows.length - 1)}.`);
        return;
      }
      const updatedSheets = sheets.map((s, idx) =>
        idx === selectedSheet ? { ...s, headers: rebuilt.headers, rows: rebuilt.rows } : s
      );
      setSheets(updatedSheets);
      setFileData({ headers: rebuilt.headers, rows: rebuilt.rows });
      setTotalRows(rebuilt.rows.length);
      setMappings(detectColumnMappings(rebuilt.headers));
      setError('');
    }
  }, [isCsvFile, csvRawRows, sheets, selectedSheet]);

  /**
   * Format an ISO timestamp as "Oct 27, 2024 at 3:45 PM".
   */
  const formatBackupTimestamp = (iso: string): string => {
    try {
      const d = new Date(iso);
      const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${datePart} at ${timePart}`;
    } catch {
      return iso;
    }
  };

  /**
   * Resolve a Lucide icon component for a given backup trigger.
   */
  const getBackupTriggerIcon = (trigger: AutoBackup['trigger']) => {
    switch (trigger) {
      case 'import': return Upload;
      case 'reset': return RotateCcw;
      case 'bulk-action': return Layers;
      case 'manual': return Save;
      default: return Save;
    }
  };

  /**
   * Triggered when the user clicks "Restore" on a backup entry — opens the confirm dialog.
   */
  const handleRestoreClick = (backup: AutoBackup) => {
    setRestoreTarget(backup);
  };

  /**
   * Actually perform the restore after the user confirms in the AlertDialog.
   * Creates a fresh safety backup first, then restores from the selected snapshot.
   */
  const confirmRestore = async () => {
    if (!restoreTarget) return;
    // Create a safety backup of the CURRENT state so the user can undo the restore
    // (fire-and-forget; if it throws, restoreBackup will abort separately).
    createAutoBackup('manual', `Safety snapshot before restoring "${restoreTarget.description}"`)
      .catch((err) => console.warn('[PricePilot] Pre-restore backup failed.', err));
    // Phase 11: restoreBackup is now async.
    const success = await restoreBackup(restoreTarget.dataString);
    if (success) {
      toast.success('Backup restored', {
        description: `Restored snapshot from ${formatBackupTimestamp(restoreTarget.timestamp)}`,
      });
      setRestoreTarget(null);
      // Reset import flow state since the underlying data has changed
      setStep('upload');
      setFileName('');
      setFileData({ headers: [], rows: [] });
      setSheets([]);
      setCsvRawRows(null);
      setMappings([]);
      setCleaningResult(null);
      setPreviewProducts([]);
      setError('');
      setImportComplete(false);
      setImportSummary(null);
      setHeadingRow(0);
      setCurrentView('products');
    } else {
      toast.error('Restore failed', {
        description: 'The backup data could not be parsed. The snapshot may be corrupted.',
      });
      setRestoreTarget(null);
    }
  };

  /**
   * Download a single backup entry as a JSON file.
   */
  const downloadBackupEntry = (backup: AutoBackup) => {
    try {
      const blob = new Blob([backup.dataString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeTimestamp = backup.timestamp.slice(0, 19).replace(/[:T]/g, '-');
      link.download = `pricepilot-backup-${safeTimestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded', {
        description: `Snapshot from ${formatBackupTimestamp(backup.timestamp)}`,
      });
    } catch {
      toast.error('Download failed', { description: 'Could not generate the backup file.' });
    }
  };

  // Note: `skipDuplicateSku` is the legacy boolean that the cleaning-options
  // checkbox toggles directly. `duplicateHandling` is never modified by the UI
  // (only by import defaults), so no sync effect is required here.

  /**
   * Validate a file before parsing.
   * Checks: extension, size, and empty file.
   */
  const validateFile = useCallback((file: File): string | null => {
    // Check extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type "${ext}". Please use one of: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      return `File is too large (${sizeMB.toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
    }

    // Check empty file
    if (file.size === 0) {
      return 'The file is empty (0 bytes). Please select a file with data.';
    }

    return null;
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setError('');

    // Validate file first
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setFileName(file.name);

    try {
      // Reset heading row to 0 for every new file
      setHeadingRow(0);
      if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
        const text = await file.text();
        if (text.trim() === '') {
          setError('The CSV/TSV file appears to be empty — no data rows found.');
          return;
        }
        const result = parseCSVFile(text);
        if (result.headers.length === 0 || result.rows.length === 0) {
          setError('No data found in the file. Make sure it has a header row and at least one data row.');
          return;
        }
        const parsedHeaders = result.headers;
        setIsCsvFile(true);
        setCsvRawRows(result.rawRows);
        setSheets([{ name: 'Sheet1', headers: parsedHeaders, rows: result.rows }]);
        setFileData({ headers: parsedHeaders, rows: result.rows });
        setTotalRows(result.rows.length);
        // Auto-detect mappings using parsed headers (not stale state)
        setMappings(detectColumnMappings(parsedHeaders));
        setStep('preview');
      } else {
        const buffer = await file.arrayBuffer();
        const result = await parseExcelFile(buffer);
        if (result.sheets.length === 0) {
          setError('No data found in the Excel file. The file may be empty or all sheets are blank.');
          return;
        }
        setIsCsvFile(false);
        setCsvRawRows(null);
        setSheets(result.sheets);
        const firstSheet = result.sheets[0];
        const parsedHeaders = firstSheet.headers;
        setFileData({ headers: parsedHeaders, rows: firstSheet.rows });
        setTotalRows(firstSheet.rows.length);
        // Auto-detect mappings using parsed headers (not stale state)
        setMappings(detectColumnMappings(parsedHeaders));
        setStep('preview');
      }
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleSheetChange = (index: number) => {
    setSelectedSheet(index);
    const sheet = sheets[index];
    setFileData({ headers: sheet.headers, rows: sheet.rows });
    setTotalRows(sheet.rows.length);
    setMappings(detectColumnMappings(sheet.headers));
    // Reset heading row to 0 for the new sheet
    setHeadingRow(0);
  };

  const updateMapping = (sourceColumn: string, targetField: string) => {
    setMappings(prev => prev.map(m =>
      m.sourceColumn === sourceColumn ? { ...m, targetField, isManual: true } : m
    ));
  };

  const handleCleanAndConfirm = () => {
    const sheetName = sheets.length > 0 ? sheets[selectedSheet]?.name : undefined;
    const result = cleanImportData(
      fileData.rows,
      mappings,
      businessSettings,
      cleaningOptions,
      fileName,
      sheetName,
    );

    setCleaningResult(result);

    // Convert ImportedProductDraft[] to Partial<Product>[] for preview and import
    const products: Partial<Product>[] = result.cleanedProducts.map(draft => ({
      ...createDefaultProduct(),
      ...draft,
      competitorPrices: draft.competitorPrices ?? [],
      quantity: draft.quantity ?? 0,
      monthlyUnitsSold: draft.monthlyUnitsSold ?? 0,
      importBatchId: draft.importBatchId,
      importSourceFileName: draft.importSourceFileName,
      importOriginalRowNumber: draft.importOriginalRowNumber,
    }));

    setPreviewProducts(products);
    setStep('confirmation');
  };

  const handleImport = () => {
    const newProducts: Product[] = previewProducts.map((p, i) => ({
      ...createDefaultProduct(),
      ...p,
      id: `prod-import-${Date.now()}-${i}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })) as Product[];

    importProducts(newProducts);

    // Calculate import summary
    const needingAttention = newProducts.filter(p =>
      !p.purchaseCost || !p.currentSellingPrice ||
      p.calculatedPricingStatus === 'loss-making' ||
      p.calculatedPricingStatus === 'below-break-even' ||
      p.calculatedPricingStatus === 'missing-data' ||
      p.calculatedPricingStatus === 'needs-review'
    ).length;

    setImportSummary({
      added: newProducts.length,
      needingAttention,
      duplicates: stats?.duplicateRows ?? 0,
      skipped: stats?.skippedRows ?? 0,
    });
    setImportComplete(true);
  };

  const stats = cleaningResult?.statistics;

  const downloadTemplate = () => {
    const headerLine = CSV_TEMPLATE_HEADERS.join(',');
    const sampleRow = [
      'Example Product',
      'SKU-001',
      'Electronics',
      'Brand A',
      '100.00',
      '5.00',
      '2.00',
      '1.00',
      '0.50',
      '150.00',
      '2',
      '1',
      '5',
      '2.5',
      '18',
      'A sample product description',
      '50',
      '100',
    ].join(',');
    const csvContent = `${headerLine}\n${sampleRow}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'pricepilot-import-template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Template downloaded', { description: 'A CSV template with sample data has been downloaded' });
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Import completion summary */}
      {importComplete && importSummary && (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-emerald-600" /> Import Complete</CardTitle>
            <CardDescription>Your products have been imported successfully</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-200">
                <p className="text-lg font-semibold text-emerald-700">{importSummary.added}</p>
                <p className="text-xs text-emerald-600">Products imported</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                <p className="text-lg font-semibold text-amber-700">{importSummary.needingAttention}</p>
                <p className="text-xs text-amber-600">Need attention</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
                <p className="text-lg font-semibold text-slate-700">{importSummary.duplicates}</p>
                <p className="text-xs text-slate-600">
                  {cleaningOptions.duplicateHandling === 'skip' && 'Duplicates skipped'}
                  {cleaningOptions.duplicateHandling === 'overwrite' && 'Duplicates overwritten'}
                  {cleaningOptions.duplicateHandling === 'allow' && 'Duplicates allowed'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
                <p className="text-lg font-semibold text-slate-700">{importSummary.skipped}</p>
                <p className="text-xs text-slate-600">Rows skipped</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setCurrentView('review-prices')} className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md rounded-lg">
                Review Problems
              </Button>
              <Button variant="outline" onClick={() => setCurrentView('products')} className="rounded-lg shadow-sm">
                View All Products
              </Button>
              <Button variant="outline" onClick={() => {
                setImportComplete(false);
                setImportSummary(null);
                setStep('upload');
                setFileName('');
                setFileData({ headers: [], rows: [] });
                setSheets([]);
                setCsvRawRows(null);
                setIsCsvFile(false);
                setMappings([]);
                setCleaningResult(null);
                setPreviewProducts([]);
                setError('');
                setHeadingRow(0);
                setShowAllBackups(false);
                setCleaningOptions(createDefaultCleaningOptions());
              }} className="rounded-lg shadow-sm">
                Import Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!importComplete && (
      <>
      {/* Backup History panel — shown only on the upload step so it doesn't clutter later steps */}
      {step === 'upload' && (
        <Card className="shadow-md border-0 rounded-xl bg-gradient-to-b from-white to-emerald-50/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <History className="h-5 w-5" /> Backup History
            </CardTitle>
            <CardDescription className="text-slate-600">
              We automatically save a snapshot before every import. You can restore any snapshot below if something goes wrong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {autoBackups.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                <Save className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-700 font-medium">No backups yet.</p>
                <p className="text-xs text-slate-500 mt-1">
                  We&apos;ll create one automatically before your first import.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-72 overflow-y-auto pr-1 -mr-1 space-y-2">
                  {(showAllBackups ? autoBackups : autoBackups.slice(0, 5)).map(backup => {
                    const TriggerIcon = getBackupTriggerIcon(backup.trigger);
                    return (
                      <div
                        key={backup.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
                      >
                        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center">
                          <TriggerIcon className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {backup.description || `Backup (${backup.trigger})`}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatBackupTimestamp(backup.timestamp)}
                            <span className="ml-2 inline-flex items-center gap-1">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 capitalize">{backup.trigger}</Badge>
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestoreClick(backup)}
                            className="h-7 text-xs rounded-md"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" /> Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => downloadBackupEntry(backup)}
                            className="h-7 text-xs rounded-md"
                            aria-label={`Download backup from ${formatBackupTimestamp(backup.timestamp)}`}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {autoBackups.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllBackups(prev => !prev)}
                    className="w-full text-xs text-slate-600 hover:text-emerald-700 rounded-md"
                  >
                    {showAllBackups ? (
                      <>Show fewer backups <ChevronUp className="h-3 w-3 ml-1" /></>
                    ) : (
                      <>Show all {autoBackups.length} backups <ChevronDown className="h-3 w-3 ml-1" /></>
                    )}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Progress value={progress} className="h-2 rounded-full mb-2" />
      <div className="flex items-center justify-between text-sm font-medium text-slate-600 mb-4">
        <span>Step {stepIndex + 1} of {STEPS.length}: {STEP_LABELS[stepIndex]}</span>
        <Button variant="ghost" size="sm" onClick={() => setCurrentView('products')} className="rounded-lg">
          <X className="h-4 w-4 mr-1" /> Cancel Import
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload File</CardTitle>
            <CardDescription>Upload an Excel (.xlsx) or CSV file containing your product data</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="bg-gradient-to-b from-slate-50 to-white rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all p-12 text-center cursor-pointer"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <span className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="h-7 w-7 text-emerald-600" />
              </span>
              <p className="text-sm font-medium">Drag & drop your file here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx, .xls, .csv, .tsv — Max {MAX_FILE_SIZE_MB} MB
              </p>
              <input id="file-upload" type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileInput} />
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border-slate-200 hover:border-emerald-300">
                <Download className="h-4 w-4 mr-1.5" /> Download Import Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Data Preview</CardTitle>
            <CardDescription>Preview the first rows of your imported data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge>{fileName}</Badge>
                <span className="text-sm text-muted-foreground">{totalRows} rows</span>
                <span className="text-sm text-muted-foreground">{fileData.headers.length} columns</span>
              </div>
              {sheets.length > 1 && (
                <Select value={String(selectedSheet)} onValueChange={v => handleSheetChange(Number(v))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sheets.map((s, i) => <SelectItem key={i} value={String(i)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Header row selector with tooltip + live raw text preview */}
            <div className="bg-emerald-50/40 border border-emerald-200 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="heading-row" className="text-sm font-medium text-slate-700">
                  Header row:
                </Label>
                <Input
                  id="heading-row"
                  type="number"
                  min={0}
                  max={Math.min(10, Math.max(0, (isCsvFile
                    ? (csvRawRows?.length ?? 1) - 1
                    : (sheets[selectedSheet]?.rawRows?.length ?? 1) - 1)))}
                  value={headingRow}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) {
                      setHeadingRow(v);
                      applyHeadingRow(v);
                    }
                  }}
                  className="w-20 h-8 text-sm rounded-md"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-full text-slate-500 hover:text-emerald-700 hover:bg-emerald-100 transition-colors"
                      aria-label="Header row help"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-left leading-relaxed">
                    If your file has title rows above the headers, set this to skip them. Row 0 = first row is headers.
                  </TooltipContent>
                </Tooltip>
                <span className="text-xs text-slate-600">
                  Currently using row <span className="font-semibold text-emerald-700">#{headingRow}</span> as headers.
                </span>
              </div>

              {/* Live preview of the first 3 raw rows so the user can see what's at each row index */}
              <div className="bg-white border border-slate-200 rounded-md p-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 font-medium">
                  First 3 rows (raw)
                </p>
                <div className="space-y-1 font-mono text-[11px] text-slate-700">
                  {(() => {
                    const rawRowsToPreview: string[][] = isCsvFile && csvRawRows
                      ? csvRawRows.slice(0, 3).map(line => {
                          // Try to split using common delimiters for nicer display
                          const delimiters = [',', '\t', ';', '|'];
                          let best = delimiters[0];
                          let bestCount = 0;
                          for (const d of delimiters) {
                            const c = line.split(d).length;
                            if (c > bestCount) { bestCount = c; best = d; }
                          }
                          return line.split(best);
                        })
                      : (sheets[selectedSheet]?.rawRows ?? []).slice(0, 3);
                    if (rawRowsToPreview.length === 0) {
                      return <div className="text-slate-400 italic">No raw rows available</div>;
                    }
                    return rawRowsToPreview.map((row, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded text-[10px] font-semibold ${idx === headingRow ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {idx}
                        </span>
                        <span className="break-all leading-5">
                          {row.map((cell, ci) => (
                            <span key={ci}>
                              <span className={idx === headingRow ? 'text-emerald-700 font-semibold' : 'text-slate-700'}>{cell || <span className="text-slate-400 italic">empty</span>}</span>
                              {ci < row.length - 1 && <span className="text-slate-400"> | </span>}
                            </span>
                          ))}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            <Card className="shadow-md border-0 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fileData.headers.map(h => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileData.rows.slice(0, 15).map((row, i) => (
                      <TableRow key={i}>
                        {fileData.headers.map(h => <TableCell key={h} className="text-xs max-w-[120px] truncate">{String(row[h] || '')}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')} className="rounded-lg shadow-sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep('mapping')} className="rounded-lg shadow-md">Map Columns <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Mapping */}
      {step === 'mapping' && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Columns3 className="h-5 w-5" /> Column Mapping</CardTitle>
            <CardDescription>Map each column from your file to the corresponding product field</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fileData.headers.map(header => {
              const existing = mappings.find(m => m.sourceColumn === header);
              const currentTarget = existing?.targetField || '__skip__';
              const isRequired = FIELD_OPTIONS.find(f => f.value === currentTarget)?.required;

              return (
                <div key={header} className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{header}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      Sample: {String(fileData.rows[0]?.[header] || '—')}
                    </span>
                  </div>
                  <Select value={currentTarget} onValueChange={v => updateMapping(header, v)}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}{f.required ? ' *' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {isRequired && <Badge variant="secondary" className="text-xs">Required</Badge>}
                </div>
              );
            })}

            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setStep('preview')} className="rounded-lg shadow-sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep('cleaning')} className="rounded-lg shadow-md">Clean Data <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Cleaning */}
      {step === 'cleaning' && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Brush className="h-5 w-5" /> Data Cleaning</CardTitle>
            <CardDescription>Configure how to handle data issues before importing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex items-center space-x-2">
                <Checkbox
                  id="stripCurrency"
                  checked={cleaningOptions.stripCurrencySymbols}
                  onCheckedChange={(checked) => setCleaningOptions(prev => ({ ...prev, stripCurrencySymbols: checked === true }))}
                />
                <Label htmlFor="stripCurrency" className="text-sm">Strip currency symbols (₹, $, £, €, ¥)</Label>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex items-center space-x-2">
                <Checkbox
                  id="stripCommas"
                  checked={cleaningOptions.stripGroupingCommas}
                  onCheckedChange={(checked) => setCleaningOptions(prev => ({ ...prev, stripGroupingCommas: checked === true }))}
                />
                <Label htmlFor="stripCommas" className="text-sm">Remove grouping commas from numbers (1,00,000 → 100000)</Label>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex items-center space-x-2">
                <Checkbox
                  id="parsePercentages"
                  checked={cleaningOptions.parsePercentages}
                  onCheckedChange={(checked) => setCleaningOptions(prev => ({ ...prev, parsePercentages: checked === true }))}
                />
                <Label htmlFor="parsePercentages" className="text-sm">Parse percentage values (18, 18%, 0.18)</Label>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex items-center space-x-2">
                <Checkbox
                  id="skipBlanks"
                  checked={cleaningOptions.skipBlankRequired}
                  onCheckedChange={(checked) => setCleaningOptions(prev => ({ ...prev, skipBlankRequired: checked === true }))}
                />
                <Label htmlFor="skipBlanks" className="text-sm">Skip rows with blank required fields (name, SKU, cost)</Label>
              </div>
            </div>

            {/* Duplicate handling radio group */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-emerald-600" />
                <Label className="text-sm font-medium text-slate-800">Duplicate SKU Handling</Label>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                What should we do when a row&apos;s SKU already exists in this import batch or in your catalog?
              </p>
              <RadioGroup
                value={cleaningOptions.duplicateHandling}
                onValueChange={(value: DuplicateHandling) => setCleaningOptions(prev => ({ ...prev, duplicateHandling: value }))}
                className="gap-2"
              >
                <label htmlFor="dup-skip" className="flex items-start gap-3 p-2.5 rounded-md border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors cursor-pointer">
                  <RadioGroupItem value="skip" id="dup-skip" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-slate-800">Skip duplicates <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded ml-1">Default</span></div>
                    <div className="text-xs text-slate-600">Products with a matching SKU are skipped and counted in the import summary.</div>
                  </div>
                </label>
                <label htmlFor="dup-overwrite" className="flex items-start gap-3 p-2.5 rounded-md border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors cursor-pointer">
                  <RadioGroupItem value="overwrite" id="dup-overwrite" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-slate-800">Overwrite existing</div>
                    <div className="text-xs text-slate-600">Replace the existing product with the same SKU using the new row&apos;s values.</div>
                  </div>
                </label>
                <label htmlFor="dup-allow" className="flex items-start gap-3 p-2.5 rounded-md border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors cursor-pointer">
                  <RadioGroupItem value="allow" id="dup-allow" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-slate-800">Allow duplicates</div>
                    <div className="text-xs text-slate-600">Import every row, even if the SKU matches — useful for restocks or variant imports.</div>
                  </div>
                </label>
              </RadioGroup>
              <Alert className="mt-3 border-emerald-200 bg-emerald-50/50">
                <Info className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-emerald-800 text-xs font-medium">How this works</AlertTitle>
                <AlertDescription className="text-xs text-slate-700">
                  {cleaningOptions.duplicateHandling === 'skip' && (
                    <>Duplicate rows are removed from the import. You&apos;ll see the count under &ldquo;Duplicate SKUs&rdquo; in the confirmation summary.</>
                  )}
                  {cleaningOptions.duplicateHandling === 'overwrite' && (
                    <>Each duplicate row replaces the earlier row with the same SKU in this batch. Existing catalog products with matching SKU will also be replaced on import.</>
                  )}
                  {cleaningOptions.duplicateHandling === 'allow' && (
                    <>All rows are imported as separate products. You may end up with multiple products sharing the same SKU — make sure that&apos;s what you want.</>
                  )}
                </AlertDescription>
              </Alert>
            </div>

            {/* Percentage format selector */}
            {cleaningOptions.parsePercentages && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-slate-500" />
                  <Label className="text-sm font-medium">Percentage Format Interpretation</Label>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  How should percentage values in your spreadsheet be interpreted?
                </p>
                <Select
                  value={cleaningOptions.percentFormat}
                  onValueChange={(value: PercentFormat) => setCleaningOptions(prev => ({ ...prev, percentFormat: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Detect automatically (based on column values)</SelectItem>
                    <SelectItem value="whole-percentages">Whole percentages (18 means 18%)</SelectItem>
                    <SelectItem value="decimal-fractions">Decimal fractions (0.18 means 18%)</SelectItem>
                  </SelectContent>
                </Select>
                {cleaningOptions.percentFormat === 'auto' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Auto mode: if the maximum value in a percentage column is &lt; 1, values are treated as decimal fractions (0.18 = 18%). Otherwise they're whole percentages (18 = 18%).
                  </p>
                )}
                {cleaningOptions.percentFormat === 'whole-percentages' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Values like 18, 5, 2.5 are treated as percentages directly (18% = 18).
                  </p>
                )}
                {cleaningOptions.percentFormat === 'decimal-fractions' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Values like 0.18, 0.05, 0.025 are decimal fractions (0.18 = 18%).
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')} className="rounded-lg shadow-sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={handleCleanAndConfirm} className="rounded-lg shadow-md">Process Data <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Confirmation */}
      {step === 'confirmation' && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5" /> Import Confirmation</CardTitle>
            <CardDescription>Review the summary before importing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="shadow-sm rounded-lg p-4 bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-600 font-medium">Valid Products</div>
                <div className="text-lg font-bold text-emerald-700">{stats?.validRows ?? previewProducts.length}</div>
              </div>
              <div className="shadow-sm rounded-lg p-4 bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-600 font-medium">Skipped Rows</div>
                <div className="text-lg font-bold text-amber-700">{stats?.skippedRows ?? 0}</div>
              </div>
              <div className="shadow-sm rounded-lg p-4 bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-600 font-medium">Duplicate SKUs</div>
                <div className="text-lg font-bold text-amber-700">{stats?.duplicateRows ?? 0}</div>
              </div>
              <div className="shadow-sm rounded-lg p-4 bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">Total Rows</div>
                <div className="text-lg font-bold text-slate-700">{stats?.totalRows ?? totalRows}</div>
              </div>
            </div>

            {/* Detailed statistics */}
            {stats && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-600 mb-2">Detailed Statistics</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-slate-500">Missing purchase cost:</div>
                  <div className="text-slate-700 font-medium">{stats.missingCostRows}</div>
                  <div className="text-slate-500">Missing selling price:</div>
                  <div className="text-slate-700 font-medium">{stats.missingPriceRows}</div>
                  <div className="text-slate-500">Invalid percentage values:</div>
                  <div className="text-slate-700 font-medium">{stats.invalidPercentRows}</div>
                  <div className="text-slate-500">Invalid rows:</div>
                  <div className="text-slate-700 font-medium">{stats.invalidRows}</div>
                </div>
              </div>
            )}

            {/* Show skipped/duplicate details */}
            {cleaningResult && cleaningResult.skippedRows.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 max-h-48 overflow-y-auto">
                <div className="text-xs font-medium text-amber-600 mb-1">Skipped Rows Details</div>
                {cleaningResult.skippedRows.slice(0, 10).map((issue, idx) => (
                  <div key={idx} className="text-xs text-amber-700">
                    Row {issue.originalRowNumber}: {issue.reason}
                  </div>
                ))}
                {cleaningResult.skippedRows.length > 10 && (
                  <div className="text-xs text-amber-500">
                    ... and {cleaningResult.skippedRows.length - 10} more skipped rows
                  </div>
                )}
              </div>
            )}

            {cleaningResult && cleaningResult.duplicateRows.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 max-h-48 overflow-y-auto">
                <div className="text-xs font-medium text-amber-600 mb-1">Duplicate SKU Details</div>
                {cleaningResult.duplicateRows.slice(0, 10).map((issue, idx) => (
                  <div key={idx} className="text-xs text-amber-700">
                    Row {issue.originalRowNumber}: {issue.reason}
                  </div>
                ))}
                {cleaningResult.duplicateRows.length > 10 && (
                  <div className="text-xs text-amber-500">
                    ... and {cleaningResult.duplicateRows.length - 10} more duplicate rows
                  </div>
                )}
              </div>
            )}

            {previewProducts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Estimated total inventory cost:</h3>
                <p className="text-lg font-semibold">
                  {formatCurrency(
                    previewProducts.reduce((sum, p) => sum + (p.purchaseCost || 0), 0),
                    businessSettings.currencyCode
                  )}
                </p>
              </div>
            )}

            <Separator />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('cleaning')} className="rounded-lg shadow-sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={handleImport} disabled={previewProducts.length === 0} className="rounded-lg shadow-md">
                Import {previewProducts.length} Products
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}

      {/* Restore confirmation dialog */}
      <AlertDialog open={restoreTarget !== null} onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Restore this backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  You are about to restore the snapshot from{' '}
                  <span className="font-medium text-slate-900">
                    {restoreTarget ? formatBackupTimestamp(restoreTarget.timestamp) : ''}
                  </span>
                  .
                </p>
                {restoreTarget?.description && (
                  <p className="text-slate-600">
                    &ldquo;{restoreTarget.description}&rdquo;
                  </p>
                )}
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  Your current state (products, pricing rules, scenarios, settings) will be replaced.
                  Don&apos;t worry — we&apos;ll create a fresh safety snapshot first so you can undo this restore.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Restore backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ImportFlow;
