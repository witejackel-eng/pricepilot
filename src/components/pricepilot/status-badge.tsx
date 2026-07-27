'use client';

import { Badge } from '@/components/ui/badge';
import { PricingStatus } from '@/lib/pricepilot/types';
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, DollarSign, Eye, Info } from 'lucide-react';

const statusConfig: Record<PricingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; colorClass: string; icon: React.ElementType }> = {
  'loss-making': { label: 'Loss-making', variant: 'destructive', colorClass: 'bg-red-100/80 text-red-700 border border-red-300', icon: XCircle },
  'below-break-even': { label: 'Below break-even', variant: 'destructive', colorClass: 'bg-orange-100/80 text-orange-700 border border-orange-300', icon: AlertTriangle },
  'low-margin': { label: 'Low margin', variant: 'secondary', colorClass: 'bg-amber-100/80 text-amber-700 border border-amber-300', icon: AlertTriangle },
  'healthy': { label: 'Healthy', variant: 'default', colorClass: 'bg-emerald-100/80 text-emerald-700 border border-emerald-300', icon: CheckCircle },
  'high-margin': { label: 'High margin', variant: 'default', colorClass: 'bg-teal-100/80 text-teal-700 border border-teal-300', icon: TrendingUp },
  'above-market': { label: 'Above market', variant: 'outline', colorClass: 'bg-blue-100/80 text-blue-700 border border-blue-300', icon: DollarSign },
  'missing-data': { label: 'Missing data', variant: 'outline', colorClass: 'bg-slate-100/80 text-slate-600 border border-slate-300', icon: Info },
  'needs-review': { label: 'Needs review', variant: 'outline', colorClass: 'bg-violet-100/80 text-violet-700 border border-violet-300', icon: Eye },
  'approved': { label: 'Approved', variant: 'default', colorClass: 'bg-emerald-100/80 text-emerald-700 border border-emerald-300', icon: CheckCircle },
};

export function StatusBadge({ status, className }: { status: PricingStatus; className?: string }) {
  const config = statusConfig[status] || statusConfig['missing-data'];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`${config.colorClass} rounded-lg font-medium gap-1 px-2.5 py-0.5 shadow-sm transition-all duration-200 hover:shadow-md ${className || ''}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </Badge>
  );
}

export default StatusBadge;
