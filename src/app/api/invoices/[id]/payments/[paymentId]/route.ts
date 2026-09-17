import { prisma } from '@/lib/prisma';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { inTransaction, voidPayment } from '@/lib/invoice-service';
import { voidPaymentSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/**
 * Void a payment entered by mistake. The record is kept (with who, when and why)
 * and simply stops counting towards the amount paid.
 */
export const PATCH = withAuth(async (req, { params, user }) => {
  const { reason } = await parseBody(req, voidPaymentSchema);

  await inTransaction(prisma, (tx) => voidPayment(tx, params.id, params.paymentId, reason, user.id));

  const invoice = await getInvoiceViewById(params.id);
  if (!invoice) throw new ApiError(404, 'That invoice no longer exists.');
  return ok({ invoice });
});
