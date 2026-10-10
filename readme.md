# Winter Arc

Personal routine tracker + day planner. Website and installable PWA, synced through Supabase, with push reminders.

- **Today** — checklist (overdue · routines · tasks) + 24h timeline. Quick add: `Deep work 10:00 2h`, `Gym tomorrow 7am`, `Focus 9:00-11:30`.
- **Routines** — repeat on chosen weekdays, optional time/duration/color; archive keeps history.
- **Stats** — 12-month heatmap, streaks (scheduled days only), 7/30-day rates.
- **Settings** — timezone, reminder lead time, push per device, theme.
- Keyboard: `⌘K` commands · `n` add · `j/k` move · `x` done · `←/→` day · `t` today.
- Works offline: edits queue locally and sync in order on reconnect.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/ (static; deploy to Vercel / Cloudflare Pages)
```

## Checks

```bash
npm test                   # unit tests (domain logic + reminder selection)
npm run typecheck
npm run e2e                # Playwright smoke against a production build (uses a throwaway user)
npm run check:rls          # row-level security isolation between two users
npm run check:reminders    # live pg_cron → Edge Function → reminder claim (~2 min)
npm run diag:reminders     # recent cron runs + Edge Function responses
```

The `scripts/` checks and e2e need `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

## Backend (Supabase)

- `supabase/migrations/` — schema, RLS, pg_cron job. Apply with `supabase db push`.
- `supabase/functions/send-reminders` — runs every minute; deploy with
  `supabase functions deploy send-reminders --use-api --no-verify-jwt`.
- Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`supabase secrets set …`).

### One-time dashboard settings

1. **Authentication → URL Configuration**: Site URL = your deployed URL; add `http://localhost:5173` to Redirect URLs.
2. After your first sign-in, **Authentication → Sign In / Providers → turn off "Allow new users to sign up"** so it stays single-user.

### Moving to a new Supabase project

1. Update `.env.local` (URL, publishable key, service role key), then `supabase link --project-ref <new-ref>`.
2. Change the function URL in `supabase/migrations/20261010000002_reminders_cron.sql` to the new project, then `supabase db push`.
3. `supabase secrets set …` and redeploy the function (commands above).

### Push notes

- Each device opts in from **Settings → Push on this device**.
- iPhone: add to Home Screen first (iOS 16.4+), then enable from the installed app.
