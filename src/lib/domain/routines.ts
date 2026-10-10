import type { ISODate, Routine } from '../types'
import { minutesOf, toISODate, weekdayOf } from './dates'

export function isRoutineDue(routine: Routine, date: ISODate): boolean {
  if (date < routine.starts_on) return false
  if (routine.archived_at && toISODate(new Date(routine.archived_at)) <= date) return false
  return routine.days_of_week.includes(weekdayOf(date))
}

/** Timed items first (by start), then untimed by sort_order. */
export function byScheduleOrder<T extends { start_time: string | null; sort_order: number; title: string }>(a: T, b: T) {
  if (a.start_time && b.start_time) return minutesOf(a.start_time) - minutesOf(b.start_time)
  if (a.start_time) return -1
  if (b.start_time) return 1
  return a.sort_order - b.sort_order || a.title.localeCompare(b.title)
}

export const routinesDueOn = (routines: Routine[], date: ISODate): Routine[] =>
  routines.filter((r) => isRoutineDue(r, date)).sort(byScheduleOrder)
