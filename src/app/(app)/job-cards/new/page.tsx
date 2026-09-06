import { Suspense } from 'react';

import { NewJobCardView } from '@/components/job-cards/new-job-card-view';
import { Skeleton } from '@/components/ui/misc';

export const metadata = { title: 'New Job Card' };

export default function NewJobCardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <NewJobCardView />
    </Suspense>
  );
}
