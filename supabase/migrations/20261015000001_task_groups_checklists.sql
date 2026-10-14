-- Task groups (Work, Personal, …) and per-task checklists.

create table public.task_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 40),
  color       text not null default 'slate',
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on public.task_groups
  for each row execute function public.set_updated_at();
alter table public.task_groups enable row level security;
create policy "owner can do everything" on public.task_groups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.task_groups to authenticated;
revoke all on public.task_groups from anon;
create index task_groups_user_idx on public.task_groups (user_id);

alter table public.tasks
  add column group_id uuid references public.task_groups on delete set null,
  -- [{ "id": "...", "title": "...", "done": false }]
  add column subtasks jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array');
create index tasks_group_idx on public.tasks (group_id) where group_id is not null;

-- A task may only reference the caller's own topic and group.
drop policy "owner can do everything" on public.tasks;
create policy "owner can do everything" on public.tasks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (topic_id is null or exists (
      select 1 from public.learning_topics p where p.id = topic_id and p.user_id = (select auth.uid())))
    and (group_id is null or exists (
      select 1 from public.task_groups g where g.id = group_id and g.user_id = (select auth.uid())))
  );
