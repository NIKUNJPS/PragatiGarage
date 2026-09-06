import { prisma } from '@/lib/prisma';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req, { user }) => {
  const { currentPassword, password } = await parseBody(req, changePasswordSchema);

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record) throw new ApiError(404, 'Account not found.');

  if (!(await verifyPassword(currentPassword, record.passwordHash))) {
    throw new ApiError(400, 'Your current password is not correct.', {
      currentPassword: ['Your current password is not correct.'],
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });

  return ok({ success: true, message: 'Password changed.' });
});
