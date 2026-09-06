import { prisma } from '@/lib/prisma';
import { ok, parseBody, withPublic, ApiError } from '@/lib/api';
import { setSessionCookie, verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validations';
import { serializeUser } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export const POST = withPublic(async (req) => {
  const { email, password, rememberMe } = await parseBody(req, loginSchema);

  const user = await prisma.user.findUnique({ where: { email } });

  // Same message and roughly the same work for "no such user" and "wrong
  // password" so the endpoint cannot be used to enumerate accounts.
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    throw new ApiError(401, 'Incorrect email or password. Please try again.');
  }

  if (!user.isActive) {
    throw new ApiError(
      403,
      'This account has been deactivated. Ask the garage owner to re-enable it.',
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await setSessionCookie(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    rememberMe,
  );

  return ok({ user: serializeUser({ ...user, lastLoginAt: new Date() }) });
});
