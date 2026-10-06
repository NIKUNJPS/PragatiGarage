'use client';

import * as React from 'react';
import { Banknote, Calculator, Clock, Receipt } from 'lucide-react';

import { cn, formatCurrency } from '@/lib/utils';
import { formatDayKey, formatMonthKey } from '@/lib/timezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ColumnChart, type ColumnDatum } from '@/components/reports/column-chart';
import {
  BillBreakdownCard,
  MethodsCard,
  PeopleCard,
  StatTile,
  downloadCsv,
  peopleCsvRows,
} from '@/components/reports/report-parts';
import type { MonthlyReport, PeriodTotal } from '@/types';

type Measure = 'billed' | 'collected';

const MEASURES: Array<{ value: Measure; label: string }> = [
  { value: 'billed', label: 'Billed' },
  { value: 'collected', label: 'Received' },
];

export function MonthlyReportBody({
  report,
  onOpenDay,
  onSelectMonth,
}: {
  report: MonthlyReport;
  onOpenDay: (date: string) => void;
  onSelectMonth: (month: string) => void;
}) {
  const { summary, currency } = report;
  const money = (v: number) => formatCurrency(v, currency);
  const [measure, setMeasure] = React.useState<Measure>('billed');
  const measureLabel = measure === 'billed' ? 'billed' : 'received';

  const activeDays = report.days.filter((d) => d.bills > 0 || d.collected > 0).length;
  const average = summary.billCount > 0 ? summary.billed / summary.billCount : 0;
  const bestDay = report.days.reduce<PeriodTotal | null>(
    (best, d) => (d.billed > 0 && (!best || d.billed > best.billed) ? d : best),
    null,
  );

  const details = (p: PeriodTotal) => [
    { label: 'Bills', value: String(p.bills) },
    measure === 'billed'
      ? { label: 'Received', value: money(p.collected) }
      : { label: 'Billed', value: money(p.billed) },
  ];

  const dayColumns: ColumnDatum[] = report.days.map((d) => ({
    key: d.key,
    tick: String(Number(d.key.slice(8))),
    label: formatDayKey(d.key),
    value: d[measure],
    details: details(d),
  }));

  const monthColumns: ColumnDatum[] = report.trend.map((m) => ({
    key: m.key,
    tick: formatMonthKey(m.key, { month: 'short' }).slice(0, 3),
    label: formatMonthKey(m.key),
    value: m[measure],
    details: details(m),
  }));

  const trendTotals = report.trend.reduce(
    (acc, m) => ({ bills: acc.bills + m.bills, billed: acc.billed + m.billed, collected: acc.collected + m.collected }),
    { bills: 0, billed: 0, collected: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Billed this month"
          value={money(summary.billed)}
          hint={`${summary.billCount} bill${summary.billCount === 1 ? '' : 's'}`}
          icon={Receipt}
          tone="blue"
        />
        <StatTile
          label="Received this month"
          value={money(summary.collected)}
          hint={`${summary.paymentCount} payment${summary.paymentCount === 1 ? '' : 's'}`}
          icon={Banknote}
          tone="emerald"
        />
        <StatTile
          label="Due on this month's bills"
          value={money(summary.outstanding)}
          hint={`${summary.unpaidCount} unpaid · ${summary.partialCount} part paid`}
          icon={Clock}
          tone="red"
        />
        <StatTile
          label="Average bill"
          value={money(average)}
          hint={
            bestDay
              ? `Best day ${formatDayKey(bestDay.key, { day: '2-digit', month: 'short' })}: ${money(bestDay.billed)}`
              : `${activeDays} working day${activeDays === 1 ? '' : 's'}`
          }
          icon={Calculator}
          tone="amber"
        />
      </div>

      {/* --------------------------------------------------- day by day */}
      <Card>
        <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Day by day - amount {measureLabel}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMonthKey(report.month)}. Tap a day to open its daily report.
            </p>
          </div>
          <div className="inline-flex shrink-0 rounded-md border p-0.5 no-print" role="radiogroup" aria-label="Chart measure">
            {MEASURES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={measure === m.value}
                onClick={() => setMeasure(m.value)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  measure === m.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ColumnChart
            data={dayColumns}
            currency={currency}
            measureLabel={measureLabel}
            showTick={(i) => dayColumns.length <= 10 || i === 0 || (i + 1) % 5 === 0}
            onSelect={onOpenDay}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BillBreakdownCard summary={summary} currency={currency} />
        <MethodsCard methods={report.byMethod} summary={summary} currency={currency} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeopleCard
          title="By car attendant"
          description="This month's bills, by the mechanic who attended the vehicle."
          people={report.byAttendant}
          currency={currency}
        />
        <PeopleCard
          title="By bill creator"
          description="This month's bills, by the person who made the bill."
          people={report.byBiller}
          currency={currency}
        />
      </div>

      {/* ------------------------------------------------- daily table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily revenue</CardTitle>
          <p className="text-sm text-muted-foreground">
            Billed = bills created that day. Received = payments taken that day, on any bill.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <PeriodTable
            rows={report.days.slice().reverse()}
            firstColumn="Date"
            format={(key) => formatDayKey(key)}
            onOpen={onOpenDay}
            totals={{ bills: summary.billCount, billed: summary.billed, collected: summary.collected }}
            currency={currency}
            hideEmpty
          />
        </CardContent>
      </Card>

      {/* --------------------------------------------- 12-month trend */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly billing - last 12 months</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Amount {measureLabel} each month, {formatMonthKey(report.month)} highlighted. Tap a month to open it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ColumnChart
            data={monthColumns}
            currency={currency}
            measureLabel={measureLabel}
            highlightKey={report.month}
            // Phones label every other month, always including the selected (last) one.
            showTick={(i) => ((monthColumns.length - 1 - i) % 2 === 0 ? true : 'wide')}
            onSelect={onSelectMonth}
          />
        </CardContent>
        <CardContent className="p-0">
          <PeriodTable
            rows={report.trend.slice().reverse()}
            firstColumn="Month"
            format={(key) => formatMonthKey(key)}
            onOpen={onSelectMonth}
            totals={trendTotals}
            currency={currency}
            highlightKey={report.month}
            totalLabel="12-month total"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodTable({
  rows,
  firstColumn,
  format,
  onOpen,
  totals,
  currency,
  hideEmpty = false,
  highlightKey,
  totalLabel = 'Month total',
}: {
  rows: PeriodTotal[];
  firstColumn: string;
  format: (key: string) => string;
  onOpen: (key: string) => void;
  totals: { bills: number; billed: number; collected: number };
  currency: string;
  hideEmpty?: boolean;
  highlightKey?: string;
  totalLabel?: string;
}) {
  const money = (v: number) => formatCurrency(v, currency);
  const visible = hideEmpty ? rows.filter((r) => r.bills > 0 || r.collected > 0) : rows;

  if (visible.length === 0) {
    return <p className="px-6 pb-6 text-center text-sm text-muted-foreground">No bills or payments in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium sm:px-6">{firstColumn}</th>
            <th className="px-2 py-2 text-right font-medium">Bills</th>
            <th className="px-2 py-2 text-right font-medium">Billed</th>
            <th className="px-4 py-2 text-right font-medium sm:px-6">Received</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {visible.map((r) => (
            <tr
              key={r.key}
              className={cn('cursor-pointer hover:bg-muted/30', r.key === highlightKey && 'bg-primary/5 font-semibold')}
              onClick={() => onOpen(r.key)}
            >
              <td className="px-4 py-2 sm:px-6">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(r.key);
                  }}
                  className="text-left font-medium text-primary hover:underline"
                >
                  {format(r.key)}
                </button>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{r.bills}</td>
              <td className="px-2 py-2 text-right tabular-nums">{money(r.billed)}</td>
              <td className="px-4 py-2 text-right tabular-nums sm:px-6">{money(r.collected)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-semibold">
            <td className="px-4 py-2 sm:px-6">{totalLabel}</td>
            <td className="px-2 py-2 text-right tabular-nums">{totals.bills}</td>
            <td className="px-2 py-2 text-right tabular-nums">{money(totals.billed)}</td>
            <td className="px-4 py-2 text-right tabular-nums text-emerald-700 sm:px-6">{money(totals.collected)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function downloadMonthlyCsv(report: MonthlyReport, garageName: string) {
  const s = report.summary;
  downloadCsv(`monthly-report-${report.month}.csv`, [
    [`${garageName} - Monthly report`, report.month],
    [],
    ['Summary'],
    ['Bills created', s.billCount],
    ['Billed (total payable)', s.billed],
    ['Spare parts', s.partsBilled],
    ['Labour charges', s.labourBilled],
    ['Service charges', s.serviceBilled],
    ['Discount given', s.discount],
    ['Tax / GST', s.tax],
    ['Received against these bills', s.billedPaid],
    ['Still due on these bills', s.outstanding],
    ['Money received this month', s.collected],
    [],
    ['Daily revenue'],
    ['Date', 'Bills', 'Billed', 'Received'],
    ...report.days.map((d) => [d.key, d.bills, d.billed, d.collected]),
    ['Total', s.billCount, s.billed, s.collected],
    [],
    ['Payment methods'],
    ['Method', 'Payments', 'Amount'],
    ...report.byMethod.map((m) => [m.method, m.count, m.amount]),
    [],
    ...peopleCsvRows('By car attendant', report.byAttendant),
    [],
    ...peopleCsvRows('By bill creator', report.byBiller),
    [],
    ['Last 12 months'],
    ['Month', 'Bills', 'Billed', 'Received'],
    ...report.trend.map((m) => [m.key, m.bills, m.billed, m.collected]),
  ]);
}
