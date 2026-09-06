'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VehicleForm } from '@/components/vehicles/vehicle-form';
import type { CustomerDTO, VehicleDTO } from '@/types';

export function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
  presetCustomer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: VehicleDTO | null;
  presetCustomer?: CustomerDTO | null;
  onSaved?: (vehicle: VehicleDTO) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vehicle ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle>
          <DialogDescription>
            {vehicle
              ? 'Update this vehicle and who it belongs to.'
              : 'Register a bike or car and map it to its owner.'}
          </DialogDescription>
        </DialogHeader>

        <VehicleForm
          vehicle={vehicle}
          presetCustomer={presetCustomer}
          onCancel={() => onOpenChange(false)}
          onSuccess={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
