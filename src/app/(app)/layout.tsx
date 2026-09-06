import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { getGarage } from '@/lib/garage';
import { prisma } from '@/lib/prisma';
import { serializeGarage } from '@/lib/serializers';
import { AppShell } from '@/components/layout/app-shell';
import { SessionProvider } from '@/hooks/use-session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // A completely empty installation goes to first-admin creation instead.
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect('/welcome');

  const garage = await getGarage();

  return (
    <SessionProvider initial={{ user, garage: serializeGarage(garage) }}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
