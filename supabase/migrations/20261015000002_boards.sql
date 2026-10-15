-- Boards: Excalidraw whiteboards in nested folders, their images, and the user's shape library.
-- Scenes sync through a version check (see src/lib/boards/sync.ts); everything else is plain owner-only rows.

create table public.whiteboard_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id   uuid references public.whiteboard_folders on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 80),
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create table public.whiteboards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id   uuid references public.whiteboard_folders on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 120),
  -- { elements: [...incl. deleted tombstones], appState: { viewBackgroundColor, gridModeEnabled, ... } }
  scene       jsonb not null default '{"elements": [], "appState": {}}'::jsonb check (jsonb_typeof(scene) = 'object'),
  version     integer not null default 0,
  thumbnail   text check (thumbnail is null or length(thumbnail) <= 60000),
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Images pasted into a board. Keyed by Excalidraw's content-hash file id, so each is uploaded once.
create table public.whiteboard_files (
  board_id    uuid not null references public.whiteboards on delete cascade,
  id          text not null check (length(id) between 1 and 100),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  mime_type   text not null check (mime_type like 'image/%'),
  data_url    text not null check (length(data_url) <= 5600000), -- ~4 MB image as base64
  created_at  timestamptz not null default now(),
  primary key (board_id, id)
);

create table public.whiteboard_library (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index whiteboard_folders_user_idx on public.whiteboard_folders (user_id);
create index whiteboard_folders_parent_idx on public.whiteboard_folders (parent_id) where parent_id is not null;
create index whiteboards_user_idx on public.whiteboards (user_id);
create index whiteboards_folder_idx on public.whiteboards (folder_id) where folder_id is not null;
create index whiteboard_files_user_idx on public.whiteboard_files (user_id);

-- A folder may never end up inside itself (directly or through its subfolders).
create or replace function public.whiteboard_folders_no_cycle()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    with recursive up (id, parent_id) as (
      select f.id, f.parent_id from public.whiteboard_folders f where f.id = new.parent_id
      union
      select f.id, f.parent_id from public.whiteboard_folders f join up on f.id = up.parent_id
    )
    select 1 from up where up.id = new.id
  ) then
    raise exception 'A folder can''t be moved inside itself' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger no_cycle before insert or update of parent_id on public.whiteboard_folders
  for each row execute function public.whiteboard_folders_no_cycle();

do $$
declare t text;
begin
  foreach t in array array['whiteboard_folders', 'whiteboards', 'whiteboard_library'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['whiteboard_folders', 'whiteboards', 'whiteboard_files', 'whiteboard_library'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "owner can do everything" on public.whiteboard_library for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Children may only point at the caller's own parent rows.
create policy "owner can do everything" on public.whiteboard_folders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (parent_id is null or exists (
      select 1 from public.whiteboard_folders p where p.id = parent_id and p.user_id = (select auth.uid())))
  );

create policy "owner can do everything" on public.whiteboards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (folder_id is null or exists (
      select 1 from public.whiteboard_folders f where f.id = folder_id and f.user_id = (select auth.uid())))
  );

create policy "owner can do everything" on public.whiteboard_files for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.whiteboards b where b.id = board_id and b.user_id = (select auth.uid()))
  );
