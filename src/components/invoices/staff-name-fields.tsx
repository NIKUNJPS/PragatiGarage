'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { EyeOff, HardHat, UserPen } from 'lucide-react';

import { api } from '@/lib/client-api';
import { nameKey } from '@/lib/staff-names';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import type { StaffNameSuggestions } from '@/types';

type AnyForm = {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
};

const BILLER_STORAGE_KEY = 'pragati.billedByName';

/** Remembers who made the last bill on this device, so the next bill is pre-filled. */
export function rememberBiller(name: string | null | undefined) {
  if (!name) return;
  try {
    window.localStorage.setItem(BILLER_STORAGE_KEY, name);
  } catch {
    // Private mode / storage blocked - the field simply starts empty next time.
  }
}

function readRememberedBiller(): string | null {
  try {
    return window.localStorage.getItem(BILLER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * "Car attendant" and "Bill created by" on the bill form. Free text, with the
 * names used on earlier bills offered as one-tap picks so each person is
 * always spelled the same way (that keeps the per-person reports accurate).
 */
export function StaffNameFields({
  register,
  watch,
  setValue,
  errors,
  requireBiller = true,
  prefillBiller = false,
}: AnyForm & {
  /** New bills must say who made them; older bills being edited may not have it. */
  requireBiller?: boolean;
  /** Pre-fill "Bill created by" with whoever made the last bill on this device. */
  prefillBiller?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ['invoices', 'staff-names'],
    queryFn: () => api.get<StaffNameSuggestions>('/api/invoices/staff-names'),
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    if (!prefillBiller) return;
    const saved = readRememberedBiller();
    if (saved && !watch('billedByName')) setValue('billedByName', saved);
    // Runs once on mount; later edits by the user must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Car attendant &amp; bill created by</CardTitle>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          For your records only - never shown on the customer&apos;s bill, PDF or WhatsApp message.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <NameField
          id="attendantName"
          label="Car attendant"
          placeholder="Mechanic who attended the vehicle"
          icon={HardHat}
          hint="Who worked on this vehicle. Optional."
          suggestions={data?.attendants ?? []}
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors?.attendantName?.message}
        />
        <NameField
          id="billedByName"
          label="Bill created by"
          placeholder="Your name"
          icon={UserPen}
          required={requireBiller}
          hint="The person making this bill. Remembered on this device for next time."
          suggestions={data?.billers ?? []}
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors?.billedByName?.message}
        />
      </CardContent>
    </Card>
  );
}

function NameField({
  id,
  label,
  placeholder,
  icon: Icon,
  hint,
  required,
  suggestions,
  register,
  watch,
  setValue,
  error,
}: Omit<AnyForm, 'errors'> & {
  id: 'attendantName' | 'billedByName';
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  required?: boolean;
  suggestions: string[];
  error?: string;
}) {
  const value: string = watch(id) ?? '';
  const listId = `${id}-suggestions`;
  const quickPicks = suggestions.slice(0, 5);

  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div className="relative mt-1.5">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          list={listId}
          autoComplete="off"
          maxLength={80}
          placeholder={placeholder}
          className="pl-9"
          invalid={!!error}
          {...register(id)}
        />
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      <FieldError message={error} />
      {quickPicks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Recent ${label.toLowerCase()} names`}>
          {quickPicks.map((name) => {
            const selected = nameKey(name) === nameKey(value);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                onClick={() => setValue(id, name, { shouldValidate: true, shouldDirty: true })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}
