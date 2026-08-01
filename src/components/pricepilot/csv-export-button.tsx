'use client';

import { useCallback, useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { formatCurrency } from '@/lib/pricepilot/formatting';
import { Product } from '@/lib/pricepilot/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Types
// ============================================================

interface CSVExportButtonProps {
  /** Label shown on the main button (e.g. "Download" or "Export") */
  label?: string;
  /** Callback when the Excel / export-page option is chosen */
  onExportExcel?: () => void;
  /** Additional CSS classes for the button group */
  className?: string;
}

// ============================================================
// CSV Helpers
// ============================================================

/**
 * Escape a single CSV field value.
 *
 * - If the value contains a comma, double-quote, or newline, wrap it in
 *   double-quotes and escape any embedded double-quotes by doubling them.
 * - Otherwise, return the value as-is.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build a CSV string from an array of row objects.
 *
 * - First row defines the headers.
 * - BOM (\uFEFF) is prepended so Excel opens the file as UTF-8.
 * - All values are properly escaped per RFC 4180.
 */
function buildCsv(headers: string[], rows: Record<string, string | number>[]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCsvField(String(row[h] ?? ''))).join(',')
  );
  // BOM for Excel UTF-8 compatibility
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Trigger a browser download of a text blob.
 */
function downloadTextBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ============================================================
// CSV Column Definitions
// ============================================================

const CSV_HEADERS = [
  'Product Name',
  'SKU',
  'Category',
  'Brand',
  'Purchase Cost',
  'Current Price',
  'Recommended Price',
  'Margin %',
  'Profit',
  'Status',
] as const;

type CsvHeaderKey = (typeof CSV_HEADERS)[number];

/**
 * Map a Product to a CSV row object.
 */
function productToCsvRow(product: Product, currencyCode: string): Record<CsvHeaderKey, string> {
  return {
    'Product Name': product.name,
    'SKU': product.sku,
    'Category': product.category,
    'Brand': product.brand,
    'Purchase Cost': formatCurrency(product.purchaseCost, currencyCode, { showSymbol: false }),
    'Current Price': formatCurrency(product.currentSellingPrice, currencyCode, { showSymbol: false }),
    'Recommended Price': formatCurrency(product.recommendedPrices.balanced, currencyCode, { showSymbol: false }),
    'Margin %': String(
      typeof product.calculatedMarginPercent === 'number' && Number.isFinite(product.calculatedMarginPercent)
        ? product.calculatedMarginPercent.toFixed(1)
        : '0.0'
    ),
    'Profit': formatCurrency(product.calculatedProfitPerUnit, currencyCode, { showSymbol: false }),
    'Status': product.calculatedPricingStatus ?? '',
  };
}

// ============================================================
// Component
// ============================================================

/**
 * CSVExportButton — A split dropdown button for exporting product data.
 *
 * - Main action: navigates to the Export page (Excel workflow).
 * - Dropdown: offers "Export as Excel (.xlsx)" and "Export as CSV (.csv)".
 * - When no products are approved, the CSV option is disabled with a
 *   tooltip explaining why.
 */
export function CSVExportButton({
  label = 'Download',
  onExportExcel,
  className,
}: CSVExportButtonProps) {
  const { products, businessSettings } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode;

  const approvedProducts = products.filter(p => p.isApproved);
  const hasApprovedProducts = approvedProducts.length > 0;

  const [isExporting, setIsExporting] = useState(false);

  /**
   * Generate and download a CSV file from approved products.
   */
  const handleExportCsv = useCallback(() => {
    if (!hasApprovedProducts) return;

    try {
      setIsExporting(true);

      const rows = approvedProducts.map(p => productToCsvRow(p, currencyCode));
      const headers = [...CSV_HEADERS];
      const csvContent = buildCsv(headers, rows);

      const today = new Date().toISOString().slice(0, 10);
      const filename = `pricepilot-export-${today}.csv`;

      downloadTextBlob(csvContent, filename, 'text/csv;charset=utf-8;');

      toast.success(`CSV exported successfully`, {
        description: `${approvedProducts.length} product${approvedProducts.length === 1 ? '' : 's'} exported to ${filename}`,
      });
    } catch (error) {
      toast.error('CSV export failed', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      setIsExporting(false);
    }
  }, [approvedProducts, currencyCode, hasApprovedProducts]);

  return (
    <div className={`flex ${className ?? ''}`}>
      {/* Main button — navigates to the Export page */}
      <Button
        variant="outline"
        size="sm"
        onClick={onExportExcel}
        disabled={isExporting}
        className="rounded-r-none border-r-0 transition-colors duration-200 rounded-xl pr-2"
        aria-label={`${label} export options`}
      >
        <Download className="h-4 w-4 mr-1" />
        {label}
      </Button>

      {/* Dropdown trigger — chevron button */}
      <DropdownMenu>
        {hasApprovedProducts ? (
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isExporting}
              className="rounded-l-none px-2 transition-colors duration-200 rounded-xl"
              aria-label="Export format options"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="rounded-l-none px-2 transition-colors duration-200 rounded-xl opacity-60"
                aria-label="Export format options (disabled)"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Approve prices first to export</p>
            </TooltipContent>
          </Tooltip>
        )}

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={onExportExcel}
            className="cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
            <span>Export as Excel (.xlsx)</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleExportCsv}
            disabled={!hasApprovedProducts}
            className="cursor-pointer"
          >
            <FileText className="h-4 w-4 mr-2 text-teal-600" />
            <span>Export as CSV (.csv)</span>
            {!hasApprovedProducts && (
              <span className="ml-auto text-xs text-muted-foreground">No approved products</span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default CSVExportButton;
