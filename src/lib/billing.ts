/**
 * The single billing calculation used everywhere: live form previews, invoice
 * create/edit on the server, payments, dashboard splits, PDF and messages.
 * Pure and framework-free so the browser and the server run the same code.
 *
 *   line total      = quantity x unit price
 *   subtotal        = sum of line totals                (gross amount)
 *   discount        = PERCENT: subtotal x value%  |  FIXED: value  |  NONE: 0
 *   taxable amount  = subtotal - discount
 *   tax             = taxable amount x tax rate%
 *   total payable   = taxable amount + tax
 *   amount paid     = sum of non-voided payments
 *   balance due     = max(total payable - amount paid, 0)
 *
 * Discount is applied before tax, as GST is charged on the discounted value.
 */
import {
  decimalPlaces,
  fromPaise,
  isValidNumber,
  multiplyToPaise,
  percentOfPaise,
  proportionPaise,
  scaleDecimal,
  sumPaise,
  toPaise,
  type DecimalInput,
  type Paise,
} from '@/lib/money';

export type InvoiceItemKind = 'PART' | 'LABOUR' | 'SERVICE';
export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export const DISCOUNT_TYPES: readonly DiscountType[] = ['NONE', 'PERCENT', 'FIXED'];
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MAX_AMOUNT = 99_999_999.99;
export const MAX_QUANTITY = 100_000;

export interface BillingLineInput {
  kind?: InvoiceItemKind;
  quantity: DecimalInput;
  unitPrice: DecimalInput;
}

export interface BillingInput {
  items: BillingLineInput[];
  taxRate?: DecimalInput;
  discountType?: DiscountType;
  discountValue?: DecimalInput;
  payments?: Array<{ amount: DecimalInput; isVoided?: boolean }>;
}

export interface InvoiceTotals {
  lineTotals: number[];
  partsTotal: number;
  labourTotal: number;
  serviceTotal: number;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  taxRate: number;
  tax: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  /** Money received beyond the total payable (e.g. the bill was reduced after payment). */
  excessPaid: number;
  paymentStatus: PaymentStatus;
}

export type FieldErrors = Record<string, string[]>;

export class BillingValidationError extends Error {
  constructor(public fieldErrors: FieldErrors) {
    super(Object.values(fieldErrors)[0]?.[0] ?? 'Invalid billing data.');
    this.name = 'BillingValidationError';
  }
}

function addError(errors: FieldErrors, field: string, message: string) {
  (errors[field] ??= []).push(message);
}

/** UNPAID when nothing is paid, PARTIAL while money is outstanding, PAID once covered. */
export function derivePaymentStatus(totalPaise: Paise, paidPaise: Paise): PaymentStatus {
  if (totalPaise <= 0) return 'PAID';
  if (paidPaise <= 0) return 'UNPAID';
  return paidPaise >= totalPaise ? 'PAID' : 'PARTIAL';
}

function readMoney(
  value: DecimalInput,
  field: string,
  label: string,
  errors: FieldErrors,
  { allowZero = true, max = MAX_AMOUNT }: { allowZero?: boolean; max?: number } = {},
): Paise {
  if (!isValidNumber(value)) {
    addError(errors, field, `${label} must be a number.`);
    return 0;
  }
  if (decimalPlaces(value) > 2) {
    addError(errors, field, `${label} can have at most 2 decimal places.`);
    return 0;
  }
  const paise = Number(scaleDecimal(value, 2));
  if (paise < 0) addError(errors, field, `${label} cannot be negative.`);
  else if (!allowZero && paise === 0) addError(errors, field, `${label} must be greater than zero.`);
  else if (paise > toPaise(max)) addError(errors, field, `${label} is too large.`);
  else return paise;
  return 0;
}

/**
 * Validates and calculates in one pass. Never throws: invalid parts are counted
 * as zero and reported in `errors`, so a form can show a live preview while the
 * user is still typing. The server uses `calculateInvoiceTotals`, which throws.
 */
export function evaluateInvoice(input: BillingInput): { totals: InvoiceTotals; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const byKind: Record<InvoiceItemKind, Paise> = { PART: 0, LABOUR: 0, SERVICE: 0 };
  const linePaise = input.items.map((item, i) => {
    const qtyOk =
      isValidNumber(item.quantity) &&
      decimalPlaces(item.quantity) <= 2 &&
      Number(scaleDecimal(item.quantity, 2)) > 0 &&
      Number(scaleDecimal(item.quantity, 2)) <= MAX_QUANTITY * 100;
    if (!qtyOk) {
      addError(errors, `items.${i}.quantity`, 'Quantity must be greater than zero (up to 2 decimals).');
    }
    const errorCount = errors[`items.${i}.unitPrice`]?.length ?? 0;
    readMoney(item.unitPrice, `items.${i}.unitPrice`, 'Price', errors);
    const priceOk = (errors[`items.${i}.unitPrice`]?.length ?? 0) === errorCount;
    const total = qtyOk && priceOk ? multiplyToPaise(item.quantity, item.unitPrice) : 0;
    if (total > toPaise(MAX_AMOUNT)) addError(errors, `items.${i}.unitPrice`, 'Line total is too large.');
    byKind[item.kind ?? 'PART'] += total;
    return total;
  });

  const subtotal = sumPaise(linePaise);

  let taxPercent: DecimalInput = input.taxRate ?? 0;
  if (!isValidNumber(taxPercent) || decimalPlaces(taxPercent) > 2) {
    addError(errors, 'taxRate', 'Tax rate must be a number with at most 2 decimals.');
    taxPercent = 0;
  } else if (Number(scaleDecimal(taxPercent, 2)) < 0) {
    addError(errors, 'taxRate', 'Tax rate cannot be negative.');
    taxPercent = 0;
  } else if (Number(scaleDecimal(taxPercent, 2)) > 10_000) {
    addError(errors, 'taxRate', 'Tax rate cannot exceed 100%.');
    taxPercent = 0;
  }

  const discountType: DiscountType = input.discountType ?? 'NONE';
  let discountValuePaise: Paise = 0; // hundredths of a percent for PERCENT, paise for FIXED
  let discount: Paise = 0;

  if (!DISCOUNT_TYPES.includes(discountType)) {
    addError(errors, 'discountType', 'Choose a valid discount type.');
  } else if (discountType !== 'NONE') {
    const label = discountType === 'PERCENT' ? 'Discount percentage' : 'Discount';
    discountValuePaise = readMoney(input.discountValue, 'discountValue', label, errors);

    if (discountType === 'PERCENT') {
      if (discountValuePaise > 10_000) {
        addError(errors, 'discountValue', 'Discount percentage cannot exceed 100%.');
        discountValuePaise = 0;
      }
      discount = percentOfPaise(subtotal, discountValuePaise / 100);
    } else {
      if (discountValuePaise > subtotal) {
        addError(
          errors,
          'discountValue',
          `Discount cannot be more than the bill amount (${fromPaise(subtotal).toFixed(2)}).`,
        );
        discountValuePaise = 0;
      }
      discount = discountValuePaise;
    }
  }

  const taxable = subtotal - discount;
  const tax = percentOfPaise(taxable, taxPercent);
  const total = taxable + tax;

  let paid: Paise = 0;
  (input.payments ?? []).forEach((payment, i) => {
    if (payment.isVoided) return;
    paid += readMoney(payment.amount, `payments.${i}.amount`, 'Payment amount', errors, {
      allowZero: false,
    });
  });

  return {
    errors,
    totals: {
      lineTotals: linePaise.map(fromPaise),
      partsTotal: fromPaise(byKind.PART),
      labourTotal: fromPaise(byKind.LABOUR),
      serviceTotal: fromPaise(byKind.SERVICE),
      subtotal: fromPaise(subtotal),
      discountType,
      discountValue: discountType === 'NONE' ? 0 : fromPaise(discountValuePaise),
      discountAmount: fromPaise(discount),
      taxableAmount: fromPaise(taxable),
      taxRate: fromPaise(Number(scaleDecimal(taxPercent, 2))),
      tax: fromPaise(tax),
      totalAmount: fromPaise(total),
      amountPaid: fromPaise(paid),
      balanceDue: fromPaise(Math.max(total - paid, 0)),
      excessPaid: fromPaise(Math.max(paid - total, 0)),
      paymentStatus: derivePaymentStatus(total, paid),
    },
  };
}

/** Server-side entry point: throws BillingValidationError on any invalid input. */
export function calculateInvoiceTotals(input: BillingInput): InvoiceTotals {
  const { totals, errors } = evaluateInvoice(input);
  if (Object.keys(errors).length > 0) throw new BillingValidationError(errors);
  return totals;
}

/**
 * Splits money collected against an invoice into spare parts vs labour in the
 * same proportion as the bill (service charges count as labour).
 */
export function splitCollected(
  collected: number,
  partsTotal: number,
  subtotal: number,
): { parts: number; labour: number } {
  const amount = toPaise(collected);
  const whole = toPaise(subtotal);
  if (whole <= 0) return { parts: 0, labour: fromPaise(amount) };
  const parts = proportionPaise(amount, toPaise(partsTotal), whole);
  return { parts: fromPaise(parts), labour: fromPaise(amount - parts) };
}

export function discountLabel(type: DiscountType, value: number): string {
  if (type === 'PERCENT') return `Discount (${value}%)`;
  return 'Discount';
}
