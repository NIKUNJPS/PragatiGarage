'use client';

import * as React from 'react';

import {
  PAYMENT_METHODS,
  discountLabel,
  evaluateInvoice,
  type DiscountType,
  type FieldErrors,
  type InvoiceItemKind,
  type InvoiceTotals,
} from '@/lib/billing';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldHint } from '@/components/ui/misc';

type AnyForm = {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
};

/**
 * Live bill preview from the form values, using the exact calculator the server
 * runs. `errors` holds the cross-field problems zod cannot see (e.g. a discount
 * larger than the bill).
 */
export function useBillingPreview(
  watch: AnyForm['watch'],
  payments?: Array<{ amount: number; isVoided?: boolean }>,
): { totals: InvoiceTotals; errors: FieldErrors } {
  const items: Array<{ kind?: InvoiceItemKind; quantity?: unknown; unitPrice?: unknown }> = watch('items') ?? [];
  const taxRate = watch('taxRate');
  const discountType: DiscountType = watch('discountType') ?? 'NONE';
  const discountValue = watch('discountValue');

  return evaluateInvoice({
    items: items.map((i) => ({
      kind: i?.kind,
      quantity: blankToZero(i?.quantity),
      unitPrice: blankToZero(i?.unitPrice),
    })),
    taxRate: blankToZero(taxRate),
    discountType,
    discountValue: blankToZero(discountValue),
    payments,
  });
}

function blankToZero(value: unknown): string | number {
  if (value === undefined || value === null || value === '') return 0;
  return value as string | number;
}

/**
 * Pushes the calculator's field errors into react-hook-form. Returns true when the
 * form must not be submitted.
 */
export function applyBillingErrors(
  errors: FieldErrors,
  setError: (field: any, err: { type: string; message: string }) => void,
): boolean {
  const entries = Object.entries(errors).filter(([field]) => !field.startsWith('payments.'));
  for (const [field, messages] of entries) setError(field, { type: 'billing', message: messages[0] });
  return entries.length > 0;
}

const DISCOUNT_OPTIONS: Array<{ value: DiscountType; label: string }> = [
  { value: 'NONE', label: 'No discount' },
  { value: 'PERCENT', label: 'Percentage (%)' },
  { value: 'FIXED', label: 'Fixed amount' },
];

export function DiscountTaxFields({
  register,
  watch,
  setValue,
  errors,
  currency,
  previewErrors,
}: AnyForm & { currency: string; previewErrors: FieldErrors }) {
  const discountType: DiscountType = watch('discountType') ?? 'NONE';
  const discountError = errors?.discountValue?.message ?? previewErrors.discountValue?.[0];

  return (
    <div className="space-y-4">
      <div>
        <Label>Discount</Label>
        <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Discount type">
          {DISCOUNT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={discountType === option.value}
              onClick={() => {
                setValue('discountType', option.value, { shouldValidate: false });
                if (option.value === 'NONE') setValue('discountValue', 0);
              }}
              className={cn(
                'h-10 rounded-md border px-2 text-xs font-medium transition-colors sm:text-sm',
                discountType === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input bg-background hover:bg-accent',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {discountType !== 'NONE' && (
          <div className="mt-2">
            <Label htmlFor="discountValue" className="sr-only">
              Discount value
            </Label>
            <div className="relative">
              <Input
                id="discountValue"
                type="number"
                step="0.01"
                min="0"
                max={discountType === 'PERCENT' ? 100 : undefined}
                inputMode="decimal"
                placeholder={discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 1000'}
                className="pr-12"
                invalid={!!discountError}
                {...register('discountValue')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {discountType === 'PERCENT' ? '%' : currency}
              </span>
            </div>
            <FieldError message={discountError} />
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="taxRate">Tax / GST rate (%)</Label>
        <Input
          id="taxRate"
          type="number"
          step="0.01"
          min="0"
          max="100"
          inputMode="decimal"
          className="mt-1.5"
          invalid={!!(errors?.taxRate || previewErrors.taxRate)}
          {...register('taxRate')}
        />
        <FieldError message={errors?.taxRate?.message ?? previewErrors.taxRate?.[0]} />
        <FieldHint>Set to 0 if you do not charge GST. Tax is charged after the discount.</FieldHint>
      </div>
    </div>
  );
}

export function BillSummary({
  totals,
  currency,
  showPayments = false,
  title = 'Summary',
}: {
  totals: InvoiceTotals;
  currency: string;
  showPayments?: boolean;
  title?: string;
}) {
  const money = (v: number) => formatCurrency(v, currency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <SummaryRow label="Subtotal (gross)" value={money(totals.subtotal)} />
          {totals.discountAmount > 0 && (
            <SummaryRow
              label={discountLabel(totals.discountType, totals.discountValue)}
              value={`- ${money(totals.discountAmount)}`}
            />
          )}
          {totals.tax > 0 && <SummaryRow label={`Tax / GST (${totals.taxRate}%)`} value={money(totals.tax)} />}
          <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
            <dt>Total payable</dt>
            <dd data-testid="total-payable">{money(totals.totalAmount)}</dd>
          </div>
          {showPayments && (
            <>
              <SummaryRow label="Amount paid" value={money(totals.amountPaid)} />
              <div className="flex items-center justify-between font-semibold">
                <dt>Balance due</dt>
                <dd className={totals.balanceDue > 0 ? 'text-destructive' : 'text-emerald-700'}>
                  {money(totals.balanceDue)}
                </dd>
              </div>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function MethodChips({ value, onChange }: { value?: string; onChange: (method: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payment method">
      {PAYMENT_METHODS.map((method) => (
        <button
          key={method}
          type="button"
          role="radio"
          aria-checked={value === method}
          onClick={() => onChange(method)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            value === method ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          {method}
        </button>
      ))}
    </div>
  );
}

/** Payment taken while creating the invoice: none, the full payable amount, or a part. */
export function InitialPaymentFields({
  register,
  watch,
  setValue,
  errors,
  totals,
  currency,
}: AnyForm & { totals: InvoiceTotals; currency: string }) {
  const status: 'UNPAID' | 'PARTIAL' | 'PAID' = watch('paymentStatus') ?? 'UNPAID';
  const method: string | undefined = watch('paymentMethod') || undefined;
  const partAmount = Number(watch('paymentAmount') || 0);
  const options = [
    { value: 'UNPAID', label: 'Unpaid' },
    { value: 'PAID', label: 'Paid in full' },
    { value: 'PARTIAL', label: 'Part payment' },
  ] as const;

  return (
    <div className="space-y-3">
      <div>
        <Label>Payment received now</Label>
        <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment status">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={status === option.value}
              onClick={() => {
                setValue('paymentStatus', option.value);
                if (option.value !== 'UNPAID' && !method) setValue('paymentMethod', 'Cash');
              }}
              className={cn(
                'h-10 rounded-md border px-1 text-xs font-medium transition-colors sm:text-sm',
                status === option.value
                  ? option.value === 'PAID'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : option.value === 'PARTIAL'
                      ? 'border-amber-500 bg-amber-50 text-amber-800'
                      : 'border-red-400 bg-red-50 text-red-800'
                  : 'border-input bg-background hover:bg-accent',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'PAID' && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Records {formatCurrency(totals.totalAmount, currency)} received - the final payable amount
          {totals.discountAmount > 0 ? ' after discount' : ''}.
        </p>
      )}

      {status === 'PARTIAL' && (
        <div>
          <Label htmlFor="paymentAmount" required>
            Amount received ({currency})
          </Label>
          <Input
            id="paymentAmount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="mt-1.5"
            invalid={!!errors?.paymentAmount}
            {...register('paymentAmount')}
          />
          <FieldError message={errors?.paymentAmount?.message} />
          {partAmount > 0 && partAmount <= totals.totalAmount && (
            <FieldHint>
              Balance after this payment:{' '}
              {formatCurrency(Math.max(totals.totalAmount - partAmount, 0), currency)}
            </FieldHint>
          )}
        </div>
      )}

      {status !== 'UNPAID' && (
        <div className="space-y-2">
          <Label>Payment method</Label>
          <MethodChips value={method} onChange={(m) => setValue('paymentMethod', m, { shouldValidate: true })} />
          <FieldError message={errors?.paymentMethod?.message} />
          <Input placeholder="UPI / transaction reference (optional)" {...register('paymentReference')} />
        </div>
      )}
    </div>
  );
}

/** Cross-checks a part payment against the live total before submitting. */
export function initialPaymentError(
  values: { paymentStatus?: string; paymentAmount?: unknown },
  totals: InvoiceTotals,
  currency: string,
): string | null {
  if (values.paymentStatus !== 'PARTIAL') return null;
  const amount = Number(values.paymentAmount || 0);
  if (!(amount > 0)) return 'Enter the amount received.';
  if (amount > totals.totalAmount) {
    return `Amount received cannot be more than the total payable (${formatCurrency(totals.totalAmount, currency)}).`;
  }
  return null;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
