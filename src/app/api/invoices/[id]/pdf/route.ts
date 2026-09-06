import { prisma } from '@/lib/prisma';
import { ApiError, withAuth } from '@/lib/api';
import { getInvoiceViewById } from '@/lib/invoice-data';
import { renderInvoicePdf } from '@/lib/pdf';
import { uploadInvoicePdf } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth(async (req, { params }) => {
  const invoice = await getInvoiceViewById(params.id);
  if (!invoice) throw new ApiError(404, 'That invoice no longer exists.');

  const pdf = await renderInvoicePdf(invoice);

  // Opportunistically cache the PDF in object storage when it is configured, so
  // the WhatsApp link points at a permanent file rather than a live render.
  if (!invoice.pdfUrl) {
    try {
      const url = await uploadInvoicePdf(invoice.invoiceNumber, pdf);
      if (url) await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: url } });
    } catch (error) {
      console.warn('[invoice-pdf] storage upload skipped:', error);
    }
  }

  const inline = new URL(req.url).searchParams.get('inline') === 'true';

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${invoice.invoiceNumber}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});
