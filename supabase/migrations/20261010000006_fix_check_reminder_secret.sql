-- Fix: inside the body, `secret` resolved to vault.decrypted_secrets.secret (the encrypted column),
-- not the parameter, so the check always failed. Reference the parameter positionally.
create or replace function public.check_reminder_secret(secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'reminders_secret' and s.decrypted_secret = $1
  )
$$;
