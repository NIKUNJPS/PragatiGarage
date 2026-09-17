import { formatCurrency } from '@/lib/utils';

export interface PaymentMessageInput {
  customerName: string;
  invoiceNumber: string;
  garageName: string;
  currency: string;
  /** The payment being confirmed. */
  paymentAmount: number;
  /** All non-voided payments on the invoice, including this one. */
  amountPaid: number;
  balanceDue: number;
  paymentCount: number;
}

/**
 * Customer-facing receipt text. Built from the saved invoice and payment, and
 * shared by the confirmation preview and the actual send so both always match.
 */
export function buildPaymentConfirmationMessage(input: PaymentMessageInput): string {
  const money = (value: number) => formatCurrency(value, input.currency);
  const settled = input.balanceDue <= 0;

  const lines = [
    `Dear ${input.customerName},`,
    '',
    settled
      ? `We have successfully received your payment of ${money(input.paymentAmount)} against Invoice #${input.invoiceNumber}.`
      : `We have received your payment of ${money(input.paymentAmount)} against Invoice #${input.invoiceNumber}.`,
  ];

  if (input.paymentCount > 1) lines.push(`Total received so far: ${money(input.amountPaid)}.`);

  if (settled) {
    lines.push('Your invoice is now fully paid.', '', 'Thank you for your payment.', 'We appreciate your business with us.');
  } else {
    lines.push(`Outstanding balance: ${money(input.balanceDue)}.`, '', 'Thank you for your payment.');
  }

  lines.push('', `- ${input.garageName}`);
  return lines.join('\n');
}
