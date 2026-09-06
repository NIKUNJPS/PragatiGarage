import { Suspense } from 'react';

import { prisma } from '@/lib/prisma';
import { LoginForm } from '@/app/(public)/login/login-form';
import { Skeleton } from '@/components/ui/misc';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  // A brand-new installation should create the owner account, not try to log in.
  let needsFirstAdmin = false;
  let dbReachable = true;
  try {
    needsFirstAdmin = (await prisma.user.count()) === 0;
  } catch (error) {
    console.error('[login] database unreachable:', error);
    dbReachable = false;
  }

  return (
    <Suspense fallback={<Skeleton className="h-80 w-full rounded-lg" />}>
      <LoginForm needsFirstAdmin={needsFirstAdmin} dbReachable={dbReachable} />
    </Suspense>
  );
}
