import { clearSessionCookie } from '@/lib/auth';
import { ok, withPublic } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = withPublic(async () => {
  clearSessionCookie();
  return ok({ success: true });
});
