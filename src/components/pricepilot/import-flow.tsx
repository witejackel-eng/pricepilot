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
import { Product, ColumnMapping, ImportStep, createDefaultProduct } from '@/lib/pricepilot/types';
import { ArrowLeft, ArrowRight, Upload, FileSpreadsheet, Eye, Columns3, Brush, CheckCircle, X, AlertCircle } from 'lucide-react';

const STEPS: ImportStep[] = ['upload', 'preview', 'mapping', 'cleaning', 'confirmation'];
const STEP_LABELS = ['Upload', 'Preview', 'Mapping', 'Cleaning', 'Confirm'];

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
  const [skippedRows, setSkippedRows] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [previewProducts, setPreviewProducts] = useState<Partial<Product>[]>([]);
  const [error, setError] = useState('');

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const handleFileUpload = useCallback(async (file: File) => {
    setError('');
    setFileName(file.name);

    try {
      if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
        const text = await file.text();
        const result = parseCSVFile(text);
        setSheets([{ name: 'Sheet1', headers: result.headers, rows: result.rows }]);
        setFileData({ headers: result.headers, rows: result.rows });
        setTotalRows(result.rows.length);
      } else {
        const buffer = await file.arrayBuffer();
        const result = await parseExcelFile(buffer);
        if (result.sheets.length === 0) {
          setError('No data found in the file');
          return;
        }
        setSheets(result.sheets);
        const firstSheet = result.sheets[0];
        setFileData({ headers: firstSheet.headers, rows: firstSheet.rows });
        setTotalRows(firstSheet.rows.length);
      }

      // Auto-detect mappings
      const autoMappings = detectColumnMappings(fileData.headers);
      setMappings(autoMappings);
      setStep('preview');
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [fileData.headers]);

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
    const autoMappings = detectColumnMappings(sheet.headers);
    setMappings(autoMappings);
  };

  const updateMapping = (sourceColumn: string, targetField: string) => {
    setMappings(prev => prev.map(m =>
      m.sourceColumn === sourceColumn ? { ...m, targetField, isManual: true } : m
    ));
  };

  const handleCleanAndConfirm = () => {
    const result = cleanImportData(
      fileData.rows,
      mappings,
      businessSettings
    );

    setSkippedRows(result.skippedRows);
    setDuplicateCount(result.duplicates);
    setPreviewProducts(result.products);
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
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Progress value={progress} className="mb-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
        <span>Step {stepIndex + 1} of {STEPS.length}: {STEP_LABELS[stepIndex]}</span>
        <Button variant="ghost" size="sm" onClick={() => setCurrentView('products')}>
          <X className="h-4 w-4 mr-1" /> Cancel Import
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload File</CardTitle>
            <CardDescription>Upload an Excel (.xlsx) or CSV file containing your product data</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Drag & drop your file here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv, .tsv files</p>
              <input id="file-upload" type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileInput} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <Card>
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

            <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded">
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

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep('mapping')}>Map Columns <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Mapping */}
      {step === 'mapping' && (
        <Card>
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
                <div key={header} className="flex items-center gap-3 p-2 border rounded">
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
              <Button variant="outline" onClick={() => setStep('preview')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep('cleaning')}>Clean Data <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Cleaning */}
      {step === 'cleaning' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Brush className="h-5 w-5" /> Data Cleaning</CardTitle>
            <CardDescription>Configure how to handle data issues before importing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded bg-slate-50 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="stripCurrency" defaultChecked />
                <Label htmlFor="stripCurrency" className="text-sm">Strip currency symbols (₹, $, £, €)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="stripCommas" defaultChecked />
                <Label htmlFor="stripCommas" className="text-sm">Remove commas from numbers</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="stripPercent" defaultChecked />
                <Label htmlFor="stripPercent" className="text-sm">Strip % signs from percentage fields</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="skipBlanks" defaultChecked />
                <Label htmlFor="skipBlanks" className="text-sm">Skip rows with blank required fields</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="skipDuplicates" defaultChecked />
                <Label htmlFor="skipDuplicates" className="text-sm">Skip duplicate SKU rows</Label>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={handleCleanAndConfirm}>Process Data <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Confirmation */}
      {step === 'confirmation' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5" /> Import Confirmation</CardTitle>
            <CardDescription>Review the summary before importing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-600">Valid Products</div>
                <div className="text-lg font-bold">{previewProducts.length}</div>
              </div>
              <div className="p-3 rounded bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-600">Skipped Rows</div>
                <div className="text-lg font-bold">{skippedRows}</div>
              </div>
              <div className="p-3 rounded bg-amber-50 border border-amber-200">
                <div className="text-xs text-amber-600">Duplicates</div>
                <div className="text-lg font-bold">{duplicateCount}</div>
              </div>
              <div className="p-3 rounded bg-slate-50">
                <div className="text-xs text-muted-foreground">Total Rows</div>
                <div className="text-lg font-bold">{totalRows}</div>
              </div>
            </div>

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
              <Button variant="outline" onClick={() => setStep('cleaning')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={handleImport} disabled={previewProducts.length === 0}>
                Import {previewProducts.length} Products
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ImportFlow;
