import { Suspense } from 'react';

import { InvoiceDetailView } from '@/components/invoices/invoice-detail-view';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Invoice' };

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <InvoiceDetailView invoiceId={params.id} />
    </Suspense>
  );
}
