// The app's board sync instance, wired to Supabase, the offline queue and this device's IndexedDB.
import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { supabase } from '../supabase'
import { queryClient, type UpsertVars } from '../queryClient'
import type { Board } from '../types'
import { draftStore, type Elements, type SavedScene } from './store'
import { createBoardSync, type BoardStatus, type ReconcileFn } from './sync'

let reconcile: Promise<ReconcileFn> | undefined

export const boardSync = createBoardSync({
  drafts: draftStore,
  api: {
    async update(id, scene, baseVersion, thumbnail) {
      const { data, error } = await supabase.from('whiteboards')
        .update({ scene, version: baseVersion + 1, ...(thumbnail && { thumbnail }) })
        .eq('id', id).eq('version', baseVersion)
        .select('version,updated_at')
      if (error) throw error
      return (data?.[0] as { version: number; updated_at: string } | undefined) ?? null
    },
    async fetch(id) {
      const { data, error } = await supabase.from('whiteboards').select('scene,version').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      const scene = data.scene as Partial<SavedScene>
      return { version: data.version as number, scene: { elements: (scene.elements ?? []) as Elements, appState: scene.appState ?? {} } }
    },
  },
  isOnline: () => onlineManager.isOnline(),
  insertPending: (id) =>
    queryClient.getMutationCache().findAll({ mutationKey: ['upsert'], status: 'pending' })
      .some((m) => { const v = m.state.variables as UpsertVars | undefined; return v?.table === 'whiteboards' && v.row.id === id }),
  loadReconcile: () => (reconcile ??= import('@excalidraw/excalidraw').then((m) =>
    ((local, remote, appState) => m.reconcileElements(local, remote as never, (appState ?? {}) as never)) as ReconcileFn)),
  // Keep the browser's "edited" time and thumbnail current without refetching the list.
  onPushed: (id, row) => queryClient.setQueryData<Board[]>(['whiteboards'], (old) =>
    old?.map((b) => (b.id === id ? { ...b, ...(row.updated_at && { updated_at: row.updated_at }), ...(row.thumbnail && { thumbnail: row.thumbnail }) } : b))),
})

let started = false
/** Background upload of boards edited on this device: now, on reconnect, and when the app returns to the foreground. */
export function startBoardSync() {
  if (started) return
  started = true
  const run = () => void boardSync.syncAll().catch(() => {})
  onlineManager.subscribe((online) => online && run())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run())
  run()
}

export function useBoardStatus(id: string): BoardStatus {
  return useSyncExternalStore((l) => boardSync.subscribe(id, l), () => boardSync.status(id))
}
