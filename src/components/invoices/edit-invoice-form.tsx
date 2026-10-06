'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Save, User } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { fromPaise, multiplyToPaise } from '@/lib/money';
import { formatCurrency, prettyVehicleNumber } from '@/lib/utils';
import { editInvoiceFormSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/misc';
import { InvoiceItemsField } from '@/components/invoices/invoice-items-field';
import {
  BillSummary,
  DiscountTaxFields,
  applyBillingErrors,
  useBillingPreview,
} from '@/components/invoices/billing-fields';
import { StaffNameFields } from '@/components/invoices/staff-name-fields';
import type { InvoiceView } from '@/lib/invoice-data';

type FormValues = z.input<typeof editInvoiceFormSchema>;

/**
 * Edit an existing invoice - line items, discount, tax and notes. Payments are
 * recorded separately on the invoice page. The preview here uses the same
 * calculator as the server, and the save is rejected if the two ever disagree.
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
      items: invoice.items.map((i) =>
        // Labour / service rows edit a single amount; fold any older qty > 1 into
        // it so the row shows exactly what it adds to the bill.
        i.kind !== 'PART' && i.quantity !== 1
          ? { kind: i.kind, description: i.description, quantity: 1, unitPrice: fromPaise(multiplyToPaise(i.quantity, i.unitPrice)) }
          : { kind: i.kind, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice },
      ),
      taxRate: invoice.taxRate,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      notes: invoice.notes ?? '',
      attendantName: invoice.attendantName ?? '',
      billedByName: invoice.billedByName ?? '',
      confirmOverpayment: false,
    },
  });

  const activePayments = invoice.payments.filter((p) => !p.isVoided);
  const { totals, errors: previewErrors } = useBillingPreview(watch, activePayments);
  const confirmOverpayment = watch('confirmOverpayment') ?? false;

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.patch<InvoiceView>(`/api/invoices/${invoice.id}`, values),
    onSuccess: (updated) => {
      queryClient.setQueryData(['invoices', invoice.id], updated);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
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
      onSubmit={handleSubmit((values) => {
        if (applyBillingErrors(previewErrors, setError)) return;
        if (totals.excessPaid > 0 && !values.confirmOverpayment) {
          setError('confirmOverpayment', {
            type: 'billing',
            message: 'Tick this box to confirm, or void a payment first.',
          });
          return;
        }
        mutation.mutate({ ...values, expectedTotal: totals.totalAmount });
      })}
      className="space-y-4 pb-24 lg:pb-4"
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{invoice.customer.name}</span>
            <span className="text-muted-foreground">{invoice.customer.mobileNumber}</span>
          </span>
          <span className="font-mono font-semibold">{prettyVehicleNumber(invoice.vehicle.vehicleNumber)}</span>
          <span className="text-muted-foreground">Invoice {invoice.invoiceNumber}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Line items</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Spare parts use quantity × rate; labour &amp; service take a single amount.
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

      <StaffNameFields
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        requireBiller={false}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Discount &amp; tax</CardTitle>
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
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} className="mt-1.5" {...register('notes')} />
            </div>
            <p className="text-xs text-muted-foreground">
              Payments are recorded on the invoice page, so the amount paid always matches real receipts.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <BillSummary totals={totals} currency={garage.currency} showPayments title="Updated bill" />

          {totals.excessPaid > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                The new total is less than what the customer already paid.
              </p>
              <p className="mt-1">
                {formatCurrency(totals.amountPaid, garage.currency)} has been received, so{' '}
                {formatCurrency(totals.excessPaid, garage.currency)} will show as excess received (to refund or
                adjust). No payment records are changed.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={confirmOverpayment}
                  onCheckedChange={(checked) => setValue('confirmOverpayment', checked === true)}
                />
                <span>I understand, save the reduced total</span>
              </label>
              <FieldError message={errors.confirmOverpayment?.message} />
            </div>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 lg:justify-end">
          <div className="text-sm lg:hidden">
            <p className="text-xs text-muted-foreground">Total payable</p>
            <p className="font-bold">{formatCurrency(totals.totalAmount, garage.currency)}</p>
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
