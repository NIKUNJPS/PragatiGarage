import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, created, ok, parseBody, withAuth } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { appUrl } from '@/lib/env';
import { getGarage } from '@/lib/garage';
import { emailIsConfigured, sendMail, staffWelcomeEmail } from '@/lib/mailer';
import { serializeUser } from '@/lib/serializers';
import { createUserSchema } from '@/lib/validations';

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

export const GET = withAuth(async () => {
  const users = await prisma.user.findMany({
    select,
    orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
  });
  return ok({ data: users.map(serializeUser) });
}, adminOnly);

export const POST = withAuth(async (req) => {
  // Single-login app: never allow a second account to be created.
  const existing = await prisma.user.count();
  if (existing >= 1) {
    throw new ApiError(403, 'This app runs with a single owner login. Additional accounts are disabled.');
  }

  const { name, email, password, role } = await parseBody(req, createUserSchema);

  const user = await prisma.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
    select,
  });

  const garage = await getGarage();
  const mail = staffWelcomeEmail(name, email, password, garage.name, `${appUrl()}/login`);
  const { sent } = await sendMail(mail);

  return created({
    data: serializeUser(user),
    emailSent: sent,
    // Without a mail provider the owner has to pass the password on themselves,
    // so the UI needs to know to show it once.
    showCredentials: !emailIsConfigured(),
  });
}, adminOnly);
