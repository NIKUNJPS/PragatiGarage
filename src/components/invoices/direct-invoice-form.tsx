'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FileText, History, Plus, Trash2, User } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { cn, formatCurrency, formatDate, round2 } from '@/lib/utils';
import { directInvoiceSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError, FieldHint } from '@/components/ui/misc';
import { VehiclePicker } from '@/components/vehicles/vehicle-picker';
import type { InvoiceItemKind, VehicleDTO } from '@/types';
import type { InvoiceView } from '@/lib/invoice-data';

type FormValues = z.input<typeof directInvoiceSchema>;

const KIND_OPTIONS: Array<{ value: InvoiceItemKind; label: string }> = [
  { value: 'PART', label: 'Part' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'SERVICE', label: 'Service' },
];

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
      discount: 0,
      paymentStatus: 'UNPAID',
      paymentMethod: '',
      notes: '',
    },
  });

  const items = useFieldArray({ control, name: 'items' });

  React.useEffect(() => {
    setValue('vehicleId', vehicle?.id ?? '');
  }, [vehicle, setValue]);

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
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
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
              Add parts, labour and service charges. Amount = quantity x rate.
            </p>
          </div>
          <span className="text-sm font-semibold">{formatCurrency(subtotal, garage.currency)}</span>
        </CardHeader>
        <CardContent className="space-y-2">
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
                    placeholder="Description (e.g. Engine oil, Labour)"
                    aria-label="Description"
                    invalid={!!errors.items?.[index]?.description}
                    {...register(`items.${index}.description` as const)}
                  />
                  <FieldError message={errors.items?.[index]?.description?.message} />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <Select
                    value={watchedItems[index]?.kind ?? 'PART'}
                    onValueChange={(value) => setValue(`items.${index}.kind`, value as InvoiceItemKind)}
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
                    disabled={items.fields.length === 1}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          {typeof errors.items?.message === 'string' && <FieldError message={errors.items.message} />}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => items.append({ kind: 'PART', description: '', quantity: 1, unitPrice: 0 })}
          >
            <Plus /> Add line item
          </Button>
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
