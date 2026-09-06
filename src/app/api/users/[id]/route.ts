import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { serializeUser } from '@/lib/serializers';
import { updateUserSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const select = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export const PATCH = withAuth(async (req, { params, user }) => {
  const input = await parseBody(req, updateUserSchema);
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new ApiError(404, 'That user no longer exists.');

  // Guard rails so a garage can never lock itself out of its own admin account.
  if (target.id === user.id) {
    if (input.isActive === false) throw new ApiError(400, 'You cannot deactivate your own account.');
    if (input.role && input.role !== target.role)
      throw new ApiError(400, 'You cannot change your own role.');
  }

  if ((input.isActive === false || input.role === 'STAFF') && target.role === 'ADMIN') {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw new ApiError(
        400,
        'This is the only active admin. Promote another user to admin first.',
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select,
  });

  return ok(serializeUser(updated));
}, adminOnly);

/** Users are deactivated, never deleted, so their audit trail survives. */
export const DELETE = withAuth(async (_req, { params, user }) => {
  if (params.id === user.id) throw new ApiError(400, 'You cannot deactivate your own account.');

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new ApiError(404, 'That user no longer exists.');

  if (target.role === 'ADMIN') {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0)
      throw new ApiError(400, 'This is the only active admin and cannot be deactivated.');
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { isActive: false },
    select,
  });
  return ok(serializeUser(updated));
}, adminOnly);
