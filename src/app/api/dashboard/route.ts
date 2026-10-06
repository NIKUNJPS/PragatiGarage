import { prisma } from '@/lib/prisma';
import { ok, parseQuery, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { summarizePayments } from '@/lib/reports';
import { serializeJobCardListItem } from '@/lib/serializers';
import { dayRange, monthKeyOf, monthRange, todayKey } from '@/lib/timezone';
import { toNumber } from '@/lib/utils';
import { dashboardQuerySchema } from '@/lib/validations';
import type { DashboardStats } from '@/types';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req) => {
  // "Today" and "this month" start at local midnight in the viewer's time zone,
  // not the server's (UTC on Vercel).
  const { tz } = parseQuery(req, dashboardQuerySchema);
  const today = todayKey(tz);
  const { start: dayStart, end: dayEnd } = dayRange(today, tz);
  const { start: monthStart } = monthRange(monthKeyOf(today), tz);

  const paymentInclude = {
    invoice: {
      select: {
        subtotal: true,
        items: { select: { kind: true, total: true } },
      },
    },
  } as const;

  const [
    totalCustomers,
    totalVehicles,
    pendingJobs,
    inProgressJobs,
    todayPayments,
    monthPayments,
    outstanding,
    recent,
    garage,
  ] = await Promise.all([
    prisma.customer.count({ where: { isArchived: false } }),
    prisma.vehicle.count({ where: { isArchived: false } }),
    prisma.jobCard.count({ where: { isArchived: false, status: 'PENDING' } }),
    prisma.jobCard.count({ where: { isArchived: false, status: 'IN_PROGRESS' } }),
    // Revenue is money actually received (payment records, by the day it came in),
    // so discounts and unpaid balances never show up as collected.
    prisma.payment.findMany({
      where: { isVoided: false, paidAt: { gte: dayStart, lt: dayEnd }, invoice: { isArchived: false } },
      select: { amount: true, method: true, ...paymentInclude },
    }),
    prisma.payment.findMany({
      where: { isVoided: false, paidAt: { gte: monthStart, lt: dayEnd }, invoice: { isArchived: false } },
      select: { amount: true, method: true, ...paymentInclude },
    }),
    prisma.invoice.aggregate({
      where: { isArchived: false, paymentStatus: { in: ['UNPAID', 'PARTIAL'] } },
      _sum: { balanceDue: true },
      _count: true,
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
        invoice: { select: { id: true, invoiceNumber: true, paymentStatus: true, totalAmount: true, amountPaid: true, balanceDue: true } },
        createdBy: { select: { name: true } },
      },
    }),
    getGarage(),
  ]);

  const todayTotals = summarizePayments(todayPayments);
  const monthTotals = summarizePayments(monthPayments);

  const stats: DashboardStats = {
    totalCustomers,
    totalVehicles,
    activeJobs: pendingJobs + inProgressJobs,
    pendingJobs,
    inProgressJobs,
    todayRevenue: todayTotals.collected,
    monthRevenue: monthTotals.collected,
    todayPartsRevenue: todayTotals.collectedParts,
    todayLabourRevenue: todayTotals.collectedLabour,
    monthPartsRevenue: monthTotals.collectedParts,
    monthLabourRevenue: monthTotals.collectedLabour,
    unpaidCount: outstanding._count,
    unpaidAmount: toNumber(outstanding._sum.balanceDue),
    currency: garage.currency,
    recentJobCards: recent.map(serializeJobCardListItem),
  };

  return ok(stats);
});
