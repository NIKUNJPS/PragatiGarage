import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { SetupWizard } from '@/components/settings/setup-wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Setup' };

export default async function SetupPage() {
  const user = await getCurrentUser();
  // Only the owner configures the garage; staff are sent back to work.
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/dashboard');

  return <SetupWizard />;
}
