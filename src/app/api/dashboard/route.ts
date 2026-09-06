import { prisma } from '@/lib/prisma';
import { ok, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { serializeJobCardListItem } from '@/lib/serializers';
import { endOfDay, round2, startOfDay, toNumber } from '@/lib/utils';
import type { DashboardStats } from '@/types';

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

  const stats: DashboardStats = {
    totalCustomers,
    totalVehicles,
    activeJobs: pendingJobs + inProgressJobs,
    pendingJobs,
    inProgressJobs,
    todayRevenue: round2(toNumber(todayPaid._sum.totalAmount)),
    monthRevenue: round2(toNumber(monthPaid._sum.totalAmount)),
    unpaidCount: unpaid._count,
    unpaidAmount: round2(toNumber(unpaid._sum.totalAmount)),
    currency: garage.currency,
    recentJobCards: recent.map(serializeJobCardListItem),
  };

  return ok(stats);
});
