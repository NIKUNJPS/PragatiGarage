import { InvoiceDetailView } from '@/components/invoices/invoice-detail-view';

export const metadata = { title: 'Invoice' };

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return <InvoiceDetailView invoiceId={params.id} />;
}
