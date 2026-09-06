'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';

import { api, errorMessage, qs } from '@/lib/client-api';
import { cn, formatCurrency, formatDate, prettyVehicleNumber } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { PaymentStatusBadge } from '@/components/shared/status-badge';
import { StatusSelect } from '@/components/job-cards/status-select';
import type { JobCardListItemDTO, Paginated } from '@/types';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export function JobCardsView() {
  const params = useSearchParams();
  const { garage } = useSession();

  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<StatusFilter>(
    (params.get('status') as StatusFilter) || 'ALL',
  );
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const debounced = useDebounce(term, 300);

  React.useEffect(() => setPage(1), [debounced, status, from, to]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['job-cards', 'list', debounced, page, status, from, to],
    queryFn: () =>
      api.get<Paginated<JobCardListItemDTO>>(
        `/api/job-cards${qs({ q: debounced, page, pageSize: 20, status, from, to })}`,
      ),
  });

  const jobCards = data?.data ?? [];
  const hasFilters = Boolean(debounced || from || to || status !== 'ALL');

  return (
    <div>
      <PageHeader
        title="Job Cards"
        description={data ? `${data.total} job card${data.total === 1 ? '' : 's'}` : 'Loading...'}
        actions={
          <Button asChild>
            <Link href="/job-cards/new">
              <Plus /> New job card
            </Link>
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <SearchInput
          value={term}
          onChange={setTerm}
          loading={isFetching && !isLoading}
          placeholder="Search job card number, vehicle number or customer..."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  status === filter.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 h-9 w-[140px]"
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 h-9 w-[140px]"
              />
            </div>
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : isError ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
          ) : jobCards.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={hasFilters ? 'No job cards match these filters' : 'No job cards yet'}
              description={
                hasFilters
                  ? 'Try clearing the search or date range.'
                  : 'Create a job card when a vehicle comes in - parts, labour and service charges all add up automatically.'
              }
              action={
                !hasFilters && (
                  <Button asChild>
                    <Link href="/job-cards/new">
                      <Plus /> Create your first job card
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job card</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="w-[168px]">Status</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobCards.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Link href={`/job-cards/${job.id}`} className="block hover:underline">
                            <span className="font-medium">{job.jobCardNumber}</span>
                            <span className="block text-xs text-muted-foreground">
                              {formatDate(job.createdAt)}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/vehicles/${job.vehicle.id}`}
                            className="block font-mono text-xs font-semibold hover:underline"
                          >
                            {prettyVehicleNumber(job.vehicle.vehicleNumber)}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {[job.vehicle.brand, job.vehicle.model].filter(Boolean).join(' ') ||
                              (job.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/customers/${job.customer.id}`}
                            className="text-sm hover:underline"
                          >
                            {job.customer.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {job.customer.mobileNumber}
                          </span>
                        </TableCell>
                        <TableCell>
                          {/* Status is changeable straight from the list. */}
                          <StatusSelect jobCard={job} />
                        </TableCell>
                        <TableCell>
                          {job.invoice ? (
                            <Link href={`/invoices/${job.invoice.id}`} className="block">
                              <span className="block text-xs hover:underline">
                                {job.invoice.invoiceNumber}
                              </span>
                              <PaymentStatusBadge status={job.invoice.paymentStatus} />
                            </Link>
                          ) : job.status === 'COMPLETED' ? (
                            <Link
                              href={`/invoices/new?jobCardId=${job.id}`}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Generate invoice
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(job.total, garage.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y lg:hidden">
                {jobCards.map((job) => (
                  <li key={job.id} className="px-4 py-3">
                    <Link href={`/job-cards/${job.id}`} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{job.jobCardNumber}</p>
                          <p className="font-mono text-xs font-semibold text-muted-foreground">
                            {prettyVehicleNumber(job.vehicle.vehicleNumber)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {job.customer.name} · {formatDate(job.createdAt)}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold">
                          {formatCurrency(job.total, garage.currency)}
                        </p>
                      </div>
                    </Link>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusSelect jobCard={job} />
                      {job.invoice ? (
                        <Link href={`/invoices/${job.invoice.id}`}>
                          <PaymentStatusBadge status={job.invoice.paymentStatus} />
                        </Link>
                      ) : job.status === 'COMPLETED' ? (
                        <Link
                          href={`/invoices/new?jobCardId=${job.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Generate invoice
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>

              {data && (
                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  total={data.total}
                  pageSize={data.pageSize}
                  onPageChange={setPage}
                  label="job cards"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
