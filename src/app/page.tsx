import Link from 'next/link';
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  ClipboardList,
  Lock,
  MessageCircle,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Upload,
  Users,
  Wrench,
  LayoutDashboard,
} from 'lucide-react';

import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_SUBTITLE } from '@/lib/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BrandLogo } from '@/components/shared/brand-logo';

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    body: "Live counts for customers, vehicles and active jobs, spare parts / labour / total revenue for today and this month, and your 10 most recent job cards at a glance.",
  },
  {
    icon: Users,
    title: 'Customers',
    body: 'Instant search, a duplicate-mobile-number warning, and a full profile with every vehicle, job and rupee billed to each customer.',
  },
  {
    icon: Bike,
    title: 'Vehicles',
    body: 'Uppercase-normalised vehicle numbers, bike/car filters, and a complete service history for every vehicle you service.',
  },
  {
    icon: ClipboardList,
    title: 'Job cards',
    body: 'Auto-numbered job cards, a searchable vehicle picker that fills in the customer, live-calculating totals, and one-tap status changes.',
  },
  {
    icon: Receipt,
    title: 'Invoices & billing',
    body: 'Spare Parts / Labour / Service bifurcation, editable tax & discount, Paid/Pending tracking, and a pixel-matched PDF download.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp sharing',
    body: 'One click opens WhatsApp pre-addressed to the customer with the invoice link, plus one-click payment reminders. No paid API needed.',
  },
  {
    icon: Upload,
    title: 'Import past data',
    body: 'Bulk-load existing customers and vehicles from a spreadsheet, with duplicate detection and back-dated job/invoice history.',
  },
  {
    icon: Settings,
    title: 'Settings & team',
    body: 'Business details, logo, document numbering, tax rate, session timeout and staff logins — all from one screen.',
  },
];

const STEPS = [
  'Sign in',
  'Add a customer & vehicle',
  'Open a job card',
  'Mark the work complete',
  'Generate the invoice',
  'Share it on WhatsApp',
];

const TRUST = [
  { icon: ShieldCheck, text: 'Bcrypt-hashed passwords & signed session cookies' },
  { icon: Lock, text: 'Every total recomputed on the server, never trusted from the browser' },
  { icon: CheckCircle2, text: 'Owner vs staff roles enforced on every screen and every API call' },
  { icon: Smartphone, text: 'Fast and usable on a phone at the service counter' },
];

const FAQS = [
  {
    q: 'Do I need to install anything?',
    a: 'No. It runs in the browser on any phone, tablet or computer — nothing to download.',
  },
  {
    q: 'What does the WhatsApp sharing cost?',
    a: 'Nothing by default — it uses the free wa.me click-to-chat link. Direct PDF delivery via the paid WhatsApp Cloud API is supported too, if you want it later.',
  },
  {
    q: 'Can my staff have their own login?',
    a: 'Today it is a single owner login per garage, by design, to keep things simple and secure. Multiple staff logins can be enabled if you need them.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes — PostgreSQL storage, bcrypt password hashing, signed HTTP-only session cookies, and soft-deleted (never hard-deleted) records so your billing history is preserved.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo
              src={BRAND_LOGO_SRC}
              alt={BRAND_NAME}
              className="h-9 w-9 shrink-0 rounded-md bg-black object-contain"
              fallback={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Wrench className="h-4 w-4" />
                </span>
              }
            />
            <span className="text-base font-bold tracking-tight">{BRAND_NAME}</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#workflow" className="hover:text-foreground">How it works</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/login">
                Sign in <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.06] to-transparent">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Badge variant="secondary" className="mb-4">
              <CheckCircle2 className="h-3 w-3" /> {BRAND_NAME} · {BRAND_SUBTITLE}
            </Badge>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Run your garage from <span className="text-primary">one screen</span>.
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              {BRAND_NAME} garage management software for bike and car workshops — customers,
              vehicles, job cards, invoices and one-click WhatsApp billing, built to be fast on a
              phone at the service counter.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="xl">
                <Link href="/login">
                  Sign in <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <a href="#features">See what it does</a>
              </Button>
            </div>
            <ul className="mt-8 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Built for bike & car workshops
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Free WhatsApp invoice sharing
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Works on phone & desktop
              </li>
            </ul>
          </div>

          {/* product preview mockup (illustrative, not a live screenshot) */}
          <div className="relative">
            <div className="rounded-xl border bg-card p-3 shadow-xl sm:p-4">
              <div className="flex items-center gap-1.5 pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-2 text-xs text-muted-foreground">{BRAND_NAME} — Dashboard</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  ['Customers', '128'],
                  ['Vehicles', '164'],
                  ['Active jobs', '12'],
                  ['Spare parts revenue', '₹5,200'],
                  ['Labour revenue', '₹3,250'],
                  ['Total revenue', '₹8,450'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-secondary/40 p-2.5">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border">
                <div className="border-b bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Recent job cards
                </div>
                <div className="divide-y">
                  {[
                    { veh: 'MH12AB1234', name: 'Ramesh Kumar', status: 'completed' as const },
                    { veh: 'MH12CD5678', name: 'Priya Sharma', status: 'progress' as const },
                    { veh: 'MH14EF9012', name: 'Imran Shaikh', status: 'pending' as const },
                  ].map((row) => (
                    <div key={row.veh} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{row.veh}</p>
                      </div>
                      <Badge variant={row.status}>
                        {row.status === 'completed' ? 'Completed' : row.status === 'progress' ? 'In progress' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Illustrative preview — sign in to see your own numbers.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything a garage needs, in one place</h2>
          <p className="mt-3 text-muted-foreground">
            No modules to configure, no separate billing software — one app covers the whole
            customer-to-cash workflow.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="stat-card-hover">
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3.5 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ workflow */}
      <section id="workflow" className="border-y bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">From walk-in to WhatsApp, in six steps</h2>
            <p className="mt-3 text-muted-foreground">The same flow every garage already follows — just faster.</p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {STEPS.map((step, i) => (
              <div key={step} className="relative rounded-xl border bg-card p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="mt-3 text-sm font-semibold leading-snug">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- trust */}
      <section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <div key={t.text} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <t.icon className="h-4 w-4" />
                </span>
                <p className="text-sm text-muted-foreground">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- faq */}
      <section id="faq" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-8 divide-y rounded-xl border bg-card">
          {FAQS.map((item) => (
            <div key={item.q} className="p-5 sm:p-6">
              <p className="font-semibold">{item.q}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- cta band */}
      <section className="bg-primary">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
            Ready to get back to work?
          </h2>
          <p className="max-w-xl text-primary-foreground/85">
            Sign in to open today&apos;s job cards, raise an invoice and share it on WhatsApp.
          </p>
          <Button asChild size="xl" variant="secondary">
            <Link href="/login">
              Sign in <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* -------------------------------------------------------------- footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <BrandLogo
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                className="h-8 w-8 shrink-0 rounded-md bg-black object-contain"
                fallback={
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Wrench className="h-4 w-4" />
                  </span>
                }
              />
              <div>
                <p className="text-sm font-bold">{BRAND_NAME}</p>
                <p className="text-xs text-muted-foreground">{BRAND_SUBTITLE}</p>
              </div>
            </div>

            <nav className="flex flex-wrap gap-5 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground">Features</a>
              <a href="#workflow" className="hover:text-foreground">How it works</a>
              <a href="#faq" className="hover:text-foreground">FAQ</a>
              <Link href="/login" className="hover:text-foreground">Sign in</Link>
            </nav>
          </div>

          <div className="mt-8 flex flex-col gap-1 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
            <p>Built with Next.js, PostgreSQL & Tailwind CSS.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
