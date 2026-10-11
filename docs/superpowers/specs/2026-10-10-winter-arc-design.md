# Winter Arc — Routine & Day Planner (Design)

Date: 2026-10-10 · Status: approved in chat

## Goal

A personal (single-user) daily planner for a software engineer: recurring routines,
one-off daily tasks, a time-blocked schedule, and streaks/stats. Minimal "Linear-clean"
design. Works as a website and as an installable PWA (phone + laptop), synced via Supabase,
with real push reminders.

## Stack

- Vite + React + TypeScript SPA, Tailwind CSS, Radix-based UI primitives, lucide icons
- `vite-plugin-pwa` (injectManifest: custom service worker for precache + push)
- TanStack Query, persisted to IndexedDB; offline mutations persisted and resumed in order
- Supabase: Postgres + RLS (`auth.uid() = user_id`), magic-link email auth,
  Edge Function `send-reminders` triggered every minute by `pg_cron` + `pg_net`
- Vitest + Testing Library; Playwright smoke test
- Static hosting (Vercel / Cloudflare Pages)

## Data model

| table | purpose | key columns |
|---|---|---|
| `routines` | recurring template | `title`, `days_of_week smallint[]` (0=Sun..6=Sat), `start_time time?`, `duration_min int?`, `color`, `archived_at?`, `sort_order` |
| `routine_logs` | routine done on a date | `routine_id`, `date`, `done_at`; unique (`routine_id`,`date`) |
| `tasks` | one-off item for a day | `title`, `date`, `start_time?`, `duration_min?`, `notes?`, `done_at?`, `sort_order` |
| `settings` | per-user prefs (PK `user_id`) | `timezone`, `reminder_lead_min` (default 5), `week_start` |
| `push_subscriptions` | one per device | `endpoint` (unique), `p256dh`, `auth` |
| `reminder_log` | push dedupe | unique (`user_id`,`item_type`,`item_id`,`date`) |

All user tables carry `user_id` (default `auth.uid()`), `created_at`, `updated_at`; ids are
client-generated UUIDs so offline-created rows can be referenced before syncing.

Rules:
- Routines are never materialized per day. Routines due on date D = not archived,
  created on/before D, and `weekday(D) ∈ days_of_week`. Completion = a `routine_logs` row.
- Items with `start_time` render on the timeline; others in the checklist.
- Past undone tasks show in an **Overdue** group with "Move to today" (single / all). No silent auto-roll.
- Stats are derived from `routine_logs` and `tasks.done_at`.

## Screens

Sidebar (desktop) / bottom tabs (mobile): **Today · Routines · Stats · Settings**. Dark default, light optional.

- **Today**: date header with ←/→ day nav and `done/total` progress. Left: Overdue, Routines, Tasks,
  quick-add (`Deep work 10:00 2h`, `tomorrow`). Right: 24h timeline scrolled to now with a now-line;
  click empty slot to add at that time; desktop drag to move / resize blocks. Mobile: checklist above timeline.
- **Routines**: list; create/edit title, weekday chips, optional time + duration, color; archive.
- **Stats**: year heatmap of daily completion %, per-routine current/best streak, 7/30-day rates.
  Streaks count only scheduled days; today doesn't break a streak until it ends.
- **Settings**: timezone, reminder lead minutes, "Enable notifications on this device", theme, sign out.
- **Login**: magic-link email.
- Keyboard: `⌘K` palette, `n` new task, `j/k` move, `x` toggle done, `←/→` day, `t` today.

## Offline & sync

Service worker precaches the app shell; query cache persisted in IndexedDB; optimistic updates;
paused mutations persisted and replayed on reconnect. Last-write-wins (`updated_at`).
Status pill shows `Offline · N pending`.

## Push reminders

1. Client subscribes via PushManager (VAPID public key) → `push_subscriptions` row.
2. `pg_cron` every minute → `net.http_post` to `send-reminders` with a shared secret header.
3. Function, per user in their timezone: routines due today + today's tasks, not done, with
   `start_time − lead` in the last 2 minutes (tolerates a late/missed tick).
4. Insert into `reminder_log` (on conflict do nothing) — only newly inserted rows are sent.
5. Send with `web-push`; delete subscriptions answering 404/410.
6. Service worker shows "DSA in 5 min · 08:00–09:00"; click opens Today.
iOS requires the PWA installed to Home Screen (16.4+).

## Error handling

Failed mutations after retries → item flagged "not synced · retry". Session refresh by supabase-js;
on refresh failure → login, queued mutations kept. Validation in UI and DB check constraints
(non-empty title, duration > 0, weekdays 0–6). Route-level error boundary.

## Testing

TDD on pure domain logic (`src/lib/domain`): routines due on date, streaks/heatmap, quick-add parser,
reminder window selection (shared with the Edge Function). Component tests for check-off, quick-add,
move overdue. RLS isolation script (second user via service role cannot see rows). Playwright smoke.

## Out of scope (v1)

Multi-user/sharing, calendar import, native apps, notes/journal.

---

## Learning (added 2026-10-11)

Tracks (e.g. DSA, AI/ML) → goals with a target date → topic checklists.

| table | key columns |
|---|---|
| `learning_tracks` | `title`, `color`, `status` (`active`/`paused`/`completed`), `sort_order` |
| `learning_goals` | `track_id` (cascade), `title`, `starts_on`, `target_date`, `sort_order` |
| `learning_topics` | `goal_id` (cascade), `title`, `notes`, `done_at`, `sort_order` |
| `tasks.topic_id` | nullable FK → `learning_topics` (on delete set null) |

RLS: owner-only; inserts/updates must reference the caller's own parent row (track/goal/topic).

- **Learning tab**: active track cards (progress, next deadline + status); paused/completed under "Archived".
- **Track page** `/learning/:id`: goals by deadline, each with `done/total · by <date> · <status>`, expandable topic
  checklist; paste multiple lines → one topic per line; topic sheet with title + notes (URLs clickable) + delete.
- **Plan**: from a topic, open the task editor prefilled (title, today, topic_id). Task chip `Track · Goal`.
  Task done ⇒ topic done; task undone ⇒ topic undone. Topic with an open task shows `Planned · <date>`.
- **Status**: done (all topics) · overdue (past target, not done) · behind (progress < expected − 10pts) · on track.
  Expected = elapsed / (target − start). A goal with no topics is never "behind".
- **Today strip**: active-track goals due within 7 days or overdue, with progress + status.
- ⌘K: New learning track, Go to Learning. No push reminders for goals in v1.
