# Deploying WrenchBook — cheapest reliable setup

**Short answer: Vercel (free) + Neon (free PostgreSQL) = ₹0 / month.**
No separate storage bill, because your logo is stored inside the database (it's
tiny) and invoice PDFs are generated on the fly each time — nothing to store.

This handles a single garage's traffic comfortably on the free tiers.

---

## Option A — Vercel + Neon (recommended, lowest cost) 💰

| Piece            | Provider | Free tier                                   | Cost |
| ---------------- | -------- | ------------------------------------------- | ---- |
| App + API + PDFs | Vercel   | Hobby plan, custom domain, HTTPS            | Free |
| Database         | Neon     | 0.5 GB Postgres (thousands of vehicles)     | Free |
| Logo storage     | (in DB)  | Stored inline — no separate service needed  | Free |
| Invoice PDFs     | (on-demand) | Generated per request — nothing stored   | Free |

### Step-by-step (about 15 minutes, no prior experience needed)

**1. Put the code on GitHub**
- Create a free GitHub account and a new **private** repository.
- Upload this project (GitHub's website has an "upload files" button, or use
  `git`).

**2. Create the database on Neon**
- Sign up at neon.tech (free).
- Create a project → it gives you a **connection string** that starts with
  `postgresql://...`. Copy it.
- Neon shows two strings: a **pooled** one and a **direct** one. Keep both.

**3. Deploy on Vercel**
- Sign up at vercel.com with your GitHub account.
- Click **Add New → Project**, pick your repository, and before deploying open
  **Environment Variables** and add:

  | Name                  | Value                                                        |
  | --------------------- | ------------------------------------------------------------ |
  | `DATABASE_URL`        | your Neon **pooled** string + `?pgbouncer=true&connection_limit=1` |
  | `DIRECT_URL`          | your Neon **direct** string                                  |
  | `AUTH_SECRET`         | any long random text (30+ characters)                        |
  | `NEXT_PUBLIC_APP_URL` | leave blank for now; set it to your domain after first deploy |

- Click **Deploy**. Vercel builds it and creates the database tables automatically.

**4. First sign-in**
- Open your new URL (e.g. `your-garage.vercel.app`).
- It asks you to **create the owner account**, then walks you through the setup
  wizard (business details, logo, numbering, WhatsApp number).
- Done — start adding customers, or use **Import past data** to bulk-load your
  old records.

**5. (Optional) Load demo data**
Run this once from your computer with the same `DATABASE_URL` to explore with
sample data first: `npm run db:seed`.

---

## Option B — Vercel + Supabase (if you want a dashboard + file storage)

Same as Option A, but the database is **Supabase** (also free): 500 MB Postgres
**plus** 1 GB file storage and a nice web dashboard to view your data.

Use this if you'd like invoice PDFs saved as permanent files (for WhatsApp
Cloud API delivery) rather than generated each time. Add these env vars too:

```
NEXT_PUBLIC_SUPABASE_URL=...        # Project Settings → API
SUPABASE_SERVICE_ROLE_KEY=...       # Project Settings → API (service_role key)
SUPABASE_STORAGE_BUCKET=garage      # create a PUBLIC bucket named "garage"
```

> Note: Supabase's **free** project pauses after ~7 days of no activity. For a
> garage used daily this never triggers, but Neon (Option A) resumes instantly
> and is simpler, which is why it's the primary recommendation.

---

## Option C — One small VPS (most control, small fixed cost)

If you'd rather own the whole thing on one server (~₹300–500 / month on
Hostinger, Contabo, or a DigitalOcean droplet):

1. Rent the smallest VPS (1 GB RAM is enough).
2. Install Docker.
3. Run the bundled Postgres with `docker compose up -d`, set `DATABASE_URL` to
   it, then `npm run setup && npm run build && npm run start` (or containerise
   the app too).

This is more maintenance (updates, backups, HTTPS setup) so it's only worth it
if you specifically want everything on your own machine.

---

## Option D — Render (free web service) + external free database

Render's **free web service** works, but note two things:

- It **sleeps after ~15 min** of inactivity (cold start ~30–60s on next visit).
- Render's own **free PostgreSQL expires after ~30 days**, so for a permanent
  free setup pair Render's web service with a **free Neon or Supabase database**
  (those don't expire) rather than Render Postgres.

Always-on paid Render is roughly **~$7/mo** (web) **+ ~$6–7/mo** (Postgres) ≈
**$13–14/mo**. Vercel + Neon does the same job for free, which is why it's the
top pick. (Prices change — confirm on render.com.)

### Keep a free service awake with a 5-minute ping (avoid sleep)

This app ships a health endpoint at **`/api/health`** (public; also does a quick
`SELECT 1` to keep a sleeping database warm). Point any free pinger at it:

- **UptimeRobot** — add an HTTP monitor for `https://YOUR-APP/api/health`, 5-min
  interval. (Free.)
- **cron-job.org** — schedule a GET to the same URL every 5 min. (Free.)
- **GitHub Actions** — a scheduled workflow that `curl`s the URL:

  ```yaml
  # .github/workflows/keep-alive.yml
  name: keep-alive
  on:
    schedule:
      - cron: '*/10 * * * *'   # every 10 minutes
  jobs:
    ping:
      runs-on: ubuntu-latest
      steps:
        - run: curl -fsS https://YOUR-APP.onrender.com/api/health
  ```

**Notes & limits:**
- Render's free web service includes **750 instance-hours/month** (~ a full
  month is 730h), so keeping **one** service awake 24/7 fits the free budget.
- Pinging keeps the **app** awake and (via the `SELECT 1`) a **Supabase** DB
  warm. It does **not** stop Render's own free Postgres from expiring at 30 days
  — use Neon/Supabase for the database to avoid that entirely.
- **Neon** doesn't need a pinger: its compute auto-resumes in under a second, so
  the occasional cold query is invisible in normal use.

## Which should you pick?

- **Just want it live, cheapest, least hassle → Option A (Vercel + Neon).**
- Want a data dashboard and permanent PDF files → Option B (Vercel + Supabase).
- Want full ownership on your own server → Option C (VPS).

## Keeping costs at zero as you grow

- Logos live in the database and are a few KB — negligible.
- PDFs are generated on demand, so they never consume storage.
- A single garage will stay inside every free tier for a long time. If you ever
  outgrow Neon's 0.5 GB, its next paid tier is a few dollars a month.

## After deploying — backups (important)

Your data is the business. On Neon/Supabase, enable/download periodic database
backups from their dashboard, or run `pg_dump` on a schedule. Free tiers keep
recent backups automatically, but keep your own copy too.
