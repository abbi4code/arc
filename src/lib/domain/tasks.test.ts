import { addSubtasks, groupForTag, subtaskProgress, toggleSubtask } from './tasks'
import type { Task, TaskGroup } from '../types'

const task = (p: Partial<Task> = {}): Task => ({
  id: 't', title: 'Release prep', date: '2026-10-15', start_time: null, duration_min: null, notes: null, done_at: null, sort_order: 0,
  subtasks: [{ id: 'a', title: 'Bump version', done: true }, { id: 'b', title: 'Tag release', done: false }], ...p,
})

describe('checklists', () => {
  it('counts progress (no checklist → null)', () => {
    expect(subtaskProgress(task())).toEqual({ done: 1, total: 2 })
    expect(subtaskProgress(task({ subtasks: [] }))).toBeNull()
    expect(subtaskProgress(task({ subtasks: undefined }))).toBeNull()
  })
  it('ticking the last point completes the task', () => {
    const t = toggleSubtask(task(), 'b', '2026-10-15T10:00:00Z')
    expect(t.subtasks!.every((s) => s.done)).toBe(true)
    expect(t.done_at).toBe('2026-10-15T10:00:00Z')
  })
  it('unticking a point re-opens a completed task', () => {
    const done = task({ done_at: 'x', subtasks: [{ id: 'a', title: 'A', done: true }, { id: 'b', title: 'B', done: true }] })
    const t = toggleSubtask(done, 'a', 'now')
    expect(t.done_at).toBeNull()
    expect(t.subtasks![0].done).toBe(false)
  })
  it('ticking a point that is not the last leaves the task open', () => {
    const t = toggleSubtask(task({ subtasks: [{ id: 'a', title: 'A', done: false }, { id: 'b', title: 'B', done: false }] }), 'a', 'now')
    expect(t.done_at).toBeNull()
  })
  it('adds pasted lines as points (bullets/checkboxes understood) and re-opens a done task', () => {
    const t = addSubtasks(task({ done_at: 'x' }), '- Update changelog\n- [x] Build\n\n', () => 'id')
    expect(t.subtasks!.map((s) => [s.title, s.done])).toEqual([['Bump version', true], ['Tag release', false], ['Update changelog', false], ['Build', true]])
    expect(t.done_at).toBeNull()
  })
})

describe('groupForTag', () => {
  const groups: TaskGroup[] = [{ id: 'g1', title: 'Work', color: 'blue', sort_order: 0 }]
  it('matches an existing group case-insensitively', () => {
    expect(groupForTag('work', groups)).toEqual({ existing: groups[0] })
  })
  it('proposes a new, nicely-cased group otherwise', () => {
    expect(groupForTag('errands', groups)).toEqual({ create: 'Errands' })
    expect(groupForTag('side-project', groups)).toEqual({ create: 'Side Project' })
  })
})
