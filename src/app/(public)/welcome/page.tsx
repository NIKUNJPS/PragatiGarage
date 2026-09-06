'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { firstAdminSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';

type FormValues = z.input<typeof firstAdminSchema>;

/**
 * First-run screen: creates the single ADMIN account. The API refuses this once
 * any user exists, so it cannot be abused after installation.
 */
export default function WelcomePage() {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(firstAdminSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post('/api/auth/bootstrap', values),
    onSuccess: () => {
      router.replace('/setup');
      router.refresh();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) {
        setFormError(errorMessage(error, 'Could not create the account.'));
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Create the owner account
        </CardTitle>
        <CardDescription>
          This is the garage owner (admin) login with full access. You can add staff logins
          afterwards.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {formError && (
          <p
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {formError}
          </p>
        )}

        <form
          onSubmit={handleSubmit((values) => {
            setFormError(null);
            mutation.mutate(values);
          })}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="name" required>
              Your name
            </Label>
            <Input
              id="name"
              autoFocus
              placeholder="e.g. Suresh Patel"
              invalid={!!errors.name}
              className="mt-1.5"
              {...register('name')}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="owner@garage.com"
              invalid={!!errors.email}
              className="mt-1.5"
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div>
            <Label htmlFor="password" required>
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              invalid={!!errors.password}
              className="mt-1.5"
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
            <FieldHint>Use at least 8 characters with a letter and a number.</FieldHint>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Create account and continue
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already set up?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
