'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CalendarClock,
  Eye,
  MessageCircle,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InvoiceListItemDTO, ShareInvoiceResponse } from '@/types';

/**
 * Compact per-row actions for the invoice list: open, edit, share the invoice,
 * send a service or payment reminder, or delete - all over free WhatsApp where
 * relevant. Numbers come from the customer on the invoice.
 */
export function InvoiceRowActions({ invoice }: { invoice: InvoiceListItemDTO }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

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
        errorMessage(error, 'Add a mobile/WhatsApp number on this customer first.'),
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.del<{ message: string }>(`/api/invoices/${invoice.id}?mode=hard`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setDeleteOpen(false);
      toast.success('Invoice deleted', result.message);
    },
    onError: (error) => toast.error('Could not delete invoice', errorMessage(error)),
  });

  return (
    <>
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
          <DropdownMenuItem asChild>
            <Link href={`/invoices/${invoice.id}/edit`}>
              <Pencil /> Edit invoice
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => share.mutate('invoice')}>
            <MessageCircle /> Send invoice on WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => share.mutate('service')}>
            <CalendarClock /> Send service reminder
          </DropdownMenuItem>
          {invoice.paymentStatus === 'UNPAID' && (
            <DropdownMenuItem onClick={() => share.mutate('reminder')}>
              <BellRing /> Send payment reminder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete invoice
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {invoice.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the invoice and its job card. The customer and vehicle are
              kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
