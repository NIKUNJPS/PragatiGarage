import { prisma } from '@/lib/prisma';
import { ApiError, ok, parseBody, withPublic } from '@/lib/api';
import { hashPassword, hashToken } from '@/lib/auth';
import { resetPasswordSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export const POST = withPublic(async (req) => {
  const { token, password } = await parseBody(req, resetPasswordSchema);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiError(
      400,
      'This reset link has expired or has already been used. Please request a new one.',
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate every other outstanding link for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return ok({ success: true, message: 'Password updated. You can sign in now.' });
});
