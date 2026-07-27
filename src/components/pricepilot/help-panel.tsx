'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';
import { usePricePilotStore } from '@/store/pricepilot-store';
import {
  HelpCircle,
  ChevronDown,
  ChevronRight,
  FileUp,
  ClipboardCheck,
  CheckCircle2,
  Download,
  Home,
  Calculator,
  Package,
  TrendingUp,
  Info,
  X,
} from 'lucide-react';
import { useState } from 'react';

const GETTING_STARTED = [
  { step: 1, title: 'Import your price list', description: 'Upload an Excel or CSV file with your product names, costs, and current prices.', icon: FileUp },
  { step: 2, title: 'Review products needing attention', description: 'Check products that have missing data, low margins, or other pricing issues.', icon: ClipboardCheck },
  { step: 3, title: 'Approve suggested prices', description: 'Review PricePilot\'s recommended prices and approve the ones you want to use.', icon: CheckCircle2 },
  { step: 4, title: 'Apply approved prices', description: 'Once approved, apply the new prices to update your selling prices.', icon: CheckCircle2 },
  { step: 5, title: 'Download updated Excel', description: 'Export your updated price list as an Excel file to use in your business.', icon: Download },
];

const COMMON_QUESTIONS = [
  {
    q: 'How does PricePilot calculate recommended prices?',
    a: 'PricePilot considers your purchase cost, all fees (marketplace commission, payment gateway, shipping, packaging, return rate), your target margin, and tax treatment to calculate a price that ensures your desired profit.',
  },
  {
    q: 'What is the difference between "approve" and "apply"?',
    a: '"Approve" means you agree with the recommended price but it doesn\'t change your current selling price yet. "Apply" means you\'re ready to update the selling price to the approved amount. This two-step process gives you a chance to review all changes before committing.',
  },
  {
    q: 'Why is my product showing as "loss-making"?',
    a: 'A product is marked as loss-making when the selling price is below the total landed cost — meaning you lose money on every sale. This could be because the price is too low, fees are higher than expected, or purchase cost data is wrong.',
  },
  {
    q: 'What does "confidence" mean on a recommendation?',
    a: 'Confidence indicates how reliable the recommendation is. "High" means all data is present and the calculation is straightforward. "Medium" means some values might be estimated. "Low" means important data is missing and the recommendation may not be accurate.',
  },
  {
    q: 'Is my data safe?',
    a: 'All data is stored locally in your browser (localStorage). Nothing is ever sent to any server. You can download backups for extra safety.',
  },
  {
    q: 'What is Owner Mode vs Advanced Mode?',
    a: 'Owner Mode is designed for everyday pricing work — simple navigation, plain-language labels, focused workflows. Advanced Mode gives full access to pricing rules, price simulator, scenarios, and all configuration options. You can switch between them in Settings.',
  },
];

export function HelpPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { businessSettings, setCurrentView } = usePricePilotStore();
  const currencyCode = businessSettings.currencyCode;
  const [marginExample, setMarginExample] = useState({ cost: 100, sellingPrice: 150 });
  const [openQs, setOpenQs] = useState<Record<string, boolean>>({});

  const markup = ((marginExample.sellingPrice - marginExample.cost) / marginExample.cost) * 100;
  const margin = ((marginExample.sellingPrice - marginExample.cost) / marginExample.sellingPrice) * 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[540px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 pb-4 border-b border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-white">
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-emerald-600" />
            PricePilot Help
          </SheetTitle>
          <SheetDescription>Getting started, common questions, and pricing concepts</SheetDescription>
        </SheetHeader>

        <div className="p-6 space-y-6">
          {/* Getting Started */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Home className="h-4 w-4 text-emerald-600" />
              Getting Started
            </h3>
            <div className="space-y-2">
              {GETTING_STARTED.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="flex items-start gap-3 p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/30">
                    <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-xs">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Common Questions */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-emerald-600" />
              Common Questions
            </h3>
            <div className="space-y-2">
              {COMMON_QUESTIONS.map(item => (
                <Collapsible
                  key={item.q}
                  open={openQs[item.q]}
                  onOpenChange={(open) => setOpenQs(prev => ({ ...prev, [item.q]: open }))}
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-2 h-auto text-left">
                      <span className="text-xs font-medium">{item.q}</span>
                      {openQs[item.q] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-2 pr-2 pb-2">
                    <p className="text-xs text-muted-foreground">{item.a}</p>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>

          <Separator />

          {/* Interactive examples */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-emerald-600" />
              Interactive Pricing Example
            </h3>
            <Card className="bg-emerald-50/50 border-emerald-200/30">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Try it:</span>
                  <span className="text-xs">Cost =</span>
                  <input
                    type="number"
                    value={marginExample.cost}
                    onChange={e => setMarginExample(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-16 h-7 text-xs border rounded px-1 bg-white"
                  />
                  <span className="text-xs">→</span>
                  <span className="text-xs">Price =</span>
                  <input
                    type="number"
                    value={marginExample.sellingPrice}
                    onChange={e => setMarginExample(prev => ({ ...prev, sellingPrice: parseFloat(e.target.value) || 0 }))}
                    className="w-16 h-7 text-xs border rounded px-1 bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded p-2 border border-emerald-200/30">
                    <p className="text-xs text-muted-foreground">Markup</p>
                    <p className="font-semibold text-sm">{formatPercentage(markup)}</p>
                    <p className="text-xs text-muted-foreground">Profit as % of cost</p>
                  </div>
                  <div className="bg-white rounded p-2 border border-emerald-200/30">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="font-semibold text-sm">{formatPercentage(margin)}</p>
                    <p className="text-xs text-muted-foreground">Profit as % of selling price</p>
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-emerald-200/30">
                  <p className="text-xs text-muted-foreground">Profit per product</p>
                  <p className="font-semibold text-sm">{formatCurrency(marginExample.sellingPrice - marginExample.cost, currencyCode)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Plain-language glossary */}
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-600" />
              Plain-Language Glossary
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Purchase Cost</Badge>
                <span className="text-muted-foreground">What you pay to buy or make the product (also called &quot;Gross Purchase Cost&quot; in Advanced Mode)</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Selling Fees</Badge>
                <span className="text-muted-foreground">All percentage-based fees charged on the selling price (marketplace commission + payment gateway + other fees) (also called &quot;Total Percentage-Based Fees&quot;)</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Profit per Product</Badge>
                <span className="text-muted-foreground">The money you earn on each successful sale after all costs and fees (also called &quot;Net Profit per Successful Sale&quot;)</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Lowest Safe Price</Badge>
                <span className="text-muted-foreground">The minimum price that covers all costs plus your minimum margin (also called &quot;Minimum Safe Recommendation&quot;)</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Recommended Selling Price</Badge>
                <span className="text-muted-foreground">The suggested price that meets your target profit margin (also called &quot;Balanced Recommendation&quot;)</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Expected Profit</Badge>
                <span className="text-muted-foreground">The projected profit at the recommended price (also called &quot;Projected Net Profit Outcome&quot;)</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">Landed Cost</Badge>
                <span className="text-muted-foreground">The true cost of getting a product ready for sale, including shipping, packaging, returns, and damage</span>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                <Badge variant="outline" className="text-xs shrink-0">GST Included</Badge>
                <span className="text-muted-foreground">When your selling price already includes GST/VAT. The customer pays one price and tax is part of it.</span>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default HelpPanel;
