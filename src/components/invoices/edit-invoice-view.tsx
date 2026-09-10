'use client';

import { useQuery } from '@tanstack/react-query';

import { api, errorMessage } from '@/lib/client-api';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { EditInvoiceForm } from '@/components/invoices/edit-invoice-form';
import type { InvoiceView } from '@/lib/invoice-data';

export function EditInvoiceView({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => api.get<InvoiceView>(`/api/invoices/${invoiceId}`),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (isError || !data) {
    return (
      <Card>
        <ErrorState
          title="Could not load this invoice"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        backHref={`/invoices/${invoiceId}`}
        backLabel="Back to invoice"
        title={`Edit ${data.invoiceNumber}`}
        description="Fix the line items, tax, discount or payment. Totals update as you go."
      />
      <EditInvoiceForm invoice={data} />
    </div>
  );
}
