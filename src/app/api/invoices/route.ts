import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, created, ok, paginated, parseBody, parseQuery, withAuth } from '@/lib/api';
import { publicToken } from '@/lib/auth';
import { nextDocumentNumber } from '@/lib/garage';
import { buildInvoiceView, computeTotals } from '@/lib/invoice-data';
import { serializeInvoiceListItem } from '@/lib/serializers';
import { endOfDay, normalizeVehicleNumber, round2 } from '@/lib/utils';
import { createInvoiceSchema, invoiceListQuerySchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const listInclude = {
  customer: { select: { id: true, name: true, mobileNumber: true, whatsappNumber: true } },
  jobCard: {
    select: {
      id: true,
      jobCardNumber: true,
      vehicle: { select: { id: true, vehicleNumber: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

function parseDate(value: string | undefined, end = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return end ? endOfDay(d) : new Date(d.setHours(0, 0, 0, 0));
}

export const GET = withAuth(async (req) => {
  const { q, page, pageSize, sortDir, includeArchived, paymentStatus, from, to, customerId } =
    parseQuery(req, invoiceListQuerySchema);

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  const where: Prisma.InvoiceWhereInput = {
    ...(includeArchived ? {} : { isArchived: false }),
    ...(paymentStatus && paymentStatus !== 'ALL' ? { paymentStatus } : {}),
    ...(customerId ? { customerId } : {}),
    ...(fromDate || toDate
      ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { jobCard: { jobCardNumber: { contains: q, mode: 'insensitive' } } },
            { jobCard: { vehicle: { vehicleNumber: { contains: normalizeVehicleNumber(q) } } } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { customer: { mobileNumber: { contains: q.replace(/\D/g, '') || q } } },
          ],
        }
      : {}),
  };

  const [rows, total, totals] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({ by: ['paymentStatus'], where, _sum: { totalAmount: true } }),
  ]);

  const summary = {
    paid: round2(Number(totals.find((t) => t.paymentStatus === 'PAID')?._sum.totalAmount ?? 0)),
    unpaid: round2(Number(totals.find((t) => t.paymentStatus === 'UNPAID')?._sum.totalAmount ?? 0)),
  };

  return ok({
    ...paginated(rows.map(serializeInvoiceListItem), total, page, pageSize),
    summary,
  });
});

/**
 * Create an invoice from a completed job card. Line items arrive from the
 * client (they are editable before finalising) but every total is recomputed
 * here - a client-supplied total is never trusted.
 */
export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, createInvoiceSchema);

  const jobCard = await prisma.jobCard.findUnique({
    where: { id: input.jobCardId },
    select: { id: true, customerId: true, isArchived: true, invoice: { select: { id: true } } },
  });

  if (!jobCard) throw new ApiError(404, 'That job card no longer exists.');
  if (jobCard.isArchived) throw new ApiError(400, 'This job card is archived.');
  if (jobCard.invoice)
    throw new ApiError(409, 'This job card already has an invoice.', undefined);

  const totals = computeTotals(input.items, input.taxRate, input.discount);
  const invoiceNumber = await nextDocumentNumber('invoice');

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      publicToken: publicToken(),
      jobCardId: jobCard.id,
      customerId: jobCard.customerId,
      subtotal: totals.subtotal,
      taxRate: input.taxRate,
      tax: totals.tax,
      discount: totals.discount,
      totalAmount: totals.totalAmount,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      paidAt: input.paymentStatus === 'PAID' ? new Date() : null,
      notes: input.notes,
      createdById: user.id,
      items: {
        create: input.items.map((item, i) => ({
          kind: item.kind,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: round2(item.quantity * item.unitPrice),
          sortOrder: i,
        })),
      },
    },
    include: {
      items: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
      customer: true,
      jobCard: { include: { vehicle: true } },
    },
  });

  // Billing an unfinished job is almost always a mistake, so close it out.
  await prisma.jobCard.update({
    where: { id: jobCard.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  return created(await buildInvoiceView(invoice));
});
