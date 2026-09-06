import { prisma } from '@/lib/prisma';
import { adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import { GARAGE_ID, getGarage } from '@/lib/garage';
import { serializeGarage } from '@/lib/serializers';
import { setupWizardSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/** Every signed-in user can read the garage profile (it appears on invoices). */
export const GET = withAuth(async () => {
  const garage = await getGarage();
  return ok(serializeGarage(garage));
});

/** Only the owner can change business details or document numbering. */
export const PUT = withAuth(async (req) => {
  const input = await parseBody(req, setupWizardSchema);

  const garage = await prisma.garage.upsert({
    where: { id: GARAGE_ID },
    create: { id: GARAGE_ID, ...stripUndefined(input) },
    update: stripUndefined(input),
  });

  return ok(serializeGarage(garage));
}, adminOnly);

/** Zod `.partial()` leaves explicit undefineds behind; Prisma wants them gone. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
