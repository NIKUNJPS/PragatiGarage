import { prisma } from '@/lib/prisma';
import { ok, parseQuery, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { buildDailyReport } from '@/lib/reports';
import { todayKey } from '@/lib/timezone';
import { dailyReportQuerySchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/** One day's bills, collections, payment methods and per-person totals. */
export const GET = withAuth(async (req) => {
  const { date, tz } = parseQuery(req, dailyReportQuerySchema);
  const garage = await getGarage();
  return ok(await buildDailyReport(prisma, { date: date || todayKey(tz), timeZone: tz, currency: garage.currency }));
});
