'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, User } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { cn, formatCurrency, prettyVehicleNumber, round2 } from '@/lib/utils';
import { editInvoiceFormSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/misc';
import { InvoiceItemsField } from '@/components/invoices/invoice-items-field';
import type { InvoiceView } from '@/lib/invoice-data';

type FormValues = z.input<typeof editInvoiceFormSchema>;

/**
 * Edit an existing invoice - fix the line items, tax, discount, payment status
 * and notes. The vehicle/customer stay as they are. Totals are recomputed on
 * the server, so what shows here always matches what is saved.
 */
export function EditInvoiceForm({ invoice }: { invoice: InvoiceView }) {
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
    resolver: zodResolver(editInvoiceFormSchema),
    defaultValues: {
      items: invoice.items.map((i) => ({
        kind: i.kind,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      taxRate: invoice.taxRate,
      discount: invoice.discount,
      paymentStatus: invoice.paymentStatus,
      paymentMethod: invoice.paymentMethod ?? '',
      notes: invoice.notes ?? '',
    },
  });

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
    mutationFn: (values: FormValues) => api.patch<InvoiceView>(`/api/invoices/${invoice.id}`, values),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      toast.success('Invoice updated', `${updated.invoiceNumber} saved.`);
      router.push(`/invoices/${invoice.id}`);
      router.refresh();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        toast.error('Could not update invoice', errorMessage(error));
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-4 pb-24 lg:pb-4"
    >
      {/* vehicle / customer (read-only) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{invoice.customer.name}</span>
            <span className="text-muted-foreground">{invoice.customer.mobileNumber}</span>
          </span>
          <span className="font-mono font-semibold">
            {prettyVehicleNumber(invoice.vehicle.vehicleNumber)}
          </span>
          <span className="text-muted-foreground">Invoice {invoice.invoiceNumber}</span>
        </CardContent>
      </Card>

      {/* line items */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Line items</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Spare parts use quantity × rate; labour &amp; service take a single amount.
            </p>
          </div>
          <span className="text-sm font-semibold">{formatCurrency(subtotal, garage.currency)}</span>
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

      {/* tax / payment / totals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tax, discount &amp; payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="taxRate">Tax / GST rate (%)</Label>
                <Input id="taxRate" type="number" step="any" className="mt-1.5" {...register('taxRate')} />
                <FieldError message={errors.taxRate?.message} />
              </div>
              <div>
                <Label htmlFor="discount">Discount ({garage.currency})</Label>
                <Input id="discount" type="number" step="any" className="mt-1.5" {...register('discount')} />
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
                    {option === 'PAID' ? 'Paid' : 'Pending (unpaid)'}
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
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} className="mt-1.5" {...register('notes')} />
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
                <Row label="Discount" value={`- ${formatCurrency(safeDiscount, garage.currency)}`} />
              )}
              <Row label={`Tax / GST (${taxRate || 0}%)`} value={formatCurrency(tax, garage.currency)} />
              <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
                <dt>Grand total</dt>
                <dd>{formatCurrency(grandTotal, garage.currency)}</dd>
              </div>
            </dl>
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
            <Button type="button" variant="outline" onClick={() => router.push(`/invoices/${invoice.id}`)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || mutation.isPending}>
              <Save /> Save changes
            </Button>
          </div>
        </div>
      </div>
    </form>
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
