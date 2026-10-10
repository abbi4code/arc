import { routineStreak, dayCompletion } from './stats'
import type { Routine, Task } from '../types'

const daily: Routine = {
  id: 'r', title: 'Read', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: null, duration_min: null,
  color: 'blue', starts_on: '2026-10-01', archived_at: null, sort_order: 0,
}

describe('routineStreak', () => {
  it('counts consecutive done days ending today', () => {
    const done = new Set(['2026-10-08', '2026-10-09', '2026-10-10'])
    expect(routineStreak(daily, done, '2026-10-10')).toEqual({ current: 3, best: 3 })
  })
  it('does not break the current streak when today is not done yet', () => {
    const done = new Set(['2026-10-08', '2026-10-09'])
    expect(routineStreak(daily, done, '2026-10-10').current).toBe(2)
  })
  it('breaks on a missed past scheduled day and tracks best', () => {
    const done = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-07'])
    expect(routineStreak(daily, done, '2026-10-07')).toEqual({ current: 2, best: 4 })
  })
  it('ignores unscheduled days', () => {
    const mwf: Routine = { ...daily, days_of_week: [1, 3, 5] } // Oct 5 Mon, 7 Wed, 9 Fri
    const done = new Set(['2026-10-05', '2026-10-07', '2026-10-09'])
    expect(routineStreak(mwf, done, '2026-10-11')).toEqual({ current: 3, best: 3 })
  })
  it('is zero with no logs', () => {
    expect(routineStreak(daily, new Set(), '2026-10-10')).toEqual({ current: 0, best: 0 })
  })
})

describe('dayCompletion', () => {
  it('counts due routines and tasks on that date', () => {
    const tasks: Task[] = [
      { id: 't1', title: 'a', date: '2026-10-10', start_time: null, duration_min: null, notes: null, done_at: 'x', sort_order: 0 },
      { id: 't2', title: 'b', date: '2026-10-10', start_time: null, duration_min: null, notes: null, done_at: null, sort_order: 0 },
      { id: 't3', title: 'c', date: '2026-10-11', start_time: null, duration_min: null, notes: null, done_at: 'x', sort_order: 0 },
    ]
    const logs = new Set(['r|2026-10-10'])
    expect(dayCompletion('2026-10-10', [daily], logs, tasks)).toEqual({ done: 2, total: 3 })
  })
})
