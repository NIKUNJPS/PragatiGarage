import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        // Status colours are always paired with an icon + label so they never
        // rely on colour alone (colour-blind friendly).
        pending: 'border-amber-300 bg-amber-50 text-amber-800',
        progress: 'border-blue-300 bg-blue-50 text-blue-800',
        completed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
        paid: 'border-emerald-300 bg-emerald-50 text-emerald-800',
        unpaid: 'border-red-300 bg-red-50 text-red-700',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
