import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, created, ok, parseBody, withAuth } from '@/lib/api';
import { getGarage } from '@/lib/garage';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { inTransaction, recordPayment } from '@/lib/invoice-service';
import { recordPaymentSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/**
 * Record money received against an invoice. The amount is checked against the
 * saved balance under a row lock, and the invoice's paid amount, balance and
 * status are recalculated in the same transaction.
 *
 * Returns 201 for a new payment, or 200 with `duplicate: true` when the same
 * submission (idempotency key) was already recorded.
 */
export const POST = withAuth(async (req, { params, user }) => {
  const input = await parseBody(req, recordPaymentSchema);
  const garage = await getGarage();

  let result: { paymentId: string; duplicate: boolean };
  try {
    result = await inTransaction(prisma, (tx) =>
      recordPayment(tx, params.id, input, { userId: user.id, currency: garage.currency }),
    );
  } catch (error) {
    // Two identical submissions raced past the replay check; the loser gets the winner's payment.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (!existing || existing.invoiceId !== params.id) throw error;
      result = { paymentId: existing.id, duplicate: true };
    } else {
      throw error;
    }
  }

  const invoice = await getInvoiceViewById(params.id);
  if (!invoice) throw new ApiError(404, 'That invoice no longer exists.');

  const body = { invoice, paymentId: result.paymentId, duplicate: result.duplicate };
  return result.duplicate ? ok(body) : created(body);
});
