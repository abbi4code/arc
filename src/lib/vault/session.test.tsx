import { act, renderHook } from '@testing-library/react'
import { useAutoLock, vaultSession } from './session'

const fakeKey = {} as CryptoKey
const setVisibility = (v: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('vault auto-lock', () => {
  beforeEach(() => { vi.useFakeTimers(); vaultSession.unlock(fakeKey) })
  afterEach(() => { vi.useRealTimers(); vaultSession.lock(); setVisibility('visible') })

  it('locks after the idle timeout, and activity resets it', () => {
    renderHook(() => useAutoLock(true, 1000, 500))
    act(() => { vi.advanceTimersByTime(800) })
    act(() => { window.dispatchEvent(new Event('pointerdown')) })
    act(() => { vi.advanceTimersByTime(800) })
    expect(vaultSession.key()).toBe(fakeKey)
    act(() => { vi.advanceTimersByTime(300) })
    expect(vaultSession.key()).toBeNull()
  })
  it('locks shortly after the app is backgrounded, but not if it comes back first', () => {
    renderHook(() => useAutoLock(true, 60_000, 500))
    act(() => { setVisibility('hidden'); vi.advanceTimersByTime(300); setVisibility('visible'); vi.advanceTimersByTime(1000) })
    expect(vaultSession.key()).toBe(fakeKey)
    act(() => { setVisibility('hidden'); vi.advanceTimersByTime(500) })
    expect(vaultSession.key()).toBeNull()
  })
  it('locks when the screen unmounts', () => {
    const { unmount } = renderHook(() => useAutoLock(true))
    unmount()
    act(() => { vi.advanceTimersByTime(1) })
    expect(vaultSession.key()).toBeNull()
  })
})
