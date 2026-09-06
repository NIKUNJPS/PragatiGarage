import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { SettingsView } from '@/components/settings/settings-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Settings is admin-only; the server enforces it and so does the API.
  if (user.role !== 'ADMIN') redirect('/dashboard');

  return <SettingsView />;
}
