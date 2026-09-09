'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Download, PartyPopper, Printer, Undo2 } from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { formatCurrency } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { WhatsAppShareButton } from '@/components/invoices/whatsapp-share-button';
import type { InvoiceView } from '@/lib/invoice-data';

export function InvoiceDetailView({ invoiceId }: { invoiceId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage } = useSession();
  const justCreated = useSearchParams().get('created') === '1';

  const [payOpen, setPayOpen] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState('Cash');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => api.get<InvoiceView>(`/api/invoices/${invoiceId}`),
  });

  const paymentMutation = useMutation({
    mutationFn: (payload: { paymentStatus: 'PAID' | 'UNPAID'; paymentMethod?: string }) =>
      api.patch<InvoiceView>(`/api/invoices/${invoiceId}`, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['invoices', invoiceId], updated);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      setPayOpen(false);
      toast.success(
        updated.paymentStatus === 'PAID' ? 'Marked as paid' : 'Marked as unpaid',
        `${updated.invoiceNumber} updated.`,
      );
    },
    onError: (err) => toast.error('Could not update payment status', errorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-[600px] rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load this invoice"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const isPaid = data.paymentStatus === 'PAID';

  return (
    <div>
      <PageHeader
        backHref="/invoices"
        backLabel="All invoices"
        title={data.invoiceNumber}
        description={
          <>
            {data.customer.name} ·{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(data.totalAmount, garage.currency)}
            </span>
          </>
        }
        actions={
          <>
            <WhatsAppShareButton invoice={data} onUpdated={() => void refetch()} />

            {/* Free "time for your next service" WhatsApp reminder for this vehicle. */}
            <WhatsAppShareButton
              invoice={data}
              mode="service"
              variant="outline"
              onUpdated={() => void refetch()}
            />

            <Button variant="outline" asChild>
              <a href={`/api/invoices/${data.id}/pdf`} download={`${data.invoiceNumber}.pdf`}>
                <Download /> Download PDF
              </a>
            </Button>

            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>

            {isPaid ? (
              <Button
                variant="outline"
                onClick={() => paymentMutation.mutate({ paymentStatus: 'UNPAID' })}
                loading={paymentMutation.isPending}
              >
                <Undo2 /> Mark unpaid
              </Button>
            ) : (
              <Button variant="success" onClick={() => setPayOpen(true)}>
                <CheckCircle2 /> Mark as paid
              </Button>
            )}
          </>
        }
      />

      {justCreated && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 no-print sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-sm">
            <PartyPopper className="h-5 w-5 shrink-0" />
            <span>
              <span className="font-semibold">Invoice {data.invoiceNumber} created.</span> Send it to{' '}
              {data.customer.name} on WhatsApp
              {data.customer.whatsappNumber || data.customer.mobileNumber
                ? ` (${data.customer.whatsappNumber || data.customer.mobileNumber})`
                : ''}
              .
            </span>
          </span>
          <WhatsAppShareButton invoice={data} onUpdated={() => void refetch()} />
        </div>
      )}

      {!isPaid && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900 no-print sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm">
            <span className="font-semibold">Payment pending</span> -{' '}
            {formatCurrency(data.totalAmount, garage.currency)} is yet to be collected.
          </span>
          {/* Free one-click payment reminder over WhatsApp (wa.me). */}
          <WhatsAppShareButton
            invoice={data}
            mode="reminder"
            variant="outline"
            size="sm"
            onUpdated={() => void refetch()}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground no-print">
        <Link href={`/job-cards/${data.jobCard.id}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <ClipboardList className="h-3.5 w-3.5" /> Job card {data.jobCard.jobCardNumber}
        </Link>
        <Link href={`/customers/${data.customer.id}`} className="hover:text-foreground">
          Customer profile
        </Link>
        <a
          href={`/i/${data.publicToken}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          Public invoice link
        </a>
      </div>

      <InvoiceDocument invoice={data} />

      {/* ------------------------------------------------------- mark as paid */}
      <AlertDialog open={payOpen} onOpenChange={setPayOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {data.invoiceNumber} as paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This records {formatCurrency(data.totalAmount, garage.currency)} as collected today and
              counts it towards your revenue.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div>
            <Label htmlFor="paymentMethod">Payment method</Label>
            <Input
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Cash / UPI / Card"
              className="mt-1.5"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Cash', 'UPI', 'Card', 'Bank transfer'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                paymentMutation.mutate({ paymentStatus: 'PAID', paymentMethod });
              }}
            >
              Confirm payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
