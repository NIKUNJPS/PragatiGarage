'use client';

import * as React from 'react';
import Link from 'next/link';
import { Banknote, BadgePercent, Clock, Receipt } from 'lucide-react';

import { cn, formatCurrency, prettyVehicleNumber } from '@/lib/utils';
import { formatDayKey } from '@/lib/timezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentStatusBadge } from '@/components/shared/status-badge';
import {
  BillBreakdownCard,
  MethodsCard,
  PeopleCard,
  StatTile,
  downloadCsv,
  peopleCsvRows,
} from '@/components/reports/report-parts';
import type { DailyReport } from '@/types';

export function DailyReportBody({ report }: { report: DailyReport }) {
  const { summary, currency } = report;
  const money = (v: number) => formatCurrency(v, currency);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: report.timeZone });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={report.isToday ? 'Received today' : 'Received'}
          value={money(summary.collected)}
          hint={`${summary.paymentCount} payment${summary.paymentCount === 1 ? '' : 's'}`}
          icon={Banknote}
          tone="emerald"
        />
        <StatTile
          label="Billed"
          value={money(summary.billed)}
          hint={`${summary.billCount} bill${summary.billCount === 1 ? '' : 's'} created`}
          icon={Receipt}
          tone="blue"
        />
        <StatTile
          label="Due on these bills"
          value={money(summary.outstanding)}
          hint={`${summary.unpaidCount} unpaid · ${summary.partialCount} part paid`}
          icon={Clock}
          tone="red"
        />
        <StatTile
          label="Discount given"
          value={money(summary.discount)}
          hint={summary.tax > 0 ? `GST collected ${money(summary.tax)}` : 'No GST charged'}
          icon={BadgePercent}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BillBreakdownCard summary={summary} currency={currency} />
        <MethodsCard methods={report.byMethod} summary={summary} currency={currency} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeopleCard
          title="By car attendant"
          description="Bills created on this day, by the mechanic who attended the vehicle."
          people={report.byAttendant}
          currency={currency}
        />
        <PeopleCard
          title="By bill creator"
          description="Bills created on this day, by the person who made the bill."
          people={report.byBiller}
          currency={currency}
        />
      </div>

      {/* ---------------------------------------------------------- bills */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Bills created</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{formatDayKey(report.date)}</p>
          </div>
          {report.bills.length > 0 && (
            <Link
              href={`/invoices?from=${report.date}&to=${report.date}`}
              className="text-sm font-medium text-primary hover:underline no-print"
            >
              Open in invoices
            </Link>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {report.bills.length === 0 ? (
            <p className="px-6 pb-6 text-center text-sm text-muted-foreground">No bills were created on this day.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-6 py-2 font-medium">Invoice</th>
                      <th className="px-2 py-2 font-medium">Customer / vehicle</th>
                      <th className="px-2 py-2 font-medium">Car attendant</th>
                      <th className="px-2 py-2 font-medium">Bill created by</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-6 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.bills.map((bill) => (
                      <tr key={bill.id} className="hover:bg-muted/30">
                        <td className="px-6 py-2">
                          <Link href={`/invoices/${bill.id}`} className="font-medium text-primary hover:underline">
                            {bill.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          <span className="block">{bill.customerName}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {prettyVehicleNumber(bill.vehicleNumber)}
                          </span>
                        </td>
                        <td className={cn('px-2 py-2', !bill.attendantName && 'text-muted-foreground')}>
                          {bill.attendantName || '-'}
                        </td>
                        <td className={cn('px-2 py-2', !bill.billedByName && 'text-muted-foreground')}>
                          {bill.billedByName || '-'}
                        </td>
                        <td className="px-2 py-2">
                          <PaymentStatusBadge status={bill.paymentStatus} />
                        </td>
                        <td className="px-6 py-2 text-right">
                          <span className="font-semibold tabular-nums">{money(bill.totalAmount)}</span>
                          {bill.balanceDue > 0 && (
                            <span className="block text-xs text-destructive">{money(bill.balanceDue)} due</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="px-6 py-2" colSpan={5}>
                        Total ({report.bills.length})
                      </td>
                      <td className="px-6 py-2 text-right tabular-nums">{money(summary.billed)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <ul className="divide-y border-t md:hidden">
                {report.bills.map((bill) => (
                  <li key={bill.id}>
                    <Link href={`/invoices/${bill.id}`} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{bill.invoiceNumber}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {bill.customerName} · <span className="font-mono">{prettyVehicleNumber(bill.vehicleNumber)}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Attendant: {bill.attendantName || '-'} · By: {bill.billedByName || '-'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">{money(bill.totalAmount)}</p>
                        <div className="mt-1 flex justify-end">
                          <PaymentStatusBadge status={bill.paymentStatus} />
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- payments */}
      <Card>
        <CardHeader>
          <CardTitle>Payments received</CardTitle>
          <p className="text-sm text-muted-foreground">Every payment taken on this day, including dues on older bills.</p>
        </CardHeader>
        <CardContent className="p-0">
          {report.payments.length === 0 ? (
            <p className="px-6 pb-6 text-center text-sm text-muted-foreground">No payments were received on this day.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium sm:px-6">Time</th>
                    <th className="px-2 py-2 font-medium">Invoice</th>
                    <th className="hidden px-2 py-2 font-medium sm:table-cell">Customer</th>
                    <th className="px-2 py-2 font-medium">Method</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-6">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground sm:px-6">
                        {time(p.paidAt)}
                      </td>
                      <td className="px-2 py-2">
                        <Link href={`/invoices/${p.invoiceId}`} className="font-medium text-primary hover:underline">
                          {p.invoiceNumber}
                        </Link>
                      </td>
                      <td className="hidden px-2 py-2 sm:table-cell">{p.customerName}</td>
                      <td className="px-2 py-2">
                        {p.method}
                        {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums sm:px-6">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-4 py-2 sm:px-6" colSpan={3}>
                      Total received
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700 sm:px-6">{money(summary.collected)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function downloadDailyCsv(report: DailyReport, garageName: string) {
  const s = report.summary;
  downloadCsv(`daily-report-${report.date}.csv`, [
    [`${garageName} - Daily report`, report.date],
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
    ['Money received on this day', s.collected],
    [],
    ['Bills created'],
    ['Invoice', 'Customer', 'Vehicle', 'Car attendant', 'Bill created by', 'Total', 'Paid', 'Due', 'Status'],
    ...report.bills.map((b) => [
      b.invoiceNumber,
      b.customerName,
      b.vehicleNumber,
      b.attendantName ?? '',
      b.billedByName ?? '',
      b.totalAmount,
      b.amountPaid,
      b.balanceDue,
      b.paymentStatus,
    ]),
    [],
    ['Payments received'],
    ['Time', 'Invoice', 'Customer', 'Method', 'Reference', 'Amount'],
    ...report.payments.map((p) => [
      new Date(p.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: report.timeZone }),
      p.invoiceNumber,
      p.customerName,
      p.method,
      p.reference ?? '',
      p.amount,
    ]),
    [],
    ...peopleCsvRows('By car attendant', report.byAttendant),
    [],
    ...peopleCsvRows('By bill creator', report.byBiller),
  ]);
}
