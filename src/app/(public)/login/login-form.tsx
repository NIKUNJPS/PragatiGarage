'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Database, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

import { api, errorMessage } from '@/lib/client-api';
import { loginSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/misc';

type FormValues = z.input<typeof loginSchema>;

const REASONS: Record<string, string> = {
  expired: 'Your session has ended. Please sign in again.',
  timeout: 'You were signed out after a period of inactivity.',
  reset: 'Password updated. Sign in with your new password.',
};

export function LoginForm({
  needsFirstAdmin,
  dbReachable,
}: {
  needsFirstAdmin: boolean;
  dbReachable: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const next = params.get('next') || '/dashboard';
  const reason = params.get('reason');
  const notice = reason ? REASONS[reason] : null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => api.post('/api/auth/login', values),
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
    onError: (error) => setFormError(errorMessage(error, 'Could not sign in.')),
  });

  if (!dbReachable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Database className="h-5 w-5" /> Database not connected
          </CardTitle>
          <CardDescription>
            The app cannot reach its database, so nobody can sign in yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Check these, then reload this page:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> exists and{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> points at
              your PostgreSQL database.
            </li>
            <li>
              The database is running (locally:{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">docker compose up -d</code>).
            </li>
            <li>
              Tables have been created:{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run setup</code>.
            </li>
          </ol>
        </CardContent>
      </Card>
    );
  }

  if (needsFirstAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome - let&apos;s get you set up</CardTitle>
          <CardDescription>
            No accounts exist yet. Create the garage owner account to begin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <Link href="/welcome">
              Create owner account <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your email and password to continue.</CardDescription>
      </CardHeader>

      <CardContent>
        {notice && (
          <p className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            {notice}
          </p>
        )}

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
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@garage.com"
              invalid={!!errors.email}
              className="mt-1.5"
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                invalid={!!errors.password}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-accent"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <FieldError message={errors.password?.message} />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={watch('rememberMe') ?? true}
              onCheckedChange={(checked) => setValue('rememberMe', checked === true)}
            />
            <span>Keep me signed in on this device</span>
          </label>

          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
