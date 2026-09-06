'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage, qs } from '@/lib/client-api';
import { customerSchema } from '@/lib/validations';
import { useDebounce } from '@/hooks/use-debounce';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import type { CustomerDTO } from '@/types';

// The form works with raw strings; the shared zod schema does the normalising.
const formSchema = customerSchema;
type FormValues = z.input<typeof formSchema>;

export function CustomerForm({
  customer,
  onSuccess,
  onCancel,
  submitLabel,
  defaultName,
}: {
  customer?: CustomerDTO | null;
  onSuccess: (customer: CustomerDTO) => void;
  onCancel?: () => void;
  submitLabel?: string;
  defaultName?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(customer);

  const [sameAsMobile, setSameAsMobile] = React.useState(
    !customer || !customer.whatsappNumber || customer.whatsappNumber === customer.mobileNumber,
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
      name: customer?.name ?? defaultName ?? '',
      mobileNumber: customer?.mobileNumber ?? '',
      whatsappNumber: customer?.whatsappNumber ?? '',
      address: customer?.address ?? '',
      notes: customer?.notes ?? '',
    },
  });

  const mobileNumber = watch('mobileNumber') ?? '';
  const debouncedMobile = useDebounce(mobileNumber, 500);

  // Keep the WhatsApp field mirrored while "same as mobile" is ticked.
  React.useEffect(() => {
    if (sameAsMobile) setValue('whatsappNumber', mobileNumber);
  }, [sameAsMobile, mobileNumber, setValue]);

  // Warn (never block) when the mobile number already belongs to somebody.
  const { data: duplicateCheck } = useQuery({
    queryKey: ['customer-duplicate', debouncedMobile, customer?.id],
    queryFn: () =>
      api.get<{ duplicate: { id: string; name: string; vehicleCount: number } | null }>(
        `/api/customers/check${qs({ mobile: debouncedMobile, excludeId: customer?.id })}`,
      ),
    enabled: debouncedMobile.replace(/\D/g, '').length >= 10,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      isEdit
        ? api.patch<CustomerDTO>(`/api/customers/${customer!.id}`, values)
        : api.post<CustomerDTO>('/api/customers', values),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Customer updated' : 'Customer added', saved.name);
      onSuccess(saved);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        toast.error('Could not save customer', errorMessage(error));
      }
    },
  });

  const duplicate = duplicateCheck?.duplicate;

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
      <div>
        <Label htmlFor="name" required>
          Customer name
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="e.g. Ramesh Kumar"
          autoComplete="name"
          invalid={!!errors.name}
          className="mt-1.5"
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div>
        <Label htmlFor="mobileNumber" required>
          Mobile number
        </Label>
        <Input
          id="mobileNumber"
          type="tel"
          inputMode="tel"
          {...register('mobileNumber')}
          placeholder="9876543210"
          autoComplete="tel"
          invalid={!!errors.mobileNumber}
          className="mt-1.5"
        />
        <FieldError message={errors.mobileNumber?.message} />

        {duplicate && !errors.mobileNumber && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs">
              <span className="font-semibold">{duplicate.name}</span> already uses this number (
              {duplicate.vehicleCount} vehicle{duplicate.vehicleCount === 1 ? '' : 's'}).{' '}
              <Link href={`/customers/${duplicate.id}`} className="underline underline-offset-2">
                Open that customer
              </Link>{' '}
              or continue if this is a different person.
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="whatsappNumber">WhatsApp number</Label>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={sameAsMobile}
              onCheckedChange={(checked) => setSameAsMobile(checked === true)}
              className="h-4 w-4"
            />
            Same as mobile
          </label>
        </div>
        <Input
          id="whatsappNumber"
          type="tel"
          inputMode="tel"
          {...register('whatsappNumber')}
          placeholder="9876543210"
          disabled={sameAsMobile}
          invalid={!!errors.whatsappNumber}
          className="mt-1.5"
        />
        <FieldError message={errors.whatsappNumber?.message} />
        <FieldHint>Used to send invoices on WhatsApp.</FieldHint>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          {...register('address')}
          rows={2}
          placeholder="Shop / street / area, city"
          className="mt-1.5"
        />
        <FieldError message={errors.address?.message} />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          {submitLabel ?? (isEdit ? 'Save changes' : 'Add customer')}
        </Button>
      </div>
    </form>
  );
}
