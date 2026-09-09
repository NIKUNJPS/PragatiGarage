'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { BellRing, CalendarClock, MessageCircle } from 'lucide-react';

import { api, applyFieldErrors, errorMessage } from '@/lib/client-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import type { ShareInvoiceResponse } from '@/types';

/** Minimal invoice shape needed to share - works with a full invoice or a list row. */
export interface ShareableInvoice {
  id: string;
  invoiceNumber: string;
  customer: { name: string; whatsappNumber: string | null; mobileNumber: string };
}

type ShareMode = 'invoice' | 'reminder' | 'service';

const MODES: Record<
  ShareMode,
  { label: string; noun: string; icon: React.ComponentType<{ className?: string }> }
> = {
  invoice: { label: 'Share on WhatsApp', noun: 'invoice', icon: MessageCircle },
  reminder: { label: 'Send payment reminder', noun: 'payment reminder', icon: BellRing },
  service: { label: 'Service reminder', noun: 'service reminder', icon: CalendarClock },
};

/**
 * True one-click WhatsApp sharing.
 *
 * A single press asks the server to make sure the PDF exists at a stable public
 * URL and to build the message, then opens WhatsApp (app or web, whichever the
 * device handles the wa.me link with) already addressed to the customer with
 * the text filled in. Nothing is copied and pasted by hand.
 *
 * The one case that needs input is a customer with no number saved - then a
 * small prompt appears instead of the action silently failing.
 */
export function WhatsAppShareButton({
  invoice,
  onUpdated,
  mode = 'invoice',
  variant = 'whatsapp',
  size,
  label,
}: {
  invoice: ShareableInvoice;
  onUpdated?: () => void;
  /** 'invoice' sends the bill; 'reminder' a payment nudge; 'service' a next-service reminder. All free. */
  mode?: ShareMode;
  variant?: 'whatsapp' | 'outline' | 'ghost';
  size?: 'sm' | 'default';
  label?: string;
}) {
  const toast = useToast();
  const [promptOpen, setPromptOpen] = React.useState(false);
  const [numberInput, setNumberInput] = React.useState('');
  const [numberError, setNumberError] = React.useState<string | undefined>();

  const cfg = MODES[mode];
  const Icon = cfg.icon;
  const noun = cfg.noun;
  const hasNumber = Boolean(invoice.customer.whatsappNumber || invoice.customer.mobileNumber);

  const share = useMutation({
    mutationFn: (whatsappNumber?: string) =>
      api.post<ShareInvoiceResponse>(`/api/invoices/${invoice.id}/share`, {
        whatsappNumber: whatsappNumber ?? '',
        saveToCustomer: true,
        kind: mode,
      }),
    onSuccess: (result) => {
      setPromptOpen(false);
      onUpdated?.();

      if (result.sentDirectly) {
        toast.success(`${cap(noun)} sent on WhatsApp`, `Delivered to ${result.whatsappNumber}.`);
        return;
      }

      // Opening in a new tab keeps the app open behind WhatsApp.
      const opened = window.open(result.waLink, '_blank', 'noopener,noreferrer');
      if (opened) {
        toast.success('Opening WhatsApp', `The ${noun} message is already filled in.`);
      } else {
        // Pop-up blockers: navigate the current tab instead of losing the action.
        toast.warn('Opening WhatsApp in this tab', 'Allow pop-ups to keep the app open.');
        window.location.href = result.waLink;
      }
    },
    onError: (error) => {
      setNumberError(undefined);
      const handled = applyFieldErrors(error, (field, err) => {
        if (field === 'whatsappNumber') setNumberError(err.message);
      });
      if (!handled) {
        toast.error(`Could not send ${noun} on WhatsApp`, errorMessage(error));
      } else if (!promptOpen) {
        setPromptOpen(true);
      }
    },
  });

  return (
    <>
      <Button
        variant={variant}
        size={size}
        loading={share.isPending}
        onClick={() => {
          if (hasNumber) share.mutate(undefined);
          else setPromptOpen(true);
        }}
      >
        <Icon />
        {label ?? cfg.label}
      </Button>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WhatsApp number needed</DialogTitle>
            <DialogDescription>
              {invoice.customer.name} has no WhatsApp number saved. Enter one to send the {noun} for{' '}
              {invoice.invoiceNumber} - it will be saved to their profile for next time.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="waNumber" required>
              WhatsApp number
            </Label>
            <Input
              id="waNumber"
              type="tel"
              inputMode="tel"
              autoFocus
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              placeholder="9876543210"
              invalid={!!numberError}
              className="mt-1.5"
            />
            <FieldError message={numberError} />
            <FieldHint>A 10-digit number is fine; the country code is added for you.</FieldHint>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="whatsapp"
              loading={share.isPending}
              onClick={() => share.mutate(numberInput)}
            >
              <MessageCircle /> Send {noun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
