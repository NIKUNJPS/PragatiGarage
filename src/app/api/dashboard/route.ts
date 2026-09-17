import { prisma } from '@/lib/prisma';
import { ok, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { serializeJobCardListItem } from '@/lib/serializers';
import { splitCollected } from '@/lib/billing';
import { fromPaise, toPaise } from '@/lib/money';
import { endOfDay, startOfDay, toNumber, type DecimalLike } from '@/lib/utils';
import type { DashboardStats, InvoiceItemKind } from '@/types';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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
      where: { isVoided: false, paidAt: { gte: dayStart, lte: dayEnd }, invoice: { isArchived: false } },
      select: { amount: true, ...paymentInclude },
    }),
    prisma.payment.findMany({
      where: { isVoided: false, paidAt: { gte: monthStart, lte: dayEnd }, invoice: { isArchived: false } },
      select: { amount: true, ...paymentInclude },
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

  const today = collectedSplit(todayPayments);
  const month = collectedSplit(monthPayments);

  const stats: DashboardStats = {
    totalCustomers,
    totalVehicles,
    activeJobs: pendingJobs + inProgressJobs,
    pendingJobs,
    inProgressJobs,
    todayRevenue: today.total,
    monthRevenue: month.total,
    todayPartsRevenue: today.parts,
    todayLabourRevenue: today.labour,
    monthPartsRevenue: month.parts,
    monthLabourRevenue: month.labour,
    unpaidCount: outstanding._count,
    unpaidAmount: toNumber(outstanding._sum.balanceDue),
    currency: garage.currency,
    recentJobCards: recent.map(serializeJobCardListItem),
  };

  return ok(stats);
});

/**
 * Totals the payments and splits each one into spare parts vs labour in the same
 * proportion as its invoice's line items (service charges count as labour).
 */
function collectedSplit(
  payments: Array<{
    amount: DecimalLike;
    invoice: { subtotal: DecimalLike; items: Array<{ kind: InvoiceItemKind; total: DecimalLike }> };
  }>,
): { total: number; parts: number; labour: number } {
  let total = 0;
  let parts = 0;
  let labour = 0;

  for (const payment of payments) {
    const partsBilled = payment.invoice.items
      .filter((i) => i.kind === 'PART')
      .reduce((sum, i) => sum + toPaise(toNumber(i.total)), 0);
    const split = splitCollected(toNumber(payment.amount), fromPaise(partsBilled), toNumber(payment.invoice.subtotal));
    total += toPaise(toNumber(payment.amount));
    parts += toPaise(split.parts);
    labour += toPaise(split.labour);
  }

  return { total: fromPaise(total), parts: fromPaise(parts), labour: fromPaise(labour) };
}
