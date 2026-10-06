import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, created, ok, paginated, parseBody, parseQuery, withAuth } from '@/lib/api';
import { publicToken } from '@/lib/auth';
import { getGarage } from '@/lib/garage';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { createInvoice, inTransaction } from '@/lib/invoice-service';
import { serializeInvoiceListItem } from '@/lib/serializers';
import { dayRange, isDateKey } from '@/lib/timezone';
import { endOfDay, normalizeVehicleNumber, round2, toNumber } from '@/lib/utils';
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

/**
 * A "YYYY-MM-DD" filter covers that whole local day in the viewer's time zone
 * (`to` is inclusive of the day, so the bound is the next day's start, exclusive).
 */
function dateBound(value: string | undefined, tz: string, edge: 'from' | 'to'): { gte: Date } | { lt: Date } | undefined {
  if (isDateKey(value)) {
    const { start, end } = dayRange(value, tz);
    return edge === 'from' ? { gte: start } : { lt: end };
  }
  const legacy = parseDate(value, edge === 'to');
  if (!legacy) return undefined;
  return edge === 'from' ? { gte: legacy } : { lt: new Date(legacy.getTime() + 1) };
}

function parseDate(value: string | undefined, end = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return end ? endOfDay(d) : new Date(d.setHours(0, 0, 0, 0));
}

export const GET = withAuth(async (req) => {
  const { q, page, pageSize, sortDir, includeArchived, paymentStatus, from, to, tz, customerId } =
    parseQuery(req, invoiceListQuerySchema);

  const fromBound = dateBound(from, tz, 'from');
  const toBound = dateBound(to, tz, 'to');

  const where: Prisma.InvoiceWhereInput = {
    ...(includeArchived ? {} : { isArchived: false }),
    ...(paymentStatus === 'DUE'
      ? { paymentStatus: { in: ['UNPAID', 'PARTIAL'] } }
      : paymentStatus && paymentStatus !== 'ALL'
        ? { paymentStatus }
        : {}),
    ...(customerId ? { customerId } : {}),
    ...(fromBound || toBound ? { createdAt: { ...fromBound, ...toBound } } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { jobCard: { jobCardNumber: { contains: q, mode: 'insensitive' } } },
            { jobCard: { vehicle: { vehicleNumber: { contains: normalizeVehicleNumber(q) } } } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { customer: { mobileNumber: { contains: q.replace(/\D/g, '') || q } } },
            { attendantName: { contains: q, mode: 'insensitive' } },
            { billedByName: { contains: q, mode: 'insensitive' } },
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
    prisma.invoice.aggregate({ where, _sum: { amountPaid: true, balanceDue: true, totalAmount: true } }),
  ]);

  // Collected = money actually received; pending = what is still owed. Discounts
  // are in neither, and part-paid invoices count in both for their share.
  const summary = {
    paid: round2(toNumber(totals._sum.amountPaid)),
    unpaid: round2(toNumber(totals._sum.balanceDue)),
    billed: round2(toNumber(totals._sum.totalAmount)),
  };

  return ok({
    ...paginated(rows.map(serializeInvoiceListItem), total, page, pageSize),
    summary,
  });
});

/**
 * Create an invoice from a job card. Line items arrive from the client (they are
 * editable before finalising) but every total is recalculated on the server, and
 * the invoice, its items, the job card mirror and any payment taken now are
 * saved in one transaction - all or nothing.
 */
export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, createInvoiceSchema);
  const garage = await getGarage();

  const invoiceId = await inTransaction(prisma, async (tx) => {
    const jobCard = await tx.jobCard.findUnique({
      where: { id: input.jobCardId },
      select: { id: true, customerId: true, isArchived: true, invoice: { select: { id: true } } },
    });

    if (!jobCard) throw new ApiError(404, 'That job card no longer exists.');
    if (jobCard.isArchived) throw new ApiError(400, 'This job card is archived.');
    if (jobCard.invoice) throw new ApiError(409, 'This job card already has an invoice.');

    const id = await createInvoice(tx, {
      jobCardId: jobCard.id,
      customerId: jobCard.customerId,
      billing: input,
      notes: input.notes,
      attendantName: input.attendantName,
      billedByName: input.billedByName,
      publicToken: publicToken(),
      currency: garage.currency,
      userId: user.id,
      initialPayment: {
        status: input.paymentStatus,
        amount: input.paymentAmount,
        method: input.paymentMethod,
        reference: input.paymentReference,
        paidAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      },
    });

    // Billing an unfinished job is almost always a mistake, so close it out.
    await tx.jobCard.update({
      where: { id: jobCard.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    return id;
  });

  // Respond with the committed record, exactly as every later screen will read it.
  return created(await getInvoiceViewById(invoiceId));
});
