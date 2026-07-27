'use client';

import { Badge } from '@/components/ui/badge';
import { PricingStatus } from '@/lib/pricepilot/types';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle, TrendingUp, DollarSign, Eye, Info } from 'lucide-react';

const statusConfig: Record<PricingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; colorClass: string; icon: React.ElementType }> = {
  'loss-making': { label: 'Loss-making', variant: 'destructive', colorClass: 'bg-red-100 text-red-800 border-red-300', icon: XCircle },
  'below-break-even': { label: 'Below break-even', variant: 'destructive', colorClass: 'bg-orange-100 text-orange-800 border-orange-300', icon: AlertTriangle },
  'low-margin': { label: 'Low margin', variant: 'secondary', colorClass: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertTriangle },
  'healthy': { label: 'Healthy', variant: 'default', colorClass: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
  'high-margin': { label: 'High margin', variant: 'default', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: TrendingUp },
  'above-market': { label: 'Above market', variant: 'outline', colorClass: 'bg-blue-100 text-blue-800 border-blue-300', icon: DollarSign },
  'missing-data': { label: 'Missing data', variant: 'outline', colorClass: 'bg-gray-100 text-gray-800 border-gray-300', icon: Info },
  'needs-review': { label: 'Needs review', variant: 'outline', colorClass: 'bg-purple-100 text-purple-800 border-purple-300', icon: Eye },
  'approved': { label: 'Approved', variant: 'default', colorClass: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
};

export function StatusBadge({ status, className }: { status: PricingStatus; className?: string }) {
  const config = statusConfig[status] || statusConfig['missing-data'];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`${config.colorClass} font-medium gap-1 ${className || ''}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default StatusBadge;
