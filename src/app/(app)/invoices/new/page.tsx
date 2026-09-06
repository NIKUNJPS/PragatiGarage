import { Suspense } from 'react';

import { NewInvoiceView } from '@/components/invoices/new-invoice-view';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'New Invoice' };

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <NewInvoiceView />
    </Suspense>
  );
}
