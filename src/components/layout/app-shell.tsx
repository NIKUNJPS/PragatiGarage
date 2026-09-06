'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bike,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Upload,
  Users,
  X,
} from 'lucide-react';

import { cn, initials } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BrandLogo } from '@/components/shared/brand-logo';
import { GlobalSearch } from '@/components/layout/global-search';
import { SetupBanner } from '@/components/layout/setup-banner';

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', shortLabel: 'Customers', icon: Users },
  { href: '/vehicles', label: 'Vehicles', shortLabel: 'Vehicles', icon: Bike },
  { href: '/job-cards', label: 'Job Cards', shortLabel: 'Jobs', icon: ClipboardList },
  { href: '/invoices', label: 'Invoices', shortLabel: 'Bills', icon: Receipt },
  { href: '/import', label: 'Import Data', shortLabel: 'Import', icon: Upload },
  { href: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, garage, isAdmin, logout } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const visibleNav = NAV.filter((item) => !item.adminOnly || isAdmin);
  // Bottom nav on phones keeps to five items; Settings lives in the avatar menu.
  const bottomNav = visibleNav.filter((item) => item.href !== '/settings').slice(0, 5);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen">
      {/* ------------------------------------------------------------ header */}
      <header className="app-header sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <BrandLogo
              src={garage.logoUrl || '/logo.png'}
              alt={garage.name}
              className="h-8 w-8 shrink-0 rounded-md bg-black object-contain"
              fallback={
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                  {initials(garage.name) || 'GM'}
                </span>
              }
            />
            <span className="hidden truncate text-sm font-semibold sm:block sm:max-w-[220px]">
              {garage.name}
            </span>
          </Link>

          <div className="ml-auto flex flex-1 items-center justify-end gap-2">
            <GlobalSearch />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  {initials(user.name)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1.5 inline-flex rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {user.role === 'ADMIN' ? 'Garage owner (Admin)' : 'Staff'}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings /> Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem destructive onClick={() => void logout()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* mobile slide-down nav */}
        {mobileNavOpen && (
          <nav className="border-t bg-card px-2 py-2 lg:hidden">
            {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <div className="flex">
        {/* ----------------------------------------------------- sidebar (lg) */}
        <aside className="app-sidebar sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r bg-card lg:block">
          <nav className="flex flex-col gap-1 p-3">
            {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* -------------------------------------------------------- main area */}
        <main className="min-w-0 flex-1 pb-20 lg:pb-8">
          <SetupBanner />
          <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-6">{children}</div>
        </main>
      </div>

      {/* -------------------------------------------------- bottom nav (sm) */}
      <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t bg-card lg:hidden">
        <div className="grid grid-cols-5">
          {bottomNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                isActive(item.href) ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <item.icon className="h-5 w-5" />
              {item.shortLabel}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
