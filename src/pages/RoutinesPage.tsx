import { useMemo, useState } from 'react'
import { ChevronRight, Flame, Plus } from 'lucide-react'
import { Button } from '@/components/primitives'
import { useEditor } from '@/components/Editor'
import { useLogs, useRoutines } from '@/lib/data'
import { formatHM, minutesOf, todayISO } from '@/lib/domain/dates'
import { byScheduleOrder } from '@/lib/domain/routines'
import { routineStreak } from '@/lib/domain/stats'
import { describeDays } from '@/lib/schedule'
import type { Routine } from '@/lib/types'
import { cn, colorOf } from '@/lib/ui'

export default function RoutinesPage() {
  const { data: routines = [], isLoading } = useRoutines()
  const { data: logs = [] } = useLogs()
  const { editRoutine } = useEditor()
  const [showArchived, setShowArchived] = useState(false)
  const today = todayISO()

  const doneByRoutine = useMemo(() => {
    const m = new Map<string, Set<string>>()
    logs.forEach((l) => (m.get(l.routine_id) ?? m.set(l.routine_id, new Set()).get(l.routine_id)!).add(l.date))
    return m
  }, [logs])

  const active = routines.filter((r) => !r.archived_at).sort(byScheduleOrder)
  const archived = routines.filter((r) => r.archived_at)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-2xl font-semibold tracking-tight">Routines</h1>
          <p className="mt-1 text-sm text-muted md:text-[13px]">Repeat on chosen days and show up automatically on Today.</p>
        </div>
        <Button variant="primary" onClick={() => editRoutine({ starts_on: today })}><Plus size={14} /> New routine</Button>
      </header>

      {!isLoading && active.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center sm:p-10">
          <p className="text-sm font-medium">No routines yet</p>
          <p className="mt-1 text-[13px] text-muted">Start with something small: “Gym 07:00”, “Read 20m”, “DSA 1h”.</p>
          <Button className="mt-4" variant="subtle" onClick={() => editRoutine({ starts_on: today })}><Plus size={14} /> Create your first routine</Button>
        </div>
      )}

      {active.length > 0 && <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {active.map((r) => <RoutineRow key={r.id} r={r} done={doneByRoutine.get(r.id)} today={today} onOpen={() => editRoutine(r)} />)}
      </div>}

      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((s) => !s)} className="mb-2 flex items-center gap-1 text-xs font-medium text-muted hover:text-fg cursor-pointer">
            <ChevronRight size={14} className={cn('transition-transform', showArchived && 'rotate-90')} /> Archived · {archived.length}
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line opacity-70">
              {archived.map((r) => <RoutineRow key={r.id} r={r} done={doneByRoutine.get(r.id)} today={today} onOpen={() => editRoutine(r)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RoutineRow({ r, done, today, onOpen }: { r: Routine; done?: Set<string>; today: string; onOpen: () => void }) {
  const { current } = routineStreak(r, done ?? new Set(), today)
  return (
    <button onClick={onOpen} className="flex items-center gap-3 bg-panel px-4 py-3 text-left transition-colors hover:bg-panel-2 cursor-pointer">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(r.color) }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium md:text-[13px]">{r.title}</div>
        <div className="truncate text-xs text-muted">
          {describeDays(r.days_of_week)}
          {r.start_time && <span className="tabular font-mono"> · {r.start_time.slice(0, 5)}{r.duration_min ? `–${formatHM(minutesOf(r.start_time) + r.duration_min)}` : ''}</span>}
        </div>
      </div>
      {current > 0 && (
        <span className="tabular flex items-center gap-1 font-mono text-xs text-muted" title="Current streak">
          <Flame size={13} className="text-amber-500" /> {current}
        </span>
      )}
    </button>
  )
}
