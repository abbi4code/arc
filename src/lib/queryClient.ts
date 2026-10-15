import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'
import { toast } from 'sonner'
import { supabase } from './supabase'
import type { RoutineLog, Settings } from './types'
import { dropBoardsLocally, type LibraryItems } from './boards/store'

const WEEK = 1000 * 60 * 60 * 24 * 7

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', gcTime: WEEK, staleTime: 30_000, retry: 2 },
    mutations: { networkMode: 'offlineFirst', retry: 3, gcTime: WEEK },
  },
})

export const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'winter-arc-cache',
})

type Row = { id: string }
export type ListTable = 'tasks' | 'routines' | 'learning_tracks' | 'learning_goals' | 'learning_topics' | 'vault_items' | 'task_groups'
  | 'whiteboard_folders' | 'whiteboards'

// Only columns the client owns; server fills user_id / timestamps.
const COLUMNS: Record<ListTable, string[]> = {
  tasks: ['id', 'title', 'date', 'start_time', 'duration_min', 'notes', 'done_at', 'sort_order', 'topic_id', 'group_id', 'subtasks'],
  routines: ['id', 'title', 'days_of_week', 'start_time', 'duration_min', 'color', 'starts_on', 'archived_at', 'sort_order'],
  learning_tracks: ['id', 'title', 'color', 'status', 'sort_order'],
  learning_goals: ['id', 'track_id', 'title', 'starts_on', 'target_date', 'sort_order'],
  learning_topics: ['id', 'goal_id', 'title', 'notes', 'done_at', 'sort_order'],
  vault_items: ['id', 'ciphertext', 'iv', 'version'], // already encrypted on-device
  task_groups: ['id', 'title', 'color', 'sort_order'],
  whiteboard_folders: ['id', 'parent_id', 'title', 'sort_order'],
  whiteboards: ['id', 'folder_id', 'title', 'sort_order'], // scene/version/thumbnail sync via src/lib/boards/sync.ts
}

/** Server-side cascades, mirrored in the cache so children disappear immediately. */
const CHILDREN: Partial<Record<ListTable, { table: ListTable; fk: string }[]>> = {
  learning_tracks: [{ table: 'learning_goals', fk: 'track_id' }],
  learning_goals: [{ table: 'learning_topics', fk: 'goal_id' }],
  whiteboard_folders: [{ table: 'whiteboard_folders', fk: 'parent_id' }, { table: 'whiteboards', fk: 'folder_id' }],
}
function removeCascade(table: ListTable, ids: Set<string>) {
  for (const child of CHILDREN[table] ?? []) {
    const childIds = new Set<string>()
    queryClient.setQueryData<(Row & Record<string, unknown>)[]>([child.table], (old) =>
      (old ?? []).filter((r) => (ids.has(r[child.fk] as string) ? (childIds.add(r.id), false) : true)))
    if (childIds.size) removeCascade(child.table, childIds)
  }
  if (table === 'whiteboards') dropBoardsLocally(ids) // drafts + cached images on this device
  if (table === 'learning_topics') // tasks.topic_id is "on delete set null"
    queryClient.setQueryData<(Row & { topic_id?: string | null })[]>(['tasks'], (old) =>
      old?.map((t) => (t.topic_id && ids.has(t.topic_id) ? { ...t, topic_id: null } : t)))
  if (table === 'task_groups') // tasks.group_id is "on delete set null": tasks stay, ungrouped
    queryClient.setQueryData<(Row & { group_id?: string | null })[]>(['tasks'], (old) =>
      old?.map((t) => (t.group_id && ids.has(t.group_id) ? { ...t, group_id: null } : t)))
}
const pick = (table: ListTable, row: Record<string, unknown>) =>
  Object.fromEntries(COLUMNS[table].filter((c) => c in row).map((c) => [c, row[c]]))

const upsertById = <T extends Row>(list: T[] | undefined, row: T) => {
  const old = list ?? []
  return old.some((r) => r.id === row.id) ? old.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...old, row]
}

function reportError(error: unknown, what: string, refetch: string[]) {
  const msg = error instanceof Error ? error.message : (error as { message?: string })?.message
  toast.error(`Couldn't save ${what}`, { description: `${msg ?? 'Unknown error'} · restored from server` })
  refetch.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
}

/*
 * Mutation defaults are registered by key so that mutations paused while offline can be
 * persisted to IndexedDB and resumed after a reload (functions themselves aren't serialized).
 * All share one scope → they replay serially, in the order they were made.
 */
export const SYNC_SCOPE = { id: 'sync' }

export type UpsertVars = { table: ListTable; row: Row & Record<string, unknown> }
queryClient.setMutationDefaults(['upsert'], {
  mutationFn: async ({ table, row }: UpsertVars) => {
    const { error } = await supabase.from(table).upsert(pick(table, row))
    if (error) throw error
  },
  onMutate: async ({ table, row }: UpsertVars) => {
    await queryClient.cancelQueries({ queryKey: [table] })
    queryClient.setQueryData<Row[]>([table], (old) => upsertById(old, row))
  },
  onError: (e: unknown, { table, row }: UpsertVars) => reportError(e, row.title ? `"${String(row.title)}"` : 'item', [table]),
  scope: SYNC_SCOPE,
})

export type UpsertManyVars = { table: ListTable; rows: (Row & Record<string, unknown>)[] }
queryClient.setMutationDefaults(['upsertMany'], {
  mutationFn: async ({ table, rows }: UpsertManyVars) => {
    const { error } = await supabase.from(table).upsert(rows.map((r) => pick(table, r)))
    if (error) throw error
  },
  onMutate: async ({ table, rows }: UpsertManyVars) => {
    await queryClient.cancelQueries({ queryKey: [table] })
    queryClient.setQueryData<Row[]>([table], (old) => rows.reduce((acc, r) => upsertById(acc, r), old ?? []))
  },
  onError: (e: unknown, { table }: UpsertManyVars) => reportError(e, 'items', [table]),
  scope: SYNC_SCOPE,
})

export type DeleteVars = { table: ListTable; id: string }
queryClient.setMutationDefaults(['delete'], {
  mutationFn: async ({ table, id }: DeleteVars) => {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
  },
  onMutate: async ({ table, id }: DeleteVars) => {
    await queryClient.cancelQueries({ queryKey: [table] })
    queryClient.setQueryData<Row[]>([table], (old) => (old ?? []).filter((r) => r.id !== id))
    removeCascade(table, new Set([id]))
  },
  onError: (e: unknown, { table }: DeleteVars) => reportError(e, 'delete', [table]),
  scope: SYNC_SCOPE,
})

export type LogVars = { id: string; routine_id: string; date: string; done: boolean }
queryClient.setMutationDefaults(['log'], {
  mutationFn: async ({ id, routine_id, date, done }: LogVars) => {
    const { error } = done
      ? await supabase.from('routine_logs').upsert({ id, routine_id, date, done_at: new Date().toISOString() }, { onConflict: 'routine_id,date' })
      : await supabase.from('routine_logs').delete().eq('routine_id', routine_id).eq('date', date)
    if (error) throw error
  },
  onMutate: async ({ id, routine_id, date, done }: LogVars) => {
    await queryClient.cancelQueries({ queryKey: ['logs'] })
    queryClient.setQueryData<RoutineLog[]>(['logs'], (old = []) => {
      const rest = old.filter((l) => !(l.routine_id === routine_id && l.date === date))
      return done ? [...rest, { id, routine_id, date, done_at: new Date().toISOString() }] : rest
    })
  },
  onError: (e: unknown) => reportError(e, 'routine check-in', ['logs']),
  scope: SYNC_SCOPE,
})

queryClient.setMutationDefaults(['settings'], {
  mutationFn: async (s: Settings) => {
    const { timezone, reminder_lead_min, week_start } = s
    const { error } = await supabase.from('settings').upsert({ timezone, reminder_lead_min, week_start })
    if (error) throw error
  },
  onMutate: async (s: Settings) => {
    await queryClient.cancelQueries({ queryKey: ['settings'] })
    queryClient.setQueryData(['settings'], (old: Settings | null | undefined) => ({ ...old, ...s }))
  },
  onError: (e: unknown) => reportError(e, 'settings', ['settings']),
  scope: SYNC_SCOPE,
})

/** One image of a board, uploaded once (keyed by Excalidraw's content-hash file id). */
export type BoardFileVars = { board_id: string; id: string; mime_type: string; data_url: string }
queryClient.setMutationDefaults(['boardFile'], {
  mutationFn: async (f: BoardFileVars) => {
    const { error } = await supabase.from('whiteboard_files').upsert(f, { onConflict: 'board_id,id', ignoreDuplicates: true })
    if (error) throw error
  },
  onError: (e: unknown) => reportError(e, 'image', []),
  scope: SYNC_SCOPE,
})

/** The whole shape library (one row per user); the newest save wins. */
queryClient.setMutationDefaults(['library'], {
  mutationFn: async (items: LibraryItems) => {
    const { error } = await supabase.from('whiteboard_library').upsert({ items })
    if (error) throw error
  },
  onError: (e: unknown) => reportError(e, 'library', []),
  scope: SYNC_SCOPE,
})
