-- Fix: the folders policy looked up whiteboard_folders from inside its own policy ("infinite recursion").
-- Check parent ownership through a definer function instead, which reads the table without re-entering RLS.
create or replace function public.owns_whiteboard_folder(folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.whiteboard_folders f where f.id = folder and f.user_id = (select auth.uid()))
$$;

revoke execute on function public.owns_whiteboard_folder(uuid) from public, anon;
grant execute on function public.owns_whiteboard_folder(uuid) to authenticated;

drop policy "owner can do everything" on public.whiteboard_folders;
create policy "owner can do everything" on public.whiteboard_folders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (parent_id is null or public.owns_whiteboard_folder(parent_id)));
