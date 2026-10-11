// Vault cryptography. Browser Web Crypto only: no third-party crypto code.
//
//   Vault Key (VK, 32 random bytes) ── encrypts every entry (AES-256-GCM, AAD binds user + row)
//   VK is stored only wrapped (AES-256-GCM) by:
//     · passkey KEK  = HKDF(WebAuthn PRF secret)   one per enrolled passkey
//     · recovery KEK = HKDF(32-byte recovery key)  shown to the user once
//
// Nothing here ever sees a password in plaintext except encryptEntry / decryptEntry's arguments.

type Bytes = Uint8Array<ArrayBuffer>

export interface Sealed { ciphertext: string; iv: string }
export interface VaultField { label: string; value: string; hidden: boolean }
export interface VaultEntry {
  title: string
  category: string
  username: string
  password: string
  url: string
  notes: string
  fields: VaultField[]
}

const enc = new TextEncoder()
const dec = new TextDecoder()
const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n))

// ── base64url ────────────────────────────────────────────────────────────────
export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function fromB64(text: string): Bytes {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0)) as Bytes
}

// ── keys ─────────────────────────────────────────────────────────────────────
export const newVaultKeyBytes = (): Bytes => random(32)

/** Entry-encryption key held in memory while unlocked. Non-extractable: page code can use it, never export it. */
export const importVaultKey = (raw: Bytes) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

export type KekPurpose = 'passkey' | 'recovery'

/** Key-encryption key from a high-entropy secret (PRF output or recovery key). */
export async function deriveKek(secret: Uint8Array, purpose: KekPurpose) {
  const ikm = await crypto.subtle.importKey('raw', new Uint8Array(secret) as Bytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('winter-arc/vault/v1'), info: enc.encode(`winter-arc/vault/${purpose}/v1`) },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

async function seal(key: CryptoKey, plaintext: Bytes, aad: string): Promise<Sealed> {
  const iv = random(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plaintext)
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) }
}
async function open(key: CryptoKey, box: Sealed, aad: string): Promise<Bytes> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: enc.encode(aad) }, key, fromB64(box.ciphertext))
  return new Uint8Array(pt) as Bytes
}

export const wrapVaultKey = (kek: CryptoKey, vk: Bytes, aad: string) => seal(kek, vk, aad)
export const unwrapVaultKey = (kek: CryptoKey, box: Sealed, aad: string) => open(kek, box, aad)

export const encryptEntry = (vk: CryptoKey, entry: VaultEntry, aad: string) => seal(vk, enc.encode(JSON.stringify(entry)) as Bytes, aad)
export const decryptEntry = async (vk: CryptoKey, box: Sealed, aad: string): Promise<VaultEntry> =>
  JSON.parse(dec.decode(await open(vk, box, aad)))

// ── AAD (binds ciphertext to its owner, purpose and row) ─────────────────────
export const aad = {
  passkey: (userId: string, credentialId: string) => `vault_key:passkey:${userId}:${credentialId}:v1`,
  recovery: (userId: string) => `vault_key:recovery:${userId}:v1`,
  item: (userId: string, itemId: string) => `vault_item:${userId}:${itemId}:v1`,
}

// ── recovery key: 32 random bytes as Crockford base32 + 20-bit checksum ──────
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const newRecoveryKey = (): Bytes => random(32)

function base32(bytes: Uint8Array) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** FNV-1a: not a security property, only catches typos when the key is typed back in. */
function checksum(bytes: Uint8Array) {
  let h = 0x811c9dc5
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0
  let out = ''
  for (let i = 3; i >= 0; i--) out += ALPHABET[(h >>> (i * 5)) & 31]
  return out
}

export function formatRecoveryKey(bytes: Uint8Array) {
  const chars = base32(bytes) + checksum(bytes)
  return 'WA-' + chars.match(/.{4}/g)!.join('-')
}

export function parseRecoveryKey(input: string): Bytes {
  const chars = input.toUpperCase().replace(/[\s-]/g, '').replace(/^WA/, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1')
  if (chars.length !== 56 || [...chars].some((c) => !ALPHABET.includes(c))) throw new Error("That isn't a complete recovery key.")
  const data = chars.slice(0, 52)
  const bytes: number[] = []
  let bits = 0, value = 0
  for (const c of data) {
    value = (value << 5) | ALPHABET.indexOf(c); bits += 5
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  if (value & ((1 << bits) - 1)) throw new Error('The recovery key has a typo.')
  const out = new Uint8Array(bytes) as Bytes
  if (checksum(out) !== chars.slice(52)) throw new Error('The recovery key has a typo. Check it character by character.')
  return out
}
