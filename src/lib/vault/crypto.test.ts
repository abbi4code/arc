// @vitest-environment node
import {
  decryptEntry, deriveKek, encryptEntry, formatRecoveryKey, importVaultKey, newRecoveryKey,
  newVaultKeyBytes, parseRecoveryKey, unwrapVaultKey, wrapVaultKey, toB64, fromB64, type VaultEntry,
} from './crypto'

const entry: VaultEntry = {
  title: 'HDFC NetBanking', category: 'Bank', username: 'cust-1234', password: 'S3cr3t!pass', url: 'https://netbanking.hdfcbank.com',
  notes: 'Branch: MG Road', fields: [{ label: 'MPIN', value: '4321', hidden: true }],
}

describe('base64url', () => {
  it('round-trips bytes', () => {
    const b = crypto.getRandomValues(new Uint8Array(37))
    expect(fromB64(toB64(b))).toEqual(b)
    expect(toB64(new Uint8Array([251, 255]))).not.toMatch(/[+/=]/)
  })
})

describe('vault key wrapping', () => {
  it('wraps and unwraps the vault key with a passkey- or recovery-derived key', async () => {
    const vk = newVaultKeyBytes()
    const kek = await deriveKek(crypto.getRandomValues(new Uint8Array(32)), 'passkey')
    const w = await wrapVaultKey(kek, vk, 'aad:1')
    expect(await unwrapVaultKey(kek, w, 'aad:1')).toEqual(vk)
  })
  it('rejects the wrong secret, wrong purpose, wrong AAD, or tampering', async () => {
    const vk = newVaultKeyBytes()
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const kek = await deriveKek(secret, 'passkey')
    const w = await wrapVaultKey(kek, vk, 'aad:1')
    await expect(unwrapVaultKey(await deriveKek(crypto.getRandomValues(new Uint8Array(32)), 'passkey'), w, 'aad:1')).rejects.toThrow()
    await expect(unwrapVaultKey(await deriveKek(secret, 'recovery'), w, 'aad:1')).rejects.toThrow()
    await expect(unwrapVaultKey(kek, w, 'aad:2')).rejects.toThrow()
    const ct = fromB64(w.ciphertext); ct[0] ^= 1
    await expect(unwrapVaultKey(kek, { ...w, ciphertext: toB64(ct) }, 'aad:1')).rejects.toThrow()
  })
})

describe('entries', () => {
  it('round-trips an entry and produces no plaintext in the ciphertext', async () => {
    const vk = await importVaultKey(newVaultKeyBytes())
    const box = await encryptEntry(vk, entry, 'user:item-1')
    const raw = JSON.stringify(box)
    for (const secret of ['HDFC', 'cust-1234', 'S3cr3t', 'MPIN', '4321', 'Bank']) expect(raw).not.toContain(secret)
    expect(await decryptEntry(vk, box, 'user:item-1')).toEqual(entry)
  })
  it('uses a fresh IV every time', async () => {
    const vk = await importVaultKey(newVaultKeyBytes())
    const a = await encryptEntry(vk, entry, 'x'), b = await encryptEntry(vk, entry, 'x')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
  it('rejects a ciphertext moved to another row (AAD) or encrypted with another key', async () => {
    const vk = await importVaultKey(newVaultKeyBytes())
    const box = await encryptEntry(vk, entry, 'user:item-1')
    await expect(decryptEntry(vk, box, 'user:item-2')).rejects.toThrow()
    await expect(decryptEntry(await importVaultKey(newVaultKeyBytes()), box, 'user:item-1')).rejects.toThrow()
  })
  it('keeps the imported vault key non-extractable', async () => {
    const vk = await importVaultKey(newVaultKeyBytes())
    expect(vk.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', vk)).rejects.toThrow()
  })
})

describe('recovery key', () => {
  it('formats as WA- groups and parses back, forgiving case, spaces and look-alike characters', () => {
    const bytes = newRecoveryKey()
    const text = formatRecoveryKey(bytes)
    expect(text).toMatch(/^WA(-[0-9A-HJKMNP-TV-Z]{4}){14}$/)
    expect(parseRecoveryKey(text)).toEqual(bytes)
    const sloppy = ` ${text.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l')} `
    expect(parseRecoveryKey(sloppy)).toEqual(bytes)
  })
  it('detects typos via the checksum', () => {
    const text = formatRecoveryKey(newRecoveryKey())
    const i = text.length - 8
    const typo = text.slice(0, i) + (text[i] === 'A' ? 'B' : 'A') + text.slice(i + 1)
    expect(() => parseRecoveryKey(typo)).toThrow(/typo/i)
    expect(() => parseRecoveryKey('WA-1234')).toThrow()
  })
})
