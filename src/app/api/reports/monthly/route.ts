import { prisma } from '@/lib/prisma';
import { ok, parseQuery, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { buildMonthlyReport } from '@/lib/reports';
import { monthKeyOf, todayKey } from '@/lib/timezone';
import { monthlyReportQuerySchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/** One month's billing and collections, day by day, plus a 12-month trend. */
export const GET = withAuth(async (req) => {
  const { month, tz } = parseQuery(req, monthlyReportQuerySchema);
  const garage = await getGarage();
  return ok(
    await buildMonthlyReport(prisma, {
      month: month || monthKeyOf(todayKey(tz)),
      timeZone: tz,
      currency: garage.currency,
    }),
  );
});
