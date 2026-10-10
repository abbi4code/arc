import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from './supabase'
import { SYNC_SCOPE, type DeleteVars, type LogVars, type UpsertVars } from './queryClient'
import type { Routine, RoutineLog, Settings, Task } from './types'
import { logKey } from './domain/stats'

const PAGE = 1000 // PostgREST max rows per request

async function fetchAll<T>(table: string, columns = '*'): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data as T[]))
    if (data.length < PAGE) return out
  }
}

export const useRoutines = () => useQuery({ queryKey: ['routines'], queryFn: () => fetchAll<Routine>('routines') })
export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: () => fetchAll<Task>('tasks') })

export function useLogs() {
  const q = useQuery({
    queryKey: ['logs'],
    queryFn: () => fetchAll<RoutineLog>('routine_logs', 'id,routine_id,date,done_at'),
  })
  const keys = useMemo(() => new Set((q.data ?? []).map((l) => logKey(l.routine_id, l.date))), [q.data])
  return { ...q, keys }
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  reminder_lead_min: 5,
  week_start: 1,
}

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').maybeSingle()
      if (error) throw error
      return data as Settings | null
    },
  })

export function useMutations() {
  const upsert = useMutation<void, Error, UpsertVars>({ mutationKey: ['upsert'], scope: SYNC_SCOPE })
  const remove = useMutation<void, Error, DeleteVars>({ mutationKey: ['delete'], scope: SYNC_SCOPE })
  const log = useMutation<void, Error, LogVars>({ mutationKey: ['log'], scope: SYNC_SCOPE })
  const settings = useMutation<void, Error, Settings>({ mutationKey: ['settings'], scope: SYNC_SCOPE })

  return {
    saveTask: (row: Task) => upsert.mutate({ table: 'tasks', row: row as unknown as UpsertVars['row'] }),
    saveRoutine: (row: Routine) => upsert.mutate({ table: 'routines', row: row as unknown as UpsertVars['row'] }),
    deleteTask: (id: string) => remove.mutate({ table: 'tasks', id }),
    deleteRoutine: (id: string) => remove.mutate({ table: 'routines', id }),
    setRoutineDone: (routine_id: string, date: string, done: boolean) =>
      log.mutate({ id: crypto.randomUUID(), routine_id, date, done }),
    saveSettings: (s: Settings) => settings.mutate(s),
  }
}
