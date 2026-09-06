'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { createUserSchema } from '@/lib/validations';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldError, FieldHint } from '@/components/ui/misc';
import type { UserDTO } from '@/types';

type FormValues = z.input<typeof createUserSchema>;

interface CreateResult {
  data: UserDTO;
  emailSent: boolean;
  showCredentials: boolean;
}

/** Generates a friendly starter password the owner can share. */
function suggestPassword(): string {
  const words = ['Spark', 'Gear', 'Wheel', 'Motor', 'Turbo', 'Piston', 'Chain', 'Brake'];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}@${Math.floor(1000 + Math.random() * 9000)}`;
}

export function StaffDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (user: UserDTO) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = React.useState<{ email: string; password: string } | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: suggestPassword(), role: 'STAFF' },
  });

  const role = watch('role');
  const password = watch('password');

  React.useEffect(() => {
    if (open) {
      reset({ name: '', email: '', password: suggestPassword(), role: 'STAFF' });
      setCredentials(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post<CreateResult>('/api/users', values),
    onSuccess: (result, values) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved?.(result.data);
      if (result.showCredentials) {
        // No email provider: show the credentials once so the owner can pass them on.
        setCredentials({ email: values.email, password: values.password });
      } else {
        toast.success('Staff added', `${result.data.name} can now sign in.`);
        onOpenChange(false);
      }
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) toast.error('Could not add staff', errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle>Staff account created</DialogTitle>
              <DialogDescription>
                Share these sign-in details with them. This password is shown only once.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <CredRow label="Email" value={credentials.email} />
              <CredRow label="Password" value={credentials.password} mono />
            </div>

            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`)
                  .then(() => toast.success('Copied to clipboard'))
                  .catch(() => toast.error('Could not copy'));
              }}
            >
              <Copy /> Copy details
            </Button>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add staff login</DialogTitle>
              <DialogDescription>
                Create a login for a mechanic or front-desk staff member.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
              <div>
                <Label htmlFor="staffName" required>
                  Name
                </Label>
                <Input
                  id="staffName"
                  className="mt-1.5"
                  invalid={!!errors.name}
                  {...register('name')}
                />
                <FieldError message={errors.name?.message} />
              </div>

              <div>
                <Label htmlFor="staffEmail" required>
                  Email
                </Label>
                <Input
                  id="staffEmail"
                  type="email"
                  className="mt-1.5"
                  invalid={!!errors.email}
                  {...register('email')}
                />
                <FieldError message={errors.email?.message} />
              </div>

              <div>
                <Label htmlFor="staffPassword" required>
                  Temporary password
                </Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    id="staffPassword"
                    className="font-mono"
                    invalid={!!errors.password}
                    {...register('password')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Generate password"
                    onClick={() => setValue('password', suggestPassword())}
                  >
                    <KeyRound />
                  </Button>
                </div>
                <FieldError message={errors.password?.message} />
                <FieldHint>They can change this after signing in.</FieldHint>
              </div>

              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={(value) => setValue('role', value as 'ADMIN' | 'STAFF')}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff - day-to-day work</SelectItem>
                    <SelectItem value="ADMIN">Admin - full access</SelectItem>
                  </SelectContent>
                </Select>
                <FieldHint>
                  {role === 'ADMIN'
                    ? 'Admins can change settings, manage users and delete records.'
                    : 'Staff can manage customers, vehicles and job cards, but not settings or deletions.'}
                </FieldHint>
              </div>

              <input type="hidden" value={password} readOnly />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={mutation.isPending}>
                  Add staff
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CredRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono font-semibold' : 'font-semibold'}>{value}</span>
    </div>
  );
}
