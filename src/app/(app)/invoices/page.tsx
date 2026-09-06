import { Suspense } from 'react';

import { InvoicesView } from '@/components/invoices/invoices-view';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Invoices' };

export default function InvoicesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <InvoicesView />
    </Suspense>
  );
}
