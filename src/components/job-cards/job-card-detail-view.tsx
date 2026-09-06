'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, Pencil, Printer, Receipt } from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { formatCurrency, formatDate, formatDateTime, prettyVehicleNumber } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, Separator, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { JobStatusBadge, PaymentStatusBadge } from '@/components/shared/status-badge';
import { StatusSelect } from '@/components/job-cards/status-select';
import type { JobCardDetailDTO } from '@/types';

export function JobCardDetailView({ jobCardId }: { jobCardId: string }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage, isAdmin } = useSession();
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['job-cards', jobCardId],
    queryFn: () => api.get<JobCardDetailDTO>(`/api/job-cards/${jobCardId}`),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.del<{ message: string }>(`/api/job-cards/${jobCardId}`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      toast.success('Archived', result.message);
      router.push('/job-cards');
    },
    onError: (err) => toast.error('Could not archive job card', errorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

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

  const currency = garage.currency;

  return (
    <div className="print-area">
      <PageHeader
        backHref="/job-cards"
        backLabel="All job cards"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.jobCardNumber}
            {data.isArchived && <Badge variant="muted">Archived</Badge>}
          </span>
        }
        description={
          <>
            Created {formatDateTime(data.createdAt)}
            {data.createdBy ? ` by ${data.createdBy}` : ''}
            {data.completedAt ? ` · Completed ${formatDate(data.completedAt)}` : ''}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/job-cards/${data.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            {data.invoice ? (
              <Button asChild>
                <Link href={`/invoices/${data.invoice.id}`}>
                  <Receipt /> View invoice
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/invoices/new?jobCardId=${data.id}`}>
                  <FileText /> Generate invoice
                </Link>
              </Button>
            )}
            {isAdmin && !data.invoice && !data.isArchived && (
              <Button variant="ghost" size="icon" aria-label="Archive job card" onClick={() => setArchiveOpen(true)}>
                <Archive className="text-destructive" />
              </Button>
            )}
          </>
        }
      />

      {/* ------------------------------------------------------ status strip */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 no-print">
        <span className="text-sm font-medium text-muted-foreground">Status</span>
        <StatusSelect jobCard={data} onChanged={() => void refetch()} />
        {data.invoice && (
          <Link
            href={`/invoices/${data.invoice.id}`}
            className="ml-auto flex items-center gap-2 text-sm"
          >
            <span className="text-muted-foreground">{data.invoice.invoiceNumber}</span>
            <PaymentStatusBadge status={data.invoice.paymentStatus} />
          </Link>
        )}
      </div>

      {/* Printed copy shows the status as a plain badge instead of a dropdown */}
      <div className="mb-4 hidden print:block">
        <JobStatusBadge status={data.status} />
      </div>

      {/* -------------------------------------------------- customer/vehicle */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link
              href={`/customers/${data.customer.id}`}
              className="text-base font-semibold hover:underline"
            >
              {data.customer.name}
            </Link>
            <p className="text-sm text-muted-foreground">{data.customer.mobileNumber}</p>
            {data.customerFull.address && (
              <p className="text-sm text-muted-foreground">{data.customerFull.address}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link
              href={`/vehicles/${data.vehicle.id}`}
              className="font-mono text-base font-semibold hover:underline"
            >
              {prettyVehicleNumber(data.vehicle.vehicleNumber)}
            </Link>
            <p className="text-sm text-muted-foreground">
              {[data.vehicle.brand, data.vehicle.model].filter(Boolean).join(' ') ||
                (data.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike')}
            </p>
            {data.odometer != null && (
              <p className="text-sm text-muted-foreground">
                Odometer: {data.odometer.toLocaleString()} km
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------- work details */}
      {(data.complaint || data.workPerformed) && (
        <Card className="mt-4">
          <CardContent className="space-y-4 p-5">
            {data.complaint && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer complaint
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.complaint}</p>
              </div>
            )}
            {data.complaint && data.workPerformed && <Separator />}
            {data.workPerformed && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Work performed
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{data.workPerformed}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------------- line items */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Charges</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-20 text-right">Qty</TableHead>
                <TableHead className="w-28 text-right">Rate</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.parts.length > 0 && (
                <SectionRow label="Parts used" total={data.partsTotal} currency={currency} />
              )}
              {data.parts.map((part) => (
                <TableRow key={part.id}>
                  <TableCell>{part.partName}</TableCell>
                  <TableCell className="text-right">{part.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(part.unitPrice, currency)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(part.total, currency)}
                  </TableCell>
                </TableRow>
              ))}

              {data.labourCharges.length > 0 && (
                <SectionRow label="Labour" total={data.labourTotal} currency={currency} />
              )}
              {data.labourCharges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell colSpan={3}>{charge.description}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(charge.amount, currency)}
                  </TableCell>
                </TableRow>
              ))}

              {data.serviceCharges.length > 0 && (
                <SectionRow label="Services" total={data.serviceTotal} currency={currency} />
              )}
              {data.serviceCharges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell colSpan={3}>{charge.description}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(charge.amount, currency)}
                  </TableCell>
                </TableRow>
              ))}

              {data.parts.length === 0 &&
                data.labourCharges.length === 0 &&
                data.serviceCharges.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No charges added yet.{' '}
                      <Link href={`/job-cards/${data.id}/edit`} className="text-primary hover:underline">
                        Add parts and labour
                      </Link>
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>

          <div className="flex justify-end border-t bg-muted/40 px-4 py-3">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <Line label="Parts" value={formatCurrency(data.partsTotal, currency)} />
              <Line label="Labour" value={formatCurrency(data.labourTotal, currency)} />
              <Line label="Service" value={formatCurrency(data.serviceTotal, currency)} />
              <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(data.total, currency)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 hidden text-center text-xs text-muted-foreground print:block">
        {garage.name} · {garage.phone} · Job card {data.jobCardNumber}
      </p>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this job card?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.jobCardNumber} will be hidden from the list but kept for your records. You can
              restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => archiveMutation.mutate()}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionRow({
  label,
  total,
  currency,
}: {
  label: string;
  total: number;
  currency: string;
}) {
  return (
    <TableRow className="bg-muted/40">
      <TableCell colSpan={3} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </TableCell>
      <TableCell className="py-2 text-right text-xs font-semibold text-muted-foreground">
        {formatCurrency(total, currency)}
      </TableCell>
    </TableRow>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
