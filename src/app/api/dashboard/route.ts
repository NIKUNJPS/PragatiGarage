import { prisma } from '@/lib/prisma';
import { ok, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { serializeJobCardListItem } from '@/lib/serializers';
import { endOfDay, round2, startOfDay, toNumber, type DecimalLike } from '@/lib/utils';
import type { DashboardStats, InvoiceItemKind } from '@/types';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalCustomers,
    totalVehicles,
    pendingJobs,
    inProgressJobs,
    todayPaid,
    monthPaid,
    unpaid,
    todayItems,
    monthItems,
    recent,
    garage,
  ] = await Promise.all([
    prisma.customer.count({ where: { isArchived: false } }),
    prisma.vehicle.count({ where: { isArchived: false } }),
    prisma.jobCard.count({ where: { isArchived: false, status: 'PENDING' } }),
    prisma.jobCard.count({ where: { isArchived: false, status: 'IN_PROGRESS' } }),
    prisma.invoice.aggregate({
      where: {
        isArchived: false,
        paymentStatus: 'PAID',
        // Revenue is counted on the day the money came in, not the day the
        // invoice was raised.
        paidAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { isArchived: false, paymentStatus: 'PAID', paidAt: { gte: monthStart, lte: dayEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { isArchived: false, paymentStatus: 'UNPAID' },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.invoiceItem.groupBy({
      by: ['kind'],
      where: {
        invoice: {
          isArchived: false,
          paymentStatus: 'PAID',
          paidAt: { gte: dayStart, lte: dayEnd },
        },
      },
      _sum: { total: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ['kind'],
      where: {
        invoice: {
          isArchived: false,
          paymentStatus: 'PAID',
          paidAt: { gte: monthStart, lte: dayEnd },
        },
      },
      _sum: { total: true },
    }),
    prisma.jobCard.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        customer: { select: { id: true, name: true, mobileNumber: true } },
        vehicle: {
          select: { id: true, vehicleNumber: true, vehicleType: true, brand: true, model: true },
        },
        parts: true,
        labourCharges: true,
        serviceCharges: true,
        invoice: { select: { id: true, invoiceNumber: true, paymentStatus: true } },
        createdBy: { select: { name: true } },
      },
    }),
    getGarage(),
  ]);

  const todayRevenue = round2(toNumber(todayPaid._sum.totalAmount));
  const monthRevenue = round2(toNumber(monthPaid._sum.totalAmount));
  const todaySplit = splitRevenue(todayItems, todayRevenue);
  const monthSplit = splitRevenue(monthItems, monthRevenue);

  const stats: DashboardStats = {
    totalCustomers,
    totalVehicles,
    activeJobs: pendingJobs + inProgressJobs,
    pendingJobs,
    inProgressJobs,
    todayRevenue,
    monthRevenue,
    todayPartsRevenue: todaySplit.parts,
    todayLabourRevenue: todaySplit.labour,
    monthPartsRevenue: monthSplit.parts,
    monthLabourRevenue: monthSplit.labour,
    unpaidCount: unpaid._count,
    unpaidAmount: round2(toNumber(unpaid._sum.totalAmount)),
    currency: garage.currency,
    recentJobCards: recent.map(serializeJobCardListItem),
  };

  return ok(stats);
});

/**
 * Splits billed line items into spare parts vs labour (service charges bill as
 * labour), scaled so both add up to the money actually collected - invoice-level
 * tax and discount sit outside the line items.
 */
function splitRevenue(
  rows: Array<{ kind: InvoiceItemKind; _sum: { total: DecimalLike } }>,
  collected: number,
): { parts: number; labour: number } {
  let parts = 0;
  let billed = 0;

  for (const row of rows) {
    const amount = toNumber(row._sum.total);
    billed += amount;
    if (row.kind === 'PART') parts += amount;
  }

  if (billed <= 0) return { parts: 0, labour: collected };

  const partsRevenue = round2((parts / billed) * collected);
  return { parts: partsRevenue, labour: round2(collected - partsRevenue) };
}
