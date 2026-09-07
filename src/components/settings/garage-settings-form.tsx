'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { garageSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError, FieldHint } from '@/components/ui/misc';
import { LogoUploader } from '@/components/settings/logo-uploader';
import type { GarageDTO } from '@/types';

type FormValues = z.input<typeof garageSchema>;

const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (Rs.)' },
  { value: 'USD', label: 'US Dollar ($)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'AED', label: 'UAE Dirham (AED)' },
  { value: 'AUD', label: 'Australian Dollar (A$)' },
  { value: 'CAD', label: 'Canadian Dollar (C$)' },
];

/**
 * The full garage profile form. Reused as the body of the setup wizard's last
 * step and as the standalone settings page.
 */
export function GarageSettingsForm({
  garage,
  onSaved,
  submitLabel = 'Save changes',
  showLogo = true,
}: {
  garage: GarageDTO;
  onSaved?: (garage: GarageDTO) => void;
  submitLabel?: string;
  showLogo?: boolean;
}) {
  const toast = useToast();
  const { refresh } = useSession();
  const [currentLogo, setCurrentLogo] = React.useState(garage);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(garageSchema),
    defaultValues: {
      name: garage.name,
      address: garage.address,
      phone: garage.phone,
      whatsappNumber: garage.whatsappNumber,
      gstNumber: garage.gstNumber,
      tagline: garage.tagline,
      email: garage.email,
      currency: garage.currency as FormValues['currency'],
      invoicePrefix: garage.invoicePrefix,
      invoiceNextNumber: garage.invoiceNextNumber,
      jobCardPrefix: garage.jobCardPrefix,
      jobCardNextNumber: garage.jobCardNextNumber,
      defaultTaxRate: garage.defaultTaxRate,
      invoiceTerms: garage.invoiceTerms,
      sessionTimeoutMin: garage.sessionTimeoutMin,
    },
  });

  const currency = watch('currency');

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.put<GarageDTO>('/api/garage', values),
    onSuccess: (saved) => {
      refresh();
      toast.success('Settings saved');
      onSaved?.(saved);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) toast.error('Could not save settings', errorMessage(error));
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
      {/* --------------------------------------------------- business details */}
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showLogo && (
            <LogoUploader
              garage={currentLogo}
              garageName={watch('name') || garage.name}
              onChange={(g) => {
                setCurrentLogo(g);
                refresh();
              }}
            />
          )}

          <div>
            <Label htmlFor="name" required>
              Garage name
            </Label>
            <Input id="name" className="mt-1.5" invalid={!!errors.name} {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>

          <div>
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              className="mt-1.5"
              placeholder="e.g. PLACE WHERE QUALITY AND SERVICE MEET"
              {...register('tagline')}
            />
            <FieldError message={errors.tagline?.message} />
            <FieldHint>Shown under your garage name on invoices.</FieldHint>
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              rows={2}
              className="mt-1.5"
              placeholder="Shop no., street, area, city, PIN"
              {...register('address')}
            />
            <FieldError message={errors.address?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" className="mt-1.5" {...register('phone')} />
              <FieldError message={errors.phone?.message} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1.5" {...register('email')} />
              <FieldError message={errors.email?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="whatsappNumber">WhatsApp business number</Label>
              <Input
                id="whatsappNumber"
                type="tel"
                className="mt-1.5"
                {...register('whatsappNumber')}
              />
              <FieldError message={errors.whatsappNumber?.message} />
              <FieldHint>Shown to customers on shared invoices.</FieldHint>
            </div>
            <div>
              <Label htmlFor="gstNumber">GST / Tax number</Label>
              <Input id="gstNumber" className="mt-1.5" {...register('gstNumber')} />
              <FieldError message={errors.gstNumber?.message} />
            </div>
          </div>

          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={currency}
              onValueChange={(value) => setValue('currency', value as FormValues['currency'])}
            >
              <SelectTrigger id="currency" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- numbering */}
      <Card>
        <CardHeader>
          <CardTitle>Document numbering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="jobCardPrefix">Job card prefix</Label>
              <Input id="jobCardPrefix" className="mt-1.5 font-mono" {...register('jobCardPrefix')} />
              <FieldError message={errors.jobCardPrefix?.message} />
            </div>
            <div>
              <Label htmlFor="jobCardNextNumber">Next job card number</Label>
              <Input
                id="jobCardNextNumber"
                type="number"
                className="mt-1.5"
                {...register('jobCardNextNumber')}
              />
              <FieldError message={errors.jobCardNextNumber?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="invoicePrefix">Invoice prefix</Label>
              <Input id="invoicePrefix" className="mt-1.5 font-mono" {...register('invoicePrefix')} />
              <FieldError message={errors.invoicePrefix?.message} />
            </div>
            <div>
              <Label htmlFor="invoiceNextNumber">Next invoice number</Label>
              <Input
                id="invoiceNextNumber"
                type="number"
                className="mt-1.5"
                {...register('invoiceNextNumber')}
              />
              <FieldError message={errors.invoiceNextNumber?.message} />
            </div>
          </div>

          <FieldHint>
            Use <code className="rounded bg-muted px-1">{'{YYYY}'}</code>,{' '}
            <code className="rounded bg-muted px-1">{'{YY}'}</code> or{' '}
            <code className="rounded bg-muted px-1">{'{MM}'}</code> in a prefix for the year or month,
            e.g. <code className="rounded bg-muted px-1">JC-{'{YYYY}'}-</code> becomes{' '}
            <span className="font-mono">JC-{new Date().getFullYear()}-0001</span>.
          </FieldHint>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------- invoice + tax */}
      <Card>
        <CardHeader>
          <CardTitle>Invoicing &amp; security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="defaultTaxRate">Default tax / GST rate (%)</Label>
              <Input
                id="defaultTaxRate"
                type="number"
                step="any"
                className="mt-1.5"
                {...register('defaultTaxRate')}
              />
              <FieldError message={errors.defaultTaxRate?.message} />
              <FieldHint>Pre-filled on every new invoice; editable per invoice.</FieldHint>
            </div>
            <div>
              <Label htmlFor="sessionTimeoutMin">Auto sign-out after (minutes)</Label>
              <Input
                id="sessionTimeoutMin"
                type="number"
                className="mt-1.5"
                {...register('sessionTimeoutMin')}
              />
              <FieldError message={errors.sessionTimeoutMin?.message} />
              <FieldHint>Signs out an idle device on a shared counter.</FieldHint>
            </div>
          </div>

          <div>
            <Label htmlFor="invoiceTerms">Invoice footer / terms</Label>
            <Textarea
              id="invoiceTerms"
              rows={2}
              className="mt-1.5"
              placeholder="Thank you for your business."
              {...register('invoiceTerms')}
            />
            <FieldError message={errors.invoiceTerms?.message} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={isSubmitting || mutation.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
