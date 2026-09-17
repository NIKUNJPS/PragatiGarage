'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { formatCurrency, prettyVehicleNumber } from '@/lib/utils';
import { createInvoiceSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { DirectInvoiceForm } from '@/components/invoices/direct-invoice-form';
import { InvoiceItemsField } from '@/components/invoices/invoice-items-field';
import {
  BillSummary,
  DiscountTaxFields,
  InitialPaymentFields,
  applyBillingErrors,
  initialPaymentError,
  newIdempotencyKey,
  useBillingPreview,
} from '@/components/invoices/billing-fields';
import type { JobCardDetailDTO } from '@/types';
import type { InvoiceView } from '@/lib/invoice-data';

type FormValues = z.input<typeof createInvoiceSchema>;

export function NewInvoiceView() {
  const jobCardId = useSearchParams().get('jobCardId');
  const { garage } = useSession();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['job-cards', jobCardId],
    queryFn: () => api.get<JobCardDetailDTO>(`/api/job-cards/${jobCardId}`),
    enabled: Boolean(jobCardId),
  });

  // No job card given -> direct invoice entry (also used for past bills).
  if (!jobCardId) {
    return (
      <div>
        <PageHeader
          backHref="/invoices"
          backLabel="All invoices"
          title="New invoice"
          description={
            <>
              Enter a bill directly - pick or add the vehicle, set the date, and add the charges.
              It will be numbered{' '}
              <span className="font-mono font-semibold text-foreground">
                {garage.nextInvoiceNumberPreview}
              </span>
              . Already have a completed job card?{' '}
              <Link href="/job-cards?status=COMPLETED" className="text-primary hover:underline">
                Bill it from there
              </Link>
              .
            </>
          }
        />
        <DirectInvoiceForm />
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load that job card"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  if (data.invoice) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="This job card is already invoiced"
          description={`Invoice ${data.invoice.invoiceNumber} was already generated for ${data.jobCardNumber}.`}
          action={
            <Button asChild>
              <Link href={`/invoices/${data.invoice.id}`}>Open invoice</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return <InvoiceForm jobCard={data} />;
}

function InvoiceForm({ jobCard }: { jobCard: JobCardDetailDTO }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage } = useSession();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      jobCardId: jobCard.id,
      // Everything from the job card is pre-filled and stays editable.
      items: [
        ...jobCard.parts.map((p) => ({
          kind: 'PART' as const,
          description: p.partName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })),
        ...jobCard.labourCharges.map((l) => ({
          kind: 'LABOUR' as const,
          description: l.description,
          quantity: 1,
          unitPrice: l.amount,
        })),
        ...jobCard.serviceCharges.map((s) => ({
          kind: 'SERVICE' as const,
          description: s.description,
          quantity: 1,
          unitPrice: s.amount,
        })),
      ],
      taxRate: garage.defaultTaxRate,
      discountType: 'NONE',
      discountValue: 0,
      paymentStatus: 'UNPAID',
      paymentMethod: '',
      paymentReference: '',
      notes: '',
    },
  });

  // One key per form instance: a double-click or retry cannot record the payment twice.
  const idempotencyKey = React.useMemo(newIdempotencyKey, []);
  const { totals, errors: previewErrors } = useBillingPreview(watch);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post<InvoiceView>('/api/invoices', values),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      toast.success('Invoice created', `${invoice.invoiceNumber} is ready to share.`);
      router.push(`/invoices/${invoice.id}?created=1`);
      router.refresh();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        toast.error('Could not create invoice', errorMessage(error));
      }
    },
  });

  return (
    <div>
      <PageHeader
        backHref={`/job-cards/${jobCard.id}`}
        backLabel={`Back to ${jobCard.jobCardNumber}`}
        title="Generate invoice"
        description={
          <>
            For {jobCard.customer.name} ·{' '}
            <span className="font-mono">{prettyVehicleNumber(jobCard.vehicle.vehicleNumber)}</span> ·
            will be numbered{' '}
            <span className="font-mono font-semibold text-foreground">
              {garage.nextInvoiceNumberPreview}
            </span>
          </>
        }
      />

      <form
        onSubmit={handleSubmit((values) => {
          if (applyBillingErrors(previewErrors, setError)) return;
          const paymentError = initialPaymentError(values, totals, garage.currency);
          if (paymentError) {
            setError('paymentAmount', { type: 'billing', message: paymentError });
            return;
          }
          mutation.mutate({ ...values, expectedTotal: totals.totalAmount, idempotencyKey });
        })}
        className="space-y-4 pb-24 lg:pb-4"
      >
        <input type="hidden" {...register('jobCardId')} />

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Line items</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Pulled in from {jobCard.jobCardNumber}. Edit anything before saving.
              </p>
            </div>
            <span className="text-sm font-semibold">{formatCurrency(totals.subtotal, garage.currency)}</span>
          </CardHeader>
          <CardContent>
            <InvoiceItemsField
              control={control}
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
              currency={garage.currency}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Discount, tax &amp; payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <DiscountTaxFields
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                currency={garage.currency}
                previewErrors={previewErrors}
              />
              <InitialPaymentFields
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                totals={totals}
                currency={garage.currency}
              />
              <div>
                <Label htmlFor="notes">Notes on the invoice</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  placeholder="e.g. Next service due after 3000 km"
                  className="mt-1.5"
                  {...register('notes')}
                />
              </div>
            </CardContent>
          </Card>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <BillSummary totals={totals} currency={garage.currency} />
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 lg:justify-end">
            <div className="text-sm lg:hidden">
              <p className="text-xs text-muted-foreground">Total payable</p>
              <p className="font-bold">{formatCurrency(totals.totalAmount, garage.currency)}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting || mutation.isPending}>
                <FileText /> Create invoice
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
