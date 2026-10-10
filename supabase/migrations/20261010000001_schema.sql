-- Winter Arc core schema. Every user table is private to its owner via RLS.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Recurring templates. Never materialized per day; "due on D" is computed.
create table public.routines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  days_of_week  smallint[] not null default '{0,1,2,3,4,5,6}'
                check (cardinality(days_of_week) > 0 and days_of_week <@ '{0,1,2,3,4,5,6}'::smallint[]),
  start_time    time,
  duration_min  int check (duration_min is null or duration_min > 0),
  color         text not null default 'blue',
  starts_on     date not null default current_date,
  archived_at   timestamptz,
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.routine_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  routine_id  uuid not null references public.routines on delete cascade,
  date        date not null,
  done_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (routine_id, date)
);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  date          date not null,
  start_time    time,
  duration_min  int check (duration_min is null or duration_min > 0),
  notes         text,
  done_at       timestamptz,
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.settings (
  user_id            uuid primary key default auth.uid() references auth.users on delete cascade,
  timezone           text not null default 'UTC',
  reminder_lead_min  int not null default 5 check (reminder_lead_min between 0 and 120),
  week_start         smallint not null default 1 check (week_start in (0, 1)),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Written only by the send-reminders Edge Function (service role). Dedupes pushes.
create table public.reminder_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  item_type  text not null check (item_type in ('routine', 'task')),
  item_id    uuid not null,
  date       date not null,
  sent_at    timestamptz not null default now(),
  unique (user_id, item_type, item_id, date)
);

create index tasks_user_date_idx on public.tasks (user_id, date);
create index routine_logs_user_date_idx on public.routine_logs (user_id, date);
create index routines_user_idx on public.routines (user_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

do $$
declare t text;
begin
  foreach t in array array['routines', 'routine_logs', 'tasks', 'settings', 'push_subscriptions'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner can do everything" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
