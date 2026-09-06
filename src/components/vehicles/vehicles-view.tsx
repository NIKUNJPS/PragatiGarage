'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Bike, ClipboardList, MoreVertical, Pencil, Plus } from 'lucide-react';

import { api, errorMessage, qs } from '@/lib/client-api';
import { cn, formatDate, prettyVehicleNumber } from '@/lib/utils';
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
import { VehicleTypeBadge } from '@/components/shared/status-badge';
import { VehicleDialog } from '@/components/vehicles/vehicle-dialog';
import type { Paginated, VehicleDTO } from '@/types';

const TYPE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'BIKE', label: 'Bikes' },
  { value: 'CAR', label: 'Cars' },
] as const;

export function VehiclesView() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useSession();

  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [vehicleType, setVehicleType] = React.useState<'ALL' | 'BIKE' | 'CAR'>('ALL');
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VehicleDTO | null>(null);

  const debounced = useDebounce(term, 300);

  React.useEffect(() => setPage(1), [debounced, vehicleType, showArchived]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['vehicles', 'list', debounced, page, vehicleType, showArchived],
    queryFn: () =>
      api.get<Paginated<VehicleDTO>>(
        `/api/vehicles${qs({
          q: debounced,
          page,
          pageSize: 20,
          vehicleType,
          includeArchived: showArchived,
        })}`,
      ),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      api.del<{ message: string }>(`/api/vehicles/${id}${restore ? '?restore=true' : ''}`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Done', result.message);
    },
    onError: (err) => toast.error('Could not update vehicle', errorMessage(err)),
  });

  const vehicles = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description={
          data ? `${data.total} vehicle${data.total === 1 ? '' : 's'} registered` : 'Loading...'
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add vehicle
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={term}
          onChange={setTerm}
          loading={isFetching && !isLoading}
          placeholder="Search by vehicle number, brand, model or owner..."
          className="flex-1"
        />

        <div className="flex gap-2">
          <div className="flex h-10 items-center rounded-md border bg-card p-1">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setVehicleType(filter.value)}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  vehicleType === filter.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Archived
          </label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : isError ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
          ) : vehicles.length === 0 ? (
            <EmptyState
              icon={Bike}
              title={debounced ? 'No vehicles match your search' : 'No vehicles yet'}
              description={
                debounced
                  ? 'Try a different vehicle number, brand or owner name.'
                  : 'Register the first bike or car that comes into your garage.'
              }
              action={
                !debounced && (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus /> Add your first vehicle
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
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Make &amp; model</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="text-center">Services</TableHead>
                      <TableHead>Last service</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((vehicle) => (
                      <TableRow key={vehicle.id} className="table-row-link">
                        <TableCell>
                          <Link href={`/vehicles/${vehicle.id}`} className="block">
                            <span className="flex items-center gap-2 font-mono text-sm font-semibold">
                              {prettyVehicleNumber(vehicle.vehicleNumber)}
                              <VehicleTypeBadge type={vehicle.vehicleType} />
                              {vehicle.isArchived && <Badge variant="muted">Archived</Badge>}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'}
                          {vehicle.year && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({vehicle.year})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/customers/${vehicle.customer.id}`}
                            className="text-sm hover:underline"
                          >
                            {vehicle.customer.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {vehicle.customer.mobileNumber}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{vehicle.jobCardCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {vehicle.lastServiceAt ? formatDate(vehicle.lastServiceAt) : 'Never'}
                        </TableCell>
                        <TableCell>
                          <RowMenu
                            vehicleId={vehicle.id}
                            isAdmin={isAdmin}
                            isArchived={vehicle.isArchived}
                            onEdit={() => {
                              setEditing(vehicle);
                              setDialogOpen(true);
                            }}
                            onArchive={() =>
                              archiveMutation.mutate({ id: vehicle.id, restore: vehicle.isArchived })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y md:hidden">
                {vehicles.map((vehicle) => (
                  <li key={vehicle.id} className="flex items-center gap-2 px-4 py-3">
                    <Link href={`/vehicles/${vehicle.id}`} className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-mono text-sm font-semibold">
                        {prettyVehicleNumber(vehicle.vehicleNumber)}
                        <VehicleTypeBadge type={vehicle.vehicleType} />
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {vehicle.customer.name} · {vehicle.jobCardCount} service
                        {vehicle.jobCardCount === 1 ? '' : 's'}
                      </p>
                    </Link>
                    <RowMenu
                      vehicleId={vehicle.id}
                      isAdmin={isAdmin}
                      isArchived={vehicle.isArchived}
                      onEdit={() => {
                        setEditing(vehicle);
                        setDialogOpen(true);
                      }}
                      onArchive={() =>
                        archiveMutation.mutate({ id: vehicle.id, restore: vehicle.isArchived })
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
                  label="vehicles"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <VehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} vehicle={editing} />
    </div>
  );
}

function RowMenu({
  vehicleId,
  isAdmin,
  isArchived,
  onEdit,
  onArchive,
}: {
  vehicleId: string;
  isAdmin: boolean;
  isArchived: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Vehicle actions">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/job-cards/new?vehicleId=${vehicleId}`}>
            <ClipboardList /> New job card
          </Link>
        </DropdownMenuItem>
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
                <Archive /> Archive / delete
              </>
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
