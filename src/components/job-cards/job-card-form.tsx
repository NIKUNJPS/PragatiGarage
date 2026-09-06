'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, User, Wrench } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { cn, formatCurrency, round2 } from '@/lib/utils';
import { jobCardSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import { JOB_STATUS_OPTIONS } from '@/components/shared/status-badge';
import { VehiclePicker } from '@/components/vehicles/vehicle-picker';
import type { JobCardDetailDTO, JobStatus, VehicleDTO } from '@/types';

const formSchema = jobCardSchema;
type FormValues = z.input<typeof formSchema>;

export function JobCardForm({
  jobCard,
  presetVehicle,
}: {
  jobCard?: JobCardDetailDTO | null;
  presetVehicle?: VehicleDTO | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage } = useSession();
  const isEdit = Boolean(jobCard);

  const [vehicle, setVehicle] = React.useState<VehicleDTO | null>(
    jobCard?.vehicleFull ?? presetVehicle ?? null,
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleId: jobCard?.vehicleFull.id ?? presetVehicle?.id ?? '',
      complaint: jobCard?.complaint ?? '',
      workPerformed: jobCard?.workPerformed ?? '',
      status: jobCard?.status ?? 'PENDING',
      odometer: jobCard?.odometer ?? presetVehicle?.odometer ?? undefined,
      parts:
        jobCard?.parts.map((p) => ({
          partName: p.partName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })) ?? [],
      labourCharges:
        jobCard?.labourCharges.map((l) => ({ description: l.description, amount: l.amount })) ?? [],
      serviceCharges:
        jobCard?.serviceCharges.map((s) => ({ description: s.description, amount: s.amount })) ?? [],
    },
  });

  const parts = useFieldArray({ control, name: 'parts' });
  const labour = useFieldArray({ control, name: 'labourCharges' });
  const service = useFieldArray({ control, name: 'serviceCharges' });

  React.useEffect(() => {
    setValue('vehicleId', vehicle?.id ?? '');
  }, [vehicle, setValue]);

  // Watching the arrays keeps the totals live as rows are typed into.
  const watchedParts = watch('parts') ?? [];
  const watchedLabour = watch('labourCharges') ?? [];
  const watchedService = watch('serviceCharges') ?? [];
  const status = watch('status') as JobStatus;

  const partsTotal = round2(
    watchedParts.reduce((sum, p) => sum + num(p?.quantity) * num(p?.unitPrice), 0),
  );
  const labourTotal = round2(watchedLabour.reduce((sum, l) => sum + num(l?.amount), 0));
  const serviceTotal = round2(watchedService.reduce((sum, s) => sum + num(s?.amount), 0));
  const grandTotal = round2(partsTotal + labourTotal + serviceTotal);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      isEdit
        ? api.patch<JobCardDetailDTO>(`/api/job-cards/${jobCard!.id}`, values)
        : api.post<{ id: string; jobCardNumber: string; status: JobStatus }>('/api/job-cards', values),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(
        isEdit ? 'Job card updated' : 'Job card created',
        `${saved.jobCardNumber} saved successfully.`,
      );
      router.push(`/job-cards/${saved.id}`);
      router.refresh();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        toast.error('Could not save job card', errorMessage(error));
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-4 pb-24 lg:pb-4"
    >
      {/* ------------------------------------------------------------ vehicle */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle &amp; customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          </div>

          {vehicle && (
            <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{vehicle.customer.name}</p>
                <p className="text-muted-foreground">{vehicle.customer.mobileNumber}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Customer filled in automatically from the selected vehicle.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="odometer">Odometer reading (km)</Label>
              <Input
                id="odometer"
                type="number"
                inputMode="numeric"
                placeholder="24500"
                className="mt-1.5"
                {...register('odometer')}
              />
              <FieldError message={errors.odometer?.message} />
            </div>

            <div>
              <Label>Status</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {JOB_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setValue('status', option.value)}
                    aria-pressed={status === option.value}
                    className={cn(
                      'h-10 rounded-md border text-xs font-medium transition-colors',
                      status === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- complaint */}
      <Card>
        <CardHeader>
          <CardTitle>Work details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="complaint">Customer complaint</Label>
            <Textarea
              id="complaint"
              rows={3}
              placeholder="What did the customer report? e.g. Engine making noise, brakes not gripping..."
              className="mt-1.5"
              {...register('complaint')}
            />
            <FieldError message={errors.complaint?.message} />
          </div>

          <div>
            <Label htmlFor="workPerformed">Work performed</Label>
            <Textarea
              id="workPerformed"
              rows={3}
              placeholder="What was done? You can keep updating this as the work progresses."
              className="mt-1.5"
              {...register('workPerformed')}
            />
            <FieldError message={errors.workPerformed?.message} />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- parts used */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Parts used</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Line total is calculated as quantity x unit price.
            </p>
          </div>
          <span className="text-sm font-semibold">
            {formatCurrency(partsTotal, garage.currency)}
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          {parts.fields.length === 0 && (
            <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              No parts added yet.
            </p>
          )}

          {parts.fields.map((field, index) => {
            const lineTotal = round2(
              num(watchedParts[index]?.quantity) * num(watchedParts[index]?.unitPrice),
            );
            return (
              <div
                key={field.id}
                className="grid grid-cols-12 items-start gap-2 rounded-md border p-2 sm:border-0 sm:p-0"
              >
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    placeholder="Part name (e.g. Engine oil 1L)"
                    aria-label="Part name"
                    invalid={!!errors.parts?.[index]?.partName}
                    {...register(`parts.${index}.partName` as const)}
                  />
                  <FieldError message={errors.parts?.[index]?.partName?.message} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label="Quantity"
                    invalid={!!errors.parts?.[index]?.quantity}
                    {...register(`parts.${index}.quantity` as const)}
                  />
                  <FieldError message={errors.parts?.[index]?.quantity?.message} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="Rate"
                    aria-label="Unit price"
                    invalid={!!errors.parts?.[index]?.unitPrice}
                    {...register(`parts.${index}.unitPrice` as const)}
                  />
                  <FieldError message={errors.parts?.[index]?.unitPrice?.message} />
                </div>
                <div className="col-span-3 flex h-10 items-center justify-end pr-1 text-sm font-medium sm:col-span-2">
                  {formatCurrency(lineTotal, garage.currency)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove part"
                    onClick={() => parts.remove(index)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => parts.append({ partName: '', quantity: 1, unitPrice: 0 })}
          >
            <Plus /> Add part
          </Button>
        </CardContent>
      </Card>

      {/* --------------------------------------------------- labour + service */}
      <ChargeSection
        title="Labour charges"
        description="Mechanic time and workmanship."
        total={labourTotal}
        currency={garage.currency}
        fields={labour.fields}
        onAdd={() => labour.append({ description: '', amount: 0 })}
        onRemove={labour.remove}
        register={register}
        name="labourCharges"
        errors={errors.labourCharges}
        placeholder="e.g. Engine overhaul labour"
      />

      <ChargeSection
        title="Service charges"
        description="Washing, pickup, consumables and other services."
        total={serviceTotal}
        currency={garage.currency}
        fields={service.fields}
        onAdd={() => service.append({ description: '', amount: 0 })}
        onRemove={service.remove}
        register={register}
        name="serviceCharges"
        errors={errors.serviceCharges}
        placeholder="e.g. Full body wash"
      />

      {/* ------------------------------------------------------------ totals */}
      <Card>
        <CardContent className="p-4">
          <dl className="space-y-2 text-sm">
            <Row label="Parts" value={formatCurrency(partsTotal, garage.currency)} />
            <Row label="Labour" value={formatCurrency(labourTotal, garage.currency)} />
            <Row label="Service" value={formatCurrency(serviceTotal, garage.currency)} />
            <div className="flex items-center justify-between border-t pt-2.5 text-base font-bold">
              <dt>Total bill amount</dt>
              <dd>{formatCurrency(grandTotal, garage.currency)}</dd>
            </div>
          </dl>
          <FieldHint>
            The invoice can still be edited (discount, tax) before you finalise it.
          </FieldHint>
        </CardContent>
      </Card>

      {/* Sticky save bar keeps the action reachable on a phone */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 lg:justify-end">
          <div className="text-sm lg:hidden">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold">{formatCurrency(grandTotal, garage.currency)}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || mutation.isPending}>
              <Wrench /> {isEdit ? 'Save changes' : 'Create job card'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ChargeSection({
  title,
  description,
  total,
  currency,
  fields,
  onAdd,
  onRemove,
  register,
  name,
  errors,
  placeholder,
}: {
  title: string;
  description: string;
  total: number;
  currency: string;
  fields: { id: string }[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  register: UseFormRegister<FormValues>;
  name: 'labourCharges' | 'serviceCharges';
  // Loosely typed: react-hook-form's nested FieldErrors array shape is awkward
  // to name precisely, and we only ever read `.description`/`.amount` messages.
  errors?: unknown;
  placeholder: string;
}) {
  const errorAt = (index: number) =>
    (errors as Record<number, { description?: { message?: string }; amount?: { message?: string } } | undefined> | undefined)?.[index];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm font-semibold">{formatCurrency(total, currency)}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {fields.length === 0 && (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Nothing added yet.
          </p>
        )}

        {fields.map((field, index) => (
          <div key={field.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                placeholder={placeholder}
                aria-label="Description"
                invalid={!!errorAt(index)?.description}
                {...register(`${name}.${index}.description` as const)}
              />
              <FieldError message={errorAt(index)?.description?.message} />
            </div>
            <div className="w-28 shrink-0 sm:w-36">
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="Amount"
                aria-label="Amount"
                invalid={!!errorAt(index)?.amount}
                {...register(`${name}.${index}.amount` as const)}
              />
              <FieldError message={errorAt(index)?.amount?.message} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove charge"
              onClick={() => onRemove(index)}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus /> Add {title.toLowerCase().replace(' charges', '')} charge
        </Button>
      </CardContent>
    </Card>
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
