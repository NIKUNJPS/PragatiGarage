import { prisma } from '@/lib/prisma';
import { ok, parseBody, withPublic } from '@/lib/api';
import { RESET_TOKEN_TTL_MINUTES, generateResetToken } from '@/lib/auth';
import { appUrl } from '@/lib/env';
import { getGarage } from '@/lib/garage';
import { passwordResetEmail, sendMail, shouldRevealResetLink } from '@/lib/mailer';
import { forgotPasswordSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export const POST = withPublic(async (req) => {
  const { email } = await parseBody(req, forgotPasswordSchema);

  const user = await prisma.user.findUnique({ where: { email } });

  // Always answer the same way so the form cannot be used to discover which
  // email addresses have accounts.
  const genericResponse = {
    success: true,
    message: 'If that email is registered, a reset link is on its way.',
  };

  if (!user || !user.isActive) return ok(genericResponse);

  const { token, tokenHash } = generateResetToken();

  await prisma.$transaction([
    // Any older, still-valid link for this user is invalidated.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const garage = await getGarage();
  const resetUrl = `${appUrl()}/reset-password?token=${token}`;
  const mail = passwordResetEmail(user.name, resetUrl, garage.name);
  await sendMail({ ...mail, to: user.email });

  // In local development with no mail provider, hand the link back so the flow
  // can be completed without digging through server logs.
  return ok(shouldRevealResetLink() ? { ...genericResponse, devResetUrl: resetUrl } : genericResponse);
});
