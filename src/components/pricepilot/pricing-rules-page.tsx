'use client';

import { useState } from 'react';
import { usePricePilotStore } from '@/store/pricepilot-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { PricingRule, RuleLevel, RoundingRule, createDefaultPricingRule } from '@/lib/pricepilot/types';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { applyRoundingRule } from '@/lib/pricepilot/calculations';
import { Plus, Copy, Trash2, Edit, RefreshCw, AlertTriangle } from 'lucide-react';

const LEVEL_OPTIONS: { value: RuleLevel; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
  { value: 'channel', label: 'Channel' },
  { value: 'product', label: 'Product (SKU)' },
];

const ROUNDING_OPTIONS: { value: RoundingRule; label: string }[] = [
  { value: 'no-rounding', label: 'No rounding' },
  { value: 'nearest-whole', label: 'Nearest whole' },
  { value: 'nearest-5', label: 'Nearest 5' },
  { value: 'nearest-10', label: 'Nearest 10' },
  { value: 'end-in-99', label: 'End in .99' },
  { value: 'end-in-95', label: 'End in .95' },
  { value: 'end-in-9', label: 'End in .9' },
  { value: 'end-in-49', label: 'End in .49' },
  { value: 'end-in-99-whole', label: 'End in 99 (whole)' },
];

export function PricingRulesPage() {
  const { pricingRules, addPricingRule, updatePricingRule, deletePricingRule, duplicatePricingRule, businessSettings, products, updateBusinessSettings } = usePricePilotStore();
  const [editRule, setEditRule] = useState<PricingRule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const categories = [...new Set(products.map(p => p.category))];
  const brands = [...new Set(products.map(p => p.brand))];
  const channels = [...new Set(products.map(p => p.salesChannel))];
  const skus = products.map(p => ({ sku: p.sku, name: p.name }));

  // Rounding preview
  const examplePrice = 1247;
  const roundingPreviews = ROUNDING_OPTIONS.map(r => ({
    rule: r.label,
    result: formatCurrency(applyRoundingRule(examplePrice, r.value), businessSettings.currencyCode),
  }));

  // Conflict detection
  const conflicts = detectConflicts(pricingRules);

  const handleNewRule = () => {
    const newRule = createDefaultPricingRule();
    newRule.id = `rule-${Date.now()}`;
    newRule.name = 'New Rule';
    setEditRule(newRule);
    setIsDialogOpen(true);
  };

  const handleEditRule = (rule: PricingRule) => {
    setEditRule({ ...rule });
    setIsDialogOpen(true);
  };

  const handleSaveRule = () => {
    if (!editRule) return;
    if (pricingRules.find(r => r.id === editRule.id)) {
      updatePricingRule(editRule.id, editRule);
    } else {
      addPricingRule(editRule);
    }
    setIsDialogOpen(false);
    setEditRule(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pricing Rules</h2>
          <p className="text-sm text-muted-foreground">Rules determine how prices are calculated. Higher-priority rules override lower ones.</p>
        </div>
        <Button onClick={handleNewRule}><Plus className="h-4 w-4 mr-2" /> Add Rule</Button>
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-700">Rule conflicts detected</p>
              <p className="text-xs text-amber-600">{conflicts.length} rules may conflict with each other. Review priority levels.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules Table */}
      {pricingRules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>No pricing rules yet. Click &quot;Add Rule&quot; to create one, or rules will use business settings defaults.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Target Margin</TableHead>
                  <TableHead className="text-right">Min Margin</TableHead>
                  <TableHead>Rounding</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingRules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell><Badge variant="outline">{rule.level}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {rule.level === 'global' ? 'All products' : rule.level === 'category' ? rule.targetCategory : rule.level === 'brand' ? rule.targetBrand : rule.level === 'channel' ? rule.targetChannel : rule.targetProductSku || rule.targetProductId}
                    </TableCell>
                    <TableCell className="text-right">{formatPercentage(rule.targetMarginPercent)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(rule.minimumMarginPercent)}</TableCell>
                    <TableCell className="text-xs">{rule.roundingRule}</TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
                      <Switch checked={rule.isActive} onCheckedChange={checked => updatePricingRule(rule.id, { isActive: checked })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => handleEditRule(rule)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => duplicatePricingRule(rule.id)}><Copy className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete &quot;{rule.name}&quot;?</AlertDialogTitle>
                              <AlertDialogDescription>This rule will be permanently removed and all products using it will fall back to other rules or defaults.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deletePricingRule(rule.id)}>Delete</AlertDialogAction>
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
      )}

      {/* Rounding Rules Preview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rounding Rules Preview</CardTitle>
          <CardDescription>See how each rounding rule transforms a price of {formatCurrency(examplePrice, businessSettings.currencyCode)}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {roundingPreviews.map(item => (
              <div key={item.rule} className="p-2 rounded border text-center">
                <div className="text-xs text-muted-foreground">{item.rule}</div>
                <div className="text-sm font-semibold">{item.result}</div>
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          <div className="flex items-center gap-3">
            <Label className="text-sm">Global Rounding Rule:</Label>
            <Select value={businessSettings.defaultRoundingRule} onValueChange={v => updateBusinessSettings({ defaultRoundingRule: v as RoundingRule })}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUNDING_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Rule Priority Explanation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How Rule Priority Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>When multiple rules could apply to a product, PricePilot selects the rule with the highest specificity:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>Product-level</strong> rules (most specific — applies to a single SKU)</li>
              <li><strong>Channel-level</strong> rules (applies to products sold on a specific channel)</li>
              <li><strong>Brand-level</strong> rules (applies to all products of a brand)</li>
              <li><strong>Category-level</strong> rules (applies to all products in a category)</li>
              <li><strong>Global</strong> rules (least specific — fallback for everything)</li>
            </ol>
            <p>If two rules have the same level, the one with the higher <strong>priority</strong> number wins.</p>
          </div>
        </CardContent>
      </Card>

      {/* Edit Rule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRule?.id && pricingRules.find(r => r.id === editRule.id) ? 'Edit Rule' : 'New Rule'}</DialogTitle>
          </DialogHeader>

          {editRule && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="ruleName">Rule Name</Label>
                <Input id="ruleName" value={editRule.name} onChange={e => setEditRule({ ...editRule, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Level</Label>
                  <Select value={editRule.level} onValueChange={v => setEditRule({ ...editRule, level: v as RuleLevel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVEL_OPTIONS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Input type="number" value={editRule.priority} onChange={e => setEditRule({ ...editRule, priority: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              {editRule.level === 'category' && (
                <div>
                  <Label>Target Category</Label>
                  <Select value={editRule.targetCategory || ''} onValueChange={v => setEditRule({ ...editRule, targetCategory: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editRule.level === 'brand' && (
                <div>
                  <Label>Target Brand</Label>
                  <Select value={editRule.targetBrand || ''} onValueChange={v => setEditRule({ ...editRule, targetBrand: v })}>
                    <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                    <SelectContent>
                      {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editRule.level === 'channel' && (
                <div>
                  <Label>Target Channel</Label>
                  <Select value={editRule.targetChannel || ''} onValueChange={v => setEditRule({ ...editRule, targetChannel: v })}>
                    <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                    <SelectContent>
                      {channels.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editRule.level === 'product' && (
                <div>
                  <Label>Target Product SKU</Label>
                  <Select value={editRule.targetProductSku || ''} onValueChange={v => setEditRule({ ...editRule, targetProductSku: v })}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {skus.map(s => <SelectItem key={s.sku} value={s.sku}>{s.sku} — {s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Target Margin (%)</Label>
                  <Input type="number" value={editRule.targetMarginPercent} onChange={e => setEditRule({ ...editRule, targetMarginPercent: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Minimum Margin (%)</Label>
                  <Input type="number" value={editRule.minimumMarginPercent} onChange={e => setEditRule({ ...editRule, minimumMarginPercent: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Maximum Margin (%)</Label>
                  <Input type="number" value={editRule.maximumMarginPercent} onChange={e => setEditRule({ ...editRule, maximumMarginPercent: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Rounding Rule</Label>
                  <Select value={editRule.roundingRule} onValueChange={v => setEditRule({ ...editRule, roundingRule: v as RoundingRule })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROUNDING_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch checked={editRule.isActive} onCheckedChange={checked => setEditRule({ ...editRule, isActive: checked })} />
                <Label>Active</Label>
              </div>

              <div>
                <Label>Notes</Label>
                <Input value={editRule.notes} onChange={e => setEditRule({ ...editRule, notes: e.target.value })} placeholder="Optional notes about this rule" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRule}>Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function detectConflicts(rules: PricingRule[]): PricingRule[] {
  const conflicts: PricingRule[] = [];
  const byLevel = rules.filter(r => r.isActive).reduce<Record<string, PricingRule[]>>((acc, r) => {
    const key = `${r.level}-${r.targetCategory || ''}-${r.targetBrand || ''}-${r.targetChannel || ''}-${r.targetProductId || ''}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  for (const group of Object.values(byLevel)) {
    if (group.length > 1) {
      // Same level + same target, multiple rules = conflict if same priority
      const priorities = group.map(r => r.priority);
      if (priorities.some(p => priorities.filter(x => x === p).length > 1)) {
        conflicts.push(...group);
      }
    }
  }

  return conflicts;
}

export default PricingRulesPage;
