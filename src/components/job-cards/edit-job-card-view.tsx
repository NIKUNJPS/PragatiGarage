'use client';

import { useQuery } from '@tanstack/react-query';

import { api, errorMessage } from '@/lib/client-api';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { JobCardForm } from '@/components/job-cards/job-card-form';
import type { JobCardDetailDTO } from '@/types';

export function EditJobCardView({ jobCardId }: { jobCardId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['job-cards', jobCardId],
    queryFn: () => api.get<JobCardDetailDTO>(`/api/job-cards/${jobCardId}`),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load this job card"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        backHref={`/job-cards/${jobCardId}`}
        backLabel="Back to job card"
        title={`Edit ${data.jobCardNumber}`}
        description="Update the work done, parts and charges as the job progresses."
      />
      <JobCardForm jobCard={data} />
    </div>
  );
}
