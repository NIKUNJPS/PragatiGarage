'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { z } from 'zod';

import { api, errorMessage } from '@/lib/client-api';
import { forgotPasswordSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/misc';

type FormValues = z.input<typeof forgotPasswordSchema>;

interface ForgotResponse {
  message: string;
  /** Present only in local development with no email provider configured. */
  devResetUrl?: string;
}

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState<ForgotResponse | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post<ForgotResponse>('/api/auth/forgot-password', values),
    onSuccess: (data) => setSent(data),
    onError: (error) => setFormError(errorMessage(error)),
  });

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Check your email
          </CardTitle>
          <CardDescription>{sent.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent.devResetUrl && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="mb-1.5 font-semibold">
                Development mode - no email provider configured
              </p>
              <p className="mb-2">Use this link to reset the password:</p>
              <Link
                href={sent.devResetUrl}
                className="break-all font-mono underline underline-offset-2"
              >
                {sent.devResetUrl}
              </Link>
            </div>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">
              <ChevronLeft /> Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we will send you a link to choose a new one.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {formError && (
          <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              placeholder="you@garage.com"
              invalid={!!errors.email}
              className="mt-1.5"
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Send reset link
          </Button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
