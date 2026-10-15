// On-device copies of boards, in their own IndexedDB database. Scenes and images live here instead of the
// TanStack cache, which re-serializes everything it holds about once a second.
import { createStore, del, delMany, entries, get, set, clear } from 'idb-keyval'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { LibraryItems as ExcalidrawLibraryItems } from '@excalidraw/excalidraw/types'

export type LibraryItems = ExcalidrawLibraryItems
export type Elements = readonly OrderedExcalidrawElement[]

/** Board-level settings worth syncing. Scroll/zoom are per device (see view*). */
export interface SavedAppState {
  viewBackgroundColor?: string
  gridModeEnabled?: boolean
  gridSize?: number
  gridStep?: number
}

export interface SavedScene { elements: Elements; appState: SavedAppState }

export interface Draft extends SavedScene {
  /** Server version this draft was built on; uploads only succeed if the server is still on it. */
  baseVersion: number
  /** Has edits the server hasn't accepted yet. */
  dirty: boolean
  savedAt: number
}

export interface StoredFile { id: string; mimeType: string; dataURL: string; created: number }

const db = createStore('winter-arc-boards', 'kv')
const draftKey = (id: string) => `draft:${id}`
const filesKey = (id: string) => `files:${id}`

export const draftStore = {
  get: (id: string) => get<Draft>(draftKey(id), db),
  set: (id: string, d: Draft) => set(draftKey(id), d, db),
  del: (id: string) => del(draftKey(id), db),
  /** Ids of boards with edits not yet on the server. */
  async dirtyIds() {
    return (await entries<string, Draft>(db))
      .filter(([k, v]) => typeof k === 'string' && k.startsWith('draft:') && v?.dirty)
      .map(([k]) => (k as string).slice('draft:'.length))
  },
}

export const fileStore = {
  get: async (boardId: string) => (await get<Record<string, StoredFile>>(filesKey(boardId), db)) ?? {},
  set: (boardId: string, files: Record<string, StoredFile>) => set(filesKey(boardId), files, db),
}

export const libraryStore = {
  get: () => get<LibraryItems>('library', db),
  set: (items: LibraryItems) => set('library', items, db),
}

/** A board was deleted (here or by a cascade): forget its draft and images on this device. */
export function dropBoardsLocally(ids: Iterable<string>) {
  const keys = [...ids].flatMap((id) => [draftKey(id), filesKey(id)])
  if (keys.length) delMany(keys, db).catch(() => {})
  for (const id of ids) try { localStorage.removeItem(viewKey(id)) } catch { /* storage blocked */ }
}

/** Sign-out: nothing of the boards stays on the device. */
export const clearBoardsLocally = () => clear(db)

// Per-device scroll + zoom, so each device reopens a board where it left off.
export interface View { scrollX: number; scrollY: number; zoom: number }
const viewKey = (id: string) => `board-view:${id}`
export function readView(id: string): View | null {
  try { return JSON.parse(localStorage.getItem(viewKey(id)) ?? 'null') } catch { return null }
}
export function writeView(id: string, v: View) {
  try { localStorage.setItem(viewKey(id), JSON.stringify(v)) } catch { /* storage blocked */ }
}
