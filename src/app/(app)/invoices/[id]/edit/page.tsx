import { EditInvoiceView } from '@/components/invoices/edit-invoice-view';

export const metadata = { title: 'Edit Invoice' };

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  return <EditInvoiceView invoiceId={params.id} />;
}
