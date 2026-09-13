'use client';

import * as React from 'react';
import { Phone } from 'lucide-react';

import { formatCurrency, formatDate, initials, prettyVehicleNumber } from '@/lib/utils';
import { BrandLogo } from '@/components/shared/brand-logo';
import type { InvoiceView } from '@/lib/invoice-data';

/**
 * On-screen invoice, styled as a classic Indian garage bill book: centred logo +
 * tagline + phone, a customer/vehicle info box, a black-header
 * Sr.No / Particulars / Amount table, a TOTAL AMOUNT bar, and a
 * Thank You / Authorised Sign footer. The printed page and PDF mirror this.
 */
const SECTIONS: Array<{ kind: 'PART' | 'LABOUR' | 'SERVICE'; label: string }> = [
  { kind: 'PART', label: 'Spare Parts' },
  { kind: 'LABOUR', label: 'Labour Charges' },
  { kind: 'SERVICE', label: 'Service Charges' },
];

export function InvoiceDocument({ invoice }: { invoice: InvoiceView }) {
  const currency = invoice.garage.currency;
  const money = (value: number) => formatCurrency(value, currency);
  const g = invoice.garage;

  // Each line's "particulars" text: description, plus qty x rate when qty != 1.
  const particulars = (item: InvoiceView['items'][number]) =>
    item.quantity && item.quantity !== 1
      ? `${item.description}  (${item.quantity} × ${money(item.unitPrice)})`
      : item.description;

  // Bifurcate the line items into Spare Parts / Labour / Service sections.
  const groups = SECTIONS.map((s) => ({
    ...s,
    items: invoice.items.filter((i) => i.kind === s.kind),
    total: invoice.items
      .filter((i) => i.kind === s.kind)
      .reduce((sum, i) => sum + i.total, 0),
  })).filter((g2) => g2.items.length > 0);

  // Continuous serial number across all sections.
  let serial = 0;

  return (
    <div className="print-area relative overflow-hidden rounded-xl border-2 border-slate-900 bg-white text-slate-900 shadow-sm print-keep-color">
      {/* decorative corners (red + black) */}
      <Corner className="left-0 top-0" />
      <Corner className="right-0 top-0 -scale-x-100" />
      <Corner className="bottom-0 left-0 -scale-y-100" />
      <Corner className="bottom-0 right-0 -scale-100" />

      <div className="relative p-5 sm:p-8">
        {/* ------------------------------------------------------- header */}
        <div className="flex flex-col items-center text-center">
          <BrandLogo
            src={g.logoUrl || '/logo.svg'}
            alt={g.name}
            className="h-24 w-24 object-contain sm:h-28 sm:w-28"
            fallback={
              <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-slate-900 text-2xl font-black italic text-white">
                {initials(g.name) || 'GM'}
              </div>
            }
          />
          <h1 className="mt-2 text-2xl font-black uppercase italic tracking-tight sm:text-3xl">
            {g.name}
          </h1>
          {g.tagline && (
            <div className="mt-1 flex w-full max-w-md items-center justify-center gap-3">
              <span className="h-px flex-1 bg-red-600" />
              <p className="text-xs font-bold uppercase italic tracking-wide text-slate-800 sm:text-sm">
                {g.tagline}
              </p>
              <span className="h-px flex-1 bg-red-600" />
            </div>
          )}
          {g.phone && (
            <p className="mt-2 flex items-center gap-2 text-lg font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 print-keep-color">
                <Phone className="h-3.5 w-3.5 text-white" />
              </span>
              {g.phone}
            </p>
          )}
          {(g.gstNumber || g.address) && (
            <p className="mt-1 max-w-lg text-[11px] text-slate-500">
              {[g.address, g.gstNumber && `GSTIN: ${g.gstNumber}`].filter(Boolean).join('  ·  ')}
            </p>
          )}
        </div>

        {/* invoice no + status strip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 py-2 text-xs">
          <span className="font-semibold">
            Invoice: <span className="font-mono">{invoice.invoiceNumber}</span>
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase print-keep-color ${
              invoice.paymentStatus === 'PAID'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {invoice.paymentStatus === 'PAID' ? 'Paid' : 'Payment Due'}
          </span>
        </div>

        {/* ---------------------------------------------- customer/vehicle box */}
        <div className="mt-4 rounded-xl border-2 border-slate-900 p-3 sm:p-4">
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <InfoRow label="Customer Name" value={invoice.customer.name} />
            <InfoRow label="Vehicle No." value={prettyVehicleNumber(invoice.vehicle.vehicleNumber)} mono />
            <InfoRow
              label="Model"
              value={
                [invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' ') ||
                (invoice.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike')
              }
            />
            <InfoRow
              label="K.M."
              value={invoice.vehicle.odometer ? `${invoice.vehicle.odometer.toLocaleString()} km` : '-'}
            />
            <InfoRow label="Contact No." value={invoice.customer.mobileNumber} />
            <InfoRow label="Date" value={formatDate(invoice.createdAt)} />
          </div>
        </div>

        {/* --------------------------------------------------------- table */}
        <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-900 text-white print-keep-color">
              <th className="w-10 border border-slate-900 px-1.5 py-2 text-center font-bold sm:w-14 sm:px-2">
                Sr.
              </th>
              <th className="border border-slate-900 px-2 py-2 text-left font-bold sm:px-3">
                Particulars
              </th>
              <th className="w-24 border border-slate-900 px-2 py-2 text-right font-bold sm:w-32 sm:px-3">
                Amount (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.kind}>
                {/* section header (bifurcation) - label only */}
                <tr className="bg-slate-100 print-keep-color">
                  <td
                    colSpan={3}
                    className="border border-slate-300 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.items.map((item) => {
                  serial += 1;
                  return (
                    <tr key={item.id}>
                      <td className="border border-slate-300 px-2 py-2 text-center text-slate-500">
                        {serial}.
                      </td>
                      <td className="border border-slate-300 px-3 py-2 font-medium">
                        {particulars(item)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right font-semibold">
                        {money(item.total)}
                      </td>
                    </tr>
                  );
                })}
                {/* section subtotal - AFTER the items */}
                <tr className="bg-slate-50 print-keep-color">
                  <td className="border border-slate-300 px-2 py-1.5" />
                  <td className="border border-slate-300 px-3 py-1.5 text-right text-xs font-semibold italic text-slate-600">
                    {group.label} total
                  </td>
                  <td className="border border-slate-300 px-3 py-1.5 text-right text-xs font-bold text-slate-800">
                    {money(group.total)}
                  </td>
                </tr>
              </React.Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="border border-slate-300 px-3 py-6 text-center text-sm text-slate-400"
                >
                  No items on this invoice.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* ----------------------------------------------- totals (below all) */}
        <div className="mt-4 flex justify-end">
          <div className="w-full space-y-2 sm:max-w-sm">
            <dl className="space-y-1 text-sm">
              <TotalRow label="Subtotal" value={money(invoice.subtotal)} />
              {invoice.discount > 0 && (
                <TotalRow label="Discount" value={`- ${money(invoice.discount)}`} />
              )}
              {(invoice.taxRate > 0 || invoice.tax > 0) && (
                <TotalRow label={`GST (${invoice.taxRate}%)`} value={money(invoice.tax)} />
              )}
            </dl>

            <div className="flex items-stretch overflow-hidden rounded-md border-2 border-slate-900 print-keep-color">
              <div className="flex-1 bg-slate-900 px-3 py-2.5 text-sm font-black uppercase tracking-wide text-white sm:px-4 sm:text-base">
                Total Amount
              </div>
              <div className="flex items-center justify-end whitespace-nowrap px-3 py-2.5 text-base font-black sm:px-4 sm:text-lg">
                ₹ {money(invoice.totalAmount).replace(/^₹\s*/, '')}
              </div>
            </div>

            {invoice.paymentStatus === 'PAID' && invoice.paidAt && (
              <p className="text-right text-xs font-medium text-emerald-700">
                Paid on {formatDate(invoice.paidAt)}
                {invoice.paymentMethod ? ` (${invoice.paymentMethod})` : ''}
              </p>
            )}
          </div>
        </div>

        {/* --------------------------------------------- work notes (compact) */}
        {(invoice.jobCard.complaint || invoice.notes) && (
          <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
            {invoice.jobCard.complaint && (
              <p>
                <span className="font-semibold text-slate-800">Complaint:</span>{' '}
                {invoice.jobCard.complaint}
              </p>
            )}
            {invoice.notes && (
              <p>
                <span className="font-semibold text-slate-800">Note:</span> {invoice.notes}
              </p>
            )}
          </div>
        )}

        {/* --------------------------------------------------------- footer */}
        <div className="mt-6 flex flex-col items-center gap-1 text-center">
          <p
            className="text-3xl font-bold italic text-slate-900"
            style={{ fontFamily: 'Georgia, cursive' }}
          >
            Thank You!
          </p>
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
            <span className="h-0.5 w-6 bg-red-600 print-keep-color" /> Visit Again
            <span className="h-0.5 w-6 bg-red-600 print-keep-color" />
          </p>
        </div>
      </div>
    </div>
  );
}

function Corner({ className }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute h-16 w-16 print-keep-color ${className ?? ''}`}
      viewBox="0 0 100 100"
      aria-hidden
    >
      <polygon points="0,0 100,0 0,100" fill="#0f172a" />
      <polygon points="0,0 62,0 0,62" fill="#dc2626" />
    </svg>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-sm font-semibold text-slate-700">{label} :</span>
      <span className={`min-w-0 flex-1 border-b border-dotted border-slate-400 text-sm ${mono ? 'font-mono font-semibold' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
