/**
 * Every write that touches invoice money goes through here, inside a database
 * transaction, and every stored total comes from `calculateInvoiceTotals`.
 * Route handlers only parse input, call these functions and render the saved
 * record - so the database, the invoice screen, the PDF and customer messages
 * all read the same persisted values.
 */
import { Prisma, type PrismaClient } from '@prisma/client';

import {
  BillingValidationError,
  calculateInvoiceTotals,
  type DiscountType,
  type InvoiceItemKind,
  type InvoiceTotals,
  type PaymentStatus,
} from '@/lib/billing';
import { ApiError } from '@/lib/errors';
import { nextDocumentNumber } from '@/lib/garage';
import { paiseToDecimalString, toPaise } from '@/lib/money';
import { formatCurrency } from '@/lib/utils';

export type Tx = Prisma.TransactionClient;

/** Generous limits: a pooled serverless connection can be slow to hand out. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export interface ItemInput {
  kind: InvoiceItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface BillingPayload {
  items: ItemInput[];
  taxRate: number;
  discountType?: DiscountType;
  discountValue?: number;
  /** Legacy fixed discount amount. */
  discount?: number;
  expectedTotal?: number;
}

export interface InitialPayment {
  status: PaymentStatus;
  amount?: number;
  method?: string;
  reference?: string;
  paidAt: Date;
  idempotencyKey?: string;
}

const dec = (value: number) => paiseToDecimalString(toPaise(value));
const num = (value: Prisma.Decimal | number | null | undefined) => (value == null ? 0 : Number(value));

export function resolveDiscount(payload: {
  discountType?: DiscountType;
  discountValue?: number;
  discount?: number;
}): { discountType: DiscountType; discountValue: number } {
  if (payload.discountType) {
    return {
      discountType: payload.discountType,
      discountValue: payload.discountType === 'NONE' ? 0 : payload.discountValue ?? 0,
    };
  }
  if (payload.discount && payload.discount > 0) return { discountType: 'FIXED', discountValue: payload.discount };
  return { discountType: 'NONE', discountValue: 0 };
}

/** Runs the calculator and turns validation failures into a 400 with field errors. */
export function computeTotals(input: Parameters<typeof calculateInvoiceTotals>[0]): InvoiceTotals {
  try {
    return calculateInvoiceTotals(input);
  } catch (error) {
    if (error instanceof BillingValidationError) {
      throw new ApiError(400, error.message, error.fieldErrors);
    }
    throw error;
  }
}

function assertExpectedTotal(totals: InvoiceTotals, expected: number | undefined, currency: string) {
  if (expected === undefined) return;
  if (toPaise(expected) !== toPaise(totals.totalAmount)) {
    throw new ApiError(
      409,
      `The bill total works out to ${formatCurrency(totals.totalAmount, currency)}, not ${formatCurrency(
        expected,
        currency,
      )}. Nothing was saved - please review the amounts and save again.`,
      { expectedTotal: ['Total does not match the saved calculation.'] },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export type AuditAction =
  | 'INVOICE_CREATED'
  | 'INVOICE_UPDATED'
  | 'INVOICE_DELETED'
  | 'DISCOUNT_CHANGED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_VOIDED'
  | 'PAYMENT_STATUS_CHANGED'
  | 'PAYMENT_CONFIRMATION_SENT';

export async function writeAudit(
  tx: Tx,
  entry: {
    entityType: 'INVOICE' | 'PAYMENT';
    entityId: string;
    invoiceId: string | null;
    action: AuditAction;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
    userId?: string | null;
  },
) {
  await tx.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      invoiceId: entry.invoiceId,
      action: entry.action,
      oldValue: entry.oldValue ?? Prisma.JsonNull,
      newValue: entry.newValue ?? Prisma.JsonNull,
      userId: entry.userId ?? null,
    },
  });
}

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: { items: true; payments: true } }>;

function billingSnapshot(invoice: InvoiceRow) {
  return {
    subtotal: num(invoice.subtotal),
    discountType: invoice.discountType,
    discountValue: num(invoice.discountValue),
    discount: num(invoice.discount),
    taxRate: num(invoice.taxRate),
    tax: num(invoice.tax),
    totalAmount: num(invoice.totalAmount),
    amountPaid: num(invoice.amountPaid),
    balanceDue: num(invoice.balanceDue),
    paymentStatus: invoice.paymentStatus,
    items: invoice.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        kind: i.kind,
        description: i.description,
        quantity: num(i.quantity),
        unitPrice: num(i.unitPrice),
        total: num(i.total),
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* Locking and recalculation                                                   */
/* -------------------------------------------------------------------------- */

/** Row lock so concurrent payments/edits on one invoice run one after another. */
async function lockInvoice(tx: Tx, invoiceId: string): Promise<InvoiceRow> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
  if (locked.length === 0) throw new ApiError(404, 'That invoice no longer exists.');
  return tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
}

function totalsFor(invoice: InvoiceRow): InvoiceTotals {
  return computeTotals({
    items: invoice.items.map((i) => ({ kind: i.kind, quantity: i.quantity, unitPrice: i.unitPrice })),
    taxRate: invoice.taxRate,
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    payments: invoice.payments.map((p) => ({ amount: p.amount, isVoided: p.isVoided })),
  });
}

/**
 * Recomputes and stores every derived money field from the invoice's saved line
 * items, discount, tax and non-voided payments. Called at the end of every
 * invoice or payment mutation, inside the same transaction.
 */
export async function recalculateInvoice(tx: Tx, invoiceId: string, userId?: string | null) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  const totals = totalsFor(invoice);

  const active = invoice.payments
    .filter((p) => !p.isVoided)
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  const latest = active[0];

  const paidAt =
    totals.paymentStatus === 'PAID'
      ? invoice.paymentStatus === 'PAID' && invoice.paidAt
        ? invoice.paidAt
        : latest?.paidAt ?? invoice.createdAt
      : null;

  const moneyChanged =
    toPaise(num(invoice.subtotal)) !== toPaise(totals.subtotal) ||
    toPaise(num(invoice.discount)) !== toPaise(totals.discountAmount) ||
    toPaise(num(invoice.tax)) !== toPaise(totals.tax) ||
    toPaise(num(invoice.totalAmount)) !== toPaise(totals.totalAmount) ||
    toPaise(num(invoice.amountPaid)) !== toPaise(totals.amountPaid) ||
    invoice.paymentStatus !== totals.paymentStatus;

  const updated = await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: dec(totals.subtotal),
      discount: dec(totals.discountAmount),
      tax: dec(totals.tax),
      totalAmount: dec(totals.totalAmount),
      amountPaid: dec(totals.amountPaid),
      balanceDue: dec(totals.balanceDue),
      paymentStatus: totals.paymentStatus,
      paidAt,
      paymentMethod: latest?.method ?? null,
      // A stored PDF shows amounts and status; drop it so the next share or
      // download renders the saved figures.
      ...(moneyChanged ? { pdfUrl: null } : {}),
    },
  });

  if (invoice.paymentStatus !== totals.paymentStatus) {
    await writeAudit(tx, {
      entityType: 'INVOICE',
      entityId: invoiceId,
      invoiceId,
      action: 'PAYMENT_STATUS_CHANGED',
      oldValue: { paymentStatus: invoice.paymentStatus, amountPaid: num(invoice.amountPaid) },
      newValue: { paymentStatus: totals.paymentStatus, amountPaid: totals.amountPaid },
      userId,
    });
  }

  return { invoice: updated, totals, previousPdfUrl: moneyChanged ? invoice.pdfUrl : null };
}

/* -------------------------------------------------------------------------- */
/* Job card mirror                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The job card keeps the same line items as its invoice, so the job card screen,
 * vehicle history and customer profile show what was actually billed.
 */
export async function syncJobCardItems(tx: Tx, jobCardId: string, items: ItemInput[], lineTotals: number[]) {
  await tx.partUsed.deleteMany({ where: { jobCardId } });
  await tx.labourCharge.deleteMany({ where: { jobCardId } });
  await tx.serviceCharge.deleteMany({ where: { jobCardId } });

  const withTotals = items.map((item, i) => ({ ...item, total: lineTotals[i] ?? 0 }));
  const parts = withTotals.filter((i) => i.kind === 'PART');
  const labour = withTotals.filter((i) => i.kind === 'LABOUR');
  const service = withTotals.filter((i) => i.kind === 'SERVICE');

  if (parts.length) {
    await tx.partUsed.createMany({
      data: parts.map((p, i) => ({
        jobCardId,
        partName: p.description,
        quantity: dec(p.quantity),
        unitPrice: dec(p.unitPrice),
        total: dec(p.total),
        sortOrder: i,
      })),
    });
  }
  if (labour.length) {
    await tx.labourCharge.createMany({
      data: labour.map((l, i) => ({ jobCardId, description: l.description, amount: dec(l.total), sortOrder: i })),
    });
  }
  if (service.length) {
    await tx.serviceCharge.createMany({
      data: service.map((s, i) => ({ jobCardId, description: s.description, amount: dec(s.total), sortOrder: i })),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

export async function createInvoice(
  tx: Tx,
  args: {
    jobCardId: string;
    customerId: string;
    billing: BillingPayload;
    notes?: string;
    publicToken: string;
    createdAt?: Date;
    currency: string;
    userId: string;
    initialPayment?: InitialPayment;
  },
): Promise<string> {
  const discount = resolveDiscount(args.billing);
  const totals = computeTotals({
    items: args.billing.items,
    taxRate: args.billing.taxRate,
    ...discount,
  });
  assertExpectedTotal(totals, args.billing.expectedTotal, args.currency);

  let paymentAmount = 0;
  const initial = args.initialPayment;
  if (initial && initial.status !== 'UNPAID' && totals.totalAmount > 0) {
    paymentAmount = initial.status === 'PAID' ? totals.totalAmount : initial.amount ?? 0;
    if (toPaise(paymentAmount) <= 0) {
      throw new ApiError(400, 'Enter the amount received.', { paymentAmount: ['Enter the amount received.'] });
    }
    if (toPaise(paymentAmount) > toPaise(totals.totalAmount)) {
      const msg = `Amount received cannot be more than the total payable (${formatCurrency(
        totals.totalAmount,
        args.currency,
      )}).`;
      throw new ApiError(400, msg, { paymentAmount: [msg] });
    }
    if (!initial.method) {
      throw new ApiError(400, 'Choose how the customer paid.', { paymentMethod: ['Choose how the customer paid.'] });
    }
  }

  if (initial?.idempotencyKey) {
    const existing = await tx.payment.findUnique({ where: { idempotencyKey: initial.idempotencyKey } });
    if (existing) {
      throw new ApiError(409, 'This invoice was already submitted. Open the invoice list to find it.');
    }
  }

  const invoiceNumber = await nextDocumentNumber('invoice', tx);
  const when = args.createdAt ?? new Date();

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      publicToken: args.publicToken,
      jobCardId: args.jobCardId,
      customerId: args.customerId,
      subtotal: dec(totals.subtotal),
      taxRate: dec(totals.taxRate),
      tax: dec(totals.tax),
      discountType: totals.discountType,
      discountValue: dec(totals.discountValue),
      discount: dec(totals.discountAmount),
      totalAmount: dec(totals.totalAmount),
      amountPaid: '0',
      balanceDue: dec(totals.totalAmount),
      paymentStatus: totals.totalAmount > 0 ? 'UNPAID' : 'PAID',
      paidAt: totals.totalAmount > 0 ? null : when,
      notes: args.notes,
      createdById: args.userId,
      createdAt: when,
      items: {
        create: args.billing.items.map((item, i) => ({
          kind: item.kind,
          description: item.description,
          quantity: dec(item.quantity),
          unitPrice: dec(item.unitPrice),
          total: dec(totals.lineTotals[i]),
          sortOrder: i,
        })),
      },
    },
    include: { items: true, payments: true },
  });

  await syncJobCardItems(tx, args.jobCardId, args.billing.items, totals.lineTotals);

  await writeAudit(tx, {
    entityType: 'INVOICE',
    entityId: invoice.id,
    invoiceId: invoice.id,
    action: 'INVOICE_CREATED',
    newValue: { invoiceNumber, ...billingSnapshot(invoice) },
    userId: args.userId,
  });

  if (paymentAmount > 0 && initial) {
    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        customerId: args.customerId,
        amount: dec(paymentAmount),
        method: initial.method!,
        reference: initial.reference,
        paidAt: initial.paidAt,
        idempotencyKey: initial.idempotencyKey,
        createdById: args.userId,
        updatedById: args.userId,
      },
    });
    await writeAudit(tx, {
      entityType: 'PAYMENT',
      entityId: payment.id,
      invoiceId: invoice.id,
      action: 'PAYMENT_RECORDED',
      newValue: paymentSnapshot(payment),
      userId: args.userId,
    });
  }

  await recalculateInvoice(tx, invoice.id, args.userId);
  return invoice.id;
}

export async function updateInvoice(
  tx: Tx,
  invoiceId: string,
  input: {
    items?: ItemInput[];
    taxRate?: number;
    discountType?: DiscountType;
    discountValue?: number;
    discount?: number;
    expectedTotal?: number;
    notes?: string | null;
    confirmOverpayment?: boolean;
    paymentStatus?: 'PAID' | 'UNPAID';
    paymentMethod?: string;
  },
  ctx: { userId: string; currency: string },
) {
  const existing = await lockInvoice(tx, invoiceId);
  const before = billingSnapshot(existing);

  const billingTouched =
    input.items !== undefined ||
    input.taxRate !== undefined ||
    input.discountType !== undefined ||
    input.discountValue !== undefined ||
    input.discount !== undefined;

  if (billingTouched) {
    const items: ItemInput[] =
      input.items ??
      existing.items
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({ kind: i.kind, description: i.description, quantity: num(i.quantity), unitPrice: num(i.unitPrice) }));

    const discount =
      input.discountType !== undefined || input.discount !== undefined
        ? resolveDiscount(input)
        : input.discountValue !== undefined
          ? { discountType: existing.discountType, discountValue: input.discountValue }
          : { discountType: existing.discountType, discountValue: num(existing.discountValue) };

    const taxRate = input.taxRate ?? num(existing.taxRate);
    const totals = computeTotals({
      items,
      taxRate,
      ...discount,
      payments: existing.payments.map((p) => ({ amount: p.amount, isVoided: p.isVoided })),
    });
    assertExpectedTotal(totals, input.expectedTotal, ctx.currency);

    if (totals.excessPaid > 0 && !input.confirmOverpayment) {
      const msg = `The customer has already paid ${formatCurrency(
        totals.amountPaid,
        ctx.currency,
      )}, which is ${formatCurrency(totals.excessPaid, ctx.currency)} more than the new total. Confirm to save it as excess received, or void a payment first.`;
      throw new ApiError(409, msg, { confirmOverpayment: [msg] });
    }

    if (input.items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      await tx.invoiceItem.createMany({
        data: input.items.map((item, i) => ({
          invoiceId,
          kind: item.kind,
          description: item.description,
          quantity: dec(item.quantity),
          unitPrice: dec(item.unitPrice),
          total: dec(totals.lineTotals[i]),
          sortOrder: i,
        })),
      });
      await syncJobCardItems(tx, existing.jobCardId, input.items, totals.lineTotals);
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        taxRate: dec(totals.taxRate),
        discountType: totals.discountType,
        discountValue: dec(totals.discountValue),
      },
    });

    if (
      before.discountType !== totals.discountType ||
      toPaise(before.discountValue) !== toPaise(totals.discountValue) ||
      toPaise(before.discount) !== toPaise(totals.discountAmount)
    ) {
      await writeAudit(tx, {
        entityType: 'INVOICE',
        entityId: invoiceId,
        invoiceId,
        action: 'DISCOUNT_CHANGED',
        oldValue: { discountType: before.discountType, discountValue: before.discountValue, discount: before.discount },
        newValue: {
          discountType: totals.discountType,
          discountValue: totals.discountValue,
          discount: totals.discountAmount,
        },
        userId: ctx.userId,
      });
    }
  }

  if (input.notes !== undefined) {
    await tx.invoice.update({ where: { id: invoiceId }, data: { notes: input.notes } });
  }

  // Legacy manual toggle - kept, but translated into real payment records.
  if (input.paymentStatus === 'PAID') {
    const { invoice: fresh } = await recalculateInvoice(tx, invoiceId, ctx.userId);
    if (num(fresh.balanceDue) > 0) {
      await insertPayment(tx, fresh, {
        amount: num(fresh.balanceDue),
        method: input.paymentMethod || 'Cash',
        paidAt: new Date(),
        userId: ctx.userId,
      });
    }
  } else if (input.paymentStatus === 'UNPAID') {
    for (const payment of existing.payments.filter((p) => !p.isVoided)) {
      await markVoided(tx, payment, 'Invoice marked unpaid', ctx.userId);
    }
  }

  const { invoice: after } = await recalculateInvoice(tx, invoiceId, ctx.userId);

  if (billingTouched || input.notes !== undefined) {
    const afterRow = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true, payments: true },
    });
    await writeAudit(tx, {
      entityType: 'INVOICE',
      entityId: invoiceId,
      invoiceId,
      action: 'INVOICE_UPDATED',
      oldValue: { ...before, notes: existing.notes },
      newValue: { ...billingSnapshot(afterRow), notes: afterRow.notes },
      userId: ctx.userId,
    });
  }

  return after;
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

type PaymentRow = Prisma.PaymentGetPayload<object>;

function paymentSnapshot(p: PaymentRow) {
  return {
    amount: num(p.amount),
    method: p.method,
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
    notes: p.notes,
    isVoided: p.isVoided,
    voidReason: p.voidReason,
  };
}

async function insertPayment(
  tx: Tx,
  invoice: { id: string; customerId: string },
  p: { amount: number; method: string; paidAt: Date; reference?: string; notes?: string; idempotencyKey?: string; userId: string },
) {
  const payment = await tx.payment.create({
    data: {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amount: dec(p.amount),
      method: p.method,
      paidAt: p.paidAt,
      reference: p.reference,
      notes: p.notes,
      idempotencyKey: p.idempotencyKey,
      createdById: p.userId,
      updatedById: p.userId,
    },
  });
  await writeAudit(tx, {
    entityType: 'PAYMENT',
    entityId: payment.id,
    invoiceId: invoice.id,
    action: 'PAYMENT_RECORDED',
    newValue: paymentSnapshot(payment),
    userId: p.userId,
  });
  return payment;
}

async function markVoided(tx: Tx, payment: PaymentRow, reason: string, userId: string) {
  const voided = await tx.payment.update({
    where: { id: payment.id },
    data: { isVoided: true, voidedAt: new Date(), voidReason: reason, updatedById: userId },
  });
  await writeAudit(tx, {
    entityType: 'PAYMENT',
    entityId: payment.id,
    invoiceId: payment.invoiceId,
    action: 'PAYMENT_VOIDED',
    oldValue: paymentSnapshot(payment),
    newValue: paymentSnapshot(voided),
    userId,
  });
  return voided;
}

export interface RecordPaymentArgs {
  amount: number;
  method: string;
  paidAt?: Date;
  reference?: string;
  notes?: string;
  idempotencyKey: string;
}

/**
 * Records a payment against the balance due. A repeated submission with the same
 * idempotency key returns the original payment instead of recording it again.
 */
export async function recordPayment(
  tx: Tx,
  invoiceId: string,
  args: RecordPaymentArgs,
  ctx: { userId: string; currency: string },
): Promise<{ paymentId: string; duplicate: boolean }> {
  const replay = await tx.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
  if (replay) {
    if (replay.invoiceId !== invoiceId) throw new ApiError(409, 'This payment was already submitted for another invoice.');
    return { paymentId: replay.id, duplicate: true };
  }

  const locked = await lockInvoice(tx, invoiceId);
  if (locked.isArchived) throw new ApiError(400, 'Restore this invoice before recording a payment.');

  // Normalise first so the balance check uses the authoritative figures.
  const { invoice } = await recalculateInvoice(tx, invoiceId, ctx.userId);
  const balance = num(invoice.balanceDue);

  if (toPaise(balance) <= 0) {
    throw new ApiError(409, 'This invoice is already fully paid.', { amount: ['Nothing is due on this invoice.'] });
  }
  if (toPaise(args.amount) > toPaise(balance)) {
    const msg = `Only ${formatCurrency(balance, ctx.currency)} is due on this invoice.`;
    throw new ApiError(400, msg, { amount: [msg] });
  }

  const payment = await insertPayment(tx, invoice, {
    amount: args.amount,
    method: args.method,
    paidAt: args.paidAt ?? new Date(),
    reference: args.reference,
    notes: args.notes,
    idempotencyKey: args.idempotencyKey,
    userId: ctx.userId,
  });

  await recalculateInvoice(tx, invoiceId, ctx.userId);
  return { paymentId: payment.id, duplicate: false };
}

export async function voidPayment(tx: Tx, invoiceId: string, paymentId: string, reason: string, userId: string) {
  await lockInvoice(tx, invoiceId);
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.invoiceId !== invoiceId) throw new ApiError(404, 'That payment no longer exists.');
  if (payment.isVoided) throw new ApiError(409, 'This payment is already voided.');
  await markVoided(tx, payment, reason, userId);
  await recalculateInvoice(tx, invoiceId, userId);
}

/**
 * Atomically claims the confirmation send for a payment. Unless `resend` is set,
 * only the first caller wins, so two quick clicks cannot both message the
 * customer. Returns null when a confirmation was already sent.
 */
export async function claimConfirmationSend(
  tx: Tx,
  paymentId: string,
  { resend, channel, userId }: { resend: boolean; channel: 'whatsapp_api' | 'whatsapp_link'; userId: string },
) {
  const claimed = await tx.payment.updateMany({
    where: { id: paymentId, isVoided: false, ...(resend ? {} : { confirmationSentAt: null }) },
    data: { confirmationSentAt: new Date(), confirmationChannel: channel, confirmationCount: { increment: 1 } },
  });
  if (claimed.count === 0) return null;

  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  await writeAudit(tx, {
    entityType: 'PAYMENT',
    entityId: paymentId,
    invoiceId: payment.invoiceId,
    action: 'PAYMENT_CONFIRMATION_SENT',
    newValue: { channel, count: payment.confirmationCount, amount: num(payment.amount), resend },
    userId,
  });
  return payment;
}

/** Permanently deletes an invoice and its job card - refused while payments are on record. */
export async function deleteInvoice(tx: Tx, invoiceId: string, userId: string) {
  const invoice = await lockInvoice(tx, invoiceId);
  const activePayments = invoice.payments.filter((p) => !p.isVoided);
  if (activePayments.length > 0) {
    throw new ApiError(
      409,
      `${invoice.invoiceNumber} has ${activePayments.length} payment(s) recorded. Void them first, or archive the invoice to keep its history.`,
    );
  }

  await writeAudit(tx, {
    entityType: 'INVOICE',
    entityId: invoice.id,
    invoiceId: invoice.id,
    action: 'INVOICE_DELETED',
    oldValue: { invoiceNumber: invoice.invoiceNumber, ...billingSnapshot(invoice) },
    userId,
  });
  await tx.invoice.delete({ where: { id: invoiceId } });
  await tx.jobCard.delete({ where: { id: invoice.jobCardId } });
  return invoice;
}

/** Convenience wrapper so callers don't repeat the transaction options. */
export function inTransaction<T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, TX_OPTIONS);
}
