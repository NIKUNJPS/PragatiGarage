'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FileText, History, User } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { directInvoiceSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import { VehiclePicker } from '@/components/vehicles/vehicle-picker';
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
import type { VehicleDTO } from '@/types';
import type { InvoiceView } from '@/lib/invoice-data';

type FormValues = z.input<typeof directInvoiceSchema>;

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Direct invoice entry - no job card needed first. Pick (or add) a vehicle,
 * choose the date, type the line items, set paid/unpaid, and the invoice + its
 * job card are created in one go. Perfect for entering past bills by hand.
 */
export function DirectInvoiceForm({ presetVehicle }: { presetVehicle?: VehicleDTO | null }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage } = useSession();

  const [vehicle, setVehicle] = React.useState<VehicleDTO | null>(presetVehicle ?? null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(directInvoiceSchema),
    defaultValues: {
      vehicleId: presetVehicle?.id ?? '',
      issueDate: todayInput(),
      complaint: '',
      workPerformed: '',
      odometer: presetVehicle?.odometer ?? undefined,
      items: [{ kind: 'LABOUR', description: '', quantity: 1, unitPrice: 0 }],
      taxRate: garage.defaultTaxRate,
      discountType: 'NONE',
      discountValue: 0,
      paymentStatus: 'UNPAID',
      paymentAmount: undefined,
      paymentMethod: '',
      paymentReference: '',
      notes: '',
    },
  });

  // One key per form instance: a double-click or retry cannot record the payment twice.
  const idempotencyKey = React.useMemo(newIdempotencyKey, []);


  React.useEffect(() => {
    setValue('vehicleId', vehicle?.id ?? '');
  }, [vehicle, setValue]);

  const { totals, errors: previewErrors } = useBillingPreview(watch);
  const subtotal = totals.subtotal;
  const grandTotal = totals.totalAmount;

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post<InvoiceView>('/api/invoices/direct', values),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      toast.success('Invoice created', `${invoice.invoiceNumber} saved.`);
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
      {/* ------------------------------------------------- vehicle + date */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle &amp; date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="vehicle" required>
                Vehicle
              </Label>
              <div className="mt-1.5">
                <VehiclePicker
                  id="vehicle"
                  value={vehicle}
                  onChange={setVehicle}
                  invalid={!!errors.vehicleId}
                />
              </div>
              <input type="hidden" {...register('vehicleId')} />
              <FieldError message={errors.vehicleId?.message} />
              <FieldHint>
                Same vehicle number? Just pick it - this is added as a new dated visit.
              </FieldHint>
            </div>

            <div>
              <Label htmlFor="issueDate" required>
                Invoice date
              </Label>
              <div className="relative mt-1.5">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="issueDate"
                  type="date"
                  max={todayInput()}
                  className="pl-9"
                  invalid={!!errors.issueDate}
                  {...register('issueDate')}
                />
              </div>
              <FieldError message={errors.issueDate?.message} />
              <FieldHint>Set an older date to record a past bill.</FieldHint>
            </div>
          </div>

          {vehicle && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/40 p-3 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{vehicle.customer.name}</span>
                <span className="text-muted-foreground">{vehicle.customer.mobileNumber}</span>
              </span>
              {vehicle.jobCardCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <History className="h-4 w-4" />
                  {vehicle.jobCardCount} past visit{vehicle.jobCardCount === 1 ? '' : 's'}
                  {vehicle.lastServiceAt ? ` · last ${formatDate(vehicle.lastServiceAt)}` : ''}
                </span>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="odometer">Odometer (km)</Label>
              <Input
                id="odometer"
                type="number"
                inputMode="numeric"
                placeholder="24500"
                className="mt-1.5"
                {...register('odometer')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- line items */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Line items</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Spare parts use quantity × rate; labour &amp; service take a single amount. Every line
              adds into the total.
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

      {/* --------------------------------------------- work notes (optional) */}
      <Card>
        <CardHeader>
          <CardTitle>Work details (optional)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="complaint">Customer complaint</Label>
            <Textarea id="complaint" rows={2} className="mt-1.5" {...register('complaint')} />
          </div>
          <div>
            <Label htmlFor="workPerformed">Work performed</Label>
            <Textarea id="workPerformed" rows={2} className="mt-1.5" {...register('workPerformed')} />
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------- tax / payment / total */}
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
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} className="mt-1.5" {...register('notes')} />
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
  );
}
