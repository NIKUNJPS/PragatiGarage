import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { deleteInvoice, inTransaction, updateInvoice } from '@/lib/invoice-service';
import { updateInvoiceSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { params }) => {
  const view = await getInvoiceViewById(params.id);
  if (!view) throw new ApiError(404, 'That invoice no longer exists.');
  return ok(view);
});

/**
 * Edit line items, tax, discount or notes. Totals, paid amount, balance and
 * status are all recalculated from the saved data in the same transaction.
 */
export const PATCH = withAuth(async (req, { params, user }) => {
  const input = await parseBody(req, updateInvoiceSchema);
  const garage = await getGarage();

  await inTransaction(prisma, (tx) =>
    updateInvoice(tx, params.id, input, { userId: user.id, currency: garage.currency }),
  );

  const view = await getInvoiceViewById(params.id);
  if (!view) throw new ApiError(404, 'That invoice no longer exists.');
  return ok(view);
});

/**
 * Delete an invoice.
 *
 * Default (?mode=archive or none): soft-delete (hide but keep the record).
 * ?mode=hard: permanently remove the invoice, its line items AND the job card
 * that was created with it - refused while payments are recorded against it, so
 * money received is never erased. Admin only.
 */
export const DELETE = withAuth(async (req, { params, user }) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');
  const restore = url.searchParams.get('restore') === 'true';

  if (mode === 'hard') {
    const deleted = await inTransaction(prisma, (tx) => deleteInvoice(tx, params.id, user.id));
    return ok({ deleted: true, message: `Invoice ${deleted.invoiceNumber} deleted permanently.` });
  }

  const exists = await prisma.invoice.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, 'That invoice no longer exists.');
  await prisma.invoice.update({ where: { id: params.id }, data: { isArchived: !restore } });

  return ok({
    ...(await getInvoiceViewById(params.id)),
    deleted: false,
    message: restore ? 'Invoice restored.' : 'Invoice archived.',
  });
}, adminOnly);
