// Face ID / Touch ID passkeys used only to derive an encryption secret (WebAuthn PRF extension).
// Not used for login: Supabase auth still gates access to the (encrypted) rows.
import { fromB64, toB64 } from './crypto'

type Bytes = Uint8Array<ArrayBuffer>
type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n))

export class PasskeyError extends Error {}

const explain = (e: unknown) => {
  const name = (e as Error)?.name
  if (name === 'NotAllowedError') return new PasskeyError('Face ID was cancelled or timed out.')
  if (name === 'InvalidStateError') return new PasskeyError('This device already has a passkey for the vault.')
  return new PasskeyError((e as Error)?.message ?? 'Passkey failed.')
}

export async function passkeysSupported() {
  if (!window.PublicKeyCredential || !window.isSecureContext) return false
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
}

/** Ask the passkey for its PRF secret. All of a vault's passkeys share one salt, so plain `eval` works everywhere. */
export async function getPrfSecret(credentialIds: string[], salt: string): Promise<{ credentialId: string; secret: Bytes }> {
  let cred: PublicKeyCredential
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32), // not verified by a server: the PRF secret itself is the proof
        rpId: location.hostname,
        allowCredentials: credentialIds.map((id) => ({ type: 'public-key' as const, id: fromB64(id) })),
        userVerification: 'required',
        extensions: { prf: { eval: { first: fromB64(salt) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential
  } catch (e) { throw explain(e) }
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first
  if (!first) throw new PasskeyError("This browser didn't return the passkey secret. Use your recovery key here.")
  return { credentialId: toB64(new Uint8Array(cred.rawId)), secret: new Uint8Array(first) as Bytes }
}

/** Create a vault passkey and obtain its PRF secret (some platforms only return it on a follow-up get). */
export async function createPrfPasskey(salt: string, label: string): Promise<{ credentialId: string; secret: Bytes }> {
  let cred: PublicKeyCredential
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Winter Arc', id: location.hostname },
        user: { id: random(16), name: `Winter Arc passwords (${label})`, displayName: 'Winter Arc passwords' },
        challenge: random(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
        extensions: { prf: { eval: { first: fromB64(salt) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential
  } catch (e) { throw explain(e) }
  const credentialId = toB64(new Uint8Array(cred.rawId))
  const prf = (cred.getClientExtensionResults() as PrfResults).prf
  if (prf?.results?.first) return { credentialId, secret: new Uint8Array(prf.results.first) as Bytes }
  if (prf && prf.enabled === false) throw new PasskeyError("This device's passkeys can't produce an encryption key. Use your recovery key here.")
  return getPrfSecret([credentialId], salt)
}

export const newPrfSalt = () => toB64(random(32))
