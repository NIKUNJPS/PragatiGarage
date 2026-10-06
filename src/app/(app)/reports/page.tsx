import { Suspense } from 'react';

import { ReportsView } from '@/components/reports/reports-view';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Reports' };

export default function ReportsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <ReportsView />
    </Suspense>
  );
}
