import { ok, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { serializeGarage } from '@/lib/serializers';
import type { MeResponse } from '@/types';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { user }) => {
  const garage = await getGarage();
  const body: MeResponse = { user, garage: serializeGarage(garage) };
  return ok(body);
});
