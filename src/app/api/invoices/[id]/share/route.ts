import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { renderInvoicePdf } from '@/lib/pdf';
import { uploadInvoicePdf } from '@/lib/storage';
import { optionalPhoneSchema } from '@/lib/validations';
import {
  buildInvoiceMessage,
  buildReminderMessage,
  buildServiceReminderMessage,
  invoicePdfUrl,
  invoiceShareUrl,
  sendInvoiceViaCloudApi,
  waMeLink,
} from '@/lib/whatsapp';
import type { ShareInvoiceResponse } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const shareSchema = z.object({
  /** Optional override, used when the customer has no number on file yet. */
  whatsappNumber: optionalPhoneSchema,
  /** Save the entered number back onto the customer record. */
  saveToCustomer: z.boolean().optional().default(true),
  /**
   * 'invoice' sends the bill, 'reminder' a payment-due nudge, 'service' a
   * next-service reminder for the vehicle.
   */
  kind: z.enum(['invoice', 'reminder', 'service']).optional().default('invoice'),
});

/**
 * One-click WhatsApp share.
 *
 * Guarantees the PDF exists at a stable public URL, then returns a ready-to-open
 * wa.me deep link pre-addressed to the customer with the message pre-filled.
 * When WhatsApp Cloud API credentials are configured the document is delivered
 * directly instead, and the link is still returned as a fallback.
 */
export const POST = withAuth(async (req, { params }) => {
  const { whatsappNumber, saveToCustomer, kind } = await parseBody(req, shareSchema);

  let invoice = await getInvoiceViewById(params.id);
  if (!invoice) throw new ApiError(404, 'That invoice no longer exists.');

  const targetNumber =
    whatsappNumber || invoice.customer.whatsappNumber || invoice.customer.mobileNumber || '';

  if (!targetNumber) {
    throw new ApiError(400, 'This customer has no phone number saved. Add one to share on WhatsApp.', {
      whatsappNumber: ['Enter a WhatsApp number to send this invoice to.'],
    });
  }

  if (whatsappNumber && saveToCustomer) {
    await prisma.customer.update({
      where: { id: invoice.customer.id },
      data: { whatsappNumber },
    });
  }

  // The invoice message links to the PDF; reminders are plain text and don't.
  if (kind === 'invoice' && !invoice.pdfUrl) {
    try {
      const pdf = await renderInvoicePdf(invoice);
      const uploaded = await uploadInvoicePdf(invoice.invoiceNumber, pdf);
      if (uploaded) {
        await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: uploaded } });
        invoice = { ...invoice, pdfUrl: uploaded };
      }
    } catch (error) {
      // Without object storage the public /i/<token> page serves the invoice and
      // renders the PDF on demand, so this is never fatal.
      console.warn('[invoice-share] PDF pre-generation skipped:', error);
    }
  }

  const message =
    kind === 'service'
      ? buildServiceReminderMessage(invoice)
      : kind === 'reminder'
        ? buildReminderMessage(invoice)
        : buildInvoiceMessage(invoice);

  // Direct Cloud API delivery only applies to the invoice document itself; a
  // reminder is a plain text nudge sent through the same free wa.me link.
  const sentDirectly =
    kind === 'invoice' ? await sendInvoiceViaCloudApi(invoice, targetNumber) : false;

  const body: ShareInvoiceResponse = {
    waLink: waMeLink(targetNumber, message),
    shareUrl: invoiceShareUrl(invoice.publicToken),
    pdfUrl: invoice.pdfUrl || invoicePdfUrl(invoice.publicToken),
    message,
    sentDirectly,
    whatsappNumber: targetNumber,
  };

  return ok(body);
});
