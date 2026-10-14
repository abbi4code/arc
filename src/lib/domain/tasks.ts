import type { Subtask, Task, TaskGroup } from '../types'
import { parseTopicLines } from './learning'

export function subtaskProgress(task: Pick<Task, 'subtasks'>) {
  const list = task.subtasks ?? []
  return list.length ? { done: list.filter((s) => s.done).length, total: list.length } : null
}

/** Ticking the last open point completes the task; un-ticking any point re-opens it. */
export function toggleSubtask(task: Task, subtaskId: string, nowIso: string): Task {
  const subtasks = (task.subtasks ?? []).map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s))
  const allDone = subtasks.length > 0 && subtasks.every((s) => s.done)
  return { ...task, subtasks, done_at: allDone ? (task.done_at ?? nowIso) : null }
}

/** One point per pasted line; a new open point re-opens a completed task. */
export function addSubtasks(task: Task, text: string, newId: () => string = () => crypto.randomUUID()): Task {
  const added: Subtask[] = parseTopicLines(text).map((l) => ({ id: newId(), title: l.title, done: l.done }))
  if (!added.length) return task
  const subtasks = [...(task.subtasks ?? []), ...added]
  return { ...task, subtasks, done_at: subtasks.every((s) => s.done) ? task.done_at : null }
}

const titleCase = (tag: string) => tag.split(/[-_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

/** Resolve a composer `#tag` to an existing group (case-insensitive) or a new group name. */
export function groupForTag(tag: string, groups: TaskGroup[]): { existing: TaskGroup } | { create: string } {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '')
  const existing = groups.find((g) => norm(g.title) === norm(tag))
  return existing ? { existing } : { create: titleCase(tag) }
}
