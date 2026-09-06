'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
  hint?: string;
}

/**
 * Searchable dropdown with an optional "add new" escape hatch, used to pick a
 * customer or a vehicle. Typing filters server-side via `onSearch`; the parent
 * owns the loading state and the option list.
 */
export function EntityPicker({
  value,
  options,
  loading,
  placeholder = 'Search and select...',
  emptyText = 'No matches found.',
  searchPlaceholder = 'Type to search...',
  onSelect,
  onSearch,
  onCreateNew,
  createNewLabel = 'Add new',
  invalid,
  disabled,
  id,
}: {
  value?: PickerOption | null;
  options: PickerOption[];
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  onSelect: (option: PickerOption) => void;
  onSearch: (term: string) => void;
  onCreateNew?: (term: string) => void;
  createNewLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState('');

  React.useEffect(() => {
    onSearch(term);
    // `onSearch` is expected to be stable enough; re-running on every render
    // would defeat the debounce the parent applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  React.useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-destructive focus-visible:ring-destructive',
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {value ? (
              <>
                <span className="font-medium">{value.label}</span>
                {value.sublabel && (
                  <span className="ml-2 text-xs text-muted-foreground">{value.sublabel}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-60 overflow-y-auto p-1">
          {options.length === 0 && !loading && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          )}

          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-accent"
            >
              <Check
                className={cn(
                  'h-4 w-4 shrink-0',
                  value?.id === option.id ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{option.label}</span>
                {option.sublabel && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.sublabel}
                  </span>
                )}
              </span>
              {option.hint && (
                <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>
              )}
            </button>
          ))}
        </div>

        {onCreateNew && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                onCreateNew(term);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              {term ? `${createNewLabel}: "${term}"` : createNewLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
