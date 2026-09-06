import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Download, Phone } from 'lucide-react';

import { getInvoiceViewByToken } from '@/lib/invoice-data';
import { formatCurrency, toWhatsAppNumber } from '@/lib/utils';
import { InvoiceDocument } from '@/components/invoices/invoice-document';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const invoice = await getInvoiceViewByToken(params.token);
  if (!invoice) return { title: 'Invoice not found' };
  return {
    title: `Invoice ${invoice.invoiceNumber} - ${invoice.garage.name}`,
    description: `Invoice for ${invoice.vehicle.vehicleNumber}, total ${formatCurrency(
      invoice.totalAmount,
      invoice.garage.currency,
    )}.`,
    robots: { index: false, follow: false },
  };
}

/**
 * Public, unguessable invoice link shared with customers over WhatsApp.
 * No sign-in required - the random token is the credential.
 */
export default async function PublicInvoicePage({ params }: { params: { token: string } }) {
  const invoice = await getInvoiceViewByToken(params.token);
  if (!invoice) notFound();

  const garageWhatsApp = toWhatsAppNumber(invoice.garage.whatsappNumber || invoice.garage.phone);

  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8">
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between no-print">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Hi {invoice.customer.name},</p>
            <p className="text-sm text-muted-foreground">
              Here is your invoice from {invoice.garage.name}.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={`/i/${invoice.publicToken}/pdf`}
              download={`${invoice.invoiceNumber}.pdf`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-4 w-4" /> Download PDF
            </a>
            {garageWhatsApp && (
              <a
                href={`https://wa.me/${garageWhatsApp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-4 text-sm font-medium transition-colors hover:bg-slate-50"
              >
                <Phone className="h-4 w-4" /> Contact garage
              </a>
            )}
          </div>
        </div>

        <InvoiceDocument invoice={invoice} />

        <p className="mt-4 text-center text-xs text-slate-500 no-print">
          This link is private to you. Please do not share it publicly.
        </p>
      </div>
    </div>
  );
}
