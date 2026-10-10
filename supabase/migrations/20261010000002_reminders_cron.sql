-- Every minute, pg_cron calls the send-reminders Edge Function via pg_net.
-- The shared secret is generated here, server-side, and lives only in Vault (never in git).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'reminders_secret',
  'Shared secret between pg_cron and the send-reminders Edge Function'
);

-- Lets the Edge Function (service role) verify the header without reading Vault directly.
create or replace function public.check_reminder_secret(secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'reminders_secret' and decrypted_secret = secret
  )
$$;

revoke execute on function public.check_reminder_secret(text) from public, anon, authenticated;
grant execute on function public.check_reminder_secret(text) to service_role;

-- NOTE: project-specific URL. Update this when moving to a new Supabase project.
select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ljsjbkrsysgeorcqcxzz.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Keep the dedupe log small.
select cron.schedule('prune-reminder-log', '17 3 * * *', $$ delete from public.reminder_log where sent_at < now() - interval '14 days' $$);
