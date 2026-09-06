'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Hash, ImagePlus, MessageCircle, Store, Users } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { garageSchema } from '@/lib/validations';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint, Skeleton } from '@/components/ui/misc';
import { LogoUploader } from '@/components/settings/logo-uploader';
import { StaffDialog } from '@/components/settings/staff-dialog';
import type { GarageDTO, UserDTO } from '@/types';

const stepSchema = garageSchema.pick({
  name: true,
  address: true,
  phone: true,
  whatsappNumber: true,
  gstNumber: true,
  invoicePrefix: true,
  invoiceNextNumber: true,
  jobCardPrefix: true,
  jobCardNextNumber: true,
});
type FormValues = z.input<typeof stepSchema>;

const STEPS = [
  { icon: Store, title: 'Business details' },
  { icon: ImagePlus, title: 'Logo' },
  { icon: Hash, title: 'Numbering' },
  { icon: MessageCircle, title: 'WhatsApp' },
  { icon: Users, title: 'Staff' },
];

export function SetupWizard() {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useSession();
  const [step, setStep] = React.useState(0);
  const [logo, setLogo] = React.useState<GarageDTO | null>(null);
  const [staffOpen, setStaffOpen] = React.useState(false);

  const { data: garage, isLoading } = useQuery({
    queryKey: ['garage-setup'],
    queryFn: () => api.get<GarageDTO>('/api/garage'),
  });

  const { data: staff, refetch: refetchStaff } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: UserDTO[] }>('/api/users'),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(stepSchema) });

  React.useEffect(() => {
    if (garage) {
      setLogo(garage);
      reset({
        name: garage.name === 'My Garage' ? '' : garage.name,
        address: garage.address,
        phone: garage.phone,
        whatsappNumber: garage.whatsappNumber,
        gstNumber: garage.gstNumber,
        invoicePrefix: garage.invoicePrefix,
        invoiceNextNumber: garage.invoiceNextNumber,
        jobCardPrefix: garage.jobCardPrefix,
        jobCardNextNumber: garage.jobCardNextNumber,
      });
    }
  }, [garage, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.put<GarageDTO>('/api/garage', { ...values, setupCompleted: true }),
    onSuccess: () => {
      refresh();
      toast.success('Setup complete', 'Your garage is ready to go.');
      router.push('/dashboard');
      router.refresh();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) toast.error('Could not save', errorMessage(error));
    },
  });

  if (isLoading || !garage || !logo) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  // Validate only the fields that belong to the current step before advancing.
  const next = async () => {
    const fieldsByStep: Array<(keyof FormValues)[]> = [
      ['name', 'address', 'phone', 'gstNumber'],
      [],
      ['jobCardPrefix', 'jobCardNextNumber', 'invoicePrefix', 'invoiceNextNumber'],
      ['whatsappNumber'],
      [],
    ];
    const valid = await trigger(fieldsByStep[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Set up your garage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few quick details so your job cards and invoices look professional.
        </p>
      </div>

      {/* --------------------------------------------------------- step rail */}
      <div className="mb-6 flex items-center justify-between">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <React.Fragment key={s.title}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors',
                    done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : active
                        ? 'border-primary text-primary'
                        : 'border-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                </div>
                <span
                  className={cn(
                    'hidden text-[11px] font-medium sm:block',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('mx-1 h-0.5 flex-1', i < step ? 'bg-primary' : 'bg-muted')} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))}>
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step].title}</CardTitle>
            <CardDescription>{descriptions[step]}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Step 0 - business details */}
            <div className={cn('space-y-4', step !== 0 && 'hidden')}>
              <div>
                <Label htmlFor="name" required>
                  Garage name
                </Label>
                <Input
                  id="name"
                  className="mt-1.5"
                  placeholder="e.g. Sai Auto Works"
                  invalid={!!errors.name}
                  {...register('name')}
                />
                <FieldError message={errors.name?.message} />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" rows={2} className="mt-1.5" {...register('address')} />
                <FieldError message={errors.address?.message} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" className="mt-1.5" {...register('phone')} />
                  <FieldError message={errors.phone?.message} />
                </div>
                <div>
                  <Label htmlFor="gstNumber">GST / Tax number</Label>
                  <Input id="gstNumber" className="mt-1.5" {...register('gstNumber')} />
                  <FieldError message={errors.gstNumber?.message} />
                </div>
              </div>
            </div>

            {/* Step 1 - logo */}
            <div className={cn(step !== 1 && 'hidden')}>
              <LogoUploader
                garage={logo}
                garageName={logo.name}
                onChange={(g) => {
                  setLogo(g);
                  refresh();
                }}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                This is optional - you can add or change it later in Settings.
              </p>
            </div>

            {/* Step 2 - numbering */}
            <div className={cn('space-y-4', step !== 2 && 'hidden')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="jobCardPrefix">Job card prefix</Label>
                  <Input id="jobCardPrefix" className="mt-1.5 font-mono" {...register('jobCardPrefix')} />
                  <FieldError message={errors.jobCardPrefix?.message} />
                </div>
                <div>
                  <Label htmlFor="jobCardNextNumber">Start job cards at</Label>
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
                  <Label htmlFor="invoiceNextNumber">Start invoices at</Label>
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
                Tip: <code className="rounded bg-muted px-1">{'{YYYY}'}</code> in a prefix inserts the
                current year automatically.
              </FieldHint>
            </div>

            {/* Step 3 - whatsapp */}
            <div className={cn(step !== 3 && 'hidden')}>
              <Label htmlFor="whatsappNumber">WhatsApp business number</Label>
              <Input
                id="whatsappNumber"
                type="tel"
                className="mt-1.5"
                placeholder="9876543210"
                {...register('whatsappNumber')}
              />
              <FieldError message={errors.whatsappNumber?.message} />
              <FieldHint>
                Used when you share invoices with customers on WhatsApp and shown on their copy.
              </FieldHint>
            </div>

            {/* Step 4 - staff */}
            <div className={cn(step !== 4 && 'hidden')}>
              <p className="text-sm text-muted-foreground">
                Add logins for your mechanics and front-desk staff. They can manage customers,
                vehicles and job cards, but only you (admin) can change settings or delete records.
                You can skip this and add them later.
              </p>

              <div className="mt-4 space-y-2">
                {(staff?.data ?? []).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                      {member.role === 'ADMIN' ? 'Admin' : 'Staff'}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setStaffOpen(true)}
              >
                <Users /> Add a staff login
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- nav bar */}
        <div className="mt-4 flex items-center justify-between">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <span />
          )}

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => void next()}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button type="submit" loading={saveMutation.isPending}>
              <Check /> Finish setup
            </Button>
          )}
        </div>
      </form>

      <StaffDialog
        open={staffOpen}
        onOpenChange={setStaffOpen}
        onSaved={() => void refetchStaff()}
      />
    </div>
  );
}

const descriptions = [
  'Your garage name and contact details appear at the top of every invoice.',
  'Add your garage logo (optional).',
  'Choose how your job cards and invoices are numbered.',
  'The number customers see when you share invoices on WhatsApp.',
  'Invite the people who will use this system with you.',
];
