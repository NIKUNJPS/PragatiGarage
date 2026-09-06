import { prisma } from '@/lib/prisma';
import { ok, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Duplicate-mobile lookup used by the customer form. It warns rather than
 * blocks, because families genuinely do share one phone number.
 */
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const mobile = (url.searchParams.get('mobile') ?? '').replace(/\D/g, '');
  const excludeId = url.searchParams.get('excludeId') ?? undefined;

  if (mobile.length < 6) return ok({ duplicate: null });

  const last10 = mobile.slice(-10);

  const match = await prisma.customer.findFirst({
    where: {
      isArchived: false,
      mobileNumber: { contains: last10 },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, mobileNumber: true, _count: { select: { vehicles: true } } },
  });

  return ok({
    duplicate: match
      ? {
          id: match.id,
          name: match.name,
          mobileNumber: match.mobileNumber,
          vehicleCount: match._count.vehicles,
        }
      : null,
  });
});
