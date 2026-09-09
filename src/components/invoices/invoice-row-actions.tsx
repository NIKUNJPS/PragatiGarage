'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { BellRing, CalendarClock, Eye, MessageCircle, MoreVertical } from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InvoiceListItemDTO, ShareInvoiceResponse } from '@/types';

/**
 * Compact per-row actions for the invoice list: open, share the invoice, send a
 * service reminder, or (when unpaid) a payment reminder - all over free WhatsApp.
 * Numbers come from the customer on the invoice; if none is saved it says so.
 */
export function InvoiceRowActions({ invoice }: { invoice: InvoiceListItemDTO }) {
  const toast = useToast();

  const share = useMutation({
    mutationFn: (kind: 'invoice' | 'reminder' | 'service') =>
      api.post<ShareInvoiceResponse>(`/api/invoices/${invoice.id}/share`, {
        whatsappNumber: '',
        saveToCustomer: true,
        kind,
      }),
    onSuccess: (result) => {
      if (result.sentDirectly) {
        toast.success('Sent on WhatsApp', `Delivered to ${result.whatsappNumber}.`);
        return;
      }
      const opened = window.open(result.waLink, '_blank', 'noopener,noreferrer');
      if (opened) toast.success('Opening WhatsApp', 'The message is ready to send.');
      else window.location.href = result.waLink;
    },
    onError: (error) =>
      toast.error(
        'Could not open WhatsApp',
        // Most common cause: no number saved on the customer.
        errorMessage(error, 'Add a mobile/WhatsApp number on this customer first.'),
      ),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${invoice.invoiceNumber}`}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/invoices/${invoice.id}`}>
            <Eye /> View invoice
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => share.mutate('invoice')}>
          <MessageCircle /> Send invoice on WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => share.mutate('service')}>
          <CalendarClock /> Send service reminder
        </DropdownMenuItem>
        {invoice.paymentStatus === 'UNPAID' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => share.mutate('reminder')}>
              <BellRing /> Send payment reminder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
