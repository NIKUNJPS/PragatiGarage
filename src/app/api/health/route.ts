import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Lightweight health / keep-alive endpoint.
 *
 * Point a free uptime pinger (UptimeRobot, cron-job.org, a GitHub Actions cron)
 * at `/api/health` every 5-10 minutes to keep a free host (e.g. a Render free
 * web service) from sleeping. It also runs a trivial `SELECT 1`, so a database
 * that sleeps on inactivity (e.g. Supabase free) is kept warm too.
 *
 * Public by design (no session needed) - it exposes nothing but a status.
 */
export async function GET() {
  const startedAt = Date.now();
  let database: 'up' | 'down' = 'up';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error('[health] database check failed:', error);
    database = 'down';
  }

  return NextResponse.json(
    {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeMs: Math.round(process.uptime() * 1000),
      responseMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    {
      status: database === 'up' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
