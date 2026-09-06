'use client';

import { formatCurrency, formatDate, prettyVehicleNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaymentStatusBadge } from '@/components/shared/status-badge';
import type { InvoiceView } from '@/lib/invoice-data';

const KIND_LABELS: Record<string, string> = {
  PART: 'Part',
  LABOUR: 'Labour',
  SERVICE: 'Service',
};

/**
 * The on-screen invoice. Deliberately laid out like the PDF so the printed
 * page, the downloaded PDF and this view all match.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceView }) {
  const currency = invoice.garage.currency;
  const money = (value: number) => formatCurrency(value, currency);

  return (
    <div className="print-area overflow-hidden rounded-lg border bg-white text-slate-900 shadow-sm">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          {invoice.garage.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invoice.garage.logoUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded object-contain"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{invoice.garage.name}</h2>
            {invoice.garage.address && (
              <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">
                {invoice.garage.address}
              </p>
            )}
            <p className="mt-0.5 text-xs text-slate-500">
              {[
                invoice.garage.phone && `Phone: ${invoice.garage.phone}`,
                invoice.garage.email,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
            {invoice.garage.gstNumber && (
              <p className="text-xs text-slate-500">GSTIN: {invoice.garage.gstNumber}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-base font-bold uppercase tracking-wide text-primary">Tax Invoice</p>
          <p className="mt-1 font-mono text-sm font-semibold">{invoice.invoiceNumber}</p>
          <p className="text-xs text-slate-500">Date: {formatDate(invoice.createdAt)}</p>
          <p className="text-xs text-slate-500">Job card: {invoice.jobCard.jobCardNumber}</p>
          <div className="mt-2 flex sm:justify-end print-keep-color">
            <PaymentStatusBadge status={invoice.paymentStatus} />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- bill to/vehicle */}
      <div className="grid gap-5 border-b p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-1.5 font-semibold">{invoice.customer.name}</p>
          <p className="text-sm text-slate-600">Mobile: {invoice.customer.mobileNumber}</p>
          {invoice.customer.address && (
            <p className="whitespace-pre-line text-sm text-slate-600">{invoice.customer.address}</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vehicle</p>
          <p className="mt-1.5 font-mono font-semibold">
            {prettyVehicleNumber(invoice.vehicle.vehicleNumber)}
          </p>
          <p className="text-sm text-slate-600">
            {[invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' ') ||
              (invoice.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike')}
          </p>
          <p className="text-sm text-slate-600">
            Type: {invoice.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike'}
            {invoice.vehicle.odometer
              ? ` · Odometer: ${invoice.vehicle.odometer.toLocaleString()} km`
              : ''}
          </p>
        </div>
      </div>

      {/* -------------------------------------------------------- line items */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-16 text-right">Qty</TableHead>
            <TableHead className="w-28 text-right">Rate</TableHead>
            <TableHead className="w-32 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.items.map((item, index) => (
            <TableRow key={item.id}>
              <TableCell className="text-slate-500">{index + 1}</TableCell>
              <TableCell className="font-medium">{item.description}</TableCell>
              <TableCell className="text-xs text-slate-500">{KIND_LABELS[item.kind]}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{money(item.unitPrice)}</TableCell>
              <TableCell className="text-right font-semibold">{money(item.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ------------------------------------------------------------ totals */}
      <div className="flex justify-end border-t p-5 sm:p-6">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="font-medium">{money(invoice.subtotal)}</dd>
          </div>
          {invoice.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Discount</dt>
              <dd className="font-medium text-emerald-700">- {money(invoice.discount)}</dd>
            </div>
          )}
          {(invoice.taxRate > 0 || invoice.tax > 0) && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax / GST ({invoice.taxRate}%)</dt>
              <dd className="font-medium">{money(invoice.tax)}</dd>
            </div>
          )}
          <div className="flex justify-between rounded-md bg-slate-100 px-3 py-2.5 text-base font-bold print-keep-color">
            <dt>Grand total</dt>
            <dd>{money(invoice.totalAmount)}</dd>
          </div>
          {invoice.paymentStatus === 'PAID' && invoice.paidAt && (
            <p className="text-right text-xs font-medium text-emerald-700">
              Paid on {formatDate(invoice.paidAt)}
              {invoice.paymentMethod ? ` (${invoice.paymentMethod})` : ''}
            </p>
          )}
        </dl>
      </div>

      {/* --------------------------------------------------------- job notes */}
      {(invoice.jobCard.complaint || invoice.jobCard.workPerformed || invoice.notes) && (
        <div className="space-y-3 border-t p-5 text-sm sm:p-6">
          {invoice.jobCard.complaint && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Customer complaint
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-700">
                {invoice.jobCard.complaint}
              </p>
            </div>
          )}
          {invoice.jobCard.workPerformed && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Work performed
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-700">
                {invoice.jobCard.workPerformed}
              </p>
            </div>
          )}
          {invoice.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{invoice.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- footer */}
      <div className="border-t bg-slate-50 p-5 text-center text-xs text-slate-500 sm:p-6 print-keep-color">
        <p className="whitespace-pre-line">{invoice.garage.invoiceTerms}</p>
        <p className="mt-2 font-medium text-slate-600">
          This is a computer-generated invoice from {invoice.garage.name}.
        </p>
      </div>
    </div>
  );
}
