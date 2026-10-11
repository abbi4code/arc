// Vault operations: setup, unlock, device passkeys, recovery key. All crypto stays on-device.
import { supabase } from '../supabase'
import type { VaultPasskeyRow, VaultRow } from '../data'
import {
  aad, deriveKek, formatRecoveryKey, importVaultKey, newRecoveryKey, newVaultKeyBytes, parseRecoveryKey,
  unwrapVaultKey, wrapVaultKey,
} from './crypto'
import { createPrfPasskey, getPrfSecret, newPrfSalt, PasskeyError } from './passkey'

type Bytes = Uint8Array<ArrayBuffer>
export type Meta = { vault: VaultRow | null; passkeys: VaultPasskeyRow[] }
export type Proof = { kind: 'passkey' } | { kind: 'recovery'; text: string }

const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data }

export function deviceLabel() {
  const ua = navigator.userAgent
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : 'This device'
}

/** Raw Vault Key from a fresh proof. Callers must zero it (`.fill(0)`) as soon as they are done. */
async function rawVaultKey(userId: string, meta: Meta, proof: Proof): Promise<Bytes> {
  if (!meta.vault) throw new Error('No vault yet.')
  if (proof.kind === 'recovery') {
    const kek = await deriveKek(parseRecoveryKey(proof.text), 'recovery')
    try {
      return await unwrapVaultKey(kek, { ciphertext: meta.vault.recovery_wrapped_key, iv: meta.vault.recovery_iv }, aad.recovery(userId))
    } catch { throw new Error("That recovery key doesn't open this vault.") }
  }
  if (!meta.passkeys.length) throw new PasskeyError('No passkey is set up yet. Use your recovery key.')
  const { credentialId, secret } = await getPrfSecret(meta.passkeys.map((p) => p.credential_id), meta.passkeys[0].prf_salt)
  const row = meta.passkeys.find((p) => p.credential_id === credentialId)
  if (!row) throw new PasskeyError('That passkey is not registered for this vault.')
  const kek = await deriveKek(secret, 'passkey')
  secret.fill(0)
  try {
    return await unwrapVaultKey(kek, { ciphertext: row.wrapped_key, iv: row.iv }, aad.passkey(userId, credentialId))
  } catch { throw new PasskeyError("This passkey couldn't open the vault.") }
}

export async function unlock(userId: string, meta: Meta, proof: Proof): Promise<CryptoKey> {
  const raw = await rawVaultKey(userId, meta, proof)
  try { return await importVaultKey(raw) } finally { raw.fill(0) }
}

/** First-time setup: passkey + recovery key, both wrapping a fresh Vault Key. Returns the recovery key text once. */
export async function setupVault(userId: string, label = deviceLabel()) {
  const salt = newPrfSalt()
  const { credentialId, secret } = await createPrfPasskey(salt, label)
  const raw = newVaultKeyBytes()
  const recovery = newRecoveryKey()
  try {
    const pk = await wrapVaultKey(await deriveKek(secret, 'passkey'), raw, aad.passkey(userId, credentialId))
    const rec = await wrapVaultKey(await deriveKek(recovery, 'recovery'), raw, aad.recovery(userId))
    must(await supabase.from('vault').insert({ recovery_wrapped_key: rec.ciphertext, recovery_iv: rec.iv }))
    const added = await supabase.from('vault_passkeys').insert({ credential_id: credentialId, prf_salt: salt, wrapped_key: pk.ciphertext, iv: pk.iv, label })
    if (added.error) { await supabase.from('vault').delete().eq('user_id', userId); throw new Error(added.error.message) }
    return { key: await importVaultKey(raw), recoveryKey: formatRecoveryKey(recovery) }
  } finally {
    raw.fill(0); secret.fill(0); recovery.fill(0)
  }
}

/** Add this device's own passkey (e.g. a Mac whose passkeys don't sync from the iPhone). */
export async function addPasskey(userId: string, meta: Meta, proof: Proof, label = deviceLabel()) {
  const raw = await rawVaultKey(userId, meta, proof)
  try {
    const salt = meta.passkeys[0]?.prf_salt ?? newPrfSalt()
    const { credentialId, secret } = await createPrfPasskey(salt, label)
    const pk = await wrapVaultKey(await deriveKek(secret, 'passkey'), raw, aad.passkey(userId, credentialId))
    secret.fill(0)
    must(await supabase.from('vault_passkeys').insert({ credential_id: credentialId, prf_salt: salt, wrapped_key: pk.ciphertext, iv: pk.iv, label }))
  } finally { raw.fill(0) }
}

/** New recovery key; the old one stops working immediately. Returns the new key text once. */
export async function replaceRecoveryKey(userId: string, meta: Meta, proof: Proof) {
  const raw = await rawVaultKey(userId, meta, proof)
  const recovery = newRecoveryKey()
  try {
    const rec = await wrapVaultKey(await deriveKek(recovery, 'recovery'), raw, aad.recovery(userId))
    must(await supabase.from('vault').update({ recovery_wrapped_key: rec.ciphertext, recovery_iv: rec.iv }).eq('user_id', userId))
    return formatRecoveryKey(recovery)
  } finally { raw.fill(0); recovery.fill(0) }
}

export async function removePasskey(id: string) {
  must(await supabase.from('vault_passkeys').delete().eq('id', id))
}

/** Permanently delete every entry, passkey row and the vault itself. */
export async function deleteVault(userId: string) {
  must(await supabase.from('vault_items').delete().eq('user_id', userId))
  must(await supabase.from('vault_passkeys').delete().eq('user_id', userId))
  must(await supabase.from('vault').delete().eq('user_id', userId))
}
