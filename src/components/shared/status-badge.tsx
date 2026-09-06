import { CheckCircle2, CircleDot, Clock, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { JobStatus, PaymentStatus } from '@/types';

/**
 * Status is never communicated by colour alone: every badge carries an icon and
 * a text label so it stays readable for colour-blind users and in print.
 */
const JOB_STATUS = {
  PENDING: { label: 'Pending', variant: 'pending' as const, icon: Clock },
  IN_PROGRESS: { label: 'In Progress', variant: 'progress' as const, icon: Wrench },
  COMPLETED: { label: 'Completed', variant: 'completed' as const, icon: CheckCircle2 },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = JOB_STATUS[status] ?? JOB_STATUS.PENDING;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon aria-hidden /> {config.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return status === 'PAID' ? (
    <Badge variant="paid">
      <CheckCircle2 aria-hidden /> Paid
    </Badge>
  ) : (
    <Badge variant="unpaid">
      <CircleDot aria-hidden /> Unpaid
    </Badge>
  );
}

export function VehicleTypeBadge({ type }: { type: 'BIKE' | 'CAR' }) {
  return (
    <Badge variant="muted">
      {type === 'CAR' ? 'Car' : 'Bike'}
    </Badge>
  );
}

export const JOB_STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
];
