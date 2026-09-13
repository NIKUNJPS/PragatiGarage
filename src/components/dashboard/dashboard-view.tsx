'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Bike,
  ClipboardList,
  HardHat,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';

import { api } from '@/lib/client-api';
import { cn, formatCurrency, formatDate, prettyVehicleNumber } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '@/components/ui/misc';
import { JobStatusBadge, PaymentStatusBadge } from '@/components/shared/status-badge';
import { CustomerDialog } from '@/components/customers/customer-dialog';
import { VehicleDialog } from '@/components/vehicles/vehicle-dialog';
import type { DashboardStats } from '@/types';

export function DashboardView() {
  const { user, garage } = useSession();
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [vehicleOpen, setVehicleOpen] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/api/dashboard'),
  });

  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here is what is happening at {garage.name} today.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCustomerOpen(true)}>
            <UserPlus /> Quick add customer
          </Button>
          <Button variant="outline" onClick={() => setVehicleOpen(true)}>
            <Plus /> Quick add vehicle
          </Button>
          <Button variant="outline" asChild>
            <Link href="/job-cards/new">
              <ClipboardList /> New job card
            </Link>
          </Button>
          <Button asChild>
            <Link href="/invoices/new">
              <Receipt /> New invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------------- stat cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              href="/customers"
              label="Total customers"
              value={data.totalCustomers.toLocaleString()}
              icon={Users}
              tone="blue"
            />
            <StatCard
              href="/vehicles"
              label="Total vehicles"
              value={data.totalVehicles.toLocaleString()}
              icon={Bike}
              tone="violet"
            />
            <StatCard
              href="/job-cards?status=ACTIVE"
              label="Active jobs"
              value={data.activeJobs.toLocaleString()}
              hint={`${data.pendingJobs} pending · ${data.inProgressJobs} in progress`}
              icon={Wrench}
              tone="amber"
            />
            <StatCard
              href="/invoices?paymentStatus=PAID&range=today"
              label="Spare parts revenue"
              value={formatCurrency(data.todayPartsRevenue, data.currency)}
              hint={`${formatCurrency(data.monthPartsRevenue, data.currency)} this month`}
              icon={Package}
              tone="sky"
            />
            <StatCard
              href="/invoices?paymentStatus=PAID&range=today"
              label="Labour revenue"
              value={formatCurrency(data.todayLabourRevenue, data.currency)}
              hint={`${formatCurrency(data.monthLabourRevenue, data.currency)} this month`}
              icon={HardHat}
              tone="rose"
            />
            <StatCard
              href="/invoices?paymentStatus=PAID&range=today"
              label="Total revenue"
              value={formatCurrency(data.todayRevenue, data.currency)}
              hint={`${formatCurrency(data.monthRevenue, data.currency)} this month`}
              icon={TrendingUp}
              tone="emerald"
            />
          </div>

          {data.unpaidCount > 0 && (
            <Link
              href="/invoices?paymentStatus=UNPAID"
              className="mt-3 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900 transition-colors hover:bg-red-100"
            >
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">
                  {data.unpaidCount} unpaid invoice{data.unpaidCount === 1 ? '' : 's'}
                </span>{' '}
                worth {formatCurrency(data.unpaidAmount, data.currency)} pending collection.
              </p>
              <span className="shrink-0 text-xs font-semibold underline underline-offset-2">
                View
              </span>
            </Link>
          )}
        </>
      ) : null}

      {/* --------------------------------------------------- recent job cards */}
      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent job cards</CardTitle>
          <Link
            href="/job-cards"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : !data?.recentJobCards.length ? (
            <EmptyState
              icon={ClipboardList}
              title="No job cards yet"
              description="Create your first job card when a vehicle comes in for service."
              action={
                <Button asChild>
                  <Link href="/job-cards/new">
                    <Plus /> Create job card
                  </Link>
                </Button>
              }
            />
          ) : (
            <>
              {/* Table on tablet and up */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job card</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentJobCards.map((job) => (
                      <TableRow key={job.id} className="table-row-link">
                        <TableCell>
                          <Link href={`/job-cards/${job.id}`} className="block">
                            <span className="font-medium">{job.jobCardNumber}</span>
                            <span className="block text-xs text-muted-foreground">
                              {formatDate(job.createdAt)}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/job-cards/${job.id}`} className="block">
                            <span className="font-mono text-xs font-semibold">
                              {prettyVehicleNumber(job.vehicle.vehicleNumber)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {[job.vehicle.brand, job.vehicle.model].filter(Boolean).join(' ') ||
                                (job.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike')}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/job-cards/${job.id}`} className="block">
                            <span className="text-sm">{job.customer.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {job.customer.mobileNumber}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <JobStatusBadge status={job.status} />
                            {job.invoice && <PaymentStatusBadge status={job.invoice.paymentStatus} />}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(job.total, data.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Card list on phones */}
              <ul className="divide-y sm:hidden">
                {data.recentJobCards.map((job) => (
                  <li key={job.id}>
                    <Link href={`/job-cards/${job.id}`} className="block px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{job.jobCardNumber}</p>
                          <p className="font-mono text-xs font-semibold text-muted-foreground">
                            {prettyVehicleNumber(job.vehicle.vehicleNumber)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {job.customer.name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">{formatCurrency(job.total, data.currency)}</p>
                          <div className="mt-1 flex justify-end">
                            <JobStatusBadge status={job.status} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <CustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} />
      <VehicleDialog open={vehicleOpen} onOpenChange={setVehicleOpen} />
    </div>
  );
}

const TONES = {
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  rose: 'bg-rose-50 text-rose-700',
  emerald: 'bg-emerald-50 text-emerald-700',
};

function StatCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
}) {
  return (
    <Link
      href={href}
      className="stat-card-hover rounded-lg border bg-card p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </Link>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
