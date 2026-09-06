'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings2, X } from 'lucide-react';
import * as React from 'react';

import { useSession } from '@/hooks/use-session';

/**
 * Nudges a brand-new garage to finish the setup wizard, without ever blocking
 * them from using the app.
 */
export function SetupBanner() {
  const { garage, isAdmin } = useSession();
  const pathname = usePathname();
  const [dismissed, setDismissed] = React.useState(false);

  if (
    garage.setupCompleted ||
    !isAdmin ||
    dismissed ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/settings')
  ) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900 sm:px-5">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <Settings2 className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Finish setting up your garage</span>
          <span className="hidden sm:inline">
            {' '}
            - add your business details, logo and invoice numbering so your invoices look right.
          </span>
        </p>
        <Link
          href="/setup"
          className="shrink-0 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-800"
        >
          Set up now
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
