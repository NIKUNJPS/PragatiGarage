import { Suspense } from 'react';

import { JobCardsView } from '@/components/job-cards/job-cards-view';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'Job Cards' };

export default function JobCardsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <JobCardsView />
    </Suspense>
  );
}
