<!--
================================================================================
 WRENCHBOOK — ASSUMPTIONS & DECISIONS
================================================================================
Built end-to-end (database + API + auth + UI) as specified. Where the brief left
room for judgement, these decisions were made so the app runs with zero paid
setup and stays simple for non-technical garage staff:

1.  DATABASE. PostgreSQL via Prisma, exactly as specified. A `docker-compose.yml`
    is included so a local Postgres is one command away; the same DATABASE_URL
    format works for Supabase and Neon in production.

2.  AUTH. Implemented with a credentials provider hand-rolled on top of bcrypt +
    signed JWT session cookies (HTTP-only, SameSite=Lax), rather than NextAuth,
    to keep the dependency surface small and the flow fully transparent. It
    delivers everything asked: email+password login, "remember me" (30-day vs
    12-hour session), forgot/reset password by emailed link, bcrypt hashing,
    and configurable inactivity auto-logout. Roles are ADMIN and STAFF, enforced
    on BOTH the client (hidden actions) and the server (rejected requests).

3.  FILE STORAGE & PDF. Supabase Storage is used when configured. WITHOUT it, the
    logo is stored as an inline data URL and invoice PDFs are generated on demand
    from a public, unguessable link — so the whole app, including WhatsApp
    sharing, works with no external storage account. PDFs use pdf-lib.

4.  WHATSAPP. Default is the free wa.me click-to-chat deep link (zero paid setup),
    pre-addressed to the customer with the message and a link to the hosted
    invoice pre-filled — a true one-click flow. If WhatsApp Cloud API credentials
    are provided, the PDF is delivered directly instead, with wa.me as fallback.

5.  EMAIL. Password-reset and staff-welcome emails go through Resend when a key is
    set. Without it, the reset link is printed to the server console (and shown
    on-screen in development) so the flow is testable on a fresh clone.

6.  SOFT DELETE. Customers, vehicles, job cards and invoices are archived, never
    hard-deleted, to preserve billing history. A vehicle with no job cards can be
    fully deleted; otherwise it is archived. Invoiced job cards cannot be archived.

7.  MONEY. All monetary values are Prisma Decimal; every total is recomputed on
    the server and never trusted from the client. Currency is configurable
    (default INR). Invoice line items are snapshotted at creation so later edits
    to a job card never rewrite historical bills.

8.  EXTRAS beyond the brief: today's + this-month revenue, outstanding-payments
    tracking, global Ctrl-K search, a first-run setup wizard, atomic document
    numbering with {YYYY}/{MM} tokens, and a public customer-facing invoice page.
================================================================================
-->

# WrenchBook

A complete, production-ready garage management web app for small and medium
vehicle garages (bikes and cars) to manage **customers, vehicles, job cards,
invoices, and WhatsApp invoice sharing** — designed to be fast, mobile-friendly,
and usable by non-technical garage staff.

A public marketing **landing page** lives at `/` with a full feature overview
and a **live demo login** (see below) so the app can be shown to prospective
clients without giving them a real account.

> **End-to-end flow:** Login → Add customer → Add vehicle → Create job card →
> Mark completed → Generate invoice → Download PDF → Share on WhatsApp.

---

## Tech stack

| Layer            | Choice                                                        |
| ---------------- | ------------------------------------------------------------ |
| Framework        | Next.js 14 (App Router) + TypeScript                         |
| UI               | Tailwind CSS + shadcn/ui-style components (Radix primitives) |
| Data fetching    | TanStack Query with optimistic updates                       |
| Forms            | react-hook-form + zod (client **and** server validation)     |
| Database         | PostgreSQL via Prisma ORM (Supabase / Neon / local Docker)   |
| Auth             | Email + password, bcrypt, signed JWT HTTP-only cookies       |
| File storage     | Supabase Storage (optional) with inline/data-URL fallback    |
| PDF              | pdf-lib (pixel-matched to the on-screen invoice)             |
| WhatsApp         | wa.me click-to-chat (default) or WhatsApp Cloud API          |
| Hosting          | Vercel + Supabase/Neon                                       |

---

## Quick start (local, zero cloud setup)

**Prerequisites:** Node.js 18.18+ and either Docker (recommended) or any
PostgreSQL database.

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env
#    then set AUTH_SECRET to a random string:
#    node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Start a local PostgreSQL (skip if you already have one)
docker compose up -d

# 4. Create the tables and load demo data
npm run setup

# 5. Run the app
npm run dev
```

Open **http://localhost:3000** and sign in with the demo credentials below.

### Login (single owner account)

This is a **single-login** app — one owner (admin) account, configured via the
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` environment variables and created by
`npm run db:seed`. The default demo values are `demo@wrenchbook.app` /
`Demo@1234` — the same credentials shown on the landing page (`/`) and the
login screen. The owner can change their password anytime in **Settings →
Account & Password**. Additional logins are disabled by design.

The seed also loads a demo garage (**Shree Automotive Works**) with a few
customers, vehicles and invoices so the app is explorable immediately. To
rebrand the demo credentials, update `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
in `.env`, `prisma/seed.ts`'s fallbacks, and `src/lib/demo.ts` together.

### Add your logo

Save your logo image as **`public/logo.png`** (see `public/LOGO_HERE.md`). It
appears on the login/setup screens and the app header immediately. For it to
appear on **invoices and PDFs**, also upload it once in **Settings → Garage** (or
the setup wizard) — that stores it with your garage profile.

> **Starting from scratch instead?** If you skip the seed, the first visit sends
> you to a "create owner account" screen followed by a guided setup wizard.

---

## Environment variables

The first four are required. Everything else is optional and has a working
fallback — see `.env.example` for the full annotated list.

| Variable             | Required | Purpose                                                     |
| -------------------- | :------: | ----------------------------------------------------------- |
| `DATABASE_URL`       |   ✅     | PostgreSQL connection string (Neon/Supabase **pooled** in prod) |
| `DIRECT_URL`         |   ✅     | Direct (non-pooled) connection for `prisma migrate`; locally same as `DATABASE_URL` |
| `AUTH_SECRET`        |   ✅     | Signs session cookies & reset tokens (32+ random chars)     |
| `NEXT_PUBLIC_APP_URL`|   ✅\*   | Public origin, for invoice share links (auto-set on Vercel) |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | – | Store logo & invoice PDFs in Supabase Storage |
| `RESEND_API_KEY`, `EMAIL_FROM` | – | Send real password-reset / staff-welcome emails |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | – | Deliver invoice PDFs directly via WhatsApp Cloud API |

\* Recommended in production; on Vercel it is derived from the deployment URL.

---

## Scripts

| Command              | What it does                                             |
| -------------------- | ------------------------------------------------------- |
| `npm run dev`        | Start the dev server                                    |
| `npm run build`      | Production build (runs `prisma generate` first)         |
| `npm run start`      | Serve the production build                              |
| `npm run setup`      | `db push` + generate + seed (one-shot local setup)      |
| `npm run db:push`    | Sync the schema to the database (no migration history)  |
| `npm run db:migrate` | Create a SQL migration                                  |
| `npm run db:seed`    | Load demo data                                          |
| `npm run db:studio`  | Open Prisma Studio to browse the data                   |
| `npm run db:reset`   | Wipe and reseed (destructive)                           |
| `npm run typecheck`  | TypeScript check with no emit                           |

---

## Deploying to Vercel + Supabase (or Neon)

1. **Create the database.** In Supabase: *Project → Settings → Database →
   Connection string → URI*. In Neon: *Dashboard → Connection Details → Prisma*.
2. **Push the schema:** with `DATABASE_URL` set locally, run
   `npm run db:migrate` once to create the migration, then commit it. Vercel runs
   `prisma migrate deploy` automatically on each build (see `vercel.json`).
3. **Import the repo into Vercel** and add the environment variables above
   (`DATABASE_URL`, `AUTH_SECRET`, and any optional ones). Set
   `NEXT_PUBLIC_APP_URL` to your final domain.
4. **(Optional) Supabase Storage:** create a **public** bucket (default name
   `garage`) and set the three `SUPABASE_*` variables to host logos and PDFs.
5. **Deploy.** On first visit you'll create the owner account and run the setup
   wizard. To load demo data in production, run `npm run db:seed` against the
   production `DATABASE_URL` from your machine.

> **Pooled connections (Supabase/Neon):** use the pooled URL for `DATABASE_URL`
> (append `?pgbouncer=true&connection_limit=1`) and set `DIRECT_URL` to the
> direct connection so migrations run correctly.

---

## Feature overview

- **Dashboard** — live counts (customers, vehicles, active jobs, today's
  revenue), quick-add customer/vehicle modals, and the 10 most recent job cards
  with colour + icon status badges.
- **Customers** — debounced search, duplicate-mobile warning, full profile with
  vehicles, job history and lifetime billing.
- **Vehicles** — search & type filter, uppercase-normalised unique numbers,
  per-vehicle service history.
- **Job cards** — auto-numbered atomically, searchable vehicle picker that
  auto-fills the customer, live-calculating parts/labour/service totals, status
  changeable straight from the list, printable view.
- **Invoices** — two ways to create one: **directly** (`New invoice` → pick/add a
  vehicle, choose the date, type the charges — great for entering **past bills**
  with the correct date), or from a completed **job card**. Editable tax &
  discount, **Paid/Pending** bifurcation with a dedicated pending-payments view,
  print-optimised layout, and a pixel-matched PDF download. A repeat **vehicle
  number is reused** — each new bill is simply another dated visit in that
  vehicle's history, never a duplicate.
- **WhatsApp sharing (free)** — one click opens WhatsApp pre-addressed to the
  customer with the invoice message + public link filled in; unpaid invoices also
  get a one-click **Send payment reminder**. Both use the free wa.me link (no paid
  API), and prompt for a number only if none is on file.
- **Settings** (admin) — business details, logo, document numbering, tax rate,
  session timeout, and staff management.
- **Import past data** — bulk-load your existing customers & vehicles from a
  spreadsheet: download the template, fill it in Excel, then upload the CSV or
  paste columns directly. Optionally include a last-service date/note/amount and
  the importer back-dates a completed job card + paid invoice so your old
  history and revenue show up too. Duplicates (by mobile / vehicle number) are
  detected and skipped, and every row gets a created / skipped / error result.

> **Deployment:** see **[DEPLOYMENT.md](DEPLOYMENT.md)** for the cheapest reliable
> setup — **Vercel + Neon, free** — plus Supabase and self-hosted VPS options.

---

## Security notes

- Every API route authenticates server-side; admin-only routes reject STAFF
  regardless of what the UI shows.
- Passwords are bcrypt-hashed (cost 12). Sessions are signed JWTs in HTTP-only,
  SameSite=Lax cookies. Password-reset tokens are single-use, hashed at rest, and
  expire in 1 hour.
- All input is validated with zod on the client and again on the server; all
  money totals are recomputed server-side.
- Login and forgot-password responses are constant across "user exists / doesn't"
  to prevent account enumeration.
- Public invoice links use a random unguessable token and are `noindex`.

---

## Post-build checklist

**Completed**

- [x] PostgreSQL schema (Prisma) with indexes on all FKs and searched fields; Decimal money
- [x] Email + password auth: remember-me, forgot/reset password, bcrypt, inactivity auto-logout
- [x] Roles (Admin/Staff) enforced on client **and** server
- [x] First-run owner creation + guided setup wizard
- [x] Dashboard with live stats + quick-add modals + recent job cards
- [x] Customers, Vehicles, Job Cards, Invoices — full CRUD with search/filter/pagination
- [x] Auto-numbered job cards & invoices (atomic, with year/month tokens)
- [x] Live-calculated job card totals; invoice with tax/discount; Paid/Unpaid tracking
- [x] Print + pixel-matched PDF invoices
- [x] One-click WhatsApp sharing (wa.me default, Cloud API optional)
- [x] Public customer-facing invoice page
- [x] Soft-delete/archive across records; toasts, loading/empty/error states
- [x] Global search, mobile bottom-nav, responsive throughout
- [x] Seed script with realistic demo data; deploy config for Vercel + Supabase/Neon

**Known gaps / follow-ups for production**

- Provide a real `DATABASE_URL` (Supabase/Neon) and a strong `AUTH_SECRET`.
- (Optional) Add Supabase Storage keys so logos/PDFs are hosted on a CDN rather
  than generated on demand / stored inline.
- (Optional) Add `RESEND_API_KEY` so password-reset & staff-welcome emails are
  actually delivered instead of logged to the console.
- (Optional) Add WhatsApp Cloud API credentials for direct PDF delivery; the free
  wa.me flow works without them.
- Point `NEXT_PUBLIC_APP_URL` at your custom domain for correct share links.
- No automated test suite is included; `npm run typecheck` and `npm run build`
  are the current gates.
