import { isRoutineDue, routinesDueOn } from './routines'
import type { Routine } from '../types'

const base: Routine = {
  id: 'r1', title: 'Gym', days_of_week: [1, 3, 5], start_time: null, duration_min: null,
  color: 'blue', starts_on: '2026-10-01', archived_at: null, sort_order: 0,
}

describe('isRoutineDue', () => {
  it('is due on a scheduled weekday', () => {
    expect(isRoutineDue(base, '2026-10-12')).toBe(true) // Monday
  })
  it('is not due on an unscheduled weekday', () => {
    expect(isRoutineDue(base, '2026-10-13')).toBe(false) // Tuesday
  })
  it('is not due before it starts', () => {
    expect(isRoutineDue(base, '2026-09-28')).toBe(false) // Monday before starts_on
  })
  it('is due before archive date but not on/after it', () => {
    const archived = { ...base, archived_at: new Date(2026, 9, 14, 12).toISOString() } // Wed Oct 14 local
    expect(isRoutineDue(archived, '2026-10-12')).toBe(true)
    expect(isRoutineDue(archived, '2026-10-14')).toBe(false)
    expect(isRoutineDue(archived, '2026-10-16')).toBe(false)
  })
})

describe('routinesDueOn', () => {
  it('filters and sorts by start time then sort_order, untimed last', () => {
    const rs: Routine[] = [
      { ...base, id: 'a', days_of_week: [6], sort_order: 1 },
      { ...base, id: 'b', days_of_week: [6], start_time: '09:00:00' },
      { ...base, id: 'c', days_of_week: [6], start_time: '07:00:00' },
      { ...base, id: 'd', days_of_week: [6], sort_order: 0 },
      { ...base, id: 'e', days_of_week: [1] },
    ]
    expect(routinesDueOn(rs, '2026-10-10').map((r) => r.id)).toEqual(['c', 'b', 'd', 'a'])
  })
})
