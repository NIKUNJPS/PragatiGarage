'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, History, MessageCircle, Plus, Wallet } from 'lucide-react';

import { api, ApiClientError, errorMessage } from '@/lib/client-api';
import type { InvoicePayment, InvoiceView } from '@/lib/invoice-data';
import { decimalPlaces, fromPaise, isValidNumber, toPaise } from '@/lib/money';
import { buildPaymentConfirmationMessage } from '@/lib/payment-message';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';
import { PaymentStatusBadge } from '@/components/shared/status-badge';
import { MethodChips, newIdempotencyKey } from '@/components/invoices/billing-fields';
import type { PaymentConfirmationResponse } from '@/types';

type PaymentResult = { invoice: InvoiceView; paymentId: string; duplicate: boolean };

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Payment section of an invoice: what is payable, paid and due (all saved
 * figures), every payment on record, and the actions to record a payment, void
 * a mistaken one and send the customer a confirmation.
 */
export function PaymentPanel({
  invoice,
  recordOpen,
  onRecordOpenChange,
}: {
  invoice: InvoiceView;
  recordOpen: boolean;
  onRecordOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const currency = invoice.garage.currency;
  const money = (v: number) => formatCurrency(v, currency);

  const [confirmFor, setConfirmFor] = React.useState<string | null>(null);
  const [voidFor, setVoidFor] = React.useState<InvoicePayment | null>(null);
  const [showActivity, setShowActivity] = React.useState(false);

  const active = invoice.payments.filter((p) => !p.isVoided);
  const latest = active[0];

  const onInvoiceUpdated = (updated: InvoiceView) => {
    queryClient.setQueryData(['invoices', invoice.id], updated);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['job-cards'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };

  const confirmPayment = invoice.payments.find((p) => p.id === confirmFor) ?? null;

  return (
    <Card className="mb-4 no-print">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-muted-foreground" /> Payment
          <PaymentStatusBadge status={invoice.paymentStatus} />
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {latest && (
            <Button
              variant={invoice.paymentStatus === 'PAID' ? 'whatsapp' : 'outline'}
              onClick={() => setConfirmFor(latest.id)}
            >
              <MessageCircle /> Send payment confirmation
            </Button>
          )}
          {invoice.balanceDue > 0 && !invoice.isArchived && (
            <Button variant="success" onClick={() => onRecordOpenChange(true)}>
              <Plus /> Record payment
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Gross amount" value={money(invoice.subtotal)} />
          <Figure
            label={invoice.discountType === 'PERCENT' ? `Discount (${invoice.discountValue}%)` : 'Discount'}
            value={invoice.discount > 0 ? `- ${money(invoice.discount)}` : money(0)}
          />
          <Figure label="Total payable" value={money(invoice.totalAmount)} strong />
          <Figure label="Amount paid" value={money(invoice.amountPaid)} />
        </dl>

        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3',
            invoice.balanceDue > 0 ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
          )}
        >
          <span className="text-sm font-medium">Balance due</span>
          <span className="text-lg font-bold" data-testid="balance-due">
            {money(invoice.balanceDue)}
          </span>
        </div>

        {invoice.excessPaid > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {money(invoice.excessPaid)} more than the total payable has been received (the bill was reduced after
            payment). Refund or adjust it, or void the payment that was entered by mistake.
          </p>
        )}

        {invoice.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className={cn('min-w-0 flex-1', payment.isVoided && 'text-muted-foreground')}>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className={cn('font-semibold', payment.isVoided && 'line-through')}>
                      {money(payment.amount)}
                    </span>
                    <span>· {payment.method}</span>
                    {payment.reference && <span className="text-muted-foreground">· Ref {payment.reference}</span>}
                    {payment.isVoided && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase">Voided</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Received {formatDate(payment.paidAt)}
                    {payment.createdBy ? ` · recorded by ${payment.createdBy}` : ''}
                    {payment.notes ? ` · ${payment.notes}` : ''}
                  </p>
                  {payment.isVoided && payment.voidReason && (
                    <p className="text-xs">Void reason: {payment.voidReason}</p>
                  )}
                  {!payment.isVoided && payment.confirmationSentAt && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Confirmation sent {formatDateTime(payment.confirmationSentAt)}
                      {payment.confirmationCount > 1 ? ` (${payment.confirmationCount} times)` : ''}
                    </p>
                  )}
                </div>
                {!payment.isVoided && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setConfirmFor(payment.id)}>
                      <MessageCircle /> {payment.confirmationSentAt ? 'Confirmation' : 'Send confirmation'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setVoidFor(payment)}
                    >
                      <Ban /> Void
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {invoice.activity.length > 0 && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowActivity((v) => !v)}>
              <History /> {showActivity ? 'Hide' : 'Show'} billing history ({invoice.activity.length})
            </Button>
            {showActivity && (
              <ul className="mt-2 space-y-1.5 border-l pl-4 text-xs">
                {invoice.activity.map((entry) => (
                  <li key={entry.id}>
                    <span className="font-medium">{describeActivity(entry, money)}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatDateTime(entry.createdAt)}
                      {entry.user ? ` · ${entry.user}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      <RecordPaymentDialog
        invoice={invoice}
        open={recordOpen}
        onOpenChange={onRecordOpenChange}
        onRecorded={(result) => {
          onInvoiceUpdated(result.invoice);
          onRecordOpenChange(false);
          // Offer the confirmation straight away - it is the natural next step.
          setConfirmFor(result.paymentId);
        }}
      />

      {confirmPayment && (
        <ConfirmationDialog
          invoice={invoice}
          payment={confirmPayment}
          open={Boolean(confirmFor)}
          onOpenChange={(open) => !open && setConfirmFor(null)}
          onSent={(updated) => onInvoiceUpdated(updated)}
        />
      )}

      {voidFor && (
        <VoidPaymentDialog
          invoice={invoice}
          payment={voidFor}
          onClose={() => setVoidFor(null)}
          onVoided={(updated) => {
            onInvoiceUpdated(updated);
            setVoidFor(null);
          }}
        />
      )}
    </Card>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold', strong && 'text-base font-bold')}>{value}</dd>
    </div>
  );
}

function describeActivity(
  entry: InvoiceView['activity'][number],
  money: (v: number) => string,
): string {
  const next = (entry.newValue ?? {}) as Record<string, unknown>;
  const prev = (entry.oldValue ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => money(Number(v ?? 0));
  switch (entry.action) {
    case 'INVOICE_CREATED':
      return `Invoice created for ${n(next.totalAmount)}`;
    case 'INVOICE_UPDATED':
      return prev.totalAmount !== next.totalAmount
        ? `Invoice edited: total ${n(prev.totalAmount)} → ${n(next.totalAmount)}`
        : 'Invoice edited';
    case 'DISCOUNT_CHANGED':
      return `Discount changed: ${n(prev.discount)} → ${n(next.discount)}`;
    case 'PAYMENT_RECORDED':
      return `Payment of ${n(next.amount)} recorded (${String(next.method ?? '')})`;
    case 'PAYMENT_MIGRATED':
      return `Payment of ${n(next.amount)} carried over from the earlier PAID status`;
    case 'PAYMENT_VOIDED':
      return `Payment of ${n(prev.amount)} voided${next.voidReason ? `: ${String(next.voidReason)}` : ''}`;
    case 'PAYMENT_STATUS_CHANGED':
      return `Status ${String(prev.paymentStatus)} → ${String(next.paymentStatus)}`;
    case 'PAYMENT_CONFIRMATION_SENT':
      return `Payment confirmation sent${next.resend ? ' again' : ''} (${n(next.amount)})`;
    default:
      return entry.action;
  }
}

/* -------------------------------------------------------------------------- */

function RecordPaymentDialog({
  invoice,
  open,
  onOpenChange,
  onRecorded,
}: {
  invoice: InvoiceView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (result: PaymentResult) => void;
}) {
  const toast = useToast();
  const currency = invoice.garage.currency;
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState('Cash');
  const [paidOn, setPaidOn] = React.useState(todayInput());
  const [reference, setReference] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [key, setKey] = React.useState(newIdempotencyKey);

  React.useEffect(() => {
    if (!open) return;
    setAmount(String(invoice.balanceDue));
    setMethod('Cash');
    setPaidOn(todayInput());
    setReference('');
    setNotes('');
    setFieldErrors({});
    setKey(newIdempotencyKey()); // a fresh key per payment; retries of this one reuse it
  }, [open, invoice.balanceDue]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<PaymentResult>(`/api/invoices/${invoice.id}/payments`, {
        amount,
        method,
        paidAt: paidOn === todayInput() ? undefined : new Date(`${paidOn}T12:00:00`).toISOString(),
        reference,
        notes,
        idempotencyKey: key,
      }),
    onSuccess: (result) => {
      toast.success(
        result.duplicate ? 'Payment already recorded' : 'Payment recorded',
        `${invoice.invoiceNumber}: ${formatCurrency(result.invoice.amountPaid, currency)} paid, ${formatCurrency(
          result.invoice.balanceDue,
          currency,
        )} due.`,
      );
      onRecorded(result);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.fieldErrors) {
        setFieldErrors(Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k, v[0]])));
      }
      toast.error('Could not record payment', errorMessage(error));
    },
  });

  const trimmed = amount.trim();
  const valid = trimmed !== '' && isValidNumber(trimmed) && Number(trimmed) > 0;
  const localError = !valid
    ? 'Enter the amount received.'
    : decimalPlaces(trimmed) > 2
      ? 'Use at most 2 decimal places.'
      : toPaise(trimmed) > toPaise(invoice.balanceDue)
        ? `Only ${formatCurrency(invoice.balanceDue, currency)} is due on this invoice.`
        : null;
  const remaining = localError ? invoice.balanceDue : fromPaise(toPaise(invoice.balanceDue) - toPaise(trimmed));

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment · {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>
            Total payable {formatCurrency(invoice.totalAmount, currency)}
            {invoice.discount > 0 ? ` (after ${formatCurrency(invoice.discount, currency)} discount)` : ''} ·
            already paid {formatCurrency(invoice.amountPaid, currency)} ·{' '}
            <strong>{formatCurrency(invoice.balanceDue, currency)} due</strong>
          </DialogDescription>
        </DialogHeader>

        <form
          id="record-payment"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (localError || mutation.isPending) return;
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="payAmount" required>
              Amount received ({currency})
            </Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="payAmount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                invalid={Boolean(localError || fieldErrors.amount)}
              />
              <Button type="button" variant="outline" onClick={() => setAmount(String(invoice.balanceDue))}>
                Full balance
              </Button>
            </div>
            <FieldError message={fieldErrors.amount ?? (amount ? localError ?? undefined : undefined)} />
            {!localError && (
              <FieldHint>
                {remaining > 0
                  ? `${formatCurrency(remaining, currency)} will still be due (part payment).`
                  : 'This settles the invoice in full.'}
              </FieldHint>
            )}
          </div>

          <div className="space-y-1.5">
            <Label required>Payment method</Label>
            <MethodChips value={method} onChange={setMethod} />
            <FieldError message={fieldErrors.method} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="paidOn">Received on</Label>
              <Input
                id="paidOn"
                type="date"
                max={todayInput()}
                className="mt-1.5"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value || todayInput())}
              />
              <FieldError message={fieldErrors.paidAt} />
            </div>
            <div>
              <Label htmlFor="payRef">Reference</Label>
              <Input
                id="payRef"
                className="mt-1.5"
                placeholder="UPI / cheque no."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="payNotes">Notes</Label>
            <Textarea id="payNotes" rows={2} className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="record-payment"
            variant="success"
            loading={mutation.isPending}
            disabled={Boolean(localError)}
          >
            <CheckCircle2 /> Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function ConfirmationDialog({
  invoice,
  payment,
  open,
  onOpenChange,
  onSent,
}: {
  invoice: InvoiceView;
  payment: InvoicePayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (updated: InvoiceView) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const currency = invoice.garage.currency;
  const money = (v: number) => formatCurrency(v, currency);
  const [number, setNumber] = React.useState('');
  const hasNumber = Boolean(invoice.customer.whatsappNumber || invoice.customer.mobileNumber);
  const alreadySent = Boolean(payment.confirmationSentAt);

  const message = buildPaymentConfirmationMessage({
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    garageName: invoice.garage.name,
    currency,
    paymentAmount: payment.amount,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
    paymentCount: invoice.payments.filter((p) => !p.isVoided).length,
  });

  const send = useMutation({
    mutationFn: () =>
      api.post<PaymentConfirmationResponse>(
        `/api/invoices/${invoice.id}/payments/${payment.id}/confirmation`,
        { resend: alreadySent, whatsappNumber: hasNumber ? '' : number },
      ),
    onSuccess: async (result) => {
      const updated = await queryClient.fetchQuery({
        queryKey: ['invoices', invoice.id],
        queryFn: () => api.get<InvoiceView>(`/api/invoices/${invoice.id}`),
        staleTime: 0,
      });
      onSent(updated);
      onOpenChange(false);

      if (result.sentDirectly) {
        toast.success('Confirmation sent on WhatsApp', `Delivered to ${result.whatsappNumber}.`);
        return;
      }
      const opened = window.open(result.waLink, '_blank', 'noopener,noreferrer');
      if (opened) toast.success('Opening WhatsApp', 'The confirmation message is ready to send.');
      else window.location.href = result.waLink;
    },
    onError: (error) => toast.error('Could not send confirmation', errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !send.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment received</DialogTitle>
          <DialogDescription>Check the details before sending the customer a confirmation.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 text-sm">
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="font-medium">{invoice.customer.name}</dd>
          <dt className="text-muted-foreground">Invoice</dt>
          <dd className="font-medium">{invoice.invoiceNumber}</dd>
          <dt className="text-muted-foreground">Amount received</dt>
          <dd className="font-semibold">{money(payment.amount)}</dd>
          <dt className="text-muted-foreground">Total paid</dt>
          <dd className="font-medium">{money(invoice.amountPaid)}</dd>
          <dt className="text-muted-foreground">Balance</dt>
          <dd className={cn('font-semibold', invoice.balanceDue > 0 ? 'text-destructive' : 'text-emerald-700')}>
            {money(invoice.balanceDue)}
          </dd>
        </dl>

        <div>
          <Label>Message</Label>
          <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">
            {message}
          </pre>
        </div>

        {!hasNumber && (
          <div>
            <Label htmlFor="confirmNumber" required>
              WhatsApp number
            </Label>
            <Input
              id="confirmNumber"
              type="tel"
              className="mt-1.5"
              placeholder="9876543210"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <FieldHint>Saved to the customer for next time.</FieldHint>
          </div>
        )}

        {alreadySent && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Confirmation already sent on {formatDateTime(payment.confirmationSentAt)}
            {payment.confirmationCount > 1 ? ` (${payment.confirmationCount} times)` : ''}. Sending again will message the
            customer another time.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            {alreadySent ? 'Close' : 'Not now'}
          </Button>
          <Button
            variant="whatsapp"
            loading={send.isPending}
            disabled={!hasNumber && number.trim().length < 10}
            onClick={() => send.mutate()}
          >
            <MessageCircle /> {alreadySent ? 'Send again' : 'Send confirmation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function VoidPaymentDialog({
  invoice,
  payment,
  onClose,
  onVoided,
}: {
  invoice: InvoiceView;
  payment: InvoicePayment;
  onClose: () => void;
  onVoided: (updated: InvoiceView) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = React.useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ invoice: InvoiceView }>(`/api/invoices/${invoice.id}/payments/${payment.id}`, { reason }),
    onSuccess: ({ invoice: updated }) => {
      toast.success('Payment voided', `${updated.invoiceNumber} now has ${formatCurrency(updated.balanceDue, updated.garage.currency)} due.`);
      onVoided(updated);
    },
    onError: (error) => toast.error('Could not void payment', errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this payment?</DialogTitle>
          <DialogDescription>
            {formatCurrency(payment.amount, invoice.garage.currency)} by {payment.method} on {formatDate(payment.paidAt)}{' '}
            will stop counting as paid. The record is kept in the invoice history.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="voidReason" required>
            Reason
          </Label>
          <Input
            id="voidReason"
            className="mt-1.5"
            autoFocus
            placeholder="e.g. Entered twice by mistake"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={mutation.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => mutation.mutate()}
          >
            <Ban /> Void payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
