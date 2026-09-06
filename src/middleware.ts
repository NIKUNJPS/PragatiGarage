import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'gms_session';

/** Pages reachable without a session. Everything else requires one. */
const PUBLIC_PAGES = ['/login', '/forgot-password', '/reset-password', '/welcome'];

/** Public API + public invoice links (shared with customers over WhatsApp). */
const PUBLIC_PREFIXES = [
  '/i/',
  '/api/auth/',
  '/api/health',
  '/_next/',
  '/favicon',
  '/icon',
  '/apple-icon',
];

function secret() {
  const value =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== 'production'
      ? 'dev-only-insecure-secret-change-me-please-32chars'
      : '');
  return new TextEncoder().encode(value);
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const authed = await hasValidSession(req);

  // Signed-in users have no reason to see the login screen again.
  if (authed && isPublicPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (!authed && !isPublicPage) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'You need to sign in to continue.' }, { status: 401 });
    }
    const login = new URL('/login', req.url);
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
