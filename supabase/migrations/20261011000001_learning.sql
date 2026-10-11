-- Learning: tracks → goals (with target dates) → topics. Tasks can link to the topic they schedule.

create table public.learning_tracks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  color       text not null default 'violet',
  status      text not null default 'active' check (status in ('active', 'paused', 'completed')),
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.learning_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  track_id     uuid not null references public.learning_tracks on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  starts_on    date not null default current_date,
  target_date  date not null,
  sort_order   double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (target_date >= starts_on)
);

create table public.learning_topics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id     uuid not null references public.learning_goals on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  notes       text,
  done_at     timestamptz,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tasks add column topic_id uuid references public.learning_topics on delete set null;

create index learning_goals_track_idx on public.learning_goals (track_id);
create index learning_topics_goal_idx on public.learning_topics (goal_id);
create index tasks_topic_idx on public.tasks (topic_id) where topic_id is not null;

do $$
declare t text;
begin
  foreach t in array array['learning_tracks', 'learning_goals', 'learning_topics'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "owner can do everything" on public.learning_tracks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Children may only point at the caller's own parent rows.
create policy "owner can do everything" on public.learning_goals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.learning_tracks t where t.id = track_id and t.user_id = (select auth.uid()))
  );

create policy "owner can do everything" on public.learning_topics for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.learning_goals g where g.id = goal_id and g.user_id = (select auth.uid()))
  );

drop policy "owner can do everything" on public.tasks;
create policy "owner can do everything" on public.tasks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (topic_id is null or exists (
      select 1 from public.learning_topics p where p.id = topic_id and p.user_id = (select auth.uid())))
  );
