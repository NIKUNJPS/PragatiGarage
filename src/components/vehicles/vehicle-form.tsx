'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Car } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { cn, normalizeVehicleNumber } from '@/lib/utils';
import { vehicleSchema } from '@/lib/validations';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import { CustomerPicker } from '@/components/customers/customer-picker';
import type { CustomerDTO, VehicleDTO, VehicleType } from '@/types';

const formSchema = vehicleSchema;
type FormValues = z.input<typeof formSchema>;

/** Common Indian two- and four-wheeler brands, offered as a datalist. */
const BIKE_BRANDS = [
  'Hero', 'Honda', 'Bajaj', 'TVS', 'Royal Enfield', 'Yamaha', 'Suzuki', 'KTM',
  'Jawa', 'Ola Electric', 'Ather', 'Vespa',
];
const CAR_BRANDS = [
  'Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Toyota', 'Honda', 'Kia',
  'Renault', 'Volkswagen', 'Skoda', 'MG', 'Ford', 'Nissan',
];

export function VehicleForm({
  vehicle,
  presetCustomer,
  onSuccess,
  onCancel,
  submitLabel,
}: {
  vehicle?: VehicleDTO | null;
  presetCustomer?: CustomerDTO | null;
  onSuccess: (vehicle: VehicleDTO) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(vehicle);

  const [customer, setCustomer] = React.useState<CustomerDTO | null>(
    vehicle
      ? ({
          id: vehicle.customer.id,
          name: vehicle.customer.name,
          mobileNumber: vehicle.customer.mobileNumber,
        } as CustomerDTO)
      : (presetCustomer ?? null),
  );

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleNumber: vehicle?.vehicleNumber ?? '',
      vehicleType: vehicle?.vehicleType ?? 'BIKE',
      brand: vehicle?.brand ?? '',
      model: vehicle?.model ?? '',
      year: vehicle?.year ?? undefined,
      color: vehicle?.color ?? '',
      odometer: vehicle?.odometer ?? undefined,
      customerId: vehicle?.customer.id ?? presetCustomer?.id ?? '',
    },
  });

  const vehicleType = watch('vehicleType') as VehicleType;

  React.useEffect(() => {
    setValue('customerId', customer?.id ?? '', { shouldValidate: false });
  }, [customer, setValue]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      isEdit
        ? api.patch<VehicleDTO>(`/api/vehicles/${vehicle!.id}`, values)
        : api.post<VehicleDTO>('/api/vehicles', values),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle added', saved.vehicleNumber);
      onSuccess(saved);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        toast.error('Could not save vehicle', errorMessage(error));
      }
    },
  });

  const brands = vehicleType === 'CAR' ? CAR_BRANDS : BIKE_BRANDS;

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
      <div>
        <Label required>Vehicle type</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(['BIKE', 'CAR'] as VehicleType[]).map((type) => {
            const Icon = type === 'CAR' ? Car : Bike;
            const active = vehicleType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setValue('vehicleType', type, { shouldValidate: true })}
                aria-pressed={active}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {type === 'CAR' ? 'Car' : 'Bike'}
              </button>
            );
          })}
        </div>
        <FieldError message={errors.vehicleType?.message} />
      </div>

      <div>
        <Label htmlFor="vehicleNumber" required>
          Vehicle number
        </Label>
        <Input
          id="vehicleNumber"
          {...register('vehicleNumber', {
            onChange: (e) => {
              e.target.value = normalizeVehicleNumber(e.target.value);
            },
          })}
          placeholder="MH12AB1234"
          autoCapitalize="characters"
          spellCheck={false}
          invalid={!!errors.vehicleNumber}
          className="mt-1.5 font-mono uppercase tracking-wide"
        />
        <FieldError message={errors.vehicleNumber?.message} />
        <FieldHint>Spaces and dashes are removed automatically.</FieldHint>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            list="vehicle-brands"
            {...register('brand')}
            placeholder={vehicleType === 'CAR' ? 'Maruti Suzuki' : 'Hero'}
            className="mt-1.5"
          />
          <datalist id="vehicle-brands">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <FieldError message={errors.brand?.message} />
        </div>

        <div>
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            {...register('model')}
            placeholder={vehicleType === 'CAR' ? 'Swift VXi' : 'Splendor Plus'}
            className="mt-1.5"
          />
          <FieldError message={errors.model?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            type="number"
            inputMode="numeric"
            {...register('year')}
            placeholder="2021"
            className="mt-1.5"
          />
          <FieldError message={errors.year?.message} />
        </div>
        <div>
          <Label htmlFor="color">Colour</Label>
          <Input id="color" {...register('color')} placeholder="Red" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="odometer">Odometer (km)</Label>
          <Input
            id="odometer"
            type="number"
            inputMode="numeric"
            {...register('odometer')}
            placeholder="24500"
            className="mt-1.5"
          />
          <FieldError message={errors.odometer?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="customer" required>
          Owner
        </Label>
        <div className="mt-1.5">
          <CustomerPicker
            id="customer"
            value={customer}
            onChange={setCustomer}
            invalid={!!errors.customerId}
          />
        </div>
        <input type="hidden" {...register('customerId')} />
        <FieldError message={errors.customerId?.message} />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          {submitLabel ?? (isEdit ? 'Save changes' : 'Add vehicle')}
        </Button>
      </div>
    </form>
  );
}
