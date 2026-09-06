import { getInvoiceViewByToken } from '@/lib/invoice-data';
import { renderInvoicePdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public PDF download for an invoice share link. The random token is the only
 * credential, matching the public invoice page.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const invoice = await getInvoiceViewByToken(params.token);
  if (!invoice) {
    return new Response('Invoice not found.', { status: 404 });
  }

  const pdf = await renderInvoicePdf(invoice);
  const inline = new URL(req.url).searchParams.get('inline') === 'true';

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${invoice.invoiceNumber}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
