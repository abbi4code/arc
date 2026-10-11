# Password vault — design

Date: 2026-10-12 · Status: design approved in chat; device check (`/vault-check`) pending on iPhone PWA + Mac

## Goal

Store bank/email/other credentials inside Winter Arc (Settings → Passwords) with end-to-end encryption:
the server (Supabase), anyone holding database or service-role keys, and Vercel can never read entries.
Unlock with Face ID / Touch ID on iPhone + Mac; a recovery key covers a lost passkey.

## Non-goals (v1)

Password generator, password health, browser autofill, sharing, TOTP/2FA codes, import/export.

## Key hierarchy

- **Vault Key (VK)** — random AES-256-GCM key generated on-device at setup (`crypto.subtle.generateKey`,
  extractable only for wrapping). Never stored or transmitted unwrapped.
- **Passkey KEK** — per enrolled passkey: WebAuthn PRF output (32 bytes) for a random 32-byte salt →
  HKDF-SHA256 (info `winter-arc/vault/passkey/v1`) → AES-256-GCM key used to wrap VK.
  Passkey: `residentKey: required`, `userVerification: required`, platform authenticator, `rp.id = location.hostname`.
- **Recovery KEK** — recovery key = 32 random bytes, shown once as `WA-` + Crockford base32 groups with a
  checksum (catches typos). High entropy, so HKDF-SHA256 (info `winter-arc/vault/recovery/v1`) suffices.
- Wrapping = AES-GCM encrypt of the raw VK with a fresh 12-byte IV; AAD binds the purpose + user id.
- **Entries** — one JSON blob per entry `{ title, category, username, password, url, notes, fields: [{label, value, hidden}] }`,
  encrypted with VK (AES-256-GCM, fresh 12-byte IV, AAD = `vault_item:<user_id>:<item_id>:v1`).
  Titles/categories are encrypted too; search runs over decrypted entries in memory.
- Only the browser's Web Crypto API; no crypto dependencies in vault code.

## Data (RLS: owner-only, as all tables)

| table | columns |
|---|---|
| `vault` | `user_id` PK, `recovery_wrapped_key`, `recovery_iv`, `version`, timestamps |
| `vault_passkeys` | `id`, `user_id`, `credential_id` (unique), `prf_salt`, `wrapped_key`, `iv`, `label`, timestamps |
| `vault_items` | `id`, `user_id`, `ciphertext`, `iv`, `version`, timestamps |

All binary values are base64url text. No plaintext columns besides ids/timestamps/labels (label is e.g. "iPhone").

## Runtime rules

- Unlocked VK is held as a non-extractable `CryptoKey` in memory only; decrypted entries live only in the
  Passwords screen's React state.
- Lock: 3 min idle, ~30 s after the app is backgrounded, on leaving the Passwords screen, or manual Lock.
  Locking drops the key and all decrypted state.
- Offline cache / offline queue may hold vault rows because they are ciphertext; encryption happens before
  a mutation is queued. Vault works offline once unlocked.
- Copy to clipboard → best-effort clear after 30 s (only if the page is still focused).
- Vercel security headers: CSP `default-src 'self'`, `script-src 'self' 'sha256-<theme script>'`,
  `connect-src 'self' https://<project>.supabase.co`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`,
  `font-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`; plus `X-Frame-Options: DENY`,
  `Permissions-Policy` (camera/mic/geolocation off).

## Screens (Settings → Passwords, route `/settings/passwords`)

- **Setup**: explanation → "Create vault with Face ID" (create passkey, get PRF secret, generate VK, wrap twice)
  → recovery key shown with Copy / Download; confirm by typing its last 4 characters.
- **Locked**: Unlock with Face ID · Use recovery key.
- **Unlocked**: search, category chips (Bank, Email, Social, Work, Other + custom), entry list; entry sheet with
  reveal 👁 and copy 📋 per field; add/edit form with custom fields (label, value, hidden toggle).
- **Manage**: add this device's passkey, remove passkeys, replace recovery key (re-wrap VK), delete vault.

## Failure modes

- Lost passkey **and** recovery key → vault unrecoverable (by design).
- Domain change → passkeys stop matching; unlock with recovery key and enroll a new passkey.
- Device without PRF → recovery-key unlock only on that device.
- Replacing the recovery key re-wraps the same Vault Key: the old key no longer opens the live vault, but would
  still open an *old copy* of the wrapped key (e.g. a backup taken before the change). A full re-key (new VK,
  re-encrypt all entries, re-enroll passkeys) is a possible v2 if that threat matters.

## Testing

- Unit (Node Web Crypto): entry round-trip; wrong key, tampered ciphertext, swapped row id (AAD) all rejected;
  VK wrap/unwrap via passkey KEK and recovery KEK; recovery key encode/decode + checksum.
- E2E with Chrome's virtual authenticator (`hasPrf: true`): setup → add entry → lock → Face ID unlock →
  recovery-key unlock → replace recovery key; idle auto-lock.
- Ciphertext scan: after E2E, read the user's vault rows with the service role and assert no plaintext
  (titles, usernames, passwords used in the test) appears anywhere.
- RLS script extended to the vault tables.
