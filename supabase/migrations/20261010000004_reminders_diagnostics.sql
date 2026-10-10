-- Service-role-only view into the reminder cron: recent job runs and HTTP responses from the Edge Function.
create or replace function public.reminders_diagnostics()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'jobs', (select jsonb_agg(to_jsonb(j) - 'command') from cron.job j),
    'runs', (select jsonb_agg(x) from (
      select d.jobid, d.status, d.return_message, d.start_time
      from cron.job_run_details d order by d.start_time desc limit 5) x),
    'responses', (select jsonb_agg(x) from (
      select r.id, r.status_code, left(r.content, 300) as content, r.error_msg, r.created
      from net._http_response r order by r.created desc limit 5) x)
  )
$$;

revoke execute on function public.reminders_diagnostics() from public, anon, authenticated;
grant execute on function public.reminders_diagnostics() to service_role;
