'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Gauge, Pencil, Plus, User } from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { formatCurrency, formatDate, prettyVehicleNumber } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { JobStatusBadge, PaymentStatusBadge, VehicleTypeBadge } from '@/components/shared/status-badge';
import { VehicleDialog } from '@/components/vehicles/vehicle-dialog';
import type { VehicleDetailDTO } from '@/types';

export function VehicleDetailView({ vehicleId }: { vehicleId: string }) {
  const { garage } = useSession();
  const [editOpen, setEditOpen] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: () => api.get<VehicleDetailDTO>(`/api/vehicles/${vehicleId}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load this vehicle"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        backHref="/vehicles"
        backLabel="All vehicles"
        title={
          <span className="flex flex-wrap items-center gap-2 font-mono">
            {prettyVehicleNumber(data.vehicleNumber)}
            <VehicleTypeBadge type={data.vehicleType} />
            {data.isArchived && <Badge variant="muted">Archived</Badge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {[data.brand, data.model].filter(Boolean).join(' ') || 'Make and model not recorded'}
              {data.year ? ` · ${data.year}` : ''}
              {data.color ? ` · ${data.color}` : ''}
            </span>
            <Link
              href={`/customers/${data.customer.id}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <User className="h-3.5 w-3.5" /> {data.customer.name}
            </Link>
            {data.odometer != null && (
              <span className="inline-flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5" /> {data.odometer.toLocaleString()} km
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button asChild>
              <Link href={`/job-cards/new?vehicleId=${data.id}`}>
                <Plus /> New job card
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Total services" value={String(data.jobCardCount)} />
        <Tile
          label="Last service"
          value={data.lastServiceAt ? formatDate(data.lastServiceAt) : 'Never'}
        />
        <Tile label="Total billed" value={formatCurrency(data.totalBilled, garage.currency)} />
        <Tile label="Owner" value={data.customer.name} />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Service history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.jobCards.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No service history yet"
              description="Every job card raised for this vehicle will be listed here, so you can see past repairs at a glance."
              action={
                <Button asChild>
                  <Link href={`/job-cards/new?vehicleId=${data.id}`}>
                    <Plus /> Create first job card
                  </Link>
                </Button>
              }
            />
          ) : (
            <ol className="divide-y">
              {data.jobCards.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/job-cards/${job.id}`}
                    className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{job.jobCardNumber}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(job.createdAt)}
                        </span>
                      </p>
                      {job.complaint && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {job.complaint}
                        </p>
                      )}
                      {job.invoice && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Invoice {job.invoice.invoiceNumber}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <p className="font-semibold">{formatCurrency(job.total, garage.currency)}</p>
                      <JobStatusBadge status={job.status} />
                      {job.invoice && (
                        <div>
                          <PaymentStatusBadge status={job.invoice.paymentStatus} />
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <VehicleDialog open={editOpen} onOpenChange={setEditOpen} vehicle={data} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="truncate text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
