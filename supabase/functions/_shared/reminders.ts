// Pure reminder selection. No imports, so it runs unchanged in Deno (Edge Function) and Node (tests).

export interface ReminderRoutine {
  id: string
  title: string
  days_of_week: number[]
  start_time: string | null
  duration_min: number | null
  starts_on: string
  archived_at: string | null
}

export interface ReminderTask {
  id: string
  title: string
  date: string
  start_time: string | null
  duration_min: number | null
  done_at: string | null
}

export interface DueReminder {
  itemType: 'routine' | 'task'
  itemId: string
  date: string
  title: string
  startTime: string
  durationMin: number | null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function localParts(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Fire when (start − lead) is within the last 2 minutes — tolerates one late/missed cron tick. */
export const WINDOW_MIN = 2

export function selectDueReminders(input: {
  now: Date
  timezone: string
  leadMin: number
  routines: ReminderRoutine[]
  doneRoutineIds: Set<string>
  tasks: ReminderTask[]
}): DueReminder[] {
  const { date, weekday, minutes } = localParts(input.now, input.timezone)
  const inWindow = (start: string) => {
    const fireAt = toMinutes(start) - input.leadMin
    return fireAt > minutes - WINDOW_MIN && fireAt <= minutes
  }
  const out: DueReminder[] = []

  for (const r of input.routines) {
    if (!r.start_time || r.archived_at || r.starts_on > date) continue
    if (!r.days_of_week.includes(weekday) || input.doneRoutineIds.has(r.id)) continue
    if (inWindow(r.start_time))
      out.push({ itemType: 'routine', itemId: r.id, date, title: r.title, startTime: r.start_time.slice(0, 5), durationMin: r.duration_min })
  }
  for (const t of input.tasks) {
    if (!t.start_time || t.done_at || t.date !== date) continue
    if (inWindow(t.start_time))
      out.push({ itemType: 'task', itemId: t.id, date, title: t.title, startTime: t.start_time.slice(0, 5), durationMin: t.duration_min })
  }
  return out
}
