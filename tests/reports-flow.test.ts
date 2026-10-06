/**
 * Revenue reports and the attendant / bill-created-by fields against a real
 * PostgreSQL database.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:db
 *
 * The report fixtures live in 1998-1999 (a window no other test uses), and that
 * window is cleared first, so the suite can be re-run on the same database.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const url = process.env.TEST_DATABASE_URL;
if (url) {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}

const IST = 'Asia/Kolkata';
/** IST wall-clock time -> instant. */
const ist = (local: string) => new Date(`${local}+05:30`);

describe('revenue reports (database)', { skip: !url && 'TEST_DATABASE_URL not set' }, () => {
  let prisma: import('@prisma/client').PrismaClient;
  let svc: typeof import('@/lib/invoice-service');
  let reports: typeof import('@/lib/reports');
  let data: typeof import('@/lib/invoice-data');
  let pdf: typeof import('@/lib/pdf');
  let userId: string;
  let seq = 0;

  const run = <T>(fn: (tx: import('@/lib/invoice-service').Tx) => Promise<T>) => svc.inTransaction(prisma, fn);
  const key = () => `rpt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function bill(args: {
    at: Date;
    items: import('@/lib/invoice-service').ItemInput[];
    discount?: number;
    attendantName?: string;
    billedByName?: string;
    paid?: { method: string; at: Date };
  }) {
    seq += 1;
    const tag = `${Date.now().toString(36)}R${seq}`.toUpperCase();
    const customer = await prisma.customer.create({ data: { name: `Report Customer ${tag}`, mobileNumber: '9876500000' } });
    const vehicle = await prisma.vehicle.create({ data: { vehicleNumber: `MH14R${tag}`.slice(0, 20), customerId: customer.id } });
    const jobCard = await prisma.jobCard.create({
      data: { jobCardNumber: `JC-R-${tag}`, vehicleId: vehicle.id, customerId: customer.id, createdAt: args.at },
    });
    return run((tx) =>
      svc.createInvoice(tx, {
        jobCardId: jobCard.id,
        customerId: customer.id,
        billing: {
          items: args.items,
          taxRate: 0,
          discountType: args.discount ? 'FIXED' : 'NONE',
          discountValue: args.discount,
        },
        attendantName: args.attendantName,
        billedByName: args.billedByName,
        publicToken: key(),
        createdAt: args.at,
        currency: 'INR',
        userId,
        initialPayment: args.paid ? { status: 'PAID', method: args.paid.method, paidAt: args.paid.at } : undefined,
      }),
    );
  }

  before(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    svc = await import('@/lib/invoice-service');
    reports = await import('@/lib/reports');
    data = await import('@/lib/invoice-data');
    pdf = await import('@/lib/pdf');

    const user = await prisma.user.upsert({
      where: { email: 'reports-test@example.com' },
      update: {},
      create: { name: 'Reports Tester', email: 'reports-test@example.com', passwordHash: 'x', role: 'ADMIN' },
    });
    userId = user.id;
    await prisma.garage.upsert({
      where: { id: 'garage' },
      update: {},
      create: { id: 'garage', name: 'Pragati Auto', currency: 'INR' },
    });

    // Clear the fixture window left by an earlier run.
    const window = { gte: new Date('1998-01-01T00:00:00Z'), lt: new Date('2000-01-01T00:00:00Z') };
    const stale = await prisma.invoice.findMany({ where: { createdAt: window }, select: { id: true, jobCardId: true } });
    await prisma.payment.deleteMany({ where: { OR: [{ paidAt: window }, { invoiceId: { in: stale.map((s) => s.id) } }] } });
    await prisma.invoice.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    await prisma.jobCard.deleteMany({ where: { id: { in: stale.map((s) => s.jobCardId) } } });

    // A: 10 Mar 10:00 IST, parts 1000 + labour 500 - 100 discount = 1400, paid by card.
    await bill({
      at: ist('1999-03-10T10:00:00'),
      items: [
        { kind: 'PART', description: 'Clutch plate', quantity: 1, unitPrice: 1000 },
        { kind: 'LABOUR', description: 'Fitting', quantity: 1, unitPrice: 500 },
      ],
      discount: 100,
      attendantName: 'Ramesh',
      billedByName: 'Suresh',
      paid: { method: 'Card', at: ist('1999-03-10T10:05:00') },
    });

    // B: 11 Mar 01:30 IST = 10 Mar 20:00 UTC. An IST report must put it on the 11th.
    const b = await bill({
      at: ist('1999-03-11T01:30:00'),
      items: [{ kind: 'SERVICE', description: 'Night towing', quantity: 1, unitPrice: 2000 }],
      attendantName: ' ramesh ',
    });
    await run((tx) =>
      svc.recordPayment(
        tx,
        b,
        { amount: 500, method: 'Cash', paidAt: ist('1999-03-12T11:00:00'), idempotencyKey: key() },
        { userId, currency: 'INR' },
      ),
    );

    // C: a February bill whose payment (UPI) comes in on 10 Mar.
    const c = await bill({
      at: ist('1999-02-15T12:00:00'),
      items: [{ kind: 'LABOUR', description: 'Engine work', quantity: 1, unitPrice: 3000 }],
      attendantName: 'Ajay',
      billedByName: 'Suresh',
    });
    await run((tx) =>
      svc.recordPayment(
        tx,
        c,
        { amount: 3000, method: 'UPI', paidAt: ist('1999-03-10T15:00:00'), idempotencyKey: key() },
        { userId, currency: 'INR' },
      ),
    );

    // D: archived bill on 10 Mar with a payment - left out of every figure.
    const d = await bill({
      at: ist('1999-03-10T12:00:00'),
      items: [{ kind: 'PART', description: 'Archived', quantity: 1, unitPrice: 777 }],
      billedByName: 'Ghost',
      paid: { method: 'Cash', at: ist('1999-03-10T12:00:00') },
    });
    await prisma.invoice.update({ where: { id: d }, data: { isArchived: true } });

    // E: a bill on 10 Mar whose only payment was voided.
    const e = await bill({
      at: ist('1999-03-10T16:00:00'),
      items: [{ kind: 'PART', description: 'Spark plug', quantity: 2, unitPrice: 150 }],
      attendantName: 'Ajay',
      billedByName: 'Meena',
    });
    const { paymentId } = await run((tx) =>
      svc.recordPayment(
        tx,
        e,
        { amount: 300, method: 'Cash', paidAt: ist('1999-03-10T16:05:00'), idempotencyKey: key() },
        { userId, currency: 'INR' },
      ),
    );
    await run((tx) => svc.voidPayment(tx, e, paymentId, 'Wrong bill', userId));
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it('daily report: bills issued that IST day, money received that day on any bill', async () => {
    const r = await reports.buildDailyReport(prisma, { date: '1999-03-10', timeZone: IST, currency: 'INR' });

    assert.equal(r.isToday, false);
    assert.deepEqual(
      r.bills.map((b) => [b.totalAmount, b.attendantName, b.billedByName, b.paymentStatus]),
      [
        [1400, 'Ramesh', 'Suresh', 'PAID'],
        [300, 'Ajay', 'Meena', 'UNPAID'],
      ],
      'B (01:30 IST on the 11th) and the archived bill D are not on the 10th',
    );
    assert.equal(r.summary.billCount, 2);
    assert.equal(r.summary.billed, 1700);
    assert.equal(r.summary.partsBilled, 1300);
    assert.equal(r.summary.labourBilled, 500);
    assert.equal(r.summary.discount, 100);
    assert.equal(r.summary.outstanding, 300);

    // Card 1400 for A + UPI 3000 for February's bill C; D (archived) and E (voided) excluded.
    assert.equal(r.summary.collected, 4400);
    assert.equal(r.summary.paymentCount, 2);
    assert.deepEqual(r.byMethod, [
      { method: 'UPI', count: 1, amount: 3000 },
      { method: 'Card', count: 1, amount: 1400 },
    ]);
    assert.equal(r.summary.collectedParts + r.summary.collectedLabour, 4400);
    assert.deepEqual(r.payments.map((p) => p.method), ['Card', 'UPI']);

    assert.deepEqual(
      r.byAttendant.map((p) => [p.name, p.bills, p.billed]),
      [
        ['Ramesh', 1, 1400],
        ['Ajay', 1, 300],
      ],
    );
    assert.deepEqual(
      r.byBiller.map((p) => [p.name, p.bills, p.billed, p.outstanding]),
      [
        ['Suresh', 1, 1400, 0],
        ['Meena', 1, 300, 300],
      ],
    );
  });

  it('day boundaries follow the requested time zone', async () => {
    const istNext = await reports.buildDailyReport(prisma, { date: '1999-03-11', timeZone: IST, currency: 'INR' });
    assert.deepEqual(istNext.bills.map((b) => b.totalAmount), [2000]);
    assert.equal(istNext.bills[0].balanceDue, 1500, 'reflects the later part payment');
    assert.equal(istNext.summary.collected, 0);

    // Read in UTC, the 01:30 IST bill falls on the 10th instead.
    const utc = await reports.buildDailyReport(prisma, { date: '1999-03-10', timeZone: 'UTC', currency: 'INR' });
    assert.ok(utc.bills.some((b) => b.totalAmount === 2000));
  });

  it('monthly report: totals, merged attendant names, day-by-day and 12-month trend', async () => {
    const r = await reports.buildMonthlyReport(prisma, { month: '1999-03', timeZone: IST, currency: 'INR' });

    assert.equal(r.isCurrentMonth, false);
    assert.equal(r.summary.billCount, 3);
    assert.equal(r.summary.billed, 3700);
    assert.equal(r.summary.collected, 4900, 'card 1400 + UPI 3000 + cash 500');
    assert.equal(r.summary.outstanding, 1800);

    assert.deepEqual(
      r.byAttendant.map((p) => [p.name, p.bills, p.billed]),
      [
        ['Ramesh', 2, 3400],
        ['Ajay', 1, 300],
      ],
      '"Ramesh" and " ramesh " are one person',
    );
    assert.deepEqual(
      r.byBiller.map((p) => [p.name, p.bills]),
      [
        ['Suresh', 1],
        ['Meena', 1],
        [null, 1],
      ],
    );

    assert.equal(r.days.length, 31);
    const day = (d: string) => r.days.find((x) => x.key === d);
    assert.deepEqual(day('1999-03-10'), { key: '1999-03-10', bills: 2, billed: 1700, collected: 4400 });
    assert.deepEqual(day('1999-03-11'), { key: '1999-03-11', bills: 1, billed: 2000, collected: 0 });
    assert.deepEqual(day('1999-03-12'), { key: '1999-03-12', bills: 0, billed: 0, collected: 500 });
    assert.equal(r.days.reduce((s, d) => s + d.billed, 0), r.summary.billed);
    assert.equal(r.days.reduce((s, d) => s + d.collected, 0), r.summary.collected);

    assert.deepEqual(r.trend.map((m) => m.key), [
      '1998-04', '1998-05', '1998-06', '1998-07', '1998-08', '1998-09',
      '1998-10', '1998-11', '1998-12', '1999-01', '1999-02', '1999-03',
    ]);
    assert.deepEqual(r.trend.at(-2), { key: '1999-02', bills: 1, billed: 3000, collected: 0 });
    assert.deepEqual(r.trend.at(-1), { key: '1999-03', bills: 3, billed: 3700, collected: 4900 });
  });

  it('a future date or month is reported as today / this month', async () => {
    const now = ist('1999-03-12T09:00:00').getTime();
    const daily = await reports.buildDailyReport(prisma, { date: '2099-01-01', timeZone: IST, currency: 'INR', now });
    assert.equal(daily.date, '1999-03-12');
    assert.equal(daily.isToday, true);
    const monthly = await reports.buildMonthlyReport(prisma, { month: '2099-01', timeZone: IST, currency: 'INR', now });
    assert.equal(monthly.month, '1999-03');
    assert.equal(monthly.days.length, 12, 'the current month stops at today');
  });

  it('stores, shows and audits the car attendant and bill-created-by names', async () => {
    const id = await bill({
      at: new Date(),
      items: [{ kind: 'LABOUR', description: 'Check-up', quantity: 1, unitPrice: 250 }],
      attendantName: 'Ramesh',
      billedByName: 'Suresh',
    });

    const view = await data.getInvoiceViewById(id);
    assert.equal(view?.attendantName, 'Ramesh');
    assert.equal(view?.billedByName, 'Suresh');
    const created = await prisma.auditLog.findFirstOrThrow({ where: { invoiceId: id, action: 'INVOICE_CREATED' } });
    assert.equal((created.newValue as Record<string, unknown>).billedByName, 'Suresh');
    assert.ok(Buffer.from(await pdf.renderInvoicePdf(view!)).toString('latin1').startsWith('%PDF'));

    // Changing only the notes leaves the names alone.
    await run((tx) => svc.updateInvoice(tx, id, { notes: 'Washed' }, { userId, currency: 'INR' }));
    let row = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    assert.equal(row.attendantName, 'Ramesh');
    assert.equal(row.billedByName, 'Suresh');

    await run((tx) =>
      svc.updateInvoice(tx, id, { attendantName: 'Mahesh', billedByName: null }, { userId, currency: 'INR' }),
    );
    row = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    assert.equal(row.attendantName, 'Mahesh');
    assert.equal(row.billedByName, null);
    assert.equal(row.totalAmount.toFixed(2), '250.00', 'money untouched');

    const edits = await prisma.auditLog.findMany({ where: { invoiceId: id, action: 'INVOICE_UPDATED' } });
    const last = edits.find((e) => (e.newValue as Record<string, unknown>).attendantName === 'Mahesh');
    assert.ok(last, 'the name change is in the audit trail');
    assert.equal((last.oldValue as Record<string, unknown>).attendantName, 'Ramesh');
    assert.equal((last.newValue as Record<string, unknown>).attendantName, 'Mahesh');
    assert.equal((last.newValue as Record<string, unknown>).billedByName, null);
  });
});
