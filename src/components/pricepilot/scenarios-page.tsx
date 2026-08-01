'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Bookmark, Plus, Copy, Edit, Trash2, RotateCcw, Download, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PriceOutcome } from '@/lib/pricepilot/types';

export function ScenariosPage() {
  const { scenarios, products, pricingRules, businessSettings, addScenario, updateScenario, deleteScenario, restoreScenario } = usePricePilotStore();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  const cc = businessSettings.currencyCode;

  const handleCreate = () => {
    addScenario({
      id: `scenario-${Date.now()}`,
      name: newName || `Scenario ${scenarios.length + 1}`,
      description: newDescription,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenarioType: 'catalogue',
      snapshotProducts: [...products],
      snapshotPricingRules: [...pricingRules],
      snapshotBusinessSettings: { ...businessSettings },
      isBaseline: false,
    });
    toast.success('Scenario saved', { description: `${newName || `Scenario ${scenarios.length + 1}`} has been created` });
    setNewDialogOpen(false);
    setNewName('');
    setNewDescription('');
  };

  const handleDuplicate = (id: string) => {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;
    addScenario({
      ...scenario,
      id: `scenario-${Date.now()}`,
      name: `${scenario.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isBaseline: false,
    });
  };

  const handleRestore = (id: string) => {
    restoreScenario(id);
    toast.success('Scenario restored', { description: 'All data has been restored from the scenario snapshot' });
  };

  const handleExport = (id: string) => {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;
    const data = JSON.stringify(scenario, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-${scenario.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCompare = () => {
    if (scenarios.length < 2) return;
    setCompareIds([scenarios[0].id, scenarios[1].id]);
  };

  if (scenarios.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Saved Scenarios</h2>
          <Button
            onClick={() => setNewDialogOpen(true)}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors duration-150"
          >
            <Plus className="h-4 w-4 mr-2" /> Save Current State
          </Button>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="bg-slate-100 rounded-full p-6">
                <Bookmark className="h-20 w-20 text-slate-400" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-slate-700">No saved scenarios yet</p>
                <p className="text-slate-500 max-w-md">Save your current state to create a snapshot you can restore later.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
          <DialogContent className="space-y-4">
            <DialogHeader><DialogTitle>Save Current State as Scenario</DialogTitle><DialogDescription className="sr-only">Save your current pricing state as a named scenario for later comparison.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-600">Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Scenario name" className="bg-white shadow-sm border-slate-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-600">Description</Label>
                <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional description" className="bg-white shadow-sm border-slate-200" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} className="bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save Scenario</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Comparison using stored PriceOutcome data (no inline calculations)
  const comparison = compareIds ? computeComparisonFromOutcomes(
    scenarios.find(s => s.id === compareIds[0]),
    scenarios.find(s => s.id === compareIds[1]),
    cc
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Saved Scenarios</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCompare}
            disabled={scenarios.length < 2}
            className="rounded-lg bg-white border-slate-200 shadow-sm hover:bg-slate-50 transition-colors duration-150"
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" /> Compare
          </Button>
          <Button
            onClick={() => setNewDialogOpen(true)}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors duration-150"
          >
            <Plus className="h-4 w-4 mr-2" /> Save Current State
          </Button>
        </div>
      </div>

      <Card className="shadow-md border-0 overflow-hidden rounded-xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 sticky top-0">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Name</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Products</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map(s => (
                <TableRow key={s.id} className="hover:bg-emerald-50/20 transition-colors duration-150">
                  <TableCell className="font-semibold text-slate-800">
                    {s.name}
                    {s.isBaseline && <Badge variant="secondary" className="ml-2">Baseline</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{s.snapshotProducts.length}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate text-slate-600">{s.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="rounded-lg hover:bg-slate-100 transition-colors duration-150" onClick={() => handleDuplicate(s.id)}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="rounded-lg hover:bg-slate-100 transition-colors duration-150" onClick={() => handleExport(s.id)}><Download className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm rounded-lg transition-colors duration-150"><RotateCcw className="h-4 w-4 mr-1" /> Restore</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restore &quot;{s.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>This will replace your current products, rules, and settings with the data from this scenario. Your current state will be lost unless you save it first.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRestore(s.id)}>Restore</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors duration-150"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete &quot;{s.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>This scenario will be permanently removed.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => { deleteScenario(s.id); toast.success('Scenario deleted', { description: `${s.name} has been removed` }); }}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Comparison */}
      {comparison && compareIds && (
        <Card className="shadow-md border-0 rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" /> Scenario Comparison
            </CardTitle>
            <CardDescription>
              {scenarios.find(s => s.id === compareIds[0])?.name} vs {scenarios.find(s => s.id === compareIds[1])?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {comparison.map(item => (
                <ComparisonItem key={item.label} label={item.label} valueA={item.valueA} valueB={item.valueB} diff={item.diff} />
              ))}
            </div>

            <Separator className="my-3" />

            <div className="flex items-center gap-3">
              <Label className="text-sm font-semibold text-slate-700">Compare:</Label>
              <Select value={compareIds[0]} onValueChange={v => setCompareIds([v, compareIds[1]])}>
                <SelectTrigger className="w-[150px] bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scenarios.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500">vs</span>
              <Select value={compareIds[1]} onValueChange={v => setCompareIds([compareIds[0], v])}>
                <SelectTrigger className="w-[150px] bg-white shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scenarios.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Scenario Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="space-y-4">
          <DialogHeader><DialogTitle>Save Current State as Scenario</DialogTitle><DialogDescription className="sr-only">Save your current pricing state as a named scenario for later comparison.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-600">Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Scenario name" className="bg-white shadow-sm border-slate-200" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-600">Description</Label>
              <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional description" className="bg-white shadow-sm border-slate-200" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save Scenario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComparisonItem({ label, valueA, valueB, diff }: { label: string; valueA: string; valueB: string; diff: string }) {
  const diffNum = parseFloat(diff.replace(/[^0-9.\-]/g, ''));
  const diffColor = diffNum > 0 ? 'text-emerald-600' : diffNum < 0 ? 'text-red-600' : 'text-slate-500';

  return (
    <div className="bg-white shadow-sm rounded-lg p-4 border border-slate-100">
      <div className="text-sm font-semibold text-slate-700 mb-2">{label}</div>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="text-xs text-slate-500 mb-0.5">Scenario A</div>
          <div className="text-lg font-bold text-slate-800">{valueA}</div>
        </div>
        <div className="flex-1">
          <div className="text-xs text-slate-500 mb-0.5">Scenario B</div>
          <div className="text-lg font-bold text-slate-800">{valueB}</div>
        </div>
        <div className="flex-1">
          <div className="text-xs text-slate-500 mb-0.5">Diff</div>
          <div className={`text-lg font-bold ${diffColor}`}>{diff}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compute comparison using stored PriceOutcome data.
 * All values come from calculatedPriceOutcome on each product,
 * NOT from inline simplified formulas.
 */
function computeComparisonFromOutcomes(
  a: { snapshotProducts: { calculatedPriceOutcome?: PriceOutcome; calculatedProfitPerUnit: number; calculatedMarginPercent: number; currentSellingPrice: number; calculatedPricingStatus: string }[] } | undefined,
  b: { snapshotProducts: { calculatedPriceOutcome?: PriceOutcome; calculatedProfitPerUnit: number; calculatedMarginPercent: number; currentSellingPrice: number; calculatedPricingStatus: string }[] } | undefined,
  cc: string
) {
  if (!a || !b) return null;
  const aProducts = a.snapshotProducts;
  const bProducts = b.snapshotProducts;

  // Helper: get outcome data from stored PriceOutcome or fallback to stored fields
  const getOutcomeData = (p: { calculatedPriceOutcome?: PriceOutcome; calculatedProfitPerUnit: number; calculatedMarginPercent: number; currentSellingPrice: number }) => {
    if (p.calculatedPriceOutcome) {
      return {
        netProfit: p.calculatedPriceOutcome.netProfit,
        margin: p.calculatedPriceOutcome.effectiveMarginPercent,
        revenue: p.calculatedPriceOutcome.customerPayableAmount,
      };
    }
    return {
      netProfit: p.calculatedProfitPerUnit,
      margin: p.calculatedMarginPercent,
      revenue: p.currentSellingPrice,
    };
  };

  const aOutcomes = aProducts.map(getOutcomeData);
  const bOutcomes = bProducts.map(getOutcomeData);

  const aRevenue = aOutcomes.reduce((s, o) => s + o.revenue, 0);
  const bRevenue = bOutcomes.reduce((s, o) => s + o.revenue, 0);
  const aProfit = aOutcomes.reduce((s, o) => s + o.netProfit, 0);
  const bProfit = bOutcomes.reduce((s, o) => s + o.netProfit, 0);
  const aMargin = aOutcomes.length > 0 ? aOutcomes.reduce((s, o) => s + o.margin, 0) / aOutcomes.length : 0;
  const bMargin = bOutcomes.length > 0 ? bOutcomes.reduce((s, o) => s + o.margin, 0) / bOutcomes.length : 0;
  const aUnprofitable = aProducts.filter(p => {
    const d = getOutcomeData(p);
    return d.netProfit < 0;
  }).length;
  const bUnprofitable = bProducts.filter(p => {
    const d = getOutcomeData(p);
    return d.netProfit < 0;
  }).length;

  return [
    { label: 'Total Revenue (per unit)', valueA: formatCurrency(aRevenue, cc), valueB: formatCurrency(bRevenue, cc), diff: formatCurrency(bRevenue - aRevenue, cc) },
    { label: 'Total Profit (per unit)', valueA: formatCurrency(aProfit, cc), valueB: formatCurrency(bProfit, cc), diff: formatCurrency(bProfit - aProfit, cc) },
    { label: 'Avg Margin', valueA: formatPercentage(aMargin), valueB: formatPercentage(bMargin), diff: formatPercentage(bMargin - aMargin) },
    { label: 'Products', valueA: String(aProducts.length), valueB: String(bProducts.length), diff: String(bProducts.length - aProducts.length) },
    { label: 'Unprofitable Products', valueA: String(aUnprofitable), valueB: String(bUnprofitable), diff: String(bUnprofitable - aUnprofitable) },
  ];
}

export default ScenariosPage;
