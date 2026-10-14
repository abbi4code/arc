import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GraduationCap, Plus } from 'lucide-react'
import { Button } from '@/components/primitives'
import { useEditor } from '@/components/Editor'
import { ProgressBar, StatusBadge, dueLabel } from '@/components/learning'
import { useGoals, useTopics, useTracks } from '@/lib/data'
import { todayISO } from '@/lib/domain/dates'
import { goalProgress, goalStatus } from '@/lib/domain/learning'
import type { LearningTrack } from '@/lib/types'
import { cn, colorOf } from '@/lib/ui'

export default function LearningPage() {
  const { data: tracks = [], isLoading } = useTracks()
  const { editTrack } = useEditor()
  const [showArchived, setShowArchived] = useState(false)
  const active = tracks.filter((t) => t.status === 'active').sort((a, b) => a.sort_order - b.sort_order)
  const archived = tracks.filter((t) => t.status !== 'active')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-2xl font-semibold tracking-tight">Learning</h1>
          <p className="mt-1 text-sm text-muted md:text-[13px]">Tracks, goals with deadlines, and the topics that get you there.</p>
        </div>
        <Button variant="primary" onClick={() => editTrack({})}><Plus size={14} /> New track</Button>
      </header>

      {!isLoading && active.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center sm:p-10">
          <GraduationCap className="mx-auto text-accent" size={22} />
          <p className="mt-2 text-sm font-medium">What do you want to learn?</p>
          <p className="mt-1 text-[13px] text-muted">Create a track like “DSA” or “AI / ML”, then add goals with a deadline.</p>
          <Button className="mt-4" variant="subtle" onClick={() => editTrack({})}><Plus size={14} /> Create a track</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {active.map((t) => <TrackCard key={t.id} track={t} />)}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((s) => !s)} className="mb-2 flex items-center gap-1 text-xs font-medium text-muted hover:text-fg cursor-pointer">
            <ChevronRight size={14} className={cn('transition-transform', showArchived && 'rotate-90')} /> Archived · {archived.length}
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 gap-3 opacity-75 sm:grid-cols-2">
              {archived.map((t) => <TrackCard key={t.id} track={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TrackCard({ track }: { track: LearningTrack }) {
  const { data: goals = [] } = useGoals()
  const { data: topics = [] } = useTopics()
  const today = todayISO()
  const color = colorOf(track.color)

  const { done, total, next } = useMemo(() => {
    const mine = goals.filter((g) => g.track_id === track.id)
    let done = 0, total = 0
    const open = mine
      .map((g) => { const p = goalProgress(g.id, topics); done += p.done; total += p.total; return { g, ...goalStatus(g, p, today) } })
      .filter((x) => x.status !== 'done')
      .sort((a, b) => a.g.target_date.localeCompare(b.g.target_date))
    return { done, total, next: open[0] }
  }, [goals, topics, track.id, today])

  return (
    <Link to={`/learning/${track.id}`} className="group grid gap-3 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{track.title}</span>
        {track.status !== 'active' && <span className="text-[11px] capitalize text-muted">{track.status}</span>}
        <ChevronRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar value={total ? done / total : 0} color={color} className="flex-1" />
        <span className="tabular font-mono text-xs text-muted">{done}/{total}</span>
      </div>
      <div className="flex min-h-5 items-start gap-2 text-xs text-muted">
        {next ? (
          <>
            <span className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]"><span className="text-fg">{next.g.title}</span> · {dueLabel(next.g.target_date, today)}</span>
            <StatusBadge status={next.status} progress={next.progress} expected={next.expected} />
          </>
        ) : <span className="text-faint">No open goals</span>}
      </div>
    </Link>
  )
}
