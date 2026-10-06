import { prisma } from '@/lib/prisma';
import { ok, withAuth } from '@/lib/api';
import { distinctNames } from '@/lib/staff-names';
import type { StaffNameSuggestions } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Car attendant and "bill created by" names from recent bills, most recently
 * used first. The bill form offers them as suggestions so the same person is
 * always spelled the same way, which keeps the per-person reports accurate.
 */
export const GET = withAuth(async () => {
  const rows = await prisma.invoice.findMany({
    where: { OR: [{ attendantName: { not: null } }, { billedByName: { not: null } }] },
    select: { attendantName: true, billedByName: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const body: StaffNameSuggestions = {
    attendants: distinctNames(rows.map((r) => r.attendantName)),
    billers: distinctNames(rows.map((r) => r.billedByName)),
  };
  return ok(body);
});
