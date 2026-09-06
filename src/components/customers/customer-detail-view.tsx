'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  ClipboardList,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Receipt,
} from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { formatCurrency, formatDate, prettyVehicleNumber, toWhatsAppNumber } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { JobStatusBadge, PaymentStatusBadge, VehicleTypeBadge } from '@/components/shared/status-badge';
import { CustomerDialog } from '@/components/customers/customer-dialog';
import { VehicleDialog } from '@/components/vehicles/vehicle-dialog';
import type { CustomerDetailDTO } from '@/types';

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const { garage } = useSession();
  const [editOpen, setEditOpen] = React.useState(false);
  const [vehicleOpen, setVehicleOpen] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customers', customerId],
    queryFn: () => api.get<CustomerDetailDTO>(`/api/customers/${customerId}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load this customer"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const whatsapp = toWhatsAppNumber(data.whatsappNumber || data.mobileNumber);

  return (
    <div>
      <PageHeader
        backHref="/customers"
        backLabel="All customers"
        title={
          <span className="flex items-center gap-2">
            {data.name}
            {data.isArchived && <Badge variant="muted">Archived</Badge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href={`tel:${data.mobileNumber}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Phone className="h-3.5 w-3.5" /> {data.mobileNumber}
            </a>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            {data.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {data.address}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button onClick={() => setVehicleOpen(true)}>
              <Plus /> Add vehicle
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Vehicles" value={String(data.vehicleCount)} />
        <SummaryTile label="Job cards" value={String(data.jobCardCount)} />
        <SummaryTile
          label="Lifetime billing"
          value={formatCurrency(data.totalBilled, garage.currency)}
        />
        <SummaryTile
          label="Outstanding"
          value={formatCurrency(data.outstanding, garage.currency)}
          tone={data.outstanding > 0 ? 'danger' : undefined}
        />
      </div>

      {data.notes && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{data.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* --------------------------------------------------------------- tabs */}
      <Tabs defaultValue="vehicles" className="mt-5">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="vehicles" className="flex-1 sm:flex-none">
            Vehicles ({data.vehicles.length})
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex-1 sm:flex-none">
            Job history ({data.jobCards.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1 sm:flex-none">
            Invoices ({data.invoices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <Card>
            <CardContent className="p-0">
              {data.vehicles.length === 0 ? (
                <EmptyState
                  icon={Bike}
                  title="No vehicles yet"
                  description="Register this customer's bike or car to start a job card."
                  action={
                    <Button onClick={() => setVehicleOpen(true)}>
                      <Plus /> Add vehicle
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {data.vehicles.map((vehicle) => (
                    <li key={vehicle.id}>
                      <Link
                        href={`/vehicles/${vehicle.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 font-mono text-sm font-semibold">
                            {prettyVehicleNumber(vehicle.vehicleNumber)}
                            <VehicleTypeBadge type={vehicle.vehicleType} />
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <p>
                            {vehicle.jobCardCount} service
                            {vehicle.jobCardCount === 1 ? '' : 's'}
                          </p>
                          {vehicle.lastServiceAt && <p>Last: {formatDate(vehicle.lastServiceAt)}</p>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="p-0">
              {data.jobCards.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No job cards yet"
                  description="Job cards raised for this customer will appear here."
                />
              ) : (
                <ul className="divide-y">
                  {data.jobCards.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/job-cards/${job.id}`}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{job.jobCardNumber}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {prettyVehicleNumber(job.vehicle.vehicleNumber)} ·{' '}
                            {formatDate(job.createdAt)}
                          </p>
                          {job.complaint && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {job.complaint}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">
                            {formatCurrency(job.total, garage.currency)}
                          </p>
                          <div className="mt-1 flex justify-end">
                            <JobStatusBadge status={job.status} />
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              {data.invoices.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No invoices yet"
                  description="Invoices generated for this customer will appear here."
                />
              ) : (
                <ul className="divide-y">
                  {data.invoices.map((invoice) => (
                    <li key={invoice.id}>
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(invoice.createdAt)} ·{' '}
                            {prettyVehicleNumber(invoice.vehicle.vehicleNumber)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">
                            {formatCurrency(invoice.totalAmount, garage.currency)}
                          </p>
                          <div className="mt-1 flex justify-end">
                            <PaymentStatusBadge status={invoice.paymentStatus} />
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={data} />
      <VehicleDialog open={vehicleOpen} onOpenChange={setVehicleOpen} presetCustomer={data} />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p
          className={
            tone === 'danger'
              ? 'truncate text-xl font-bold text-destructive'
              : 'truncate text-xl font-bold'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
