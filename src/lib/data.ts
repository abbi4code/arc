import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from './supabase'
import { queryClient, SYNC_SCOPE, type DeleteVars, type LogVars, type UpsertManyVars, type UpsertVars } from './queryClient'
import type { LearningGoal, LearningTopic, LearningTrack, Routine, RoutineLog, Settings, Task } from './types'
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
export const useTracks = () => useQuery({ queryKey: ['learning_tracks'], queryFn: () => fetchAll<LearningTrack>('learning_tracks') })
export const useGoals = () => useQuery({ queryKey: ['learning_goals'], queryFn: () => fetchAll<LearningGoal>('learning_goals') })
export const useTopics = () => useQuery({ queryKey: ['learning_topics'], queryFn: () => fetchAll<LearningTopic>('learning_topics') })

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
  const upsertMany = useMutation<void, Error, UpsertManyVars>({ mutationKey: ['upsertMany'], scope: SYNC_SCOPE })
  const remove = useMutation<void, Error, DeleteVars>({ mutationKey: ['delete'], scope: SYNC_SCOPE })
  const row = <T,>(r: T) => r as unknown as UpsertVars['row']

  const saveTopic = (t: LearningTopic) => upsert.mutate({ table: 'learning_topics', row: row(t) })
  /** A task planned from a topic mirrors its done state onto the topic. */
  const syncTopic = (topicId: string | null | undefined, done: boolean) => {
    const topic = queryClient.getQueryData<LearningTopic[]>(['learning_topics'])?.find((t) => t.id === topicId)
    if (topic && !!topic.done_at !== done) saveTopic({ ...topic, done_at: done ? new Date().toISOString() : null })
  }
  const log = useMutation<void, Error, LogVars>({ mutationKey: ['log'], scope: SYNC_SCOPE })
  const settings = useMutation<void, Error, Settings>({ mutationKey: ['settings'], scope: SYNC_SCOPE })

  return {
    saveTask: (t: Task) => upsert.mutate({ table: 'tasks', row: row(t) }),
    setTaskDone: (t: Task, done: boolean) => {
      upsert.mutate({ table: 'tasks', row: row({ ...t, done_at: done ? new Date().toISOString() : null }) })
      syncTopic(t.topic_id, done)
    },
    saveRoutine: (r: Routine) => upsert.mutate({ table: 'routines', row: row(r) }),
    saveTrack: (t: LearningTrack) => upsert.mutate({ table: 'learning_tracks', row: row(t) }),
    saveGoal: (g: LearningGoal) => upsert.mutate({ table: 'learning_goals', row: row(g) }),
    saveTopic,
    saveTopics: (ts: LearningTopic[]) => ts.length && upsertMany.mutate({ table: 'learning_topics', rows: ts.map(row) }),
    deleteTrack: (id: string) => remove.mutate({ table: 'learning_tracks', id }),
    deleteGoal: (id: string) => remove.mutate({ table: 'learning_goals', id }),
    deleteTopic: (id: string) => remove.mutate({ table: 'learning_topics', id }),
    deleteTask: (id: string) => remove.mutate({ table: 'tasks', id }),
    deleteRoutine: (id: string) => remove.mutate({ table: 'routines', id }),
    setRoutineDone: (routine_id: string, date: string, done: boolean) =>
      log.mutate({ id: crypto.randomUUID(), routine_id, date, done }),
    saveSettings: (s: Settings) => settings.mutate(s),
  }
}
