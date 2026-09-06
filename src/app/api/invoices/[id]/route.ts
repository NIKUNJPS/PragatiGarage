import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import { buildInvoiceView, computeTotals, getInvoiceViewById } from '@/lib/invoice-data';
import { round2, toNumber } from '@/lib/utils';
import { updateInvoiceSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const include = {
  items: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
  customer: true,
  jobCard: { include: { vehicle: true } },
} satisfies Prisma.InvoiceInclude;

export const GET = withAuth(async (_req, { params }) => {
  const view = await getInvoiceViewById(params.id);
  if (!view) throw new ApiError(404, 'That invoice no longer exists.');
  return ok(view);
});

export const PATCH = withAuth(async (req, { params }) => {
  const input = await parseBody(req, updateInvoiceSchema);

  const existing = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!existing) throw new ApiError(404, 'That invoice no longer exists.');

  const items =
    input.items ??
    existing.items.map((i) => ({
      kind: i.kind,
      description: i.description,
      quantity: toNumber(i.quantity),
      unitPrice: toNumber(i.unitPrice),
    }));

  const taxRate = input.taxRate ?? toNumber(existing.taxRate);
  const discount = input.discount ?? toNumber(existing.discount);
  const totals = computeTotals(items, taxRate, discount);

  const markingPaid = input.paymentStatus === 'PAID' && existing.paymentStatus !== 'PAID';
  const markingUnpaid = input.paymentStatus === 'UNPAID' && existing.paymentStatus === 'PAID';

  const invoice = await prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: params.id } });
      await tx.invoiceItem.createMany({
        data: input.items.map((item, i) => ({
          invoiceId: params.id,
          kind: item.kind,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: round2(item.quantity * item.unitPrice),
          sortOrder: i,
        })),
      });
    }

    return tx.invoice.update({
      where: { id: params.id },
      data: {
        subtotal: totals.subtotal,
        taxRate,
        tax: totals.tax,
        discount: totals.discount,
        totalAmount: totals.totalAmount,
        ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
        ...(markingPaid ? { paidAt: new Date() } : {}),
        ...(markingUnpaid ? { paidAt: null, paymentMethod: null } : {}),
        ...(input.paymentMethod !== undefined && !markingUnpaid
          ? { paymentMethod: input.paymentMethod }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        // The stored PDF no longer matches the numbers, so drop it and let the
        // next download or share regenerate it.
        ...(input.items || input.taxRate !== undefined || input.discount !== undefined
          ? { pdfUrl: null }
          : {}),
      },
      include,
    });
  });

  return ok(await buildInvoiceView(invoice));
});

/** Archive an invoice. Admin only - invoices are never physically deleted. */
export const DELETE = withAuth(async (req, { params }) => {
  const url = new URL(req.url);
  const restore = url.searchParams.get('restore') === 'true';

  const invoice = await prisma.invoice.update({
    where: { id: params.id },
    data: { isArchived: !restore },
    include,
  });

  return ok({
    ...(await buildInvoiceView(invoice)),
    message: restore ? 'Invoice restored.' : 'Invoice archived.',
  });
}, adminOnly);
