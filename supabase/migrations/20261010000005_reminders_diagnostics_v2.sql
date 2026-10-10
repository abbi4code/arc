-- Also report which role definer functions run as and whether that role can decrypt the shared secret.
create or replace function public.reminders_diagnostics()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'definer_role', current_user,
    'secret_rows', (select count(*) from vault.secrets where name = 'reminders_secret'),
    'secret_decryptable', (select bool_and(decrypted_secret is not null) from vault.decrypted_secrets where name = 'reminders_secret'),
    'secret_length', (select max(length(decrypted_secret)) from vault.decrypted_secrets where name = 'reminders_secret'),
    'jobs', (select jsonb_agg(to_jsonb(j) - 'command') from cron.job j),
    'runs', (select jsonb_agg(x) from (
      select d.jobid, d.status, d.return_message, d.start_time
      from cron.job_run_details d order by d.start_time desc limit 3) x),
    'responses', (select jsonb_agg(x) from (
      select r.id, r.status_code, left(r.content, 300) as content, r.error_msg, r.created
      from net._http_response r order by r.created desc limit 3) x)
  )
$$;
