// THROWAWAY SPIKE (not part of the vault): checks whether this device/browser can derive a stable
// encryption secret from a Face ID / Touch ID passkey via the WebAuthn PRF extension.
// Open https://<app>/vault-check in the installed iPhone app and on the Mac. Delete after the vault ships.
import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives'

const KEY = 'vault-check'
const enc = new TextEncoder()
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

type Line = { ok: boolean | null; text: string }

export default function VaultCheck() {
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const log = (ok: boolean | null, text: string) => setLines((l) => [...l, { ok, text }])

  useEffect(() => {
    (async () => {
      const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
      log(null, `Device: ${navigator.userAgent}`)
      log(null, `Running as installed app: ${standalone ? 'yes' : 'no (browser tab)'}`)
      log(window.isSecureContext, `Secure context: ${window.isSecureContext}`)
      log(!!window.PublicKeyCredential, `Passkeys API available: ${!!window.PublicKeyCredential}`)
      if (window.PublicKeyCredential) {
        const uv = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
        log(uv, `Face ID / Touch ID authenticator available: ${uv}`)
        const caps = await (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> })
          .getClientCapabilities?.().catch(() => null)
        if (caps) log(caps['extension:prf'] ?? null, `Browser says PRF supported: ${caps['extension:prf'] ?? 'not reported'}`)
      }
    })()
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const salt = rand(32)
      const cred = (await navigator.credentials.create({
        publicKey: {
          rp: { name: 'Winter Arc (vault test)', id: location.hostname },
          user: { id: rand(16), name: 'vault-test', displayName: 'Winter Arc vault test' },
          challenge: rand(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
          extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential
      const prf = (cred.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }).prf
      log(prf?.enabled ?? (prf?.results ? true : null), `Passkey created. PRF enabled: ${prf?.enabled ?? 'not reported'}${prf?.results?.first ? ' · secret returned at creation' : ''}`)
      const data = JSON.stringify({ id: b64(cred.rawId), salt: b64(salt) })
      localStorage.setItem(KEY, data)
      setSaved(data)
    } catch (e) {
      log(false, `Create failed: ${(e as Error).name}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const unlockOnce = async (id: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>) => {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential
    return (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf?.results?.first ?? null
  }

  const unlock = async () => {
    if (!saved) return
    setBusy(true)
    try {
      const { id, salt } = JSON.parse(saved)
      const a = await unlockOnce(unb64(id), unb64(salt))
      if (!a) { log(false, 'Unlock #1: no PRF secret returned → Face ID unlock will NOT work here'); return }
      log(a.byteLength === 32, `Unlock #1: got ${a.byteLength}-byte secret (fingerprint ${hex(await crypto.subtle.digest('SHA-256', a)).slice(0, 12)})`)
      const b = await unlockOnce(unb64(id), unb64(salt))
      const same = !!b && hex(a) === hex(b)
      log(same, `Unlock #2: ${b ? 'secret returned' : 'no secret'} · same as #1: ${same}`)
      // Derive an AES key exactly like the vault will and round-trip a message
      const ikm = await crypto.subtle.importKey('raw', a, 'HKDF', false, ['deriveKey'])
      const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('winter-arc vault-check') },
        ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      const iv = rand(12)
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode('hello vault'))
      const pt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
      log(pt === 'hello vault', `Encrypt → decrypt with the derived key: ${pt === 'hello vault' ? 'works' : 'FAILED'}`)
      log(same && pt === 'hello vault', same && pt === 'hello vault' ? '✅ This device can unlock the vault with Face ID / Touch ID.' : '❌ Face ID unlock is not usable here.')
    } catch (e) {
      log(false, `Unlock failed: ${(e as Error).name}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const report = lines.map((l) => `${l.ok === null ? '•' : l.ok ? '✓' : '✗'} ${l.text}`).join('\n')

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-xl font-semibold">Vault device check</h1>
      <p className="mt-1 text-sm text-muted">Test only. Creates a passkey named “Winter Arc vault test”. You can delete it later in Settings → Passwords.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={create}>1 · Create test passkey</Button>
        <Button variant="subtle" disabled={busy || !saved} onClick={unlock}>2 · Unlock with Face ID (twice)</Button>
        <Button variant="ghost" disabled={!lines.length} onClick={() => navigator.clipboard.writeText(report)}>Copy report</Button>
      </div>
      <ul className="mt-6 grid gap-2 font-mono text-xs" data-testid="vault-check-log">
        {lines.map((l, i) => (
          <li key={i} className={l.ok === null ? 'text-muted' : l.ok ? 'text-fg' : 'text-danger'}>
            {l.ok === null ? '•' : l.ok ? '✓' : '✗'} {l.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
