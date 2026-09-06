'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, errorMessage } from '@/lib/client-api';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { JOB_STATUS_OPTIONS } from '@/components/shared/status-badge';
import type { JobCardListItemDTO, JobStatus } from '@/types';

const TRIGGER_STYLES: Record<JobStatus, string> = {
  PENDING: 'border-amber-300 bg-amber-50 text-amber-900',
  IN_PROGRESS: 'border-blue-300 bg-blue-50 text-blue-900',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

/**
 * Inline status changer used in the job-card list, so a mechanic can move a job
 * along without opening it. Completing a job offers to raise the invoice.
 */
export function StatusSelect({
  jobCard,
  onChanged,
}: {
  jobCard: Pick<JobCardListItemDTO, 'id' | 'status' | 'jobCardNumber'> & {
    invoice?: { id: string } | null;
  };
  onChanged?: (status: JobStatus) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [promptInvoice, setPromptInvoice] = React.useState(false);

  const mutation = useMutation({
    mutationFn: (status: JobStatus) =>
      api.patch<{ status: JobStatus; promptInvoice: boolean }>(
        `/api/job-cards/${jobCard.id}/status`,
        { status },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Status updated', `${jobCard.jobCardNumber} is now ${label(result.status)}.`);
      onChanged?.(result.status);
      if (result.promptInvoice) setPromptInvoice(true);
    },
    onError: (error) => toast.error('Could not update status', errorMessage(error)),
  });

  return (
    <>
      <Select
        value={jobCard.status}
        onValueChange={(value) => mutation.mutate(value as JobStatus)}
        disabled={mutation.isPending}
      >
        <SelectTrigger
          className={`h-9 w-[160px] text-xs font-semibold ${TRIGGER_STYLES[jobCard.status]}`}
          aria-label={`Change status of ${jobCard.jobCardNumber}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {JOB_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={promptInvoice} onOpenChange={setPromptInvoice}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Job completed - generate the invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {jobCard.jobCardNumber} is marked completed. The invoice will be pre-filled with every
              part, labour and service charge on this job card. You can still edit it before saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push(`/invoices/new?jobCardId=${jobCard.id}`)}>
              Generate invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function label(status: JobStatus): string {
  return JOB_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}
