'use client';

import * as React from 'react';
import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';

import { formatCurrency, round2 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/ui/misc';
import type { InvoiceItemKind } from '@/types';

/**
 * Shared line-item editor used by both invoice create and edit forms.
 *
 * Items are bifurcated by kind. Spare parts use Qty x Rate; labour and service
 * use a single Amount field (quantity fixed to 1) so there is no qty confusion
 * and every line always adds into the total correctly.
 */
export function InvoiceItemsField({
  control,
  register,
  watch,
  setValue,
  errors,
  currency,
}: {
  // Loosely typed (any) so the same editor works with the create and edit form
  // schemas - react-hook-form's Control generic is invariant, which makes a
  // shared, schema-agnostic field component awkward to type precisely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
  currency: string;
}) {
  const items = useFieldArray({ control, name: 'items' });
  const watched: Array<{ kind?: InvoiceItemKind; quantity?: unknown; unitPrice?: unknown }> =
    watch('items') ?? [];

  const itemErrors = (errors?.items ?? []) as Array<
    { description?: { message?: string } } | undefined
  >;

  const append = (kind: InvoiceItemKind) =>
    items.append({ kind, description: '', quantity: 1, unitPrice: 0 });

  return (
    <div className="space-y-2">
      {items.fields.length === 0 && (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Add spare parts and labour below - each line adds into the total.
        </p>
      )}

      {items.fields.map((field, index) => {
        const kind = (watched[index]?.kind as InvoiceItemKind) ?? 'PART';
        const isPart = kind === 'PART';
        const qty = num(watched[index]?.quantity);
        const price = num(watched[index]?.unitPrice);
        const lineTotal = round2((isPart ? qty : 1) * price);

        return (
          <div
            key={field.id}
            className="grid grid-cols-12 items-start gap-2 rounded-md border p-2 sm:border-0 sm:p-0"
          >
            {/* description */}
            <div className="col-span-12 sm:col-span-5">
              <Input
                placeholder={
                  kind === 'LABOUR'
                    ? 'Labour (e.g. Engine overhaul)'
                    : kind === 'SERVICE'
                      ? 'Service (e.g. Car wash)'
                      : 'Spare part (e.g. Engine oil)'
                }
                aria-label="Description"
                invalid={!!itemErrors[index]?.description}
                {...register(`items.${index}.description` as const)}
              />
              <FieldError message={itemErrors[index]?.description?.message} />
            </div>

            {/* kind selector as small buttons */}
            <div className="col-span-6 sm:col-span-3">
              <div className="flex rounded-md border p-0.5">
                {(['PART', 'LABOUR', 'SERVICE'] as InvoiceItemKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setValue(`items.${index}.kind`, k);
                      // Labour/service are single-amount, so pin quantity to 1.
                      if (k !== 'PART') setValue(`items.${index}.quantity`, 1);
                    }}
                    className={`flex-1 rounded px-1 py-1 text-[11px] font-semibold transition-colors ${
                      kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {k === 'PART' ? 'Part' : k === 'LABOUR' ? 'Labour' : 'Service'}
                  </button>
                ))}
              </div>
            </div>

            {/* qty (parts only) */}
            {isPart ? (
              <>
                <div className="col-span-3 sm:col-span-1">
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label="Quantity"
                    {...register(`items.${index}.quantity` as const)}
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="Rate"
                    aria-label="Unit price"
                    {...register(`items.${index}.unitPrice` as const)}
                  />
                </div>
              </>
            ) : (
              <div className="col-span-6 sm:col-span-2">
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="Amount"
                  aria-label="Amount"
                  {...register(`items.${index}.unitPrice` as const)}
                />
                {/* keep quantity in the form data at 1 for non-part rows */}
                <input type="hidden" {...register(`items.${index}.quantity` as const)} />
              </div>
            )}

            {/* line total */}
            <div className="col-span-9 flex h-10 items-center justify-end pr-1 text-sm font-semibold sm:col-span-2">
              {formatCurrency(lineTotal, currency)}
            </div>

            {/* remove */}
            <div className="col-span-3 flex justify-end sm:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line item"
                onClick={() => items.remove(index)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>
        );
      })}

      {typeof (errors?.items as { message?: string } | undefined)?.message === 'string' && (
        <FieldError message={(errors?.items as { message?: string }).message} />
      )}

      {/* quick-add pre-tagged rows so parts and labour stay bifurcated */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => append('PART')}>
          <Plus /> Spare part
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => append('LABOUR')}>
          <Plus /> Labour
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => append('SERVICE')}>
          <Plus /> Service
        </Button>
      </div>
    </div>
  );
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
