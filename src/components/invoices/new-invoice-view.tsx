'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { cn, formatCurrency, prettyVehicleNumber, round2 } from '@/lib/utils';
import { createInvoiceSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState, FieldError, FieldHint, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { DirectInvoiceForm } from '@/components/invoices/direct-invoice-form';
import type { InvoiceItemKind, JobCardDetailDTO } from '@/types';
import type { InvoiceView } from '@/lib/invoice-data';

type FormValues = z.input<typeof createInvoiceSchema>;

const KIND_OPTIONS: Array<{ value: InvoiceItemKind; label: string }> = [
  { value: 'PART', label: 'Part' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'SERVICE', label: 'Service' },
];

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
      discount: 0,
      paymentStatus: 'UNPAID',
      paymentMethod: '',
      notes: '',
    },
  });

  const items = useFieldArray({ control, name: 'items' });

  const watchedItems = watch('items') ?? [];
  const taxRate = num(watch('taxRate'));
  const discount = num(watch('discount'));
  const paymentStatus = watch('paymentStatus');

  const subtotal = round2(
    watchedItems.reduce((sum, i) => sum + num(i?.quantity) * num(i?.unitPrice), 0),
  );
  const safeDiscount = round2(Math.min(Math.max(discount, 0), subtotal));
  const tax = round2(((subtotal - safeDiscount) * taxRate) / 100);
  const grandTotal = round2(subtotal - safeDiscount + tax);

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
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
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
          </CardHeader>
          <CardContent className="space-y-2">
            {items.fields.length === 0 && (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                No line items. Add at least one to create the invoice.
              </p>
            )}

            {items.fields.map((field, index) => {
              const lineTotal = round2(
                num(watchedItems[index]?.quantity) * num(watchedItems[index]?.unitPrice),
              );
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-12 items-start gap-2 rounded-md border p-2 sm:border-0 sm:p-0"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <Input
                      placeholder="Description"
                      aria-label="Description"
                      invalid={!!errors.items?.[index]?.description}
                      {...register(`items.${index}.description` as const)}
                    />
                    <FieldError message={errors.items?.[index]?.description?.message} />
                  </div>

                  <div className="col-span-5 sm:col-span-2">
                    <Select
                      value={watchedItems[index]?.kind ?? 'PART'}
                      onValueChange={(value) =>
                        setValue(`items.${index}.kind`, value as InvoiceItemKind)
                      }
                    >
                      <SelectTrigger aria-label="Item type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KIND_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-3 sm:col-span-1">
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      placeholder="Qty"
                      aria-label="Quantity"
                      invalid={!!errors.items?.[index]?.quantity}
                      {...register(`items.${index}.quantity` as const)}
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      placeholder="Rate"
                      aria-label="Unit price"
                      invalid={!!errors.items?.[index]?.unitPrice}
                      {...register(`items.${index}.unitPrice` as const)}
                    />
                  </div>

                  <div className="col-span-10 flex h-10 items-center justify-end pr-1 text-sm font-semibold sm:col-span-2">
                    {formatCurrency(lineTotal, garage.currency)}
                  </div>

                  <div className="col-span-2 flex justify-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line item"
                      onClick={() => items.remove(index)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {errors.items?.message && <FieldError message={errors.items.message as string} />}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                items.append({ kind: 'PART', description: '', quantity: 1, unitPrice: 0 })
              }
            >
              <Plus /> Add line item
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tax, discount &amp; payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="taxRate">Tax / GST rate (%)</Label>
                  <Input
                    id="taxRate"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="mt-1.5"
                    invalid={!!errors.taxRate}
                    {...register('taxRate')}
                  />
                  <FieldError message={errors.taxRate?.message} />
                  <FieldHint>Set to 0 if you do not charge GST.</FieldHint>
                </div>

                <div>
                  <Label htmlFor="discount">Discount ({garage.currency})</Label>
                  <Input
                    id="discount"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="mt-1.5"
                    invalid={!!errors.discount}
                    {...register('discount')}
                  />
                  <FieldError message={errors.discount?.message} />
                </div>
              </div>

              <div>
                <Label>Payment status</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(['UNPAID', 'PAID'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setValue('paymentStatus', option)}
                      aria-pressed={paymentStatus === option}
                      className={cn(
                        'h-10 rounded-md border text-sm font-medium transition-colors',
                        paymentStatus === option
                          ? option === 'PAID'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-input bg-background hover:bg-accent',
                      )}
                    >
                      {option === 'PAID' ? 'Paid now' : 'Unpaid'}
                    </button>
                  ))}
                </div>
              </div>

              {paymentStatus === 'PAID' && (
                <div>
                  <Label htmlFor="paymentMethod">Payment method</Label>
                  <Input
                    id="paymentMethod"
                    placeholder="Cash / UPI / Card"
                    className="mt-1.5"
                    {...register('paymentMethod')}
                  />
                </div>
              )}

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

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Row label="Subtotal" value={formatCurrency(subtotal, garage.currency)} />
                {safeDiscount > 0 && (
                  <Row
                    label="Discount"
                    value={`- ${formatCurrency(safeDiscount, garage.currency)}`}
                  />
                )}
                <Row
                  label={`Tax / GST (${taxRate || 0}%)`}
                  value={formatCurrency(tax, garage.currency)}
                />
                <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
                  <dt>Grand total</dt>
                  <dd>{formatCurrency(grandTotal, garage.currency)}</dd>
                </div>
              </dl>

              {discount > subtotal && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  The discount is larger than the subtotal, so it has been capped at{' '}
                  {formatCurrency(subtotal, garage.currency)}.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 lg:justify-end">
            <div className="text-sm lg:hidden">
              <p className="text-xs text-muted-foreground">Grand total</p>
              <p className="font-bold">{formatCurrency(grandTotal, garage.currency)}</p>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
