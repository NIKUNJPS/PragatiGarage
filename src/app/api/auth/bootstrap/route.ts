import { prisma } from '@/lib/prisma';
import { ApiError, ok, created, parseBody, withPublic } from '@/lib/api';
import { hashPassword, setSessionCookie } from '@/lib/auth';
import { firstAdminSchema } from '@/lib/validations';
import { getGarage } from '@/lib/garage';

export const dynamic = 'force-dynamic';

/** Tells the login screen whether this is a brand-new installation. */
export const GET = withPublic(async () => {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    const garage = await getGarage();
    return ok({ needsFirstAdmin: false, setupCompleted: garage.setupCompleted });
  }
  return ok({ needsFirstAdmin: true, setupCompleted: false });
});

/**
 * Creates the very first ADMIN account. Deliberately unauthenticated, but only
 * possible while the users table is empty - after that it always 409s.
 */
export const POST = withPublic(async (req) => {
  const { name, email, password } = await parseBody(req, firstAdminSchema);

  const existing = await prisma.user.count();
  if (existing > 0) {
    throw new ApiError(409, 'This garage is already set up. Please sign in instead.');
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: 'ADMIN' },
  });

  await getGarage(); // make sure the settings row exists before the wizard runs

  await setSessionCookie(
    { id: user.id, name: user.name, email: user.email, role: 'ADMIN' },
    true,
  );

  return created({ user: { id: user.id, name: user.name, email: user.email, role: 'ADMIN' } });
});
