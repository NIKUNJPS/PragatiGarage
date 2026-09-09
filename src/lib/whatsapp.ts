import { appUrl, whatsappCloudConfig } from '@/lib/env';
import type { InvoiceView } from '@/lib/invoice-data';
import { formatCurrency, toWhatsAppNumber } from '@/lib/utils';

/** Stable, publicly reachable link to an invoice (no login required). */
export function invoiceShareUrl(publicToken: string): string {
  return `${appUrl()}/i/${publicToken}`;
}

/** Direct PDF download link for the same public invoice. */
export function invoicePdfUrl(publicToken: string): string {
  return `${appUrl()}/i/${publicToken}/pdf`;
}

export function buildInvoiceMessage(invoice: InvoiceView): string {
  const link = invoice.pdfUrl || invoiceShareUrl(invoice.publicToken);
  const amount = formatCurrency(invoice.totalAmount, invoice.garage.currency);
  const status =
    invoice.paymentStatus === 'PAID'
      ? 'Payment received - thank you!'
      : 'Kindly clear the payment at your convenience.';

  return [
    `Hi ${invoice.customer.name},`,
    '',
    `Here is your invoice from ${invoice.garage.name} for vehicle ${invoice.vehicle.vehicleNumber}.`,
    '',
    `Invoice: ${invoice.invoiceNumber}`,
    `Total: ${amount}`,
    status,
    '',
    `View / download: ${link}`,
    '',
    invoice.garage.phone ? `For any questions call us on ${invoice.garage.phone}.` : '',
    `- ${invoice.garage.name}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/** Whole days elapsed since the invoice was raised. */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * Polite payment-reminder message for an unpaid invoice. Same free wa.me path
 * as the invoice itself - it carries the amount due, the invoice reference and
 * a link to view / pay-reference the bill.
 */
export function buildReminderMessage(invoice: InvoiceView): string {
  const link = invoice.pdfUrl || invoiceShareUrl(invoice.publicToken);
  const amount = formatCurrency(invoice.totalAmount, invoice.garage.currency);
  const days = daysSince(invoice.createdAt);
  const age =
    days <= 0
      ? 'is pending'
      : `has been pending for ${days} day${days === 1 ? '' : 's'}`;

  return [
    `Hi ${invoice.customer.name},`,
    '',
    `This is a gentle reminder from ${invoice.garage.name}.`,
    `Payment for invoice ${invoice.invoiceNumber} (vehicle ${invoice.vehicle.vehicleNumber}) ${age}.`,
    '',
    `Amount due: ${amount}`,
    '',
    `Invoice details: ${link}`,
    '',
    invoice.garage.phone
      ? `Please ignore this message if you have already paid. For any help call us on ${invoice.garage.phone}.`
      : 'Please ignore this message if you have already paid.',
    `- ${invoice.garage.name}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/**
 * Friendly "time for your next service" reminder for a vehicle, sent over the
 * same free wa.me path. References the vehicle and when it was last serviced.
 */
export function buildServiceReminderMessage(invoice: InvoiceView): string {
  const vehicle =
    [invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' ') ||
    invoice.vehicle.vehicleNumber;
  const lastServiced = formatDateLike(invoice.jobCard.createdAt || invoice.createdAt);

  return [
    `Hi ${invoice.customer.name},`,
    '',
    `This is a friendly service reminder from ${invoice.garage.name}.`,
    `Your ${vehicle} (${invoice.vehicle.vehicleNumber}) is due for its next service / check-up.`,
    lastServiced ? `Last serviced on ${lastServiced}.` : '',
    '',
    'Regular servicing keeps your vehicle running smoothly and safely.',
    invoice.garage.phone
      ? `Please call us on ${invoice.garage.phone} or reply here to book a slot.`
      : 'Please reply here to book a slot.',
    '',
    `- ${invoice.garage.name}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/** Local date formatter (avoids importing the whole utils date helper here). */
function formatDateLike(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Click-to-chat deep link. Works on WhatsApp Web and the mobile app with no
 * paid API setup - this is the default sharing path.
 */
export function waMeLink(rawNumber: string, message: string): string {
  const number = toWhatsAppNumber(rawNumber);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export const hasWhatsAppCloudApi = () => whatsappCloudConfig() !== null;

/**
 * Optional upgrade path: when WhatsApp Cloud API credentials are present the
 * PDF is delivered straight to the customer instead of opening a chat window.
 * Returns false when it is not configured or the send fails, so the caller can
 * fall back to the wa.me link.
 */
export async function sendInvoiceViaCloudApi(
  invoice: InvoiceView,
  toNumber: string,
): Promise<boolean> {
  const cfg = whatsappCloudConfig();
  if (!cfg) return false;

  const to = toWhatsAppNumber(toNumber);
  if (!to) return false;

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: {
          link: invoice.pdfUrl || invoicePdfUrl(invoice.publicToken),
          filename: `${invoice.invoiceNumber}.pdf`,
          caption: buildInvoiceMessage(invoice).slice(0, 1000),
        },
      }),
    });

    if (!res.ok) {
      console.warn('[whatsapp] Cloud API send failed:', await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[whatsapp] Cloud API send error:', error);
    return false;
  }
}
