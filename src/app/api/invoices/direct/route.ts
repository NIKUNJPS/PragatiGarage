import { prisma } from '@/lib/prisma';
import { ApiError, created, parseBody, withAuth } from '@/lib/api';
import { publicToken } from '@/lib/auth';
import { getGarage, nextDocumentNumber } from '@/lib/garage';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { createInvoice, inTransaction } from '@/lib/invoice-service';
import { directInvoiceSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/**
 * Direct invoice entry.
 *
 * Creates a completed job card and its invoice in a single transaction, dated to
 * the chosen issue date (so past bills can be entered by hand). The vehicle is
 * chosen from the picker - if the same vehicle number comes back, its existing
 * record is reused and this simply becomes another dated visit, never a
 * duplicate. Every total is recalculated on the server; client totals are ignored.
 */
export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, directInvoiceSchema);
  const garage = await getGarage();
  const when = input.issueDate;

  const invoiceId = await inTransaction(prisma, async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, customerId: true, isArchived: true },
    });
    if (!vehicle) throw new ApiError(400, 'Choose a valid vehicle for this invoice.', { vehicleId: ['Choose a valid vehicle.'] });
    if (vehicle.isArchived) throw new ApiError(400, 'That vehicle is archived. Restore it before billing.');

    const jobCard = await tx.jobCard.create({
      data: {
        jobCardNumber: await nextDocumentNumber('jobCard', tx),
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
      },
      select: { id: true },
    });

    // The job card's parts / labour / service lines are mirrored from the
    // invoice items inside createInvoice, so the service history stays complete.
    const id = await createInvoice(tx, {
      jobCardId: jobCard.id,
      customerId: vehicle.customerId,
      billing: input,
      notes: input.notes,
      attendantName: input.attendantName,
      billedByName: input.billedByName,
      publicToken: publicToken(),
      createdAt: when,
      currency: garage.currency,
      userId: user.id,
      initialPayment: {
        status: input.paymentStatus,
        amount: input.paymentAmount,
        method: input.paymentMethod,
        reference: input.paymentReference,
        paidAt: when,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (input.odometer) {
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { odometer: input.odometer } });
    }

    return id;
  });

  return created(await getInvoiceViewById(invoiceId));
});
