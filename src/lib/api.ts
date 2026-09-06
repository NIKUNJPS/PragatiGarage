import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z, ZodError, type ZodTypeAny } from 'zod';

import { getCurrentUser, type Role, type SessionUser } from '@/lib/auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (msg: string, fields?: Record<string, string[]>) =>
  new ApiError(400, msg, fields);
export const unauthorized = (msg = 'You need to sign in to continue.') => new ApiError(401, msg);
export const forbidden = (msg = 'You do not have permission to do that.') => new ApiError(403, msg);
export const notFound = (msg = 'Not found.') => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data as object, { status: 201 });
}

/** Turns any thrown value into a consistent JSON error envelope. */
export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, fieldErrors: error.fieldErrors ?? null },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Please check the highlighted fields and try again.',
        fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
      },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[] | string | undefined) ?? [];
      const field = Array.isArray(target) ? target.join(', ') : String(target);
      return NextResponse.json(
        { error: `That ${friendlyField(field)} is already in use.`, fieldErrors: null },
        { status: 409 },
      );
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      return NextResponse.json(
        {
          error: 'This record is linked to other records and cannot be removed. Archive it instead.',
          fieldErrors: null,
        },
        { status: 409 },
      );
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Record not found.', fieldErrors: null }, { status: 404 });
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Error && /Can't reach database server/i.test(error.message))
  ) {
    console.error('[api] database unreachable:', error);
    return NextResponse.json(
      {
        error:
          'Cannot reach the database. Check DATABASE_URL in your .env file and that the database is running.',
        fieldErrors: null,
      },
      { status: 503 },
    );
  }

  console.error('[api] unhandled error:', error);
  return NextResponse.json(
    { error: 'Something went wrong on our side. Please try again.', fieldErrors: null },
    { status: 500 },
  );
}

function friendlyField(field: string): string {
  const map: Record<string, string> = {
    email: 'email address',
    vehicleNumber: 'vehicle number',
    invoiceNumber: 'invoice number',
    jobCardNumber: 'job card number',
    jobCardId: 'job card (it already has an invoice)',
  };
  return map[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Route wrappers                                                              */
/* -------------------------------------------------------------------------- */

type Ctx = { params: Record<string, string> };
type Handler = (
  req: Request,
  ctx: Ctx & { user: SessionUser },
) => Promise<Response> | Response;

/**
 * Wraps a route handler with authentication, optional role checks and uniform
 * error handling. Authorisation is enforced here on the server, never trusting
 * whatever the client chose to render.
 */
export function withAuth(handler: Handler, options?: { roles?: Role[] }) {
  return async (req: Request, ctx: Ctx = { params: {} }) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw unauthorized();
      if (options?.roles && !options.roles.includes(user.role)) {
        throw forbidden(
          user.role === 'STAFF'
            ? 'Only the garage owner (admin) can do this.'
            : 'You do not have permission to do that.',
        );
      }
      return await handler(req, { ...ctx, user });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Same uniform error handling, but for public (unauthenticated) routes. */
export function withPublic(handler: (req: Request, ctx: Ctx) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx = { params: {} }) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export const adminOnly = { roles: ['ADMIN'] as Role[] };

/* -------------------------------------------------------------------------- */
/* Input helpers                                                               */
/* -------------------------------------------------------------------------- */

export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, 'Please check the highlighted fields and try again.', {
      ...(result.error.flatten().fieldErrors as Record<string, string[]>),
    });
  }
  return result.data;
}

export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, 'Invalid query parameters.', {
      ...(result.error.flatten().fieldErrors as Record<string, string[]>),
    });
  }
  return result.data;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginated<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    data,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
