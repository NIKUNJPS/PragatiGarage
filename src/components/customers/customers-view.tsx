'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus, Users } from 'lucide-react';

import { api, errorMessage, qs } from '@/lib/client-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { CustomerDialog } from '@/components/customers/customer-dialog';
import type { CustomerDTO, Paginated } from '@/types';

export function CustomersView() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage, isAdmin } = useSession();

  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomerDTO | null>(null);

  const debounced = useDebounce(term, 300);

  React.useEffect(() => setPage(1), [debounced, showArchived]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['customers', 'list', debounced, page, showArchived],
    queryFn: () =>
      api.get<Paginated<CustomerDTO>>(
        `/api/customers${qs({ q: debounced, page, pageSize: 20, includeArchived: showArchived })}`,
      ),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      api.del<{ message: string }>(`/api/customers/${id}${restore ? '?restore=true' : ''}`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Done', result.message);
    },
    onError: (err) => toast.error('Could not update customer', errorMessage(err)),
  });

  const customers = data?.data ?? [];
  const isEmpty = !isLoading && customers.length === 0;

  return (
    <div>
      <PageHeader
        title="Customers"
        description={
          data ? `${data.total} customer${data.total === 1 ? '' : 's'} on record` : 'Loading...'
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add customer
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={term}
          onChange={setTerm}
          loading={isFetching && !isLoading}
          placeholder="Search by name or mobile number..."
          className="flex-1"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm sm:py-0 sm:h-10">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Show archived
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : isError ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
          ) : isEmpty ? (
            <EmptyState
              icon={Users}
              title={debounced ? 'No customers match your search' : 'No customers yet'}
              description={
                debounced
                  ? 'Try a different name or mobile number.'
                  : 'Add your first customer to start creating job cards and invoices.'
              }
              action={
                !debounced && (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus /> Add your first customer
                  </Button>
                )
              }
            />
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead className="text-center">Vehicles</TableHead>
                      <TableHead className="text-center">Jobs</TableHead>
                      <TableHead className="text-right">Lifetime billing</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id} className="table-row-link">
                        <TableCell>
                          <Link href={`/customers/${customer.id}`} className="block">
                            <span className="font-medium">{customer.name}</span>
                            {customer.isArchived && (
                              <Badge variant="muted" className="ml-2">
                                Archived
                              </Badge>
                            )}
                            <span className="block text-xs text-muted-foreground">
                              Added {formatDate(customer.createdAt)}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`tel:${customer.mobileNumber}`}
                            className="text-sm hover:underline"
                          >
                            {customer.mobileNumber}
                          </a>
                        </TableCell>
                        <TableCell className="text-center">{customer.vehicleCount}</TableCell>
                        <TableCell className="text-center">{customer.jobCardCount}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">
                            {formatCurrency(customer.totalBilled, garage.currency)}
                          </span>
                          {customer.outstanding > 0 && (
                            <span className="block text-xs font-medium text-destructive">
                              {formatCurrency(customer.outstanding, garage.currency)} due
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RowMenu
                            isAdmin={isAdmin}
                            isArchived={customer.isArchived}
                            onEdit={() => {
                              setEditing(customer);
                              setDialogOpen(true);
                            }}
                            onArchive={() =>
                              archiveMutation.mutate({
                                id: customer.id,
                                restore: customer.isArchived,
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile list */}
              <ul className="divide-y md:hidden">
                {customers.map((customer) => (
                  <li key={customer.id} className="flex items-center gap-2 px-4 py-3">
                    <Link href={`/customers/${customer.id}`} className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{customer.name}</span>
                        {customer.isArchived && <Badge variant="muted">Archived</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground">{customer.mobileNumber}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {customer.vehicleCount} vehicle{customer.vehicleCount === 1 ? '' : 's'} ·{' '}
                        {customer.jobCardCount} job{customer.jobCardCount === 1 ? '' : 's'} ·{' '}
                        {formatCurrency(customer.totalBilled, garage.currency)}
                      </p>
                    </Link>
                    <RowMenu
                      isAdmin={isAdmin}
                      isArchived={customer.isArchived}
                      onEdit={() => {
                        setEditing(customer);
                        setDialogOpen(true);
                      }}
                      onArchive={() =>
                        archiveMutation.mutate({ id: customer.id, restore: customer.isArchived })
                      }
                    />
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
                  label="customers"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CustomerDialog open={dialogOpen} onOpenChange={setDialogOpen} customer={editing} />
    </div>
  );
}

function RowMenu({
  isAdmin,
  isArchived,
  onEdit,
  onArchive,
}: {
  isAdmin: boolean;
  isArchived: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Customer actions">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> Edit details
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem destructive={!isArchived} onClick={onArchive}>
            {isArchived ? (
              <>
                <ArchiveRestore /> Restore
              </>
            ) : (
              <>
                <Archive /> Archive
              </>
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
