import { lazy, type ComponentType } from 'react'

/**
 * React.lazy that renders synchronously once preloaded. Plain lazy() always suspends on first render,
 * and React 19 holds a revealed Suspense boundary for up to ~300ms, a visible delay even when the
 * chunk is already in the service-worker cache.
 */
export function preloadable<P extends object>(factory: () => Promise<{ default: ComponentType<P> }>) {
  let Loaded: ComponentType<P> | null = null
  let pending: Promise<unknown> | null = null
  const preload = () => (pending ??= factory().then((m) => { Loaded = m.default }))
  const Lazy = lazy(() => preload().then(() => ({ default: Loaded! })))
  const Component = (props: P) => (Loaded ? <Loaded {...props} /> : <Lazy {...props} />)
  return Object.assign(Component, { preload })
}
