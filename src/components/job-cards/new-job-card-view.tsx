'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/client-api';
import { useSession } from '@/hooks/use-session';
import { Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { JobCardForm } from '@/components/job-cards/job-card-form';
import type { VehicleDetailDTO } from '@/types';

export function NewJobCardView() {
  const { garage } = useSession();
  const vehicleId = useSearchParams().get('vehicleId');

  // Coming from a vehicle page pre-selects that vehicle.
  const { data: vehicle, isLoading } = useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: () => api.get<VehicleDetailDTO>(`/api/vehicles/${vehicleId}`),
    enabled: Boolean(vehicleId),
  });

  return (
    <div>
      <PageHeader
        backHref="/job-cards"
        backLabel="All job cards"
        title="New job card"
        description={
          <>
            This job card will be numbered{' '}
            <span className="font-mono font-semibold text-foreground">
              {garage.nextJobCardNumberPreview}
            </span>
          </>
        }
      />

      {vehicleId && isLoading ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        <JobCardForm presetVehicle={vehicle ?? null} />
      )}
    </div>
  );
}
