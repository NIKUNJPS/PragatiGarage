'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { api, qs } from '@/lib/client-api';
import { prettyVehicleNumber } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { EntityPicker, type PickerOption } from '@/components/shared/entity-picker';
import { VehicleDialog } from '@/components/vehicles/vehicle-dialog';
import type { Paginated, VehicleDTO } from '@/types';

/** Vehicle selector for the job-card form. Selecting one auto-fills the customer. */
export function VehiclePicker({
  value,
  onChange,
  invalid,
  disabled,
  id,
  allowCreate = true,
}: {
  value: VehicleDTO | null;
  onChange: (vehicle: VehicleDTO | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  allowCreate?: boolean;
}) {
  const [term, setTerm] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const debounced = useDebounce(term, 250);

  const { data, isFetching } = useQuery({
    queryKey: ['vehicles', 'picker', debounced],
    queryFn: () =>
      api.get<Paginated<VehicleDTO>>(`/api/vehicles${qs({ q: debounced, pageSize: 15 })}`),
    staleTime: 15_000,
  });

  const options: PickerOption[] = (data?.data ?? []).map((v) => ({
    id: v.id,
    label: prettyVehicleNumber(v.vehicleNumber),
    sublabel: [v.brand, v.model].filter(Boolean).join(' ') || (v.vehicleType === 'CAR' ? 'Car' : 'Bike'),
    hint: v.customer.name,
  }));

  return (
    <>
      <EntityPicker
        id={id}
        value={
          value
            ? {
                id: value.id,
                label: prettyVehicleNumber(value.vehicleNumber),
                sublabel: value.customer.name,
              }
            : null
        }
        options={options}
        loading={isFetching}
        invalid={invalid}
        disabled={disabled}
        placeholder="Search by vehicle number, brand or owner"
        searchPlaceholder="e.g. MH12AB1234 or Swift..."
        emptyText="No vehicle found. Register it below."
        onSearch={setTerm}
        onSelect={(option) => {
          const found = data?.data.find((v) => v.id === option.id);
          if (found) onChange(found);
        }}
        onCreateNew={allowCreate ? () => setDialogOpen(true) : undefined}
        createNewLabel="Register new vehicle"
      />

      <VehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={onChange} />
    </>
  );
}
