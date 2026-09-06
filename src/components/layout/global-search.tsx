'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bike, ClipboardList, Loader2, Receipt, Search, Users } from 'lucide-react';

import { api, qs } from '@/lib/client-api';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useSession } from '@/hooks/use-session';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { SearchResults } from '@/types';

export function GlobalSearch() {
  const router = useRouter();
  const { garage } = useSession();
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState('');
  const debounced = useDebounce(term, 250);

  // Ctrl/Cmd+K is the habit most people already have.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<SearchResults>(`/api/search${qs({ q: debounced })}`),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  const go = (href: string) => {
    setOpen(false);
    setTerm('');
    router.push(href);
  };

  const totalResults =
    (data?.customers.length ?? 0) +
    (data?.vehicles.length ?? 0) +
    (data?.jobCards.length ?? 0) +
    (data?.invoices.length ?? 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent sm:w-64 md:w-80"
        aria-label="Search customers, vehicles, job cards and invoices"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Search everything...</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>

          <div className="flex items-center gap-2 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by name, mobile, vehicle number, job card or invoice..."
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {term.trim().length < 2 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search.
              </p>
            )}

            {term.trim().length >= 2 && !isFetching && totalResults === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing found for &ldquo;{term}&rdquo;.
              </p>
            )}

            <Group title="Customers" show={!!data?.customers.length}>
              {data?.customers.map((c) => (
                <Row
                  key={c.id}
                  icon={Users}
                  title={c.name}
                  subtitle={c.mobileNumber}
                  onClick={() => go(`/customers/${c.id}`)}
                />
              ))}
            </Group>

            <Group title="Vehicles" show={!!data?.vehicles.length}>
              {data?.vehicles.map((v) => (
                <Row
                  key={v.id}
                  icon={Bike}
                  title={v.vehicleNumber}
                  subtitle={[v.brand, v.model].filter(Boolean).join(' ') || v.customerName}
                  onClick={() => go(`/vehicles/${v.id}`)}
                />
              ))}
            </Group>

            <Group title="Job cards" show={!!data?.jobCards.length}>
              {data?.jobCards.map((j) => (
                <Row
                  key={j.id}
                  icon={ClipboardList}
                  title={j.jobCardNumber}
                  subtitle={`${j.vehicleNumber} · ${j.customerName}`}
                  onClick={() => go(`/job-cards/${j.id}`)}
                />
              ))}
            </Group>

            <Group title="Invoices" show={!!data?.invoices.length}>
              {data?.invoices.map((i) => (
                <Row
                  key={i.id}
                  icon={Receipt}
                  title={i.invoiceNumber}
                  subtitle={`${i.customerName} · ${formatCurrency(i.totalAmount, garage.currency)}`}
                  onClick={() => go(`/invoices/${i.id}`)}
                />
              ))}
            </Group>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Group({
  title,
  show,
  children,
}: {
  title: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="mb-2">
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
