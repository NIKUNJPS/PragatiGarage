'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt } from 'lucide-react';

import { api, errorMessage, qs } from '@/lib/client-api';
import { cn, formatCurrency, formatDate, prettyVehicleNumber, startOfDay } from '@/lib/utils';
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
import { InvoiceRowActions } from '@/components/invoices/invoice-row-actions';
import type { InvoiceListItemDTO, Paginated } from '@/types';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All invoices' },
  { value: 'UNPAID', label: 'Pending payments' },
  { value: 'PAID', label: 'Paid' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

interface InvoiceListResponse extends Paginated<InvoiceListItemDTO> {
  summary: { paid: number; unpaid: number };
}

export function InvoicesView() {
  const params = useSearchParams();
  const { garage } = useSession();

  const today = React.useMemo(() => toInputDate(startOfDay()), []);

  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [paymentStatus, setPaymentStatus] = React.useState<StatusFilter>(
    (params.get('paymentStatus') as StatusFilter) || 'ALL',
  );
  const [from, setFrom] = React.useState(params.get('range') === 'today' ? today : '');
  const [to, setTo] = React.useState(params.get('range') === 'today' ? today : '');

  const debounced = useDebounce(term, 300);

  React.useEffect(() => setPage(1), [debounced, paymentStatus, from, to]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['invoices', 'list', debounced, page, paymentStatus, from, to],
    queryFn: () =>
      api.get<InvoiceListResponse>(
        `/api/invoices${qs({ q: debounced, page, pageSize: 20, paymentStatus, from, to })}`,
      ),
  });

  const invoices = data?.data ?? [];
  const hasFilters = Boolean(debounced || from || to || paymentStatus !== 'ALL');

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={data ? `${data.total} invoice${data.total === 1 ? '' : 's'}` : 'Loading...'}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/job-cards?status=COMPLETED">From job card</Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
          </>
        }
      />

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Collected (filtered)</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatCurrency(data.summary.paid, garage.currency)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Pending (filtered)</p>
              <p className="mt-1 text-xl font-bold text-destructive">
                {formatCurrency(data.summary.unpaid, garage.currency)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-4 space-y-3">
        <SearchInput
          value={term}
          onChange={setTerm}
          loading={isFetching && !isLoading}
          placeholder="Search invoice number, customer or vehicle..."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setPaymentStatus(filter.value)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  paymentStatus === filter.value
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
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
              description={
                hasFilters
                  ? 'Try clearing the search, status or date range.'
                  : 'Create your first invoice directly - pick a vehicle, add charges, done.'
              }
              action={
                !hasFilters && (
                  <Button asChild>
                    <Link href="/invoices/new">
                      <Plus /> New invoice
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id} className="table-row-link">
                        <TableCell>
                          <Link href={`/invoices/${invoice.id}`} className="block">
                            <span className="font-medium">{invoice.invoiceNumber}</span>
                            <span className="block text-xs text-muted-foreground">
                              {formatDate(invoice.createdAt)} · {invoice.jobCard.jobCardNumber}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/invoices/${invoice.id}`} className="block">
                            <span className="text-sm">{invoice.customer.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {invoice.customer.mobileNumber}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold">
                          {prettyVehicleNumber(invoice.vehicle.vehicleNumber)}
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={invoice.paymentStatus} />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(invoice.totalAmount, garage.currency)}
                        </TableCell>
                        <TableCell>
                          <InvoiceRowActions invoice={invoice} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y md:hidden">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center gap-1 pr-2">
                    <Link href={`/invoices/${invoice.id}`} className="block flex-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{invoice.invoiceNumber}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {invoice.customer.name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {prettyVehicleNumber(invoice.vehicle.vehicleNumber)} ·{' '}
                            {formatDate(invoice.createdAt)}
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
                      </div>
                    </Link>
                    <InvoiceRowActions invoice={invoice} />
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
                  label="invoices"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
