import { formatHM } from './dates'
import { isLink, topicFromUrl } from './links'

export interface QuickAdd {
  title: string
  startTime: string | null // 'HH:MM'
  durationMin: number | null
  dayOffset: number // 0 = selected day, 1 = the day after
  url: string | null // a pasted link, kept in the task notes
  group: string | null // "#work" → "work" (resolved to a task group by the caller)
}

/** '10:00', '9:15am', '6pm', '@10' → minutes since midnight, or null */
function parseTime(tok: string): number | null {
  let m = tok.match(/^@?(\d{1,2}):(\d{2})(am|pm)?$/i) ?? tok.match(/^@?(\d{1,2})(am|pm)$/i) ?? tok.match(/^@(\d{1,2})$/)
  if (!m) return null
  let h = Number(m[1])
  const hasMinutes = m.length > 2 && m[2] !== undefined && /^\d+$/.test(m[2])
  const min = hasMinutes ? Number(m[2]) : 0
  const mer = (hasMinutes ? m[3] : m[2])?.toLowerCase()
  if (min > 59) return null
  if (mer) {
    if (h < 1 || h > 12) return null
    if (h === 12) h = 0
    if (mer === 'pm') h += 12
  } else if (h > 23) return null
  return h * 60 + min
}

function parseDuration(tok: string): number | null {
  const m = tok.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:ins?)?)?$/i)
  if (!m || (!m[1] && !m[2])) return null
  const total = Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0))
  return total > 0 ? total : null
}

export function parseQuickAdd(input: string): QuickAdd {
  const rest: string[] = []
  let start: number | null = null
  let duration: number | null = null
  let dayOffset: number | null = null
  let url: string | null = null
  let group: string | null = null

  for (const tok of input.trim().split(/\s+/).filter(Boolean)) {
    if (url === null && isLink(tok)) { url = topicFromUrl(tok)!.url; continue }
    if (group === null && /^#[a-z][\w-]*$/i.test(tok)) { group = tok.slice(1); continue }
    const lower = tok.toLowerCase()
    if (dayOffset === null && /^(today|tod)$/.test(lower)) { dayOffset = 0; continue }
    if (dayOffset === null && /^(tomorrow|tmr|tmrw)$/.test(lower)) { dayOffset = 1; continue }

    if (start === null) {
      const range = tok.split('-')
      if (range.length === 2) {
        const a = parseTime(range[0])
        const b = parseTime(range[1])
        if (a !== null && b !== null && b > a) { start = a; duration = duration ?? b - a; continue }
      }
      const t = parseTime(tok)
      if (t !== null) { start = t; continue }
    }
    if (duration === null) {
      const d = parseDuration(tok)
      if (d !== null) { duration = d; continue }
    }
    rest.push(tok)
  }

  return {
    title: rest.join(' ') || (url ? topicFromUrl(url)!.title : ''),
    startTime: start === null ? null : formatHM(start),
    durationMin: duration,
    dayOffset: dayOffset ?? 0,
    url,
    group,
  }
}
