import { prisma } from '@/lib/prisma';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { claimConfirmationSend, inTransaction } from '@/lib/invoice-service';
import { buildPaymentConfirmationMessage } from '@/lib/payment-message';
import { formatDateTime } from '@/lib/utils';
import { paymentConfirmationSchema } from '@/lib/validations';
import { hasWhatsAppCloudApi, sendTextViaCloudApi, waMeLink } from '@/lib/whatsapp';
import type { PaymentConfirmationResponse } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Send the customer a payment confirmation for one recorded payment, over the
 * existing WhatsApp integration (Cloud API when configured, otherwise a
 * pre-filled wa.me link). The message is built from the saved invoice and
 * payment. A confirmation already sent is refused unless `resend` is set.
 */
export const POST = withAuth(async (req, { params, user }) => {
  const { resend, whatsappNumber } = await parseBody(req, paymentConfirmationSchema);

  const invoice = await getInvoiceViewById(params.id);
  if (!invoice) throw new ApiError(404, 'That invoice no longer exists.');

  const payment = invoice.payments.find((p) => p.id === params.paymentId);
  if (!payment) throw new ApiError(404, 'That payment no longer exists.');
  if (payment.isVoided) throw new ApiError(400, 'This payment was voided, so there is nothing to confirm.');

  if (payment.confirmationSentAt && !resend) {
    throw new ApiError(409, `Confirmation already sent on ${formatDateTime(payment.confirmationSentAt)}.`, {
      resend: ['Choose "Send again" to send another confirmation.'],
    });
  }

  const target = whatsappNumber || invoice.customer.whatsappNumber || invoice.customer.mobileNumber || '';
  if (!target) {
    throw new ApiError(400, 'This customer has no phone number saved.', {
      whatsappNumber: ['Enter a WhatsApp number to send the confirmation to.'],
    });
  }
  if (whatsappNumber) {
    await prisma.customer.update({ where: { id: invoice.customer.id }, data: { whatsappNumber } });
  }

  const message = buildPaymentConfirmationMessage({
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    garageName: invoice.garage.name,
    currency: invoice.garage.currency,
    paymentAmount: payment.amount,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
    paymentCount: invoice.payments.filter((p) => !p.isVoided).length,
  });

  const hasApi = hasWhatsAppCloudApi();
  const claimed = await inTransaction(prisma, (tx) =>
    claimConfirmationSend(tx, payment.id, {
      resend,
      channel: hasApi ? 'whatsapp_api' : 'whatsapp_link',
      userId: user.id,
    }),
  );
  if (!claimed) {
    throw new ApiError(409, 'A confirmation for this payment was just sent.', {
      resend: ['Choose "Send again" to send another confirmation.'],
    });
  }

  const sentDirectly = hasApi ? await sendTextViaCloudApi(target, message) : false;
  if (hasApi && !sentDirectly) {
    await prisma.payment.update({ where: { id: payment.id }, data: { confirmationChannel: 'whatsapp_link' } });
  }

  const body: PaymentConfirmationResponse = {
    message,
    waLink: waMeLink(target, message),
    sentDirectly,
    whatsappNumber: target,
    confirmationSentAt: claimed.confirmationSentAt!.toISOString(),
  };
  return ok(body);
});
