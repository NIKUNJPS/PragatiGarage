/**
 * Daily and monthly revenue reports.
 *
 * Two figures are always kept apart:
 *  - billed:    the final payable amount of bills issued in the period
 *  - collected: payments received in the period (against any bill), the same
 *               "revenue" the dashboard shows
 * Archived bills and voided payments are left out of both. All sums are done in
 * whole paise so a month of bills never drifts by a paisa.
 *
 * The aggregation helpers are pure; `buildDailyReport` / `buildMonthlyReport`
 * run the queries. Day and month boundaries come from `@/lib/timezone`.
 */
import type { PrismaClient } from '@prisma/client';

import { splitCollected } from '@/lib/billing';
import { fromPaise, toPaise } from '@/lib/money';
import { nameKey } from '@/lib/staff-names';
import {
  addMonths,
  bucketIndex,
  dayRange,
  daysOfMonth,
  monthKeyOf,
  monthRange,
  todayKey,
} from '@/lib/timezone';
import { toNumber, type DecimalLike } from '@/lib/utils';
import type {
  DailyReport,
  InvoiceItemKind,
  MethodTotal,
  MonthlyReport,
  PaymentStatus,
  PeriodTotal,
  PersonTotal,
  RevenueSummary,
} from '@/types';

type ReportDb = Pick<PrismaClient, 'invoice' | 'payment'>;

/* -------------------------------------------------------------------------- */
/* Pure aggregation                                                            */
/* -------------------------------------------------------------------------- */

export interface BillRow {
  totalAmount: DecimalLike;
  discount: DecimalLike;
  tax: DecimalLike;
  amountPaid: DecimalLike;
  balanceDue: DecimalLike;
  paymentStatus: PaymentStatus;
  attendantName: string | null;
  billedByName: string | null;
  items: Array<{ kind: InvoiceItemKind; total: DecimalLike }>;
}

export interface PaymentRow {
  amount: DecimalLike;
  method: string;
  invoice: { subtotal: DecimalLike; items: Array<{ kind: InvoiceItemKind; total: DecimalLike }> };
}

const paise = (v: DecimalLike) => toPaise(toNumber(v));

export function summarizeBills(bills: BillRow[]) {
  const sums = { billed: 0, parts: 0, labour: 0, service: 0, discount: 0, tax: 0, paid: 0, outstanding: 0 };
  const counts = { PAID: 0, PARTIAL: 0, UNPAID: 0 };
  for (const bill of bills) {
    sums.billed += paise(bill.totalAmount);
    sums.discount += paise(bill.discount);
    sums.tax += paise(bill.tax);
    sums.paid += paise(bill.amountPaid);
    sums.outstanding += paise(bill.balanceDue);
    counts[bill.paymentStatus] += 1;
    for (const item of bill.items) {
      if (item.kind === 'PART') sums.parts += paise(item.total);
      else if (item.kind === 'LABOUR') sums.labour += paise(item.total);
      else sums.service += paise(item.total);
    }
  }
  return {
    billCount: bills.length,
    billed: fromPaise(sums.billed),
    partsBilled: fromPaise(sums.parts),
    labourBilled: fromPaise(sums.labour),
    serviceBilled: fromPaise(sums.service),
    discount: fromPaise(sums.discount),
    tax: fromPaise(sums.tax),
    billedPaid: fromPaise(sums.paid),
    outstanding: fromPaise(sums.outstanding),
    paidCount: counts.PAID,
    partialCount: counts.PARTIAL,
    unpaidCount: counts.UNPAID,
  };
}

/**
 * Totals the payments and splits each one into spare parts vs labour in the same
 * proportion as its invoice's line items (service charges count as labour).
 */
export function summarizePayments(payments: PaymentRow[]) {
  let total = 0;
  let parts = 0;
  let labour = 0;
  const methods = new Map<string, { count: number; amount: number }>();

  for (const payment of payments) {
    const partsBilled = payment.invoice.items
      .filter((i) => i.kind === 'PART')
      .reduce((sum, i) => sum + paise(i.total), 0);
    const amount = toNumber(payment.amount);
    const split = splitCollected(amount, fromPaise(partsBilled), toNumber(payment.invoice.subtotal));
    total += toPaise(amount);
    parts += toPaise(split.parts);
    labour += toPaise(split.labour);

    const m = methods.get(payment.method) ?? { count: 0, amount: 0 };
    m.count += 1;
    m.amount += toPaise(amount);
    methods.set(payment.method, m);
  }

  const byMethod: MethodTotal[] = Array.from(methods, ([method, m]) => ({
    method,
    count: m.count,
    amount: fromPaise(m.amount),
  })).sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));

  return {
    collected: fromPaise(total),
    collectedParts: fromPaise(parts),
    collectedLabour: fromPaise(labour),
    paymentCount: payments.length,
    byMethod,
  };
}

export function buildSummary(bills: BillRow[], payments: PaymentRow[]): { summary: RevenueSummary; byMethod: MethodTotal[] } {
  const { byMethod, ...collected } = summarizePayments(payments);
  return { summary: { ...summarizeBills(bills), ...collected }, byMethod };
}

/**
 * Groups bills by a typed name, case- and space-insensitively, keeping the
 * first spelling seen. Bills without a name form one "not recorded" row, listed last.
 */
export function totalsByPerson(bills: BillRow[], field: 'attendantName' | 'billedByName'): PersonTotal[] {
  const groups = new Map<string, { name: string | null; bills: number; billed: number; paid: number; outstanding: number }>();
  for (const bill of bills) {
    const key = nameKey(bill[field]);
    const g = groups.get(key) ?? {
      name: key ? (bill[field] ?? '').trim().replace(/\s+/g, ' ') : null,
      bills: 0,
      billed: 0,
      paid: 0,
      outstanding: 0,
    };
    g.bills += 1;
    g.billed += paise(bill.totalAmount);
    g.paid += paise(bill.amountPaid);
    g.outstanding += paise(bill.balanceDue);
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, billed: fromPaise(g.billed), paid: fromPaise(g.paid), outstanding: fromPaise(g.outstanding) }))
    .sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      return b.billed - a.billed || b.bills - a.bills || a.name.localeCompare(b.name);
    });
}

/**
 * Buckets bills (by createdAt) and payments (by paidAt) into consecutive periods.
 * `starts` are the UTC instants each period begins; the last period ends at `end`.
 */
export function bucketPeriods(
  keys: string[],
  starts: number[],
  end: number,
  bills: Array<{ createdAt: Date; totalAmount: DecimalLike }>,
  payments: Array<{ paidAt: Date; amount: DecimalLike }>,
): PeriodTotal[] {
  const acc = keys.map((key) => ({ key, bills: 0, billed: 0, collected: 0 }));
  const slot = (t: number) => (t >= end ? -1 : bucketIndex(starts, t));
  for (const bill of bills) {
    const i = slot(bill.createdAt.getTime());
    if (i < 0) continue;
    acc[i].bills += 1;
    acc[i].billed += paise(bill.totalAmount);
  }
  for (const payment of payments) {
    const i = slot(payment.paidAt.getTime());
    if (i < 0) continue;
    acc[i].collected += paise(payment.amount);
  }
  return acc.map((p) => ({ ...p, billed: fromPaise(p.billed), collected: fromPaise(p.collected) }));
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

const itemSelect = { select: { kind: true, total: true } } as const;
const vehicleSelect = { select: { vehicle: { select: { vehicleNumber: true } } } } as const;

const billSelect = {
  id: true,
  invoiceNumber: true,
  createdAt: true,
  totalAmount: true,
  discount: true,
  tax: true,
  amountPaid: true,
  balanceDue: true,
  paymentStatus: true,
  attendantName: true,
  billedByName: true,
  items: itemSelect,
  customer: { select: { name: true } },
  jobCard: vehicleSelect,
} as const;

const paymentSelect = {
  id: true,
  amount: true,
  method: true,
  paidAt: true,
  reference: true,
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      subtotal: true,
      items: itemSelect,
      customer: { select: { name: true } },
      jobCard: vehicleSelect,
    },
  },
} as const;

function billsIn(db: ReportDb, start: Date, end: Date) {
  return db.invoice.findMany({
    where: { isArchived: false, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: 'asc' },
    select: billSelect,
  });
}

function paymentsIn(db: ReportDb, start: Date, end: Date) {
  return db.payment.findMany({
    where: { isVoided: false, paidAt: { gte: start, lt: end }, invoice: { isArchived: false } },
    orderBy: { paidAt: 'asc' },
    select: paymentSelect,
  });
}

export async function buildDailyReport(
  db: ReportDb,
  { date, timeZone, currency, now = Date.now() }: { date: string; timeZone: string; currency: string; now?: number },
): Promise<DailyReport> {
  const today = todayKey(timeZone, now);
  const day = date > today ? today : date;
  const { start, end } = dayRange(day, timeZone);

  const [bills, payments] = await Promise.all([billsIn(db, start, end), paymentsIn(db, start, end)]);
  const { summary, byMethod } = buildSummary(bills, payments);

  return {
    date: day,
    isToday: day === today,
    timeZone,
    currency,
    summary,
    byMethod,
    byAttendant: totalsByPerson(bills, 'attendantName'),
    byBiller: totalsByPerson(bills, 'billedByName'),
    bills: bills.map((b) => ({
      id: b.id,
      invoiceNumber: b.invoiceNumber,
      createdAt: b.createdAt.toISOString(),
      customerName: b.customer.name,
      vehicleNumber: b.jobCard.vehicle.vehicleNumber,
      attendantName: b.attendantName,
      billedByName: b.billedByName,
      totalAmount: toNumber(b.totalAmount),
      amountPaid: toNumber(b.amountPaid),
      balanceDue: toNumber(b.balanceDue),
      paymentStatus: b.paymentStatus,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoice.id,
      invoiceNumber: p.invoice.invoiceNumber,
      customerName: p.invoice.customer.name,
      vehicleNumber: p.invoice.jobCard.vehicle.vehicleNumber,
      paidAt: p.paidAt.toISOString(),
      method: p.method,
      amount: toNumber(p.amount),
      reference: p.reference,
    })),
  };
}

export async function buildMonthlyReport(
  db: ReportDb,
  { month, timeZone, currency, now = Date.now() }: { month: string; timeZone: string; currency: string; now?: number },
): Promise<MonthlyReport> {
  const today = todayKey(timeZone, now);
  const currentMonth = monthKeyOf(today);
  const selected = month > currentMonth ? currentMonth : month;
  const { start, end } = monthRange(selected, timeZone);

  const trendKeys = Array.from({ length: 12 }, (_, i) => addMonths(selected, i - 11));
  const trendStart = monthRange(trendKeys[0], timeZone).start;

  const [bills, payments, trendBills, trendPayments] = await Promise.all([
    billsIn(db, start, end),
    paymentsIn(db, start, end),
    db.invoice.findMany({
      where: { isArchived: false, createdAt: { gte: trendStart, lt: end } },
      select: { createdAt: true, totalAmount: true },
    }),
    db.payment.findMany({
      where: { isVoided: false, paidAt: { gte: trendStart, lt: end }, invoice: { isArchived: false } },
      select: { paidAt: true, amount: true },
    }),
  ]);

  const { summary, byMethod } = buildSummary(bills, payments);

  const dayKeys = daysOfMonth(selected).filter((d) => d <= today);
  const dayStarts = dayKeys.map((d) => dayRange(d, timeZone).start.getTime());
  const daysEnd = dayKeys.length ? dayRange(dayKeys[dayKeys.length - 1], timeZone).end.getTime() : start.getTime();
  const monthStarts = trendKeys.map((m) => monthRange(m, timeZone).start.getTime());

  return {
    month: selected,
    isCurrentMonth: selected === currentMonth,
    timeZone,
    currency,
    summary,
    byMethod,
    byAttendant: totalsByPerson(bills, 'attendantName'),
    byBiller: totalsByPerson(bills, 'billedByName'),
    days: bucketPeriods(dayKeys, dayStarts, daysEnd, bills, payments),
    trend: bucketPeriods(trendKeys, monthStarts, end.getTime(), trendBills, trendPayments),
  };
}
