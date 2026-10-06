/**
 * Pure tests for the revenue reports: local-day boundaries, aggregation,
 * per-person grouping, CSV export and the attendant / bill-created-by fields.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  addMonths,
  bucketIndex,
  dateKeyInZone,
  dayRange,
  daysOfMonth,
  formatDayKey,
  formatMonthKey,
  isDateKey,
  isMonthKey,
  monthRange,
  resolveTimeZone,
  todayKey,
} from '@/lib/timezone';
import { bucketPeriods, summarizeBills, summarizePayments, totalsByPerson, type BillRow } from '@/lib/reports';
import { distinctNames, nameKey } from '@/lib/staff-names';
import { toCsv } from '@/lib/csv';
import { createInvoiceSchema, directInvoiceSchema, updateInvoiceSchema } from '@/lib/validations';

const IST = 'Asia/Kolkata';

describe('local calendar days and months', () => {
  it('an IST day starts at 18:30 UTC the evening before', () => {
    const { start, end } = dayRange('2026-10-06', IST);
    assert.equal(start.toISOString(), '2026-10-05T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-10-06T18:30:00.000Z');
  });

  it('a bill at 1:30am IST belongs to that IST day, not the previous UTC day', () => {
    const instant = new Date('2026-10-05T20:00:00Z'); // 06 Oct, 01:30 IST
    assert.equal(dateKeyInZone(instant, IST), '2026-10-06');
    assert.equal(dateKeyInZone(instant, 'UTC'), '2026-10-05');
    assert.equal(todayKey(IST, instant.getTime()), '2026-10-06');
  });

  it('handles daylight-saving days (23h and 25h) in zones that have them', () => {
    const spring = dayRange('2026-03-08', 'America/New_York');
    assert.equal(spring.start.toISOString(), '2026-03-08T05:00:00.000Z');
    assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 23);
    const autumn = dayRange('2026-11-01', 'America/New_York');
    assert.equal((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000, 25);
  });

  it('months run from local midnight on the 1st to local midnight on the next 1st', () => {
    const { start, end } = monthRange('2026-12', IST);
    assert.equal(start.toISOString(), '2026-11-30T18:30:00.000Z');
    assert.equal(end.toISOString(), '2026-12-31T18:30:00.000Z');
  });

  it('does calendar arithmetic across month, year and leap-day edges', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(addMonths('2026-11', 14), '2028-01');
    assert.equal(daysOfMonth('2026-02').length, 28);
    assert.equal(daysOfMonth('2028-02').at(-1), '2028-02-29');
  });

  it('validates keys and zones', () => {
    assert.ok(isDateKey('2026-10-06'));
    assert.ok(!isDateKey('2026-02-30'));
    assert.ok(!isDateKey('06/10/2026'));
    assert.ok(isMonthKey('2026-10'));
    assert.ok(!isMonthKey('2026-13'));
    assert.equal(resolveTimeZone('Asia/Dubai'), 'Asia/Dubai');
    assert.equal(resolveTimeZone('Not/AZone'), IST);
    assert.equal(resolveTimeZone(undefined), IST);
  });

  it('formats keys without shifting the day', () => {
    assert.equal(formatDayKey('2026-10-06'), 'Tue, 06 Oct 2026');
    assert.equal(formatMonthKey('2026-10'), 'October 2026');
  });

  it('finds the bucket an instant falls into', () => {
    const starts = [100, 200, 300];
    assert.equal(bucketIndex(starts, 99), -1);
    assert.equal(bucketIndex(starts, 100), 0);
    assert.equal(bucketIndex(starts, 299), 1);
    assert.equal(bucketIndex(starts, 300), 2);
  });
});

const bill = (over: Partial<BillRow> = {}): BillRow => ({
  totalAmount: 0,
  discount: 0,
  tax: 0,
  amountPaid: 0,
  balanceDue: 0,
  paymentStatus: 'UNPAID',
  attendantName: null,
  billedByName: null,
  items: [],
  ...over,
});

describe('report aggregation', () => {
  it('sums bills in exact paise and reconciles sections, discount and tax to the billed total', () => {
    const s = summarizeBills([
      bill({
        totalAmount: '1180.10',
        discount: '100.00',
        tax: '180.00',
        amountPaid: '1180.10',
        paymentStatus: 'PAID',
        items: [
          { kind: 'PART', total: '700.10' },
          { kind: 'LABOUR', total: '300.00' },
          { kind: 'SERVICE', total: '100.00' },
        ],
      }),
      bill({ totalAmount: 0.1, balanceDue: 0.1, items: [{ kind: 'LABOUR', total: 0.1 }] }),
      bill({ totalAmount: 0.2, amountPaid: 0.1, balanceDue: 0.1, paymentStatus: 'PARTIAL', items: [{ kind: 'PART', total: 0.2 }] }),
    ]);
    assert.equal(s.billCount, 3);
    assert.equal(s.billed, 1180.4);
    assert.equal(s.partsBilled, 700.3);
    assert.equal(s.labourBilled, 300.1);
    assert.equal(s.serviceBilled, 100);
    const reconciled = Math.round((s.partsBilled + s.labourBilled + s.serviceBilled - s.discount + s.tax) * 100);
    assert.equal(reconciled, Math.round(s.billed * 100));
    assert.equal(s.billedPaid, 1180.2);
    assert.equal(s.outstanding, 0.2);
    assert.deepEqual([s.paidCount, s.partialCount, s.unpaidCount], [1, 1, 1]);
  });

  it('splits money received into parts vs labour by bill proportion and groups it by method', () => {
    const invoice = { subtotal: 1000, items: [{ kind: 'PART' as const, total: 600 }, { kind: 'SERVICE' as const, total: 400 }] };
    const p = summarizePayments([
      { amount: 500, method: 'Cash', invoice },
      { amount: 250, method: 'UPI', invoice },
      { amount: 250, method: 'Cash', invoice },
    ]);
    assert.equal(p.collected, 1000);
    assert.equal(p.collectedParts, 600);
    assert.equal(p.collectedLabour, 400);
    assert.equal(p.paymentCount, 3);
    assert.deepEqual(p.byMethod, [
      { method: 'Cash', count: 2, amount: 750 },
      { method: 'UPI', count: 1, amount: 250 },
    ]);
  });

  it('groups people case- and space-insensitively, biggest first, "not recorded" last', () => {
    const rows = totalsByPerson(
      [
        bill({ attendantName: 'Ramesh', totalAmount: 100, amountPaid: 100 }),
        bill({ attendantName: ' ramesh  ', totalAmount: 50, balanceDue: 50 }),
        bill({ attendantName: null, totalAmount: 999 }),
        bill({ attendantName: 'Ajay', totalAmount: 400 }),
      ],
      'attendantName',
    );
    assert.deepEqual(
      rows.map((r) => [r.name, r.bills, r.billed]),
      [
        ['Ajay', 1, 400],
        ['Ramesh', 2, 150],
        [null, 1, 999],
      ],
    );
    assert.equal(rows[1].paid, 100);
    assert.equal(rows[1].outstanding, 50);
  });

  it('buckets bills and payments into days with half-open boundaries', () => {
    const keys = ['2026-10-01', '2026-10-02'];
    const starts = keys.map((k) => dayRange(k, IST).start.getTime());
    const end = dayRange('2026-10-02', IST).end.getTime();
    const at = (iso: string) => new Date(iso);
    const out = bucketPeriods(
      keys,
      starts,
      end,
      [
        { createdAt: at('2026-09-30T18:29:59Z'), totalAmount: 1 }, // 30 Sep 23:59 IST - outside
        { createdAt: at('2026-09-30T18:30:00Z'), totalAmount: 10 }, // 1 Oct 00:00 IST
        { createdAt: at('2026-10-01T18:30:00Z'), totalAmount: 20 }, // 2 Oct 00:00 IST
        { createdAt: at('2026-10-02T18:30:00Z'), totalAmount: 5 }, // 3 Oct - outside
      ],
      [{ paidAt: at('2026-10-01T10:00:00Z'), amount: 7.5 }],
    );
    assert.deepEqual(out, [
      { key: '2026-10-01', bills: 1, billed: 10, collected: 7.5 },
      { key: '2026-10-02', bills: 1, billed: 20, collected: 0 },
    ]);
  });
});

describe('staff names', () => {
  it('normalises names for grouping and keeps the first spelling as a suggestion', () => {
    assert.equal(nameKey('  Ramesh   Kumar '), 'ramesh kumar');
    assert.equal(nameKey(null), '');
    assert.deepEqual(distinctNames(['Suresh', null, 'suresh ', 'Ajay', '', 'AJAY', 'Ravi'], 2), ['Suresh', 'Ajay']);
  });

  const base = {
    jobCardId: 'jc1',
    items: [{ kind: 'LABOUR', description: 'Labour', quantity: 1, unitPrice: 100 }],
  };

  it('requires "bill created by" on new bills and tidies both names', () => {
    const missing = createInvoiceSchema.safeParse(base);
    assert.ok(!missing.success);
    assert.match(missing.error.flatten().fieldErrors.billedByName?.[0] ?? '', /person making this bill/);
    assert.ok(!createInvoiceSchema.safeParse({ ...base, billedByName: '   ' }).success);

    const ok = createInvoiceSchema.parse({ ...base, billedByName: '  Suresh   Patil ', attendantName: '' });
    assert.equal(ok.billedByName, 'Suresh Patil');
    assert.equal(ok.attendantName, undefined);

    const direct = directInvoiceSchema.parse({
      vehicleId: 'v1',
      items: base.items,
      billedByName: 'Suresh',
      attendantName: ' Ramesh ',
    });
    assert.equal(direct.attendantName, 'Ramesh');
  });

  it('on edit, an omitted name is left alone while an empty one clears it', () => {
    const untouched = updateInvoiceSchema.parse({ notes: 'x' });
    assert.equal(untouched.attendantName, undefined);
    assert.equal(untouched.billedByName, undefined);
    const cleared = updateInvoiceSchema.parse({ attendantName: '', billedByName: null });
    assert.equal(cleared.attendantName, null);
    assert.equal(cleared.billedByName, null);
    assert.equal(updateInvoiceSchema.parse({ billedByName: ' Ajay  K ' }).billedByName, 'Ajay K');
  });
});

describe('CSV export', () => {
  it('quotes separators and neutralises spreadsheet formulas', () => {
    const csv = toCsv([
      ['Name', 'Amount'],
      ['Patil, Suresh', 1250.5],
      ['=HYPERLINK("x")', -10],
      ['Says "hi"', null],
    ]);
    assert.equal(csv, 'Name,Amount\r\n"Patil, Suresh",1250.5\r\n"\'=HYPERLINK(""x"")",-10\r\n"Says ""hi""",');
  });
});
