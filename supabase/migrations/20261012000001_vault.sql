-- End-to-end encrypted password vault. The server only ever stores ciphertext:
-- entries are encrypted on-device with a Vault Key that is stored only wrapped (by a passkey PRF
-- secret or the user's recovery key). See docs/superpowers/specs/2026-10-12-password-vault-design.md.

create table public.vault (
  user_id               uuid primary key default auth.uid() references auth.users on delete cascade,
  recovery_wrapped_key  text not null,
  recovery_iv           text not null,
  version               smallint not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.vault_passkeys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  credential_id  text not null unique,
  prf_salt       text not null,
  wrapped_key    text not null,
  iv             text not null,
  label          text not null default 'Passkey' check (length(label) <= 60),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.vault_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  ciphertext  text not null,
  iv          text not null,
  version     smallint not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index vault_passkeys_user_idx on public.vault_passkeys (user_id);
create index vault_items_user_idx on public.vault_items (user_id);

do $$
declare t text;
begin
  foreach t in array array['vault', 'vault_passkeys', 'vault_items'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner can do everything" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
