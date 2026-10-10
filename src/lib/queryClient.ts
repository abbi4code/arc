import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'
import { toast } from 'sonner'
import { supabase } from './supabase'
import type { RoutineLog, Settings } from './types'

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
export type ListTable = 'tasks' | 'routines'

// Only columns the client owns; server fills user_id / timestamps.
const COLUMNS: Record<ListTable, string[]> = {
  tasks: ['id', 'title', 'date', 'start_time', 'duration_min', 'notes', 'done_at', 'sort_order'],
  routines: ['id', 'title', 'days_of_week', 'start_time', 'duration_min', 'color', 'starts_on', 'archived_at', 'sort_order'],
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
  onError: (e: unknown, { table, row }: UpsertVars) => reportError(e, `"${String(row.title ?? 'item')}"`, [table]),
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
