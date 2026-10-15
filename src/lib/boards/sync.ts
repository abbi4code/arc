// Latest-draft sync for board scenes.
//
// Every edit is written to this device first (IndexedDB), then only the newest draft is uploaded with a
// version check: `update … where version = baseVersion`. If another device saved in between, nothing
// matches; we fetch the server copy, merge per shape (Excalidraw's reconcileElements: the newer edit of
// each shape wins) and upload again. Drawing for an hour offline is therefore one upload, never a queue
// of full scenes, and two devices editing the same board don't overwrite each other.
//
// No Excalidraw imports here: the merge function is loaded lazily, so the app shell can run background sync.
import type { Draft, Elements, SavedAppState, SavedScene } from './store'

export type ReconcileFn = (local: Elements, remote: Elements, appState?: unknown) => Elements

export interface SyncDeps {
  drafts: { get(id: string): Promise<Draft | undefined>; set(id: string, d: Draft): Promise<void>; dirtyIds(): Promise<string[]> }
  api: {
    /** Conditional update; resolves to the new row or null when the version didn't match / row is gone. */
    update(id: string, scene: SavedScene, baseVersion: number, thumbnail?: string): Promise<{ version: number; updated_at?: string } | null>
    fetch(id: string): Promise<{ scene: SavedScene; version: number } | null>
  }
  isOnline(): boolean
  /** The board's own insert is still waiting in the offline queue. */
  insertPending(id: string): boolean
  loadReconcile(): Promise<ReconcileFn>
  onPushed?(id: string, row: { updated_at?: string; thumbnail?: string }): void
  now?(): number
}

export type SyncState = 'saved' | 'saving' | 'offline' | 'retrying' | 'deleted'
/** mergedAt: our edits were merged with another device's · remoteAt: any server copy was applied (e.g. to fetch new images). */
export interface BoardStatus { state: SyncState; mergedAt?: number; remoteAt?: number; large?: boolean }

/** Hooks an open editor provides. */
export interface EditorHooks {
  /** Apply a merged or newer server scene to the canvas. */
  onRemote(elements: Elements, appState: SavedAppState): void
  getAppState?(): unknown
  /** Render a thumbnail data URL (or undefined to skip). */
  thumbnail?(): Promise<string | undefined>
}

export const WRITE_MS = 300
export const IDLE_MS = 2000
export const MAX_MS = 10_000
export const THUMB_MS = 30_000
export const RETRY_MS = [5000, 15_000, 60_000]
export const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000
export const LARGE_CHARS = 5_000_000

type Live = {
  draft: Draft
  seq: number
  writeTimer?: ReturnType<typeof setTimeout>
  idleTimer?: ReturnType<typeof setTimeout>
  maxTimer?: ReturnType<typeof setTimeout>
  retryTimer?: ReturnType<typeof setTimeout>
  inflight?: Promise<void>
  again: boolean
  retries: number
  thumbAt: number
  hooks?: EditorHooks
}

export type OpenResult =
  | { kind: 'ready'; draft: Draft }
  | { kind: 'missing' } // deleted on the server
  | { kind: 'unavailable' } // offline and never opened on this device

const emptyScene = (): SavedScene => ({ elements: [], appState: {} })
const SAVED: BoardStatus = { state: 'saved' } // stable snapshot for useSyncExternalStore

export function createBoardSync(deps: SyncDeps) {
  const now = deps.now ?? Date.now
  const live = new Map<string, Live>()
  const statuses = new Map<string, BoardStatus>()
  const listeners = new Map<string, Set<() => void>>()

  const setStatus = (id: string, patch: Partial<BoardStatus>) => {
    statuses.set(id, { ...(statuses.get(id) ?? SAVED), ...patch })
    listeners.get(id)?.forEach((l) => l())
  }
  const ensure = (id: string, draft: Draft) => {
    let l = live.get(id)
    if (!l) live.set(id, (l = { draft, seq: 0, again: false, retries: 0, thumbAt: 0 }))
    return l
  }
  const write = (id: string) => {
    const l = live.get(id)
    if (!l) return Promise.resolve()
    clearTimeout(l.writeTimer)
    l.writeTimer = undefined
    return deps.drafts.set(id, l.draft)
  }
  const prune = (elements: Elements) => {
    const cutoff = now() - TOMBSTONE_MS
    return elements.filter((e) => !e.isDeleted || (e.updated ?? 0) > cutoff)
  }

  /** Server copy is newer: take it as-is when we have no edits, otherwise merge per shape. */
  async function absorb(id: string, server: { scene: SavedScene; version: number }) {
    const l = live.get(id)!
    if (!l.draft.dirty) {
      l.draft = { ...server.scene, baseVersion: server.version, dirty: false, savedAt: now() }
      await write(id)
      l.hooks?.onRemote(l.draft.elements, l.draft.appState)
      setStatus(id, { remoteAt: now() })
      return
    }
    const reconcile = await deps.loadReconcile()
    // Read the local draft only now (after the await), so edits made meanwhile are part of the merge.
    const merged = reconcile(l.draft.elements, server.scene.elements, l.hooks?.getAppState?.())
    l.draft = { elements: merged, appState: { ...server.scene.appState, ...l.draft.appState }, baseVersion: server.version, dirty: true, savedAt: now() }
    l.seq++
    await write(id)
    l.hooks?.onRemote(merged, l.draft.appState)
    setStatus(id, { mergedAt: now(), remoteAt: now() })
  }

  async function pushOnce(id: string) {
    const l = live.get(id)
    if (!l || !l.draft.dirty || statuses.get(id)?.state === 'deleted') return
    clearTimeout(l.idleTimer); clearTimeout(l.maxTimer); clearTimeout(l.retryTimer)
    l.idleTimer = l.maxTimer = l.retryTimer = undefined
    if (!deps.isOnline()) return setStatus(id, { state: 'offline' })
    if (deps.insertPending(id)) {
      setStatus(id, { state: 'saving' })
      l.retryTimer = setTimeout(() => push(id), 1500)
      return
    }
    setStatus(id, { state: 'saving' })
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const seq = l.seq
        const base = l.draft.baseVersion
        const scene: SavedScene = { elements: prune(l.draft.elements), appState: l.draft.appState }
        let thumbnail: string | undefined
        if (l.hooks?.thumbnail && now() - l.thumbAt >= THUMB_MS) {
          thumbnail = await l.hooks.thumbnail().catch(() => undefined)
          if (thumbnail) l.thumbAt = now()
        }
        const row = await deps.api.update(id, scene, base, thumbnail)
        if (row) {
          l.draft = { ...l.draft, baseVersion: row.version, dirty: l.seq !== seq, savedAt: now() }
          l.retries = 0
          await write(id)
          deps.onPushed?.(id, { updated_at: row.updated_at, ...(thumbnail && { thumbnail }) })
          setStatus(id, { state: l.draft.dirty ? 'saving' : 'saved', large: JSON.stringify(scene).length > LARGE_CHARS })
          if (l.draft.dirty) schedule(id)
          return
        }
        if (thumbnail) l.thumbAt = 0 // the rejected upload carried it; render again for the retry
        const server = await deps.api.fetch(id)
        if (!server) {
          if (deps.insertPending(id)) { l.retryTimer = setTimeout(() => push(id), 1500); return }
          return setStatus(id, { state: 'deleted' })
        }
        await absorb(id, server)
      }
      schedule(id) // still conflicting after 3 merges: try again shortly
    } catch {
      if (!deps.isOnline()) return setStatus(id, { state: 'offline' })
      const delay = RETRY_MS[Math.min(l.retries, RETRY_MS.length - 1)]
      l.retries++
      setStatus(id, { state: 'retrying' })
      l.retryTimer = setTimeout(() => push(id), delay)
    }
  }

  /** One upload at a time per board; a request made during an upload runs right after it. */
  function push(id: string): Promise<void> {
    const l = live.get(id)
    if (!l) return Promise.resolve()
    if (l.inflight) { l.again = true; return l.inflight }
    l.inflight = pushOnce(id).finally(() => {
      l.inflight = undefined
      if (l.again) { l.again = false; void push(id) }
    })
    return l.inflight
  }

  function schedule(id: string) {
    const l = live.get(id)!
    clearTimeout(l.idleTimer)
    l.idleTimer = setTimeout(() => push(id), IDLE_MS)
    l.maxTimer ??= setTimeout(() => push(id), MAX_MS)
  }

  return {
    status: (id: string): BoardStatus => statuses.get(id) ?? SAVED,
    subscribe(id: string, l: () => void) {
      const set = listeners.get(id) ?? listeners.set(id, new Set()).get(id)!
      set.add(l)
      return () => { set.delete(l) }
    },

    /** Load a board for editing: this device's draft first, otherwise the server copy. */
    async open(id: string, hooks?: EditorHooks): Promise<OpenResult> {
      let l = live.get(id)
      if (!l) {
        const local = await deps.drafts.get(id)
        if (local) l = ensure(id, local)
      }
      if (!l) {
        const server = deps.isOnline() ? await deps.api.fetch(id).catch(() => undefined) : undefined
        if (server) l = ensure(id, { ...server.scene, baseVersion: server.version, dirty: false, savedAt: now() })
        else if (deps.insertPending(id)) l = ensure(id, { ...emptyScene(), baseVersion: 0, dirty: false, savedAt: now() })
        else return server === null ? { kind: 'missing' } : { kind: 'unavailable' }
        await write(id)
      }
      l.hooks = hooks
      return { kind: 'ready', draft: l.draft }
    },

    /** After opening: pick up a newer server copy (merging if this device has unsynced edits). */
    async refresh(id: string) {
      const l = live.get(id)
      if (!l || !deps.isOnline() || l.inflight) return
      const server = await deps.api.fetch(id).catch(() => undefined)
      if (server === null) { if (!deps.insertPending(id)) setStatus(id, { state: 'deleted' }); return }
      if (!server) return
      if (server.version > l.draft.baseVersion) await absorb(id, server)
      if (l.draft.dirty) schedule(id)
    },

    /** The canvas changed (callers skip no-op changes). */
    edit(id: string, elements: Elements, appState: SavedAppState) {
      const l = live.get(id)
      if (!l) return
      l.draft = { ...l.draft, elements, appState, dirty: true, savedAt: now() }
      l.seq++
      if (statuses.get(id)?.state !== 'deleted') setStatus(id, { state: deps.isOnline() ? 'saving' : 'offline' })
      clearTimeout(l.writeTimer)
      l.writeTimer = setTimeout(() => write(id), WRITE_MS)
      schedule(id)
    },

    /** Leaving the board or the app going to the background: save to the device and upload now. */
    async flush(id: string, { thumbnail = true } = {}) {
      const l = live.get(id)
      if (!l) return
      if (thumbnail && l.draft.dirty) l.thumbAt = 0
      await write(id)
      await push(id)
    },

    close(id: string) {
      const l = live.get(id)
      if (!l) return
      const hooks = l.hooks
      l.thumbAt = 0
      void write(id).then(() => push(id)).finally(() => {
        // Forget the in-memory copy unless the board was reopened meanwhile.
        if (live.get(id)?.hooks === hooks && !live.get(id)?.draft.dirty) live.delete(id)
        else if (live.get(id)?.hooks === hooks) live.get(id)!.hooks = undefined
      })
    },

    /** Upload every board edited on this device but not yet on the server (startup, reconnect, foreground). */
    async syncAll() {
      if (!deps.isOnline()) return
      for (const id of await deps.drafts.dirtyIds()) {
        if (!live.has(id)) {
          const d = await deps.drafts.get(id)
          if (!d) continue
          ensure(id, d)
        }
        await push(id)
      }
    },

    /** Save a board under a new id (e.g. "Keep a copy" after it was deleted elsewhere). */
    async adopt(newId: string, scene: SavedScene) {
      live.delete(newId)
      ensure(newId, { ...scene, baseVersion: 0, dirty: true, savedAt: now() })
      await write(newId)
      void push(newId)
    },

    forget(id: string) {
      const l = live.get(id)
      if (l) { clearTimeout(l.writeTimer); clearTimeout(l.idleTimer); clearTimeout(l.maxTimer); clearTimeout(l.retryTimer) }
      live.delete(id)
      statuses.delete(id)
    },

    /** Boards with unsynced edits (in memory or on disk), for the sign-out warning. */
    async unsyncedCount() {
      const ids = new Set(await deps.drafts.dirtyIds())
      live.forEach((l, id) => l.draft.dirty && ids.add(id))
      return ids.size
    },
  }
}

export type BoardSync = ReturnType<typeof createBoardSync>
