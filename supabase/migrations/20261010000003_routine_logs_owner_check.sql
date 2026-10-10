-- A routine log may only reference one of the caller's own routines.
drop policy "owner can do everything" on public.routine_logs;
create policy "owner can do everything" on public.routine_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid()))
  );
