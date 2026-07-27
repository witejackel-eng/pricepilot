'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { Bookmark, Plus, Copy, Edit, Trash2, RotateCcw, Download, ArrowLeftRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
      snapshotProducts: [...products],
      snapshotPricingRules: [...pricingRules],
      snapshotBusinessSettings: { ...businessSettings },
      isBaseline: false,
    });
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
          <h2 className="text-lg font-semibold">Saved Scenarios</h2>
          <Button onClick={() => setNewDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Save Current State</Button>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Bookmark className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p>No saved scenarios yet. Save your current state to create a snapshot you can restore later.</p>
          </CardContent>
        </Card>

        <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Save Current State as Scenario</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Scenario name" /></div>
              <div><Label>Description</Label><Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional description" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Save Scenario</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const comparison = compareIds ? computeComparison(
    scenarios.find(s => s.id === compareIds[0]),
    scenarios.find(s => s.id === compareIds[1]),
    cc
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Saved Scenarios</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCompare} disabled={scenarios.length < 2}>
            <ArrowLeftRight className="h-4 w-4 mr-2" /> Compare
          </Button>
          <Button onClick={() => setNewDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Save Current State</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.isBaseline && <Badge variant="secondary" className="ml-2">Baseline</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{s.snapshotProducts.length}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{s.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(s.id)}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleExport(s.id)}><Download className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm"><RotateCcw className="h-4 w-4 mr-1" /> Restore</Button>
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
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete &quot;{s.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>This scenario will be permanently removed.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteScenario(s.id)}>Delete</AlertDialogAction>
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
        <Card>
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
              <Label className="text-sm">Compare:</Label>
              <Select value={compareIds[0]} onValueChange={v => setCompareIds([v, compareIds[1]])}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scenarios.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-sm">vs</span>
              <Select value={compareIds[1]} onValueChange={v => setCompareIds([compareIds[0], v])}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
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
        <DialogContent>
          <DialogHeader><DialogTitle>Save Current State as Scenario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Scenario name" /></div>
            <div><Label>Description</Label><Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Save Scenario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComparisonItem({ label, valueA, valueB, diff }: { label: string; valueA: string; valueB: string; diff: string }) {
  return (
    <div className="p-3 rounded border">
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">A: {valueA}</span>
        <span className="text-muted-foreground">B: {valueB}</span>
        <span className={`font-semibold ${diff.startsWith('+') ? 'text-emerald-600' : diff.startsWith('-') ? 'text-red-600' : ''}`}>Diff: {diff}</span>
      </div>
    </div>
  );
}

function computeComparison(a: { snapshotProducts: { calculatedProfitPerUnit: number; calculatedMarginPercent: number; currentSellingPrice: number; calculatedPricingStatus: string }[] } | undefined, b: { snapshotProducts: { calculatedProfitPerUnit: number; calculatedMarginPercent: number; currentSellingPrice: number; calculatedPricingStatus: string }[] } | undefined, cc: string) {
  if (!a || !b) return null;
  const aProducts = a.snapshotProducts;
  const bProducts = b.snapshotProducts;

  const aRevenue = aProducts.reduce((s, p) => s + p.currentSellingPrice, 0);
  const bRevenue = bProducts.reduce((s, p) => s + p.currentSellingPrice, 0);
  const aProfit = aProducts.reduce((s, p) => s + p.calculatedProfitPerUnit, 0);
  const bProfit = bProducts.reduce((s, p) => s + p.calculatedProfitPerUnit, 0);
  const aMargin = aProducts.length > 0 ? aProducts.reduce((s, p) => s + p.calculatedMarginPercent, 0) / aProducts.length : 0;
  const bMargin = bProducts.length > 0 ? bProducts.reduce((s, p) => s + p.calculatedMarginPercent, 0) / bProducts.length : 0;
  const aUnprofitable = aProducts.filter(p => p.calculatedProfitPerUnit < 0).length;
  const bUnprofitable = bProducts.filter(p => p.calculatedProfitPerUnit < 0).length;

  return [
    { label: 'Total Revenue', valueA: formatCurrency(aRevenue, cc), valueB: formatCurrency(bRevenue, cc), diff: formatCurrency(bRevenue - aRevenue, cc) },
    { label: 'Total Profit', valueA: formatCurrency(aProfit, cc), valueB: formatCurrency(bProfit, cc), diff: formatCurrency(bProfit - aProfit, cc) },
    { label: 'Avg Margin', valueA: formatPercentage(aMargin), valueB: formatPercentage(bMargin), diff: formatPercentage(bMargin - aMargin) },
    { label: 'Products', valueA: String(aProducts.length), valueB: String(bProducts.length), diff: String(bProducts.length - aProducts.length) },
    { label: 'Unprofitable Products', valueA: String(aUnprofitable), valueB: String(bUnprofitable), diff: String(bUnprofitable - aUnprofitable) },
  ];
}

export default ScenariosPage;
