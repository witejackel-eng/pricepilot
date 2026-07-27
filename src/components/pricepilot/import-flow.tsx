'use client';

import { useState, useCallback } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
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
import { formatCurrency } from '@/lib/pricepilot/formatting';
import { parseExcelFile, parseCSVFile, detectColumnMappings, cleanImportData } from '@/lib/pricepilot/excel';
import {
  Product,
  ColumnMapping,
  ImportStep,
  CleaningOptions,
  CleanImportResult,
  ImportedProductDraft,
  PercentFormat,
  createDefaultProduct,
  createDefaultCleaningOptions,
} from '@/lib/pricepilot/types';
import { ArrowLeft, ArrowRight, Upload, FileSpreadsheet, Eye, Columns3, Brush, CheckCircle, X, AlertCircle, Info, Download } from 'lucide-react';
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
  const { businessSettings, importProducts, setCurrentView } = usePricePilotStore();
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  const [sheets, setSheets] = useState<Array<{ name: string; headers: string[]; rows: Record<string, string>[] }>>([]);
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

  // Cleaning options state
  const [cleaningOptions, setCleaningOptions] = useState<CleaningOptions>(createDefaultCleaningOptions());

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

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
                <p className="text-xs text-slate-600">Duplicates skipped</p>
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
                setMappings([]);
                setCleaningResult(null);
                setPreviewProducts([]);
                setError('');
              }} className="rounded-lg shadow-sm">
                Import Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!importComplete && (
      <>
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
              <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-3 flex items-center space-x-2">
                <Checkbox
                  id="skipDuplicates"
                  checked={cleaningOptions.skipDuplicateSku}
                  onCheckedChange={(checked) => setCleaningOptions(prev => ({ ...prev, skipDuplicateSku: checked === true }))}
                />
                <Label htmlFor="skipDuplicates" className="text-sm">Skip duplicate SKU rows (instead of overwriting)</Label>
              </div>
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
    </div>
  );
}

export default ImportFlow;
