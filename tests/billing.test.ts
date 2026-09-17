import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BillingValidationError,
  calculateInvoiceTotals,
  derivePaymentStatus,
  evaluateInvoice,
  splitCollected,
} from '@/lib/billing';
import { multiplyToPaise, paiseToDecimalString, percentOfPaise, roundMoney, toPaise } from '@/lib/money';

const bill = (items: Array<[kind: 'PART' | 'LABOUR' | 'SERVICE', qty: number | string, price: number | string]>) =>
  items.map(([kind, quantity, unitPrice]) => ({ kind, quantity, unitPrice }));

describe('billing calculation (spec tests 1-8)', () => {
  it('1. normal bill: service 5,000 + parts 5,000, no discount = 10,000', () => {
    const t = calculateInvoiceTotals({
      items: bill([['SERVICE', 1, 5000], ['PART', 1, 5000]]),
      discountType: 'NONE',
    });
    assert.equal(t.subtotal, 10000);
    assert.equal(t.discountAmount, 0);
    assert.equal(t.totalAmount, 10000);
    assert.equal(t.balanceDue, 10000);
    assert.equal(t.paymentStatus, 'UNPAID');
  });

  it('2. fixed discount: 10,000 - 1,000 = 9,000', () => {
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1, 10000]]),
      discountType: 'FIXED',
      discountValue: 1000,
    });
    assert.equal(t.subtotal, 10000);
    assert.equal(t.discountAmount, 1000);
    assert.equal(t.totalAmount, 9000);
  });

  it('3. percentage discount: 10% of 10,000 = 1,000, total 9,000', () => {
    const t = calculateInvoiceTotals({
      items: bill([['LABOUR', 1, 10000]]),
      discountType: 'PERCENT',
      discountValue: 10,
    });
    assert.equal(t.discountValue, 10);
    assert.equal(t.discountAmount, 1000);
    assert.equal(t.totalAmount, 9000);
  });

  it('4. full payment of the discounted amount is PAID, not an underpayment', () => {
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1, 10000]]),
      discountType: 'FIXED',
      discountValue: 1000,
      payments: [{ amount: 9000 }],
    });
    assert.equal(t.amountPaid, 9000);
    assert.equal(t.balanceDue, 0);
    assert.equal(t.excessPaid, 0);
    assert.equal(t.paymentStatus, 'PAID');
  });

  it('5. partial payment: 5,000 of 9,000 leaves 4,000 due, PARTIAL', () => {
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1, 10000]]),
      discountType: 'FIXED',
      discountValue: 1000,
      payments: [{ amount: 5000 }],
    });
    assert.equal(t.amountPaid, 5000);
    assert.equal(t.balanceDue, 4000);
    assert.equal(t.paymentStatus, 'PARTIAL');
  });

  it('6. multiple payments 3,000 x 3 settle 9,000', () => {
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1, 10000]]),
      discountType: 'PERCENT',
      discountValue: 10,
      payments: [{ amount: 3000 }, { amount: 3000 }, { amount: 3000 }],
    });
    assert.equal(t.amountPaid, 9000);
    assert.equal(t.balanceDue, 0);
    assert.equal(t.paymentStatus, 'PAID');
  });

  it('7. zero payment leaves the invoice UNPAID with 9,000 due; voided payments do not count', () => {
    const none = calculateInvoiceTotals({
      items: bill([['PART', 1, 9000]]),
      payments: [],
    });
    assert.equal(none.paymentStatus, 'UNPAID');
    assert.equal(none.balanceDue, 9000);

    const voided = calculateInvoiceTotals({
      items: bill([['PART', 1, 9000]]),
      payments: [{ amount: 9000, isVoided: true }],
    });
    assert.equal(voided.amountPaid, 0);
    assert.equal(voided.paymentStatus, 'UNPAID');
  });

  it('8. discount larger than the bill is rejected, not silently capped', () => {
    assert.throws(
      () =>
        calculateInvoiceTotals({
          items: bill([['PART', 1, 10000]]),
          discountType: 'FIXED',
          discountValue: 15000,
        }),
      (error: unknown) =>
        error instanceof BillingValidationError && Boolean(error.fieldErrors.discountValue),
    );
  });
});

describe('discount and input validation', () => {
  const base = bill([['PART', 1, 10000]]);
  const fieldsOf = (input: Parameters<typeof evaluateInvoice>[0]) => Object.keys(evaluateInvoice(input).errors);

  it('rejects a negative discount', () => {
    assert.deepEqual(fieldsOf({ items: base, discountType: 'FIXED', discountValue: -1 }), ['discountValue']);
  });

  it('rejects a percentage above 100', () => {
    assert.deepEqual(fieldsOf({ items: base, discountType: 'PERCENT', discountValue: 100.01 }), ['discountValue']);
  });

  it('allows a 100% discount, giving a settled zero bill', () => {
    const t = calculateInvoiceTotals({ items: base, discountType: 'PERCENT', discountValue: 100 });
    assert.equal(t.totalAmount, 0);
    assert.equal(t.paymentStatus, 'PAID');
  });

  it('ignores the discount value when the type is NONE', () => {
    const t = calculateInvoiceTotals({ items: base, discountType: 'NONE', discountValue: 5000 });
    assert.equal(t.discountAmount, 0);
    assert.equal(t.totalAmount, 10000);
  });

  it('rejects negative prices, zero/negative quantities, bad tax and negative payments', () => {
    assert.ok(fieldsOf({ items: bill([['PART', 1, -5]]) }).includes('items.0.unitPrice'));
    assert.ok(fieldsOf({ items: bill([['PART', 0, 5]]) }).includes('items.0.quantity'));
    assert.ok(fieldsOf({ items: bill([['PART', -2, 5]]) }).includes('items.0.quantity'));
    assert.ok(fieldsOf({ items: base, taxRate: -1 }).includes('taxRate'));
    assert.ok(fieldsOf({ items: base, taxRate: 101 }).includes('taxRate'));
    assert.ok(fieldsOf({ items: base, payments: [{ amount: -100 }] }).includes('payments.0.amount'));
    assert.ok(fieldsOf({ items: base, payments: [{ amount: 0 }] }).includes('payments.0.amount'));
  });

  it('rejects sub-paisa amounts and non-numbers', () => {
    assert.ok(fieldsOf({ items: bill([['PART', 1, '333.335']]) }).includes('items.0.unitPrice'));
    assert.ok(fieldsOf({ items: bill([['PART', 1, 'abc']]) }).includes('items.0.unitPrice'));
  });

  it('keeps a live preview while inputs are invalid', () => {
    const { totals, errors } = evaluateInvoice({ items: base, discountType: 'FIXED', discountValue: 20000 });
    assert.ok(errors.discountValue);
    assert.equal(totals.totalAmount, 10000);
  });

  it('reports an overpayment after the bill was reduced instead of a negative balance', () => {
    const t = calculateInvoiceTotals({ items: bill([['PART', 1, 7000]]), payments: [{ amount: 9000 }] });
    assert.equal(t.balanceDue, 0);
    assert.equal(t.excessPaid, 2000);
    assert.equal(t.paymentStatus, 'PAID');
  });
});

describe('money precision (no floating point drift)', () => {
  it('adds 1,999.50 + 500.25 + 299.25 exactly', () => {
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1, 1999.5], ['LABOUR', 1, 500.25], ['SERVICE', 1, 299.25]]),
    });
    assert.equal(t.subtotal, 2799);
    assert.equal(t.partsTotal, 1999.5);
    assert.equal(t.labourTotal, 500.25);
    assert.equal(t.serviceTotal, 299.25);
  });

  it('0.1 + 0.2 is exactly 0.30', () => {
    const t = calculateInvoiceTotals({ items: bill([['PART', 1, 0.1], ['PART', 1, 0.2]]) });
    assert.equal(t.subtotal, 0.3);
    assert.equal(paiseToDecimalString(toPaise(t.subtotal)), '0.30');
  });

  it('rounds quantity x price half up at the paisa', () => {
    assert.equal(multiplyToPaise(3, '333.33'), 99999);
    assert.equal(multiplyToPaise(2.5, 199.99), 49998); // 499.975 -> 499.98
    assert.equal(multiplyToPaise('1.25', '10.07'), 1259); // 12.5875 -> 12.59
    // 100,000 x 99,999,999.99 = 9,999,999,999,000.00 - beyond float-safe cents math
    assert.equal(multiplyToPaise(100000, 99999999.99), 999999999900000);
  });

  it('computes GST half up on the discounted amount (float round2 gave 17.86)', () => {
    assert.equal(percentOfPaise(toPaise(99.25), 18), 1787);
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1, 110.25]]),
      discountType: 'FIXED',
      discountValue: 11,
      taxRate: 18,
    });
    assert.equal(t.taxableAmount, 99.25);
    assert.equal(t.tax, 17.87);
    assert.equal(t.totalAmount, 117.12);
  });

  it('handles decimal quantities, percentage discount and tax together', () => {
    const t = calculateInvoiceTotals({
      items: bill([['PART', 1.5, 420.5], ['LABOUR', 1, 350], ['SERVICE', 2, 99.99]]),
      discountType: 'PERCENT',
      discountValue: 12.5,
      taxRate: 18,
      payments: [{ amount: 500 }, { amount: '250.55' }],
    });
    // 630.75 + 350 + 199.98 = 1180.73; 12.5% = 147.59125 -> 147.59; taxable 1033.14
    assert.equal(t.subtotal, 1180.73);
    assert.equal(t.discountAmount, 147.59);
    assert.equal(t.taxableAmount, 1033.14);
    // 18% of 1033.14 = 185.9652 -> 185.97
    assert.equal(t.tax, 185.97);
    assert.equal(t.totalAmount, 1219.11);
    assert.equal(t.amountPaid, 750.55);
    assert.equal(t.balanceDue, 468.56);
    assert.equal(t.paymentStatus, 'PARTIAL');
  });

  it('roundMoney fixes the values the old round2 got wrong', () => {
    assert.equal(roundMoney(3 * 333.335), 1000.01);
    assert.equal(roundMoney((99.25 * 18) / 100), 17.87);
    assert.equal(roundMoney(1.005), 1.01);
  });
});

describe('payment status and revenue split', () => {
  it('derives status from amounts', () => {
    assert.equal(derivePaymentStatus(900000, 0), 'UNPAID');
    assert.equal(derivePaymentStatus(900000, 500000), 'PARTIAL');
    assert.equal(derivePaymentStatus(900000, 900000), 'PAID');
    assert.equal(derivePaymentStatus(900000, 1000000), 'PAID');
    assert.equal(derivePaymentStatus(0, 0), 'PAID');
  });

  it('splits collections by the bill proportion and never loses a paisa', () => {
    const split = splitCollected(9000, 4000, 10000);
    assert.deepEqual(split, { parts: 3600, labour: 5400 });
    const odd = splitCollected(100, 1, 3);
    assert.equal(roundMoney(odd.parts + odd.labour), 100);
  });
});
