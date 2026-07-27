'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Calculator, HelpCircle, TrendingUp, Package } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/pricepilot/formatting';

export function HelpSection({ currencyCode = 'INR' }: { currencyCode?: string }) {
  const [markupExample, setMarkupExample] = useState({ cost: 100, sellingPrice: 150 });
  const markup = ((markupExample.sellingPrice - markupExample.cost) / markupExample.cost) * 100;
  const margin = ((markupExample.sellingPrice - markupExample.cost) / markupExample.sellingPrice) * 100;

  const sections = [
    {
      id: 'markup-vs-margin',
      icon: TrendingUp,
      title: 'Markup vs Margin',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            These two metrics are often confused, but they measure profitability differently:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="bg-slate-50">
              <CardContent className="p-3">
                <h4 className="font-semibold text-sm mb-1">Markup</h4>
                <p className="text-xs text-muted-foreground mb-2">Profit as a percentage of cost</p>
                <p className="text-sm font-mono bg-white p-2 rounded border">
                  Markup = (Profit / Cost) × 100
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  e.g. Cost {formatCurrency(markupExample.cost, currencyCode)} → Sell {formatCurrency(markupExample.sellingPrice, currencyCode)} = {formatPercentage(markup)} markup
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-50">
              <CardContent className="p-3">
                <h4 className="font-semibold text-sm mb-1">Margin</h4>
                <p className="text-xs text-muted-foreground mb-2">Profit as a percentage of selling price</p>
                <p className="text-sm font-mono bg-white p-2 rounded border">
                  Margin = (Profit / Selling Price) × 100
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  e.g. Cost {formatCurrency(markupExample.cost, currencyCode)} → Sell {formatCurrency(markupExample.sellingPrice, currencyCode)} = {formatPercentage(margin)} margin
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">Try it:</span>
            <input
              type="number"
              value={markupExample.cost}
              onChange={e => setMarkupExample(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
              className="w-16 h-7 text-xs border rounded px-1"
              placeholder="Cost"
            />
            <span className="text-xs">→</span>
            <input
              type="number"
              value={markupExample.sellingPrice}
              onChange={e => setMarkupExample(prev => ({ ...prev, sellingPrice: parseFloat(e.target.value) || 0 }))}
              className="w-16 h-7 text-xs border rounded px-1"
              placeholder="Price"
            />
          </div>
        </div>
      ),
    },
    {
      id: 'break-even',
      icon: Calculator,
      title: 'Break-even Price',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The minimum selling price at which you cover all costs and fees without any profit. This is NOT just your cost — it includes percentage-based fees that are charged on the selling price itself.
          </p>
          <p className="text-sm font-mono bg-slate-50 p-3 rounded border">
            Break-even = (Total Landed Cost + Fixed Fees) / (1 - Total Percentage Fees)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Because marketplace commissions, payment fees, and taxes are percentages of the selling price, you cannot simply add a margin to cost. The formula accounts for fees that &quot;eat into&quot; your revenue.
          </p>
        </div>
      ),
    },
    {
      id: 'landed-cost',
      icon: Package,
      title: 'Landed Cost',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The true cost of getting a product to the point of sale, including all per-unit expenses:
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
            <li>Purchase / manufacturing cost</li>
            <li>Shipping / freight</li>
            <li>Packaging</li>
            <li>Handling / labour</li>
            <li>Expected return costs (returns × cost)</li>
            <li>Expected damage costs (damage rate × cost)</li>
            <li>Custom duty (if applicable)</li>
            <li>Other per-unit costs</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-1">
            Landed cost = Base cost + Expected return cost + Expected damage cost
          </p>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
          Pricing Concepts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sections.map(section => (
          <CollapsibleDemo key={section.id} section={section} />
        ))}
      </CardContent>
    </Card>
  );
}

function CollapsibleDemo({ section }: { section: { id: string; icon: React.ElementType; title: string; content: React.ReactNode } }) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = section.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-2 h-auto">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {section.title}
          </span>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-2 pr-2 pb-2">
        {section.content}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default HelpSection;
