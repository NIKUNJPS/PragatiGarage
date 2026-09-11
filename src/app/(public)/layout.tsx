import { Wrench } from 'lucide-react';

import { BrandLogo } from '@/components/shared/brand-logo';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* Shows /public/logo.png; falls back to a generic mark until you add it. */}
            <BrandLogo
              src="/logo.svg"
              className="mb-3 h-20 w-20 rounded-xl bg-black object-contain p-1.5 shadow-sm"
              alt="Garage logo"
              fallback={
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Wrench className="h-7 w-7" />
                </span>
              }
            />
            <h1 className="text-lg font-bold tracking-tight">WrenchBook</h1>
            <p className="text-sm text-muted-foreground">
              Job cards, invoices and customers in one place
            </p>
          </div>
          {children}
        </div>
      </div>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        Built for small and medium vehicle garages
      </footer>
    </div>
  );
}
