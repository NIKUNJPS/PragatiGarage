'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, qs } from '@/lib/client-api';
import { useDebounce } from '@/hooks/use-debounce';
import { EntityPicker, type PickerOption } from '@/components/shared/entity-picker';
import { CustomerDialog } from '@/components/customers/customer-dialog';
import type { CustomerDTO, Paginated } from '@/types';

/**
 * Customer selector with search and an inline "+ New customer" path, so staff
 * never have to abandon a half-filled form to create a missing customer.
 */
export function CustomerPicker({
  value,
  onChange,
  invalid,
  disabled,
  id,
  allowCreate = true,
}: {
  value: CustomerDTO | null;
  onChange: (customer: CustomerDTO | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  allowCreate?: boolean;
}) {
  const [term, setTerm] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [prefillName, setPrefillName] = React.useState('');
  const debounced = useDebounce(term, 250);

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'picker', debounced],
    queryFn: () =>
      api.get<Paginated<CustomerDTO>>(`/api/customers${qs({ q: debounced, pageSize: 15 })}`),
    staleTime: 15_000,
  });

  const options: PickerOption[] = (data?.data ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.mobileNumber,
    hint: c.vehicleCount ? `${c.vehicleCount} vehicle${c.vehicleCount === 1 ? '' : 's'}` : undefined,
  }));

  return (
    <>
      <EntityPicker
        id={id}
        value={value ? { id: value.id, label: value.name, sublabel: value.mobileNumber } : null}
        options={options}
        loading={isFetching}
        invalid={invalid}
        disabled={disabled}
        placeholder="Search customer by name or mobile"
        searchPlaceholder="Type a name or mobile number..."
        emptyText="No customer found. Add them below."
        onSearch={setTerm}
        onSelect={(option) => {
          const found = data?.data.find((c) => c.id === option.id);
          if (found) onChange(found);
        }}
        onCreateNew={
          allowCreate
            ? (searchTerm) => {
                // A number typed into the search box is a mobile, not a name.
                setPrefillName(/\d/.test(searchTerm) ? '' : searchTerm);
                setDialogOpen(true);
              }
            : undefined
        }
        createNewLabel="Add new customer"
      />

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultName={prefillName}
        onSaved={(saved) => onChange(saved)}
      />
    </>
  );
}
