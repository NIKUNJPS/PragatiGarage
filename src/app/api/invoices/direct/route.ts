import { prisma } from '@/lib/prisma';
import { ApiError, created, parseBody, withAuth } from '@/lib/api';
import { publicToken } from '@/lib/auth';
import { nextDocumentNumber } from '@/lib/garage';
import { buildInvoiceView, computeTotals } from '@/lib/invoice-data';
import { round2 } from '@/lib/utils';
import { directInvoiceSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/**
 * Direct invoice entry.
 *
 * Creates a completed job card and its invoice in a single step, dated to the
 * chosen issue date (so past bills can be entered by hand). The vehicle is
 * chosen from the picker - if the same vehicle number comes back, its existing
 * record is reused and this simply becomes another dated visit, never a
 * duplicate. Every total is recomputed on the server; the client total is not
 * trusted. Payment status (PAID / UNPAID) drives the pending-payments views.
 */
export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, directInvoiceSchema);

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, customerId: true, isArchived: true },
  });
  if (!vehicle) throw new ApiError(400, 'Choose a valid vehicle for this invoice.');
  if (vehicle.isArchived)
    throw new ApiError(400, 'That vehicle is archived. Restore it before billing.');

  const when = input.issueDate;
  const totals = computeTotals(input.items, input.taxRate, input.discount);

  const invoice = await prisma.$transaction(async (tx) => {
    const jobCardNumber = await nextDocumentNumber('jobCard');

    // The job card carries the same line items, split back into part / labour /
    // service buckets, so the vehicle's service history stays complete.
    const jobCard = await tx.jobCard.create({
      data: {
        jobCardNumber,
        vehicleId: vehicle.id,
        customerId: vehicle.customerId,
        complaint: input.complaint ?? '',
        workPerformed: input.workPerformed ?? '',
        status: 'COMPLETED',
        odometer: input.odometer,
        completedAt: when,
        createdAt: when,
        updatedAt: when,
        createdById: user.id,
        parts: {
          create: input.items
            .filter((i) => i.kind === 'PART')
            .map((i, idx) => ({
              partName: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: round2(i.quantity * i.unitPrice),
              sortOrder: idx,
            })),
        },
        labourCharges: {
          create: input.items
            .filter((i) => i.kind === 'LABOUR')
            .map((i, idx) => ({ description: i.description, amount: round2(i.quantity * i.unitPrice), sortOrder: idx })),
        },
        serviceCharges: {
          create: input.items
            .filter((i) => i.kind === 'SERVICE')
            .map((i, idx) => ({ description: i.description, amount: round2(i.quantity * i.unitPrice), sortOrder: idx })),
        },
      },
      select: { id: true },
    });

    const invoiceNumber = await nextDocumentNumber('invoice');

    const createdInvoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        publicToken: publicToken(),
        jobCardId: jobCard.id,
        customerId: vehicle.customerId,
        subtotal: totals.subtotal,
        taxRate: input.taxRate,
        tax: totals.tax,
        discount: totals.discount,
        totalAmount: totals.totalAmount,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        paidAt: input.paymentStatus === 'PAID' ? when : null,
        notes: input.notes,
        createdById: user.id,
        createdAt: when,
        updatedAt: when,
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

    // Keep the vehicle's last-known odometer current.
    if (input.odometer) {
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { odometer: input.odometer } });
    }

    return createdInvoice;
  });

  return created(await buildInvoiceView(invoice));
});
