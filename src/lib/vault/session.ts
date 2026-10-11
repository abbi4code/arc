// The unlocked vault lives only in memory: a non-extractable CryptoKey. Locking drops it.
import { useEffect, useSyncExternalStore } from 'react'

let vaultKey: CryptoKey | null = null
let pendingLock: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const vaultSession = {
  key: () => vaultKey,
  unlock(key: CryptoKey) { vaultKey = key; emit() },
  lock() { if (vaultKey) { vaultKey = null; emit() } },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
}

export const useVaultKey = () => useSyncExternalStore(vaultSession.subscribe, vaultSession.key)

export const IDLE_LOCK_MS = 3 * 60_000
export const BACKGROUND_LOCK_MS = 30_000

/** Lock after idle time, shortly after the app goes to the background, and when the screen unmounts. */
export function useAutoLock(active: boolean, idleMs = IDLE_LOCK_MS, backgroundMs = BACKGROUND_LOCK_MS) {
  useEffect(() => {
    if (!active) return
    clearTimeout(pendingLock) // re-mounted (React dev StrictMode): keep the vault open
    let idle = setTimeout(vaultSession.lock, idleMs)
    let hidden: ReturnType<typeof setTimeout> | undefined
    const activity = () => { clearTimeout(idle); idle = setTimeout(vaultSession.lock, idleMs) }
    const visibility = () => {
      clearTimeout(hidden)
      if (document.visibilityState === 'hidden') hidden = setTimeout(vaultSession.lock, backgroundMs)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearTimeout(idle); clearTimeout(hidden)
      events.forEach((e) => window.removeEventListener(e, activity, { capture: true }))
      document.removeEventListener('visibilitychange', visibility)
      pendingLock = setTimeout(vaultSession.lock, 0) // leaving the screen locks the vault
    }
  }, [active, idleMs, backgroundMs])
}

/** Copy a secret and clear the clipboard after 30 s if it still holds it (best effort; needs page focus). */
export async function copySecret(value: string, clearAfterMs = 30_000) {
  await navigator.clipboard.writeText(value)
  setTimeout(async () => {
    try {
      if (!document.hasFocus()) return
      const current = await navigator.clipboard.readText().catch(() => value)
      if (current === value) await navigator.clipboard.writeText('')
    } catch { /* clipboard access can be denied; nothing else to do */ }
  }, clearAfterMs)
}
