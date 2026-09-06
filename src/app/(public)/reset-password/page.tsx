'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { resetPasswordSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint, Skeleton } from '@/components/ui/misc';

type FormValues = z.input<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post('/api/auth/reset-password', values),
    onSuccess: () => router.replace('/login?reason=reset'),
    onError: (error) => {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    },
  });

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reset link not valid</CardTitle>
          <CardDescription>
            This link is missing its security token. Request a new one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Pick something you will remember, then sign in again.</CardDescription>
      </CardHeader>

      <CardContent>
        {formError && (
          <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <input type="hidden" {...register('token')} />

          <div>
            <Label htmlFor="password" required>
              New password
            </Label>
            <Input
              id="password"
              type="password"
              autoFocus
              autoComplete="new-password"
              invalid={!!errors.password}
              className="mt-1.5"
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
            <FieldHint>At least 8 characters, including a letter and a number.</FieldHint>
          </div>

          <div>
            <Label htmlFor="confirmPassword" required>
              Confirm new password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              invalid={!!errors.confirmPassword}
              className="mt-1.5"
              {...register('confirmPassword')}
            />
            <FieldError message={errors.confirmPassword?.message} />
          </div>

          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
