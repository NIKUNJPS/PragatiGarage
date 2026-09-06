import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import { AUTH_SECRET, isProd } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE = 'gms_session';

export type Role = 'ADMIN' | 'STAFF';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface SessionPayload extends SessionUser {
  /** Issued-at, seconds. Used to enforce the inactivity window. */
  iat?: number;
  exp?: number;
}

const encoder = new TextEncoder();
const secretKey = () => encoder.encode(AUTH_SECRET());

/* -------------------------------------------------------------------------- */
/* Passwords                                                                   */
/* -------------------------------------------------------------------------- */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/* -------------------------------------------------------------------------- */
/* Session tokens                                                              */
/* -------------------------------------------------------------------------- */

/** "Remember me" keeps the session for 30 days; otherwise it is a 12h session. */
export const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 30;
export const DEFAULT_MAX_AGE = 60 * 60 * 12;

export async function createSessionToken(user: SessionUser, maxAgeSeconds: number): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(user.id)
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub || !payload.email) return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser, rememberMe: boolean) {
  const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE : DEFAULT_MAX_AGE;
  const token = await createSessionToken(user, maxAge);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Read the current session from the cookie and confirm the user is still active.
 * Returns null for anonymous / revoked / deactivated users.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
}

/* -------------------------------------------------------------------------- */
/* Password reset tokens                                                       */
/* -------------------------------------------------------------------------- */

export const RESET_TOKEN_TTL_MINUTES = 60;

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Random, URL-safe token used for public invoice share links. */
export function publicToken(): string {
  return randomBytes(18).toString('base64url');
}
