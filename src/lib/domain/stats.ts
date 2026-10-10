import type { ISODate, Routine, Task } from '../types'
import { addDaysISO } from './dates'
import { isRoutineDue, routinesDueOn } from './routines'

export const logKey = (routineId: string, date: ISODate) => `${routineId}|${date}`

/**
 * Streaks count only scheduled days. A not-yet-done `today` never breaks the current streak.
 */
export function routineStreak(routine: Routine, doneDates: Set<ISODate>, today: ISODate) {
  let run = 0
  let best = 0
  for (let d = routine.starts_on; d <= today; d = addDaysISO(d, 1)) {
    if (!isRoutineDue(routine, d)) continue
    if (doneDates.has(d)) {
      run++
      best = Math.max(best, run)
    } else if (d !== today) {
      run = 0
    }
  }
  return { current: run, best }
}

export function dayCompletion(date: ISODate, routines: Routine[], logKeys: Set<string>, tasks: Task[]) {
  const due = routinesDueOn(routines, date)
  const dayTasks = tasks.filter((t) => t.date === date)
  const done = due.filter((r) => logKeys.has(logKey(r.id, date))).length + dayTasks.filter((t) => t.done_at).length
  return { done, total: due.length + dayTasks.length }
}
