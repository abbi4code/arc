# Winter Arc

Personal routine tracker + day planner. Website and installable PWA, synced through Supabase, with push reminders.

- **Today** — checklist (overdue · routines · tasks) + 24h timeline. Quick add: `Deep work 10:00 2h`, `Gym tomorrow 7am`, `Focus 9:00-11:30`.
- **Routines** — repeat on chosen weekdays, optional time/duration/color; archive keeps history.
- **Stats** — 12-month heatmap, streaks (scheduled days only), 7/30-day rates.
- **Settings** — timezone, reminder lead time, push per device, theme.
- Keyboard: `⌘K` commands · `n` add · `j/k` move · `x` done · `←/→` day · `t` today.
- Works offline: edits queue locally and sync in order on reconnect.
- Themes: Midnight, Dusk, Forest, Sepia, Light, System (contrast-tested in `src/lib/themes.test.ts`).

## Passwords (Settings → Passwords)

End-to-end encrypted vault: entries are encrypted on-device (AES-256-GCM) with a Vault Key that is stored
only wrapped by a Face ID / Touch ID passkey (WebAuthn PRF) or by your recovery key. Supabase, the service
role key and Vercel only ever see ciphertext. Auto-locks after 3 min idle, ~30 s in the background, or when
you leave the screen. Losing both the passkey and the recovery key means the vault can't be recovered.
Design: `docs/superpowers/specs/2026-10-12-password-vault-design.md`.

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

1. **Sign-in** emails a link. Inside an installed iPhone app (where tapping a link opens Safari instead),
   press and hold the link in the email → Copy Link → paste it into the app; on a computer just click it.
   The same box also accepts a code, so if you later add custom SMTP (free-tier projects can't edit
   templates on Supabase's default mailer) you can put `{{ .Token }}` in the **Magic Link** and
   **Confirm signup** templates and type codes instead.
2. **Authentication → URL Configuration**: Site URL = your Vercel URL.
3. After your first sign-in, **Authentication → Sign In / Providers → turn off "Allow new users to sign up"** so it stays single-user.
4. Supabase's built-in mailer only sends to your project's team members and is rate-limited (a few per hour). Fine for one user; add custom SMTP if you ever need more.

## Deploy (Vercel)

1. Import the repo in Vercel. `vercel.json` already sets the build, SPA rewrites and cache headers
   (hashed `/assets/*` cached for a year; `index.html`, `sw.js` and the manifest always revalidated so updates arrive).
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`. **Never** the service role key.
3. On iPhone: open the site in Safari → Share → **Add to Home Screen** → open the installed app → sign in → Settings → enable push.

## Performance

Measured on a throttled phone profile (slow 4G, 4× CPU): first visit ≈ 1.6–1.9 s, Lighthouse mobile 95–96.
Launching the installed app shows your tasks in ≈ 0.15 s, also offline: the service worker serves the app,
and the TanStack Query cache in IndexedDB serves the data while Supabase refreshes it in the background.
Startup loads only Today; other screens, dialogs and ⌘K are separate chunks prefetched when idle
(`src/lib/preloadable.tsx` avoids React's Suspense reveal delay once they're cached).

### Moving to a new Supabase project

1. Update `.env.local` (URL, publishable key, service role key), then `supabase link --project-ref <new-ref>`.
2. Change the function URL in `supabase/migrations/20261010000002_reminders_cron.sql` to the new project, then `supabase db push`.
3. `supabase secrets set …` and redeploy the function (commands above).

### Push notes

- Each device opts in from **Settings → Push on this device**.
- iPhone: add to Home Screen first (iOS 16.4+), then enable from the installed app.
