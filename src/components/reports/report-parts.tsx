'use client';

import * as React from 'react';

import { toCsv } from '@/lib/csv';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MethodTotal, PersonTotal, RevenueSummary } from '@/types';

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
};

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md print-keep-color', TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Spare parts + labour + service - discount + tax = billed, so the figures visibly add up. */
export function BillBreakdownCard({ summary, currency }: { summary: RevenueSummary; currency: string }) {
  const money = (v: number) => formatCurrency(v, currency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill breakdown</CardTitle>
        <p className="text-sm text-muted-foreground">
          {summary.billCount} bill{summary.billCount === 1 ? '' : 's'} issued
        </p>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <Row label="Spare parts" value={money(summary.partsBilled)} />
          <Row label="Labour charges" value={money(summary.labourBilled)} />
          <Row label="Service charges" value={money(summary.serviceBilled)} />
          {summary.discount > 0 && <Row label="Discount given" value={`- ${money(summary.discount)}`} />}
          {summary.tax > 0 && <Row label="Tax / GST" value={`+ ${money(summary.tax)}`} />}
          <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
            <dt>Total billed</dt>
            <dd className="tabular-nums">{money(summary.billed)}</dd>
          </div>
          <Row label="Received against these bills" value={money(summary.billedPaid)} />
          <div className="flex items-center justify-between font-semibold">
            <dt>Still due on these bills</dt>
            <dd className={cn('tabular-nums', summary.outstanding > 0 ? 'text-destructive' : 'text-emerald-700')}>
              {money(summary.outstanding)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Money received in the period, by payment method, with a share bar per method. */
export function MethodsCard({
  methods,
  summary,
  currency,
}: {
  methods: MethodTotal[];
  summary: RevenueSummary;
  currency: string;
}) {
  const money = (v: number) => formatCurrency(v, currency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Money received</CardTitle>
        <p className="text-sm text-muted-foreground">
          {summary.paymentCount} payment{summary.paymentCount === 1 ? '' : 's'}, including dues collected on older bills
        </p>
      </CardHeader>
      <CardContent>
        {methods.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No payments received.</p>
        ) : (
          <ul className="space-y-3">
            {methods.map((m) => {
              const share = summary.collected > 0 ? (m.amount / summary.collected) * 100 : 0;
              return (
                <li key={m.method}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {m.method}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({m.count}) · {Math.round(share)}%
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{money(m.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-50 print-keep-color" aria-hidden>
                    <div className="h-full rounded-full bg-primary print-keep-color" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
          <Row label="Spare parts share" value={money(summary.collectedParts)} />
          <Row label="Labour & service share" value={money(summary.collectedLabour)} />
          <div className="flex items-center justify-between text-base font-bold">
            <dt>Total received</dt>
            <dd className="tabular-nums text-emerald-700">{money(summary.collected)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Bills grouped by car attendant or by who made them. */
export function PeopleCard({
  title,
  description,
  people,
  currency,
}: {
  title: string;
  description: string;
  people: PersonTotal[];
  currency: string;
}) {
  const money = (v: number) => formatCurrency(v, currency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {people.length === 0 ? (
          <p className="px-6 pb-6 text-center text-sm text-muted-foreground">No bills in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium sm:px-6">Name</th>
                  <th className="px-2 py-2 text-right font-medium">Bills</th>
                  <th className="px-2 py-2 text-right font-medium">Billed</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-6">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {people.map((p) => (
                  <tr key={p.name ?? '__none'}>
                    <td className={cn('px-4 py-2 sm:px-6', p.name ? 'font-medium' : 'italic text-muted-foreground')}>
                      {p.name ?? 'Not recorded'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.bills}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{money(p.billed)}</td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums sm:px-6',
                        p.outstanding > 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {money(p.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Saves a CSV file. The BOM lets Excel read names typed in Hindi / Marathi correctly. */
export function downloadCsv(filename: string, rows: Parameters<typeof toCsv>[0]) {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV rows for a per-person table. */
export function peopleCsvRows(heading: string, people: PersonTotal[]) {
  return [
    [heading],
    ['Name', 'Bills', 'Billed', 'Paid', 'Due'],
    ...people.map((p) => [p.name ?? 'Not recorded', p.bills, p.billed, p.paid, p.outstanding]),
  ];
}
