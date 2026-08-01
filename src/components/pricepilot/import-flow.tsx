'use client';

import { useState, useCallback, useMemo } from 'react';
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
import { parseExcelFile, parseCSVFile, detectColumnMappings, rebuildSheetFromHeadingRow, rebuildCSVFromHeadingRow } from '@/lib/pricepilot/excel';
import {
  Product,
  ColumnMapping,
  ImportStep,
  ImportCommitResult,
  createDefaultProduct,
} from '@/lib/pricepilot/types';
import {
  processImportRows,
  downloadIssueReport,
  ImportBatchResult,
  ImportRowResult,
} from '@/lib/pricepilot/import-service';
import {
  computeDuplicateDiff,
  reconcileDuplicate,
  reconcileDuplicates,
  DuplicateResolutionStrategy,
  DuplicateDiff,
  DuplicateReconciliationInput,
  DuplicateReconciliationResult,
} from '@/lib/pricepilot/duplicate-reconciliation';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Eye,
  Columns3,
  ClipboardCheck,
  GitMerge,
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
  AlertTriangle,
  FileX,
  Copy,
  SkipForward,
  RefreshCw,
  CheckSquare,
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

const STEPS: ImportStep[] = ['upload', 'preview', 'mapping', 'row-review', 'duplicate-resolution', 'confirmation'];
const STEP_LABELS = ['Upload', 'Preview', 'Mapping', 'Row Review', 'Duplicates', 'Confirm'];

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

const STRATEGY_OPTIONS: { value: DuplicateResolutionStrategy; label: string; description: string; icon: typeof RefreshCw }[] = [
  { value: 'update-existing', label: 'Update Existing Product', description: 'Replace financial inputs on the existing product with the uploaded values.', icon: RefreshCw },
  { value: 'fill-missing', label: 'Fill Only Missing Fields', description: 'Only fill fields that are currently empty or zero on the existing product.', icon: CheckSquare },
  { value: 'keep-existing', label: 'Keep Existing Product', description: 'Skip this row entirely — no changes made to the existing product.', icon: SkipForward },
  { value: 'create-copy', label: 'Create Separate Copy', description: 'Create a new product with a new SKU suffix (e.g. SKU-COPY).', icon: Copy },
  { value: 'skip', label: 'Skip This Row', description: 'Skip this row. Same as "Keep Existing" but tracked separately.', icon: FileX },
];

export function ImportFlow() {
  const {
    businessSettings,
    pricingRules,
    products,
    importProductsWithBatch,
    setCurrentView,
    autoBackups,
    restoreBackup,
    createAutoBackup,
  } = usePricePilotStore();

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  const [sheets, setSheets] = useState<Array<{ name: string; headers: string[]; rows: Record<string, string>[]; rawRows?: string[][] }>>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[] | null>(null);
  const [isCsvFile, setIsCsvFile] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState('');
  const [headingRow, setHeadingRow] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportCommitResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Row Review step state
  const [batchResult, setBatchResult] = useState<ImportBatchResult | null>(null);

  // Duplicate Resolution step state
  const [duplicateStrategies, setDuplicateStrategies] = useState<Map<number, DuplicateResolutionStrategy>>(new Map());
  const [applyToAll, setApplyToAll] = useState(false);
  const [applyToAllStrategy, setApplyToAllStrategy] = useState<DuplicateResolutionStrategy>('update-existing');
  const [duplicateDiffs, setDuplicateDiffs] = useState<Map<number, DuplicateDiff[]>>(new Map());
  const [reconciliationResults, setReconciliationResults] = useState<DuplicateReconciliationResult[]>([]);

  // Backup history UI state
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<AutoBackup | null>(null);

  // Expanded duplicate rows
  const [expandedDuplicates, setExpandedDuplicates] = useState<Set<number>>(new Set());

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  // Existing SKUs for duplicate detection
  const existingSkus = useMemo(() => {
    const skus = new Set<string>();
    for (const p of products) {
      if (p.sku?.trim()) {
        skus.add(p.sku.trim().toLowerCase());
      }
    }
    return skus;
  }, [products]);

  // Existing product lookup by SKU (lowercased)
  const existingProductBySku = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      if (p.sku?.trim()) {
        map.set(p.sku.trim().toLowerCase(), p);
      }
    }
    return map;
  }, [products]);

  /**
   * When the heading row changes, re-parse the file data using the new header row index.
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

  const getBackupTriggerIcon = (trigger: AutoBackup['trigger']) => {
    switch (trigger) {
      case 'import': return Upload;
      case 'reset': return RotateCcw;
      case 'bulk-action': return Layers;
      case 'manual': return Save;
      default: return Save;
    }
  };

  const handleRestoreClick = (backup: AutoBackup) => {
    setRestoreTarget(backup);
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    createAutoBackup('manual', `Safety snapshot before restoring "${restoreTarget.description}"`)
      .catch((err) => console.warn('[PricePilot] Pre-restore backup failed.', err));
    const success = await restoreBackup(restoreTarget.dataString);
    if (success) {
      toast.success('Backup restored', {
        description: `Restored snapshot from ${formatBackupTimestamp(restoreTarget.timestamp)}`,
      });
      setRestoreTarget(null);
      resetImportFlow();
      setCurrentView('products');
    } else {
      toast.error('Restore failed', {
        description: 'The backup data could not be parsed. The snapshot may be corrupted.',
      });
      setRestoreTarget(null);
    }
  };

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

  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type "${ext}". Please use one of: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      return `File is too large (${sizeMB.toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
    }
    if (file.size === 0) {
      return 'The file is empty (0 bytes). Please select a file with data.';
    }
    return null;
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setError('');
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFileName(file.name);
    try {
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
    setHeadingRow(0);
  };

  const updateMapping = (sourceColumn: string, targetField: string) => {
    setMappings(prev => prev.map(m =>
      m.sourceColumn === sourceColumn ? { ...m, targetField, isManual: true } : m
    ));
  };

  /**
   * Apply column mappings to the raw rows, converting them into
   * objects keyed by the target field name so processImportRows can
   * consume them directly.
   */
  const mapRowsForImport = useCallback((): Record<string, unknown>[] => {
    const activeMappings = mappings.filter(m => m.targetField && m.targetField !== '__skip__');
    return fileData.rows.map(row => {
      const mapped: Record<string, unknown> = {};
      for (const mapping of activeMappings) {
        const rawValue = row[mapping.sourceColumn];
        if (rawValue !== undefined && rawValue !== null) {
          mapped[mapping.targetField] = rawValue;
        }
      }
      return mapped;
    });
  }, [fileData.rows, mappings]);

  /**
   * Process the mapped rows through the row-safe import pipeline.
   * This is the new "Row Review" step that replaces the old "Cleaning" step.
   */
  const handleProcessRows = useCallback(() => {
    const mappedRows = mapRowsForImport();
    const result = processImportRows(
      mappedRows,
      businessSettings,
      pricingRules,
      { existingSkus }
    );
    setBatchResult(result);

    // Pre-compute duplicate diffs for the duplicate-resolution step
    const diffs = new Map<number, DuplicateDiff[]>();
    for (const row of result.results) {
      if (row.status === 'duplicate' && row.product) {
        const existingProduct = existingProductBySku.get(row.product.sku?.trim().toLowerCase() ?? '');
        if (existingProduct) {
          diffs.set(row.rowNumber, computeDuplicateDiff(existingProduct, row.product));
        }
      }
    }
    setDuplicateDiffs(diffs);

    // Initialize strategies with defaults
    const strategies = new Map<number, DuplicateResolutionStrategy>();
    for (const row of result.results) {
      if (row.status === 'duplicate') {
        strategies.set(row.rowNumber, 'update-existing');
      }
    }
    setDuplicateStrategies(strategies);
    setApplyToAll(false);
    setApplyToAllStrategy('update-existing');
    setExpandedDuplicates(new Set());

    // Navigate to the appropriate next step
    if (result.duplicateProducts.length > 0) {
      setStep('duplicate-resolution');
    } else {
      setStep('confirmation');
    }
  }, [mapRowsForImport, businessSettings, pricingRules, existingSkus, existingProductBySku]);

  /**
   * Run reconciliation for all duplicate rows and navigate to confirmation.
   */
  const handleResolveDuplicates = useCallback(() => {
    if (!batchResult) return;

    const duplicateRows = batchResult.results.filter(r => r.status === 'duplicate');
    const inputs: DuplicateReconciliationInput[] = [];

    for (const row of duplicateRows) {
      if (!row.product) continue;
      const strategy = applyToAll ? applyToAllStrategy : (duplicateStrategies.get(row.rowNumber) ?? 'update-existing');
      const existingProduct = existingProductBySku.get(row.product.sku?.trim().toLowerCase() ?? '');
      if (existingProduct) {
        inputs.push({ existing: existingProduct, uploaded: row.product, strategy });
      }
    }

    const batchReconResult = reconcileDuplicates(inputs, businessSettings, pricingRules);
    const reconResults: DuplicateReconciliationResult[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const updatedProduct = batchReconResult.updatedProducts.find(p => p.id === input.existing.id);
      reconResults.push({
        product: updatedProduct ?? batchReconResult.newProducts[i] ?? input.existing,
        approvalInvalidated: batchReconResult.anyApprovalInvalidated,
        createdNew: batchReconResult.newProducts.length > 0,
        skipped: batchReconResult.skippedSkus.includes(input.uploaded.sku),
        message: batchReconResult.messages[i] ?? '',
        appliedChanges: [],
      });
    }
    setReconciliationResults(reconResults);

    setStep('confirmation');
  }, [batchResult, applyToAll, applyToAllStrategy, duplicateStrategies, existingProductBySku, businessSettings, pricingRules]);

  /**
   * Execute the final transactional import.
   */
  const handleImport = useCallback(async () => {
    if (!batchResult) return;
    setIsImporting(true);

    try {
      // Build products to add (valid + needs-review)
      const productsToAdd: Product[] = [
        ...batchResult.validProducts,
        ...batchResult.needsReviewProducts,
      ];

      // Build products to update (from duplicate reconciliation)
      const productsToUpdate: Product[] = [];
      let skippedCount = 0;
      let filledMissingCount = 0;

      const duplicateRows = batchResult.results.filter(r => r.status === 'duplicate');
      const inputs: DuplicateReconciliationInput[] = [];

      for (const row of duplicateRows) {
        if (!row.product) continue;
        const strategy = applyToAll ? applyToAllStrategy : (duplicateStrategies.get(row.rowNumber) ?? 'update-existing');
        const existingProduct = existingProductBySku.get(row.product.sku?.trim().toLowerCase() ?? '');
        if (existingProduct) {
          inputs.push({ existing: existingProduct, uploaded: row.product, strategy });
        }
      }

      if (inputs.length > 0) {
        const batchReconResult = reconcileDuplicates(inputs, businessSettings, pricingRules);
        productsToUpdate.push(...batchReconResult.updatedProducts);
        productsToAdd.push(...batchReconResult.newProducts);
        skippedCount = batchReconResult.skippedSkus.length;
        filledMissingCount = batchReconResult.updatedProducts.filter((_, i) => {
          const input = inputs[i];
          return input?.strategy === 'fill-missing';
        }).length;
      }

      const sheetName = sheets.length > 0 ? sheets[selectedSheet]?.name : undefined;
      const result = await importProductsWithBatch(
        productsToAdd,
        productsToUpdate,
        {
          fileName,
          sheetName,
          totalRows: batchResult.totalCount,
        }
      );

      if (!result.success) {
        toast.error('Import failed', { description: result.message });
        setIsImporting(false);
        return;
      }

      const commitResult: ImportCommitResult = result.commitResult ?? {
        added: productsToAdd.length,
        updated: productsToUpdate.length,
        filledMissing: filledMissingCount,
        skipped: skippedCount,
        rejected: batchResult.rejectedCount,
        needsReview: batchResult.needsReviewProducts.length,
      };

      setImportSummary(commitResult);
      setImportComplete(true);
    } catch (err) {
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setIsImporting(false);
    }
  }, [batchResult, applyToAll, applyToAllStrategy, duplicateStrategies, existingProductBySku, businessSettings, pricingRules, importProductsWithBatch, fileName, sheets, selectedSheet]);

  const resetImportFlow = () => {
    setStep('upload');
    setFileName('');
    setFileData({ headers: [], rows: [] });
    setSheets([]);
    setCsvRawRows(null);
    setIsCsvFile(false);
    setMappings([]);
    setError('');
    setImportComplete(false);
    setImportSummary(null);
    setHeadingRow(0);
    setShowAllBackups(false);
    setBatchResult(null);
    setDuplicateStrategies(new Map());
    setApplyToAll(false);
    setApplyToAllStrategy('update-existing');
    setDuplicateDiffs(new Map());
    setReconciliationResults([]);
    setExpandedDuplicates(new Set());
    setIsImporting(false);
  };

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

  // Group results by status for the Row Review step
  const groupedResults = useMemo(() => {
    if (!batchResult) return { valid: [], needsReview: [], duplicate: [], rejected: [] };
    const valid = batchResult.results.filter(r => r.status === 'valid');
    const needsReview = batchResult.results.filter(r => r.status === 'needs-review');
    const duplicate = batchResult.results.filter(r => r.status === 'duplicate');
    const rejected = batchResult.results.filter(r => r.status === 'rejected');
    return { valid, needsReview, duplicate, rejected };
  }, [batchResult]);

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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-200">
                <p className="text-lg font-semibold text-emerald-700">{importSummary.added}</p>
                <p className="text-xs text-emerald-600">Products added</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                <p className="text-lg font-semibold text-blue-700">{importSummary.updated}</p>
                <p className="text-xs text-blue-600">Products updated</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 text-center border border-sky-200">
                <p className="text-lg font-semibold text-sky-700">{importSummary.filledMissing}</p>
                <p className="text-xs text-sky-600">Missing fields filled</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                <p className="text-lg font-semibold text-amber-700">{importSummary.needsReview}</p>
                <p className="text-xs text-amber-600">Need review</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
                <p className="text-lg font-semibold text-slate-700">{importSummary.skipped}</p>
                <p className="text-xs text-slate-600">Skipped</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                <p className="text-lg font-semibold text-red-700">{importSummary.rejected}</p>
                <p className="text-xs text-red-600">Rejected</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setCurrentView('review-prices')} className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md rounded-lg">
                Review Problems
              </Button>
              <Button variant="outline" onClick={() => setCurrentView('products')} className="rounded-lg shadow-sm">
                View All Products
              </Button>
              <Button variant="outline" onClick={resetImportFlow} className="rounded-lg shadow-sm">
                Import Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!importComplete && (
      <>
      {/* Backup History panel — shown only on the upload step */}
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
              data-testid="import-file-trigger"
            >
              <span className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="h-7 w-7 text-emerald-600" />
              </span>
              <p className="text-sm font-medium">Drag & drop your file here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx, .xls, .csv, .tsv — Max {MAX_FILE_SIZE_MB} MB
              </p>
              <input id="file-upload" type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileInput} data-testid="import-file-input" />
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

            {/* Header row selector */}
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

              {/* Live preview of the first 3 raw rows */}
              <div className="bg-white border border-slate-200 rounded-md p-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 font-medium">
                  First 3 rows (raw)
                </p>
                <div className="space-y-1 font-mono text-[11px] text-slate-700">
                  {(() => {
                    const rawRowsToPreview: string[][] = isCsvFile && csvRawRows
                      ? csvRawRows.slice(0, 3).map(line => {
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
              <Button data-testid="import-continue-to-mapping" onClick={() => setStep('mapping')} className="rounded-lg shadow-md">Map Columns <ArrowRight className="h-4 w-4 ml-1" /></Button>
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
              <Button data-testid="import-process-rows" onClick={handleProcessRows} className="rounded-lg shadow-md">Process Rows <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Row Review */}
      {step === 'row-review' && batchResult && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Row Review</CardTitle>
            <CardDescription>Review how each row was classified before proceeding</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary message */}
            <Alert className="border-emerald-200 bg-emerald-50/50">
              <Info className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800 text-sm font-medium">Import Summary</AlertTitle>
              <AlertDescription className="text-sm text-slate-700 whitespace-pre-line">
                {batchResult.summary.message}
              </AlertDescription>
            </Alert>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-200">
                <p className="text-lg font-semibold text-emerald-700">{groupedResults.valid.length}</p>
                <p className="text-xs text-emerald-600">Ready to Add</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                <p className="text-lg font-semibold text-amber-700">{groupedResults.needsReview.length}</p>
                <p className="text-xs text-amber-600">Needs Information</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center border border-orange-200">
                <p className="text-lg font-semibold text-orange-700">{groupedResults.duplicate.length}</p>
                <p className="text-xs text-orange-600">Duplicates</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                <p className="text-lg font-semibold text-red-700">{groupedResults.rejected.length}</p>
                <p className="text-xs text-red-600">Rejected</p>
              </div>
            </div>

            {/* Download issue report */}
            {(groupedResults.needsReview.length > 0 || groupedResults.duplicate.length > 0 || groupedResults.rejected.length > 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadIssueReport(batchResult.results)}
                className="rounded-lg shadow-sm"
              >
                <Download className="h-4 w-4 mr-1.5" /> Download Issue Report (CSV)
              </Button>
            )}

            {/* Ready to Add */}
            {groupedResults.valid.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4" /> Ready to Add ({groupedResults.valid.length})
                </h3>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-emerald-200 bg-emerald-50/30">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Row</TableHead>
                        <TableHead className="text-xs">Product Name</TableHead>
                        <TableHead className="text-xs">SKU</TableHead>
                        <TableHead className="text-xs">Purchase Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedResults.valid.slice(0, 50).map(r => (
                        <TableRow key={r.rowNumber}>
                          <TableCell className="text-xs">{r.rowNumber}</TableCell>
                          <TableCell className="text-xs">{r.product?.name ?? '—'}</TableCell>
                          <TableCell className="text-xs">{r.product?.sku ?? '—'}</TableCell>
                          <TableCell className="text-xs">{r.product?.purchaseCost ? formatCurrency(r.product.purchaseCost, businessSettings.currencyCode) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {groupedResults.valid.length > 50 && (
                    <p className="text-xs text-slate-500 p-2 text-center">... and {groupedResults.valid.length - 50} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Needs Information */}
            {groupedResults.needsReview.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Needs Information ({groupedResults.needsReview.length})
                </h3>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/30 space-y-2 p-2">
                  {groupedResults.needsReview.map(r => (
                    <div key={r.rowNumber} className="bg-white rounded-md p-2.5 border border-amber-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-800">Row {r.rowNumber}: {r.product?.name ?? 'Unnamed'}</span>
                        <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700">{r.product?.sku ?? 'No SKU'}</Badge>
                      </div>
                      {r.issues.map((issue, i) => (
                        <div key={i} className="text-xs text-amber-700 ml-2">
                          <span className="font-medium">{issue.field ?? 'General'}:</span> {issue.message}
                          {issue.suggestedAction && <span className="text-amber-600 ml-1">→ {issue.suggestedAction}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicates Requiring Decision */}
            {groupedResults.duplicate.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-orange-700 mb-2 flex items-center gap-1.5">
                  <GitMerge className="h-4 w-4" /> Duplicates Requiring Decision ({groupedResults.duplicate.length})
                </h3>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-orange-200 bg-orange-50/30 space-y-2 p-2">
                  {groupedResults.duplicate.map(r => (
                    <div key={r.rowNumber} className="bg-white rounded-md p-2.5 border border-orange-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-800">Row {r.rowNumber}: {r.product?.name ?? 'Unnamed'}</span>
                        <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700">{r.product?.sku ?? 'No SKU'}</Badge>
                      </div>
                      {r.issues.map((issue, i) => (
                        <div key={i} className="text-xs text-orange-700 ml-2">
                          {issue.message}
                          {issue.suggestedAction && <span className="text-orange-600 ml-1">→ {issue.suggestedAction}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejected Rows */}
            {groupedResults.rejected.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1.5">
                  <FileX className="h-4 w-4" /> Rejected Rows ({groupedResults.rejected.length})
                </h3>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-red-200 bg-red-50/30 space-y-2 p-2">
                  {groupedResults.rejected.map(r => (
                    <div key={r.rowNumber} className="bg-white rounded-md p-2.5 border border-red-100">
                      <div className="text-xs font-medium text-slate-800 mb-1">Row {r.rowNumber}</div>
                      {r.issues.map((issue, i) => (
                        <div key={i} className="text-xs text-red-700 ml-2">
                          <span className="font-medium">{issue.field ?? 'Error'}:</span> {issue.message}
                          {issue.suggestedAction && <span className="text-red-600 ml-1">→ {issue.suggestedAction}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')} className="rounded-lg shadow-sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button
                onClick={() => {
                  if (groupedResults.duplicate.length > 0) {
                    setStep('duplicate-resolution');
                  } else {
                    setStep('confirmation');
                  }
                }}
                className="rounded-lg shadow-md"
                disabled={groupedResults.valid.length === 0 && groupedResults.needsReview.length === 0}
              >
                {groupedResults.duplicate.length > 0 ? 'Resolve Duplicates' : 'Continue to Confirm'}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Duplicate Resolution */}
      {step === 'duplicate-resolution' && batchResult && (
        <Card className="shadow-md border-0 rounded-xl" data-testid="import-duplicate-resolution">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GitMerge className="h-5 w-5" /> Duplicate Resolution</CardTitle>
            <CardDescription>
              {groupedResults.duplicate.length} product{groupedResults.duplicate.length === 1 ? '' : 's'} have SKU{groupedResults.duplicate.length === 1 ? '' : 's'} that already exist in your catalogue. Choose how to handle each one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Apply to all toggle */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="apply-to-all"
                  checked={applyToAll}
                  onCheckedChange={(checked) => setApplyToAll(checked === true)}
                />
                <Label htmlFor="apply-to-all" className="text-sm font-medium">Apply this choice to all similar duplicates</Label>
              </div>
              {applyToAll && (
                <div className="ml-6 space-y-2">
                  <p className="text-xs text-slate-600">Select the strategy to apply to all duplicates:</p>
                  <RadioGroup
                    value={applyToAllStrategy}
                    onValueChange={(value) => setApplyToAllStrategy(value as DuplicateResolutionStrategy)}
                    className="gap-2"
                  >
                    {STRATEGY_OPTIONS.map(opt => (
                      <label key={opt.value} htmlFor={`global-${opt.value}`} className="flex items-start gap-3 p-2.5 rounded-md border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors cursor-pointer">
                        <RadioGroupItem value={opt.value} id={`global-${opt.value}`} className="mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                          <div className="text-xs text-slate-600">{opt.description}</div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              )}
              {!applyToAll && (
                <p className="text-xs text-slate-600 ml-6">Review individually — choose a strategy for each duplicate below.</p>
              )}
            </div>

            {/* Individual duplicate rows */}
            <div className="space-y-3">
              {groupedResults.duplicate.map(r => {
                const diffs = duplicateDiffs.get(r.rowNumber) ?? [];
                const isExpanded = expandedDuplicates.has(r.rowNumber);
                const currentStrategy = applyToAll ? applyToAllStrategy : (duplicateStrategies.get(r.rowNumber) ?? 'update-existing');

                return (
                  <div key={r.rowNumber} className="bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden">
                    {/* Header row */}
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-orange-50/30 transition-colors"
                      onClick={() => {
                        setExpandedDuplicates(prev => {
                          const next = new Set(prev);
                          if (next.has(r.rowNumber)) {
                            next.delete(r.rowNumber);
                          } else {
                            next.add(r.rowNumber);
                          }
                          return next;
                        });
                      }}
                    >
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <GitMerge className="h-4 w-4 text-orange-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          Row {r.rowNumber}: {r.product?.name ?? 'Unnamed'}
                        </div>
                        <div className="text-xs text-slate-600">
                          SKU: <span className="font-mono font-medium">{r.product?.sku ?? '—'}</span>
                          {diffs.length > 0 && (
                            <span className="ml-2 text-orange-600">{diffs.length} field{diffs.length === 1 ? '' : 's'} differ</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!applyToAll && (
                          <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700">
                            {STRATEGY_OPTIONS.find(s => s.value === currentStrategy)?.label ?? 'Update Existing'}
                          </Badge>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-orange-100 p-3 space-y-3">
                        {/* Field differences */}
                        {diffs.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-slate-600 mb-2">Field Differences</h4>
                            <div className="overflow-x-auto rounded-md border border-slate-200">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Field</TableHead>
                                    <TableHead className="text-xs">Current Value</TableHead>
                                    <TableHead className="text-xs">Uploaded Value</TableHead>
                                    <TableHead className="text-xs">Affects Price</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {diffs.map((diff, i) => (
                                    <TableRow key={i}>
                                      <TableCell className="text-xs font-medium">{diff.label}</TableCell>
                                      <TableCell className="text-xs text-slate-600">
                                        {typeof diff.currentValue === 'number'
                                          ? formatCurrency(diff.currentValue, businessSettings.currencyCode)
                                          : String(diff.currentValue ?? '—')}
                                      </TableCell>
                                      <TableCell className="text-xs text-emerald-700 font-medium">
                                        {typeof diff.uploadedValue === 'number'
                                          ? formatCurrency(diff.uploadedValue, businessSettings.currencyCode)
                                          : String(diff.uploadedValue ?? '—')}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {diff.affectsCalculation ? (
                                          <Badge className="text-[10px] bg-amber-100 text-amber-700">Yes</Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-[10px]">No</Badge>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}

                        {/* Strategy selection for this row */}
                        {!applyToAll && (
                          <div>
                            <h4 className="text-xs font-medium text-slate-600 mb-2">Choose Resolution Strategy</h4>
                            <RadioGroup
                              value={currentStrategy}
                              onValueChange={(value) => {
                                setDuplicateStrategies(prev => {
                                  const next = new Map(prev);
                                  next.set(r.rowNumber, value as DuplicateResolutionStrategy);
                                  return next;
                                });
                              }}
                              className="gap-2"
                            >
                              {STRATEGY_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                return (
                                  <label key={opt.value} htmlFor={`dup-${r.rowNumber}-${opt.value}`} className="flex items-start gap-3 p-2.5 rounded-md border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors cursor-pointer">
                                    <RadioGroupItem value={opt.value} id={`dup-${r.rowNumber}-${opt.value}`} className="mt-0.5" />
                                    <div className="flex items-start gap-2">
                                      <Icon className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                      <div className="space-y-0.5">
                                        <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                                        <div className="text-xs text-slate-600">{opt.description}</div>
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('row-review')} className="rounded-lg shadow-sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button data-testid="import-resolve-duplicates" onClick={handleResolveDuplicates} className="rounded-lg shadow-md">
                Continue to Confirm <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Confirmation */}
      {step === 'confirmation' && batchResult && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5" /> Import Confirmation</CardTitle>
            <CardDescription>Review the final summary before importing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="shadow-sm rounded-lg p-4 bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-600 font-medium">Ready to Add</div>
                <div className="text-lg font-bold text-emerald-700">{groupedResults.valid.length + groupedResults.needsReview.length}</div>
              </div>
              <div className="shadow-sm rounded-lg p-4 bg-orange-50 border border-orange-200">
                <div className="text-xs text-orange-600 font-medium">Duplicate SKUs</div>
                <div className="text-lg font-bold text-orange-700">{groupedResults.duplicate.length}</div>
              </div>
              <div className="shadow-sm rounded-lg p-4 bg-red-50 border border-red-200">
                <div className="text-xs text-red-600 font-medium">Rejected</div>
                <div className="text-lg font-bold text-red-700">{groupedResults.rejected.length}</div>
              </div>
              <div className="shadow-sm rounded-lg p-4 bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">Total Rows</div>
                <div className="text-lg font-bold text-slate-700">{batchResult.totalCount}</div>
              </div>
            </div>

            {/* Duplicate resolution summary */}
            {groupedResults.duplicate.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-600 mb-2">Duplicate Resolution Summary</div>
                <div className="space-y-1">
                  {groupedResults.duplicate.map(r => {
                    const strategy = applyToAll ? applyToAllStrategy : (duplicateStrategies.get(r.rowNumber) ?? 'update-existing');
                    const strategyLabel = STRATEGY_OPTIONS.find(s => s.value === strategy)?.label ?? strategy;
                    return (
                      <div key={r.rowNumber} className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-[10px]">{strategyLabel}</Badge>
                        <span className="text-slate-600">Row {r.rowNumber}: {r.product?.name ?? 'Unnamed'} ({r.product?.sku ?? '—'})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Needs review note */}
            {groupedResults.needsReview.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50/50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 text-xs font-medium">Products Needing Review</AlertTitle>
                <AlertDescription className="text-xs text-slate-700">
                  {groupedResults.needsReview.length} product{groupedResults.needsReview.length === 1 ? '' : 's'} will be imported but flagged for review. They may have missing data that needs to be filled in before pricing can be calculated.
                </AlertDescription>
              </Alert>
            )}

            {/* Missing purchase cost warning */}
            {(() => {
              const allImportable = [...groupedResults.valid, ...groupedResults.needsReview];
              const rowsWithCost = allImportable.filter(r => r.product && r.product.purchaseCost > 0);
              const rowsWithoutCost = allImportable.filter(r => r.product && r.product.purchaseCost === 0);
              const costCoveragePercent = allImportable.length > 0 ? Math.round((rowsWithCost.length / allImportable.length) * 100) : 100;
              if (rowsWithoutCost.length > 0 && costCoveragePercent < 80) {
                return (
                  <Alert className="border-red-200 bg-red-50/50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertTitle className="text-red-800 text-xs font-medium">Purchase Cost Not Detected</AlertTitle>
                    <AlertDescription className="text-xs text-slate-700">
                      Purchase cost was not detected for {rowsWithoutCost.length} of {allImportable.length} products.
                      PricePilot cannot calculate reliable selling prices without purchase cost.
                      Please verify the column mapping or these products will be imported as &ldquo;Needs Cost&rdquo;.
                    </AlertDescription>
                  </Alert>
                );
              }
              return null;
            })()}

            {/* Rejected rows note */}
            {groupedResults.rejected.length > 0 && (
              <Alert className="border-red-200 bg-red-50/50">
                <FileX className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800 text-xs font-medium">Rejected Rows</AlertTitle>
                <AlertDescription className="text-xs text-slate-700">
                  {groupedResults.rejected.length} row{groupedResults.rejected.length === 1 ? '' : 's'} could not be imported and will be skipped. You can download the issue report for details.
                </AlertDescription>
              </Alert>
            )}

            {/* Total inventory cost estimate */}
            {batchResult.validProducts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Estimated total inventory cost:</h3>
                <p className="text-lg font-semibold">
                  {formatCurrency(
                    batchResult.validProducts.reduce((sum, p) => sum + (p.purchaseCost || 0), 0),
                    businessSettings.currencyCode
                  )}
                </p>
              </div>
            )}

            <Separator />

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  if (groupedResults.duplicate.length > 0) {
                    setStep('duplicate-resolution');
                  } else {
                    setStep('row-review');
                  }
                }}
                className="rounded-lg shadow-sm"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                data-testid="import-commit-button"
                onClick={handleImport}
                disabled={isImporting || (groupedResults.valid.length === 0 && groupedResults.needsReview.length === 0 && groupedResults.duplicate.length === 0)}
                className="rounded-lg shadow-md"
              >
                {isImporting ? (
                  <>Importing...</>
                ) : (
                  <>Import {groupedResults.valid.length + groupedResults.needsReview.length + groupedResults.duplicate.length} Products</>
                )}
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
