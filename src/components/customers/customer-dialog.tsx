'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CustomerForm } from '@/components/customers/customer-form';
import type { CustomerDTO } from '@/types';

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  defaultName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: CustomerDTO | null;
  defaultName?: string;
  onSaved?: (customer: CustomerDTO) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit customer' : 'Add customer'}</DialogTitle>
          <DialogDescription>
            {customer
              ? 'Update the contact details for this customer.'
              : 'Only a name and mobile number are required - everything else can wait.'}
          </DialogDescription>
        </DialogHeader>

        <CustomerForm
          customer={customer}
          defaultName={defaultName}
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
