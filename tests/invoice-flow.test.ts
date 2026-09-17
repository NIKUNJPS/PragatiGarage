/**
 * End-to-end billing flow against a real PostgreSQL database.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:db
 *
 * The database must already have the migrations applied (prisma migrate deploy).
 * Every test works on its own customer/vehicle, so the suite can be re-run.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const url = process.env.TEST_DATABASE_URL;
if (url) {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}

describe('invoice billing flow (database)', { skip: !url && 'TEST_DATABASE_URL not set' }, () => {
  let prisma: import('@prisma/client').PrismaClient;
  let svc: typeof import('@/lib/invoice-service');
  let data: typeof import('@/lib/invoice-data');
  let whatsapp: typeof import('@/lib/whatsapp');
  let pdf: typeof import('@/lib/pdf');
  let serializers: typeof import('@/lib/serializers');
  let messages: typeof import('@/lib/payment-message');
  let validations: typeof import('@/lib/validations');
  let ApiError: typeof import('@/lib/errors').ApiError;
  let userId: string;
  let seq = 0;

  before(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    svc = await import('@/lib/invoice-service');
    data = await import('@/lib/invoice-data');
    whatsapp = await import('@/lib/whatsapp');
    pdf = await import('@/lib/pdf');
    serializers = await import('@/lib/serializers');
    messages = await import('@/lib/payment-message');
    validations = await import('@/lib/validations');
    ({ ApiError } = await import('@/lib/errors'));

    const user = await prisma.user.upsert({
      where: { email: 'billing-test@example.com' },
      update: {},
      create: { name: 'Billing Tester', email: 'billing-test@example.com', passwordHash: 'x', role: 'ADMIN' },
    });
    userId = user.id;
    await prisma.garage.upsert({
      where: { id: 'garage' },
      update: {},
      create: { id: 'garage', name: 'Pragati Auto', currency: 'INR' },
    });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  const run = <T>(fn: (tx: import('@/lib/invoice-service').Tx) => Promise<T>) => svc.inTransaction(prisma, fn);
  const ctx = () => ({ userId, currency: 'INR' });
  const key = () => `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function fixture() {
    seq += 1;
    const tag = `${Date.now().toString(36)}${seq}`.toUpperCase();
    const customer = await prisma.customer.create({
      data: { name: `ABC Motors ${tag}`, mobileNumber: '9876543210', whatsappNumber: '9876543210' },
    });
    const vehicle = await prisma.vehicle.create({
      data: { vehicleNumber: `MH12T${tag}`.slice(0, 20), customerId: customer.id },
    });
    const jobCard = await prisma.jobCard.create({
      data: {
        jobCardNumber: `JC-T-${tag}`,
        vehicleId: vehicle.id,
        customerId: customer.id,
        labourCharges: { create: [{ description: 'Stale estimate', amount: '12345.00' }] },
      },
    });
    return { customer, vehicle, jobCard };
  }

  async function newInvoice(
    overrides: Partial<import('@/lib/invoice-service').BillingPayload> = {},
    initialPayment?: import('@/lib/invoice-service').InitialPayment,
  ) {
    const { customer, jobCard } = await fixture();
    const invoiceId = await run((tx) =>
      svc.createInvoice(tx, {
        jobCardId: jobCard.id,
        customerId: customer.id,
        billing: {
          items: [
            { kind: 'SERVICE', description: 'Full service', quantity: 1, unitPrice: 5000 },
            { kind: 'PART', description: 'Brake pads', quantity: 1, unitPrice: 5000 },
          ],
          taxRate: 0,
          discountType: 'FIXED',
          discountValue: 1000,
          ...overrides,
        },
        publicToken: key(),
        currency: 'INR',
        userId,
        initialPayment,
      }),
    );
    return { invoiceId, customer, jobCard };
  }

  const invoiceRow = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true } });

  const expectApiError = async (promise: Promise<unknown>, status: number, field?: string) => {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
      assert.equal(error.status, status, error.message);
      if (field) assert.ok(error.fieldErrors?.[field], `expected field error on ${field}`);
      return true;
    });
  };

  it('9. persists one consistent total: calculator = database = invoice view = PDF = customer message', async () => {
    const { invoiceId, jobCard } = await newInvoice({ expectedTotal: 9000 });
    const row = await invoiceRow(invoiceId);

    assert.equal(row.subtotal.toFixed(2), '10000.00');
    assert.equal(row.discountType, 'FIXED');
    assert.equal(row.discount.toFixed(2), '1000.00');
    assert.equal(row.totalAmount.toFixed(2), '9000.00');
    assert.equal(row.amountPaid.toFixed(2), '0.00');
    assert.equal(row.balanceDue.toFixed(2), '9000.00');
    assert.equal(row.paymentStatus, 'UNPAID');
    assert.equal(row.items.length, 2);

    const view = await data.getInvoiceViewById(invoiceId);
    assert.ok(view);
    assert.equal(view.totalAmount, 9000);
    assert.equal(view.discount, 1000);
    assert.equal(view.balanceDue, 9000);

    const message = whatsapp.buildInvoiceMessage(view);
    assert.match(message, /Total: ₹9,000\.00/);
    assert.match(message, /Discount: ₹1,000\.00/);

    const bytes = Buffer.from(await pdf.renderInvoicePdf(view)).toString('latin1');
    assert.ok(bytes.startsWith('%PDF'));

    // Internal records: the job card now mirrors the billed items and reports the invoice total.
    const jc = await prisma.jobCard.findUniqueOrThrow({
      where: { id: jobCard.id },
      include: {
        customer: { select: { id: true, name: true, mobileNumber: true } },
        vehicle: { select: { id: true, vehicleNumber: true, vehicleType: true, brand: true, model: true } },
        parts: true,
        labourCharges: true,
        serviceCharges: true,
        invoice: {
          select: { id: true, invoiceNumber: true, paymentStatus: true, totalAmount: true, amountPaid: true, balanceDue: true },
        },
      },
    });
    assert.equal(jc.labourCharges.length, 0, 'stale job card estimate replaced by invoice lines');
    assert.equal(jc.parts[0]?.total.toFixed(2), '5000.00');
    assert.equal(jc.serviceCharges[0]?.amount.toFixed(2), '5000.00');
    const listItem = serializers.serializeJobCardListItem(jc);
    assert.equal(listItem.total, 9000, 'job card lists show the discounted invoice total, not 10,000');
    assert.equal(listItem.invoice?.balanceDue, 9000);

    const audit = await prisma.auditLog.findMany({ where: { invoiceId } });
    assert.ok(audit.some((a) => a.action === 'INVOICE_CREATED'));
  });

  it('stores exact paise for decimal prices, quantities, percentage discount and tax', async () => {
    const { invoiceId } = await newInvoice({
      items: [
        { kind: 'PART', description: 'Oil', quantity: 1.5, unitPrice: 420.5 },
        { kind: 'LABOUR', description: 'Labour', quantity: 1, unitPrice: 350 },
        { kind: 'SERVICE', description: 'Wash', quantity: 2, unitPrice: 99.99 },
      ],
      discountType: 'PERCENT',
      discountValue: 12.5,
      taxRate: 18,
      expectedTotal: 1219.11,
    });
    const row = await invoiceRow(invoiceId);
    assert.equal(row.subtotal.toFixed(2), '1180.73');
    assert.equal(row.discount.toFixed(2), '147.59');
    assert.equal(row.tax.toFixed(2), '185.97');
    assert.equal(row.totalAmount.toFixed(2), '1219.11');
    assert.deepEqual(
      row.items.sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.total.toFixed(2)),
      ['630.75', '350.00', '199.98'],
    );
  });

  it('8. rejects an invalid discount and rolls back completely (no invoice, no number used)', async () => {
    const { customer, jobCard } = await fixture();
    const before = await prisma.garage.findUniqueOrThrow({ where: { id: 'garage' } });
    const countBefore = await prisma.invoice.count();

    await expectApiError(
      run((tx) =>
        svc.createInvoice(tx, {
          jobCardId: jobCard.id,
          customerId: customer.id,
          billing: {
            items: [{ kind: 'PART', description: 'Engine', quantity: 1, unitPrice: 10000 }],
            taxRate: 0,
            discountType: 'FIXED',
            discountValue: 15000,
          },
          publicToken: key(),
          currency: 'INR',
          userId,
        }),
      ),
      400,
      'discountValue',
    );

    assert.equal(await prisma.invoice.count(), countBefore);
    const afterGarage = await prisma.garage.findUniqueOrThrow({ where: { id: 'garage' } });
    assert.equal(afterGarage.invoiceNextNumber, before.invoiceNextNumber);
  });

  it('rejects a total that differs from what the screen showed, saving nothing', async () => {
    const countBefore = await prisma.invoice.count();
    await expectApiError(newInvoice({ expectedTotal: 10000 }), 409, 'expectedTotal');
    assert.equal(await prisma.invoice.count(), countBefore);
  });

  it('rolls back the job card and document numbers when a later step fails', async () => {
    const { vehicle, customer } = await fixture();
    const existing = await newInvoice();
    const token = (await invoiceRow(existing.invoiceId)).publicToken;
    const garageBefore = await prisma.garage.findUniqueOrThrow({ where: { id: 'garage' } });
    const jobCardsBefore = await prisma.jobCard.count();

    await assert.rejects(
      run(async (tx) => {
        const { nextDocumentNumber } = await import('@/lib/garage');
        const jc = await tx.jobCard.create({
          data: {
            jobCardNumber: await nextDocumentNumber('jobCard', tx),
            vehicleId: vehicle.id,
            customerId: customer.id,
          },
        });
        // Duplicate public token -> unique violation after the job card was written.
        await svc.createInvoice(tx, {
          jobCardId: jc.id,
          customerId: customer.id,
          billing: { items: [{ kind: 'PART', description: 'X', quantity: 1, unitPrice: 10 }], taxRate: 0 },
          publicToken: token,
          currency: 'INR',
          userId,
        });
      }),
    );

    assert.equal(await prisma.jobCard.count(), jobCardsBefore);
    const garageAfter = await prisma.garage.findUniqueOrThrow({ where: { id: 'garage' } });
    assert.equal(garageAfter.jobCardNextNumber, garageBefore.jobCardNextNumber);
    assert.equal(garageAfter.invoiceNextNumber, garageBefore.invoiceNextNumber);
  });

  it('4. paid in full at creation records the discounted amount: PAID, nothing due', async () => {
    const { invoiceId } = await newInvoice({}, { status: 'PAID', method: 'UPI', paidAt: new Date(), idempotencyKey: key() });
    const row = await invoiceRow(invoiceId);
    assert.equal(row.payments.length, 1);
    assert.equal(row.payments[0].amount.toFixed(2), '9000.00');
    assert.equal(row.amountPaid.toFixed(2), '9000.00');
    assert.equal(row.balanceDue.toFixed(2), '0.00');
    assert.equal(row.paymentStatus, 'PAID');
    assert.ok(row.paidAt);
  });

  it('5 & 6. partial then multiple payments move UNPAID -> PARTIAL -> PAID', async () => {
    const { invoiceId } = await newInvoice();

    await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 5000, method: 'Cash', idempotencyKey: key() }, ctx()));
    let row = await invoiceRow(invoiceId);
    assert.equal(row.paymentStatus, 'PARTIAL');
    assert.equal(row.amountPaid.toFixed(2), '5000.00');
    assert.equal(row.balanceDue.toFixed(2), '4000.00');

    await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 3000, method: 'UPI', idempotencyKey: key() }, ctx()));
    await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 1000, method: 'Card', idempotencyKey: key() }, ctx()));
    row = await invoiceRow(invoiceId);
    assert.equal(row.payments.length, 3);
    assert.equal(row.amountPaid.toFixed(2), '9000.00');
    assert.equal(row.balanceDue.toFixed(2), '0.00');
    assert.equal(row.paymentStatus, 'PAID');
    assert.equal(row.paymentMethod, 'Card');

    const statusChanges = await prisma.auditLog.findMany({ where: { invoiceId, action: 'PAYMENT_STATUS_CHANGED' } });
    assert.equal(statusChanges.length, 2);
  });

  it('refuses overpayment, payment on a settled invoice, and zero / negative amounts', async () => {
    const { invoiceId } = await newInvoice();
    await expectApiError(
      run((tx) => svc.recordPayment(tx, invoiceId, { amount: 9000.01, method: 'Cash', idempotencyKey: key() }, ctx())),
      400,
      'amount',
    );
    await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'Cash', idempotencyKey: key() }, ctx()));
    await expectApiError(
      run((tx) => svc.recordPayment(tx, invoiceId, { amount: 1, method: 'Cash', idempotencyKey: key() }, ctx())),
      409,
    );

    for (const amount of [0, -100, '12.345']) {
      const parsed = validations.recordPaymentSchema.safeParse({ amount, method: 'Cash', idempotencyKey: key() });
      assert.equal(parsed.success, false, `amount ${amount} must be rejected`);
    }
    assert.equal(
      validations.recordPaymentSchema.safeParse({ amount: 10, method: 'Bitcoin', idempotencyKey: key() }).success,
      false,
      'unknown payment method must be rejected',
    );
    await expectApiError(
      run((tx) => svc.recordPayment(tx, 'does-not-exist', { amount: 1, method: 'Cash', idempotencyKey: key() }, ctx())),
      404,
    );
  });

  it('7. zero payments leave the invoice UNPAID with the full amount due', async () => {
    const { invoiceId } = await newInvoice();
    const view = await data.getInvoiceViewById(invoiceId);
    assert.equal(view?.paymentStatus, 'UNPAID');
    assert.equal(view?.amountPaid, 0);
    assert.equal(view?.balanceDue, 9000);
  });

  it('a repeated submission (same idempotency key) records the payment once', async () => {
    const { invoiceId } = await newInvoice();
    const k = key();
    const first = await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 2000, method: 'Cash', idempotencyKey: k }, ctx()));
    const second = await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 2000, method: 'Cash', idempotencyKey: k }, ctx()));
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.paymentId, first.paymentId);
    const row = await invoiceRow(invoiceId);
    assert.equal(row.payments.length, 1);
    assert.equal(row.amountPaid.toFixed(2), '2000.00');
  });

  it('two simultaneous full payments cannot both be recorded', async () => {
    const { invoiceId } = await newInvoice();
    const results = await Promise.allSettled([
      run((tx) => svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'Cash', idempotencyKey: key() }, ctx())),
      run((tx) => svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'UPI', idempotencyKey: key() }, ctx())),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const row = await invoiceRow(invoiceId);
    assert.equal(row.payments.length, 1);
    assert.equal(row.amountPaid.toFixed(2), '9000.00');
    assert.equal(row.paymentStatus, 'PAID');
  });

  it('voiding keeps the record, restores the balance and is audited', async () => {
    const { invoiceId } = await newInvoice();
    const { paymentId } = await run((tx) =>
      svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'Cash', idempotencyKey: key() }, ctx()),
    );
    await run((tx) => svc.voidPayment(tx, invoiceId, paymentId, 'Entered twice', userId));

    const row = await invoiceRow(invoiceId);
    assert.equal(row.payments.length, 1);
    assert.equal(row.payments[0].isVoided, true);
    assert.equal(row.payments[0].voidReason, 'Entered twice');
    assert.equal(row.amountPaid.toFixed(2), '0.00');
    assert.equal(row.balanceDue.toFixed(2), '9000.00');
    assert.equal(row.paymentStatus, 'UNPAID');
    assert.equal(row.paidAt, null);
    assert.ok(await prisma.auditLog.findFirst({ where: { invoiceId, action: 'PAYMENT_VOIDED' } }));

    await expectApiError(run((tx) => svc.voidPayment(tx, invoiceId, paymentId, 'again', userId)), 409);
  });

  it('10. payment confirmation: correct content, sent once, re-send only when explicit', async () => {
    const { invoiceId, customer } = await newInvoice();
    const { paymentId } = await run((tx) =>
      svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'UPI', idempotencyKey: key() }, ctx()),
    );
    const view = await data.getInvoiceViewById(invoiceId);
    assert.ok(view);
    assert.equal(view.paymentStatus, 'PAID');

    const payment = view.payments.find((p) => p.id === paymentId)!;
    const text = messages.buildPaymentConfirmationMessage({
      customerName: view.customer.name,
      invoiceNumber: view.invoiceNumber,
      garageName: view.garage.name,
      currency: view.garage.currency,
      paymentAmount: payment.amount,
      amountPaid: view.amountPaid,
      balanceDue: view.balanceDue,
      paymentCount: 1,
    });
    assert.match(text, new RegExp(`Dear ${customer.name},`));
    assert.match(text, /successfully received your payment of ₹9,000\.00/);
    assert.match(text, new RegExp(`Invoice #${view.invoiceNumber}`));
    assert.match(text, /fully paid/);
    assert.doesNotMatch(text, /Outstanding/);

    const first = await run((tx) => svc.claimConfirmationSend(tx, paymentId, { resend: false, channel: 'whatsapp_link', userId }));
    const duplicate = await run((tx) => svc.claimConfirmationSend(tx, paymentId, { resend: false, channel: 'whatsapp_link', userId }));
    const resent = await run((tx) => svc.claimConfirmationSend(tx, paymentId, { resend: true, channel: 'whatsapp_link', userId }));
    assert.ok(first?.confirmationSentAt);
    assert.equal(duplicate, null);
    assert.equal(resent?.confirmationCount, 2);

    const sent = await prisma.auditLog.count({ where: { invoiceId, action: 'PAYMENT_CONFIRMATION_SENT' } });
    assert.equal(sent, 2);
  });

  it('partial payment confirmation states the outstanding balance', () => {
    const text = messages.buildPaymentConfirmationMessage({
      customerName: 'ABC Motors',
      invoiceNumber: 'INV-00125',
      garageName: 'Pragati Auto',
      currency: 'INR',
      paymentAmount: 5000,
      amountPaid: 5000,
      balanceDue: 4000,
      paymentCount: 1,
    });
    assert.match(text, /received your payment of ₹5,000\.00 against Invoice #INV-00125/);
    assert.match(text, /Outstanding balance: ₹4,000\.00/);
  });

  it('editing below the amount already paid needs confirmation and never touches payments', async () => {
    const { invoiceId } = await newInvoice();
    await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'Cash', idempotencyKey: key() }, ctx()));

    const cheaper = [{ kind: 'PART' as const, description: 'Brake pads', quantity: 1, unitPrice: 7000 }];
    await expectApiError(
      run((tx) => svc.updateInvoice(tx, invoiceId, { items: cheaper, discountType: 'NONE' }, ctx())),
      409,
      'confirmOverpayment',
    );
    let row = await invoiceRow(invoiceId);
    assert.equal(row.totalAmount.toFixed(2), '9000.00', 'rejected edit changed nothing');

    await run((tx) =>
      svc.updateInvoice(tx, invoiceId, { items: cheaper, discountType: 'NONE', confirmOverpayment: true, expectedTotal: 7000 }, ctx()),
    );
    row = await invoiceRow(invoiceId);
    assert.equal(row.totalAmount.toFixed(2), '7000.00');
    assert.equal(row.amountPaid.toFixed(2), '9000.00');
    assert.equal(row.balanceDue.toFixed(2), '0.00');
    assert.equal(row.paymentStatus, 'PAID');
    assert.equal(row.payments.length, 1);
    assert.equal(row.payments[0].isVoided, false);
    const view = await data.getInvoiceViewById(invoiceId);
    assert.equal(view?.excessPaid, 2000);
    assert.ok(await prisma.auditLog.findFirst({ where: { invoiceId, action: 'INVOICE_UPDATED' } }));
    assert.ok(await prisma.auditLog.findFirst({ where: { invoiceId, action: 'DISCOUNT_CHANGED' } }));
  });

  it('editing items recalculates every stored total, balance and status (no stale totals)', async () => {
    const { invoiceId, jobCard } = await newInvoice();
    await run((tx) => svc.recordPayment(tx, invoiceId, { amount: 9000, method: 'Cash', idempotencyKey: key() }, ctx()));

    await run((tx) =>
      svc.updateInvoice(
        tx,
        invoiceId,
        {
          items: [
            { kind: 'SERVICE', description: 'Full service', quantity: 1, unitPrice: 5000 },
            { kind: 'PART', description: 'Brake pads', quantity: 2, unitPrice: 5000 },
          ],
          discountType: 'PERCENT',
          discountValue: 10,
          expectedTotal: 13500,
        },
        ctx(),
      ),
    );
    const row = await invoiceRow(invoiceId);
    assert.equal(row.subtotal.toFixed(2), '15000.00');
    assert.equal(row.discount.toFixed(2), '1500.00');
    assert.equal(row.totalAmount.toFixed(2), '13500.00');
    assert.equal(row.balanceDue.toFixed(2), '4500.00');
    assert.equal(row.paymentStatus, 'PARTIAL');
    assert.equal(row.paidAt, null);

    const parts = await prisma.partUsed.findMany({ where: { jobCardId: jobCard.id } });
    assert.equal(parts[0]?.total.toFixed(2), '10000.00', 'job card mirror follows the invoice edit');
  });

  it('legacy manual status toggle is translated into payment records', async () => {
    const { invoiceId } = await newInvoice();
    await run((tx) => svc.updateInvoice(tx, invoiceId, { paymentStatus: 'PAID', paymentMethod: 'UPI' }, ctx()));
    let row = await invoiceRow(invoiceId);
    assert.equal(row.paymentStatus, 'PAID');
    assert.equal(row.payments.length, 1);
    assert.equal(row.payments[0].amount.toFixed(2), '9000.00');

    await run((tx) => svc.updateInvoice(tx, invoiceId, { paymentStatus: 'UNPAID' }, ctx()));
    row = await invoiceRow(invoiceId);
    assert.equal(row.paymentStatus, 'UNPAID');
    assert.equal(row.payments.length, 1, 'history kept');
    assert.equal(row.payments[0].isVoided, true);
  });

  it('a payment taken at creation larger than the bill is rejected with nothing saved', async () => {
    const countBefore = await prisma.invoice.count();
    await expectApiError(
      newInvoice({}, { status: 'PARTIAL', amount: 9500, method: 'Cash', paidAt: new Date() }),
      400,
      'paymentAmount',
    );
    assert.equal(await prisma.invoice.count(), countBefore);
  });

  it('refuses to delete an invoice with payments on record', async () => {
    const { invoiceId } = await newInvoice();
    const { paymentId } = await run((tx) =>
      svc.recordPayment(tx, invoiceId, { amount: 100, method: 'Cash', idempotencyKey: key() }, ctx()),
    );
    await expectApiError(run((tx) => svc.deleteInvoice(tx, invoiceId, userId)), 409);

    await run((tx) => svc.voidPayment(tx, invoiceId, paymentId, 'Wrong invoice', userId));
    await run((tx) => svc.deleteInvoice(tx, invoiceId, userId));
    assert.equal(await prisma.invoice.findUnique({ where: { id: invoiceId } }), null);
    const deletion = await prisma.auditLog.findFirst({ where: { entityId: invoiceId, action: 'INVOICE_DELETED' } });
    assert.ok(deletion, 'deletion stays on record');
  });

  it('public invoice view hides payment notes and the audit trail', async () => {
    const { invoiceId } = await newInvoice();
    await run((tx) =>
      svc.recordPayment(tx, invoiceId, { amount: 100, method: 'Cash', notes: 'internal', idempotencyKey: key() }, ctx()),
    );
    const row = await invoiceRow(invoiceId);
    const publicView = await data.getInvoiceViewByToken(row.publicToken);
    assert.equal(publicView?.payments.length, 0);
    assert.equal(publicView?.activity.length, 0);
    assert.equal(publicView?.amountPaid, 100);
    assert.equal(publicView?.paymentStatus, 'PARTIAL');
  });
});
