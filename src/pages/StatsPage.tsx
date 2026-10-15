import { useLayoutEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useLogs, useRoutines, useSettings, useTasks } from '@/lib/data'
import { addDaysISO, todayISO, weekdayOf } from '@/lib/domain/dates'
import { isRoutineDue } from '@/lib/domain/routines'
import { dayCompletion, routineStreak } from '@/lib/domain/stats'
import { describeDays } from '@/lib/schedule'
import type { Task } from '@/lib/types'
import { colorOf } from '@/lib/ui'

const WEEKS = 53

export default function StatsPage() {
  const { data: routines = [] } = useRoutines()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [], keys } = useLogs()
  const { data: settings } = useSettings()
  const weekStart = settings?.week_start ?? 1
  const today = todayISO()
  const heatmapRef = useRef<HTMLDivElement>(null)
  // Most recent weeks first on narrow screens
  useLayoutEffect(() => { heatmapRef.current?.scrollTo({ left: heatmapRef.current.scrollWidth }) }, [])

  const tasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    tasks.forEach((t) => (m.get(t.date) ?? m.set(t.date, []).get(t.date)!).push(t))
    return m
  }, [tasks])

  const completion = useMemo(() => {
    const cache = new Map<string, { done: number; total: number }>()
    return (d: string) => {
      if (!cache.has(d)) cache.set(d, dayCompletion(d, routines, keys, tasksByDate.get(d) ?? []))
      return cache.get(d)!
    }
  }, [routines, keys, tasksByDate])

  const rate = (days: number) => {
    let done = 0, total = 0
    for (let i = 0; i < days; i++) {
      const c = completion(addDaysISO(today, -i))
      done += c.done
      total += c.total
    }
    return total ? Math.round((done / total) * 100) : null
  }

  // Heatmap: columns are weeks ending with the current one.
  const offset = (weekdayOf(today) - weekStart + 7) % 7
  const gridStart = addDaysISO(today, -offset - (WEEKS - 1) * 7)
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysISO(gridStart, w * 7 + d)))

  const perRoutine = useMemo(() => {
    const byRoutine = new Map<string, Set<string>>()
    logs.forEach((l) => (byRoutine.get(l.routine_id) ?? byRoutine.set(l.routine_id, new Set()).get(l.routine_id)!).add(l.date))
    return routines
      .filter((r) => !r.archived_at)
      .map((r) => {
        const done = byRoutine.get(r.id) ?? new Set<string>()
        let due30 = 0, done30 = 0
        for (let i = 0; i < 30; i++) {
          const d = addDaysISO(today, -i)
          if (isRoutineDue(r, d) && !(d === today && !done.has(d))) { due30++; if (done.has(d)) done30++ }
        }
        return { r, ...routineStreak(r, done, today), rate30: due30 ? Math.round((done30 / due30) * 100) : null }
      })
      .sort((a, b) => b.current - a.current)
  }, [routines, logs, today])

  const todayC = completion(today)
  const bestCurrent = perRoutine.reduce((m, p) => Math.max(m, p.current), 0)
  const tiles = [
    { label: 'Today', value: todayC.total ? `${todayC.done}/${todayC.total}` : '—' },
    { label: 'Last 7 days', value: fmtPct(rate(7)) },
    { label: 'Last 30 days', value: fmtPct(rate(30)) },
    { label: 'Top streak', value: bestCurrent ? `${bestCurrent}d` : '—' },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <Link to="/settings" className="-ml-1 mb-3 inline-flex items-center gap-0.5 text-xs text-muted hover:text-fg"><ChevronLeft size={14} /> Settings</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
      <p className="mt-1 text-[13px] text-muted">Completion across routines and tasks.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line bg-panel px-4 py-3">
            <div className="text-xs text-muted">{t.label}</div>
            <div className="tabular mt-1 font-mono text-xl font-medium">{t.value}</div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-xs font-medium text-muted">Last 12 months</h2>
        <div ref={heatmapRef} className="scrollbar-thin overflow-x-auto pb-1">
          <div className="flex w-max gap-[3px]" role="img" aria-label="Daily completion heatmap">
            {weeks.map((week) => (
              <div key={week[0]} className="grid gap-[3px]">
                {week.map((d) => {
                  const future = d > today
                  const c = future ? null : completion(d)
                  const ratio = c && c.total ? c.done / c.total : null
                  return (
                    <div
                      key={d}
                      title={c ? `${d}: ${c.done}/${c.total}` : d}
                      className="size-[11px] rounded-[3px]"
                      style={{
                        background: future ? 'transparent'
                          : ratio === null ? 'var(--panel-2)'
                          : ratio === 0 ? 'color-mix(in oklab, var(--accent) 8%, var(--panel-2))'
                          : `color-mix(in oklab, var(--accent) ${Math.round(25 + ratio * 75)}%, var(--panel-2))`,
                        outline: d === today ? '1px solid var(--muted)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-faint">
          Less
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <span key={r} className="size-[10px] rounded-[3px]" style={{ background: `color-mix(in oklab, var(--accent) ${r === 0 ? 8 : Math.round(25 + r * 75)}%, var(--panel-2))` }} />
          ))}
          More
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] gap-2 border-b sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] border-line px-4 py-2 text-[11px] font-medium text-muted">
          <span>Routine</span><span className="text-right">Streak</span><span className="text-right">Best</span><span className="text-right">30d</span>
        </div>
        {perRoutine.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-faint">Add routines to see streaks.</p>}
        {perRoutine.map(({ r, current, best, rate30 }) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] items-center sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] gap-2 border-b border-line px-4 py-2.5 last:border-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(r.color) }} />
              <span className="truncate text-[13px]">{r.title}</span>
              <span className="hidden truncate text-xs text-faint sm:inline">{describeDays(r.days_of_week)}</span>
            </div>
            <span className="tabular text-right font-mono text-[13px]">{current}d</span>
            <span className="tabular text-right font-mono text-[13px] text-muted">{best}d</span>
            <span className="tabular text-right font-mono text-[13px] text-muted">{fmtPct(rate30)}</span>
          </div>
        ))}
      </section>
    </div>
  )
}

const fmtPct = (n: number | null) => (n === null ? '—' : `${n}%`)
