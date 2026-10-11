import { useMemo, useState, type ClipboardEvent, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, ChevronDown, ChevronLeft, NotebookPen, Pencil, Plus } from 'lucide-react'
import { Button, Check } from '@/components/primitives'
import { useEditor } from '@/components/Editor'
import { OpenLink, ProgressBar, StatusBadge, dueLabel } from '@/components/learning'
import { firstUrl } from '@/lib/domain/links'
import { useGoals, useMutations, useTasks, useTopics, useTracks } from '@/lib/data'
import { todayISO } from '@/lib/domain/dates'
import { goalProgress, goalStatus, parseTopicLines } from '@/lib/domain/learning'
import type { LearningGoal, LearningTopic, LearningTrack, Task } from '@/lib/types'
import { cn, colorOf } from '@/lib/ui'

export default function TrackPage() {
  const { trackId } = useParams()
  const { data: tracks, isLoading } = useTracks()
  const { data: goals = [] } = useGoals()
  const { editTrack, editGoal } = useEditor()
  const track = tracks?.find((t) => t.id === trackId)

  const mine = useMemo(
    () => goals.filter((g) => g.track_id === trackId).sort((a, b) => a.target_date.localeCompare(b.target_date) || a.sort_order - b.sort_order),
    [goals, trackId],
  )

  if (!track) return isLoading ? null : <Navigate to="/learning" replace />
  const color = colorOf(track.color)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <Link to="/learning" className="-ml-1 mb-3 inline-flex items-center gap-0.5 text-xs text-muted hover:text-fg"><ChevronLeft size={14} /> Learning</Link>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
          <span className="size-3 shrink-0 rounded-full" style={{ background: color }} />
          <h1 className="truncate text-2xl font-semibold tracking-tight">{track.title}</h1>
          {track.status !== 'active' && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] capitalize text-muted">{track.status}</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => editTrack(track)} aria-label="Edit track"><Pencil size={14} /> Edit</Button>
          <Button variant="primary" onClick={() => editGoal({ track_id: track.id })}><Plus size={14} /> New goal</Button>
        </div>
      </header>

      {mine.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
          <p className="text-sm font-medium">Set your first goal</p>
          <p className="mt-1 text-[13px] text-muted">What do you want to finish, and by when? e.g. “Graphs by Nov 15”.</p>
          <Button className="mt-4" variant="subtle" onClick={() => editGoal({ track_id: track.id })}><Plus size={14} /> Add goal</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {mine.map((g) => <GoalCard key={g.id} goal={g} track={track} />)}
      </div>
    </div>
  )
}

function GoalCard({ goal, track }: { goal: LearningGoal; track: LearningTrack }) {
  const { data: topics = [] } = useTopics()
  const { data: tasks = [] } = useTasks()
  const { editGoal } = useEditor()
  const today = todayISO()
  const mine = useMemo(() => topics.filter((t) => t.goal_id === goal.id).sort((a, b) => a.sort_order - b.sort_order), [topics, goal.id])
  const counts = goalProgress(goal.id, topics)
  const { status, progress, expected } = goalStatus(goal, counts, today)
  const [open, setOpen] = useState(status !== 'done')
  const color = colorOf(track.color)

  // Open (not done) task per topic, to show "Planned · date"
  const planned = useMemo(() => {
    const m = new Map<string, Task>()
    tasks.forEach((t) => t.topic_id && !t.done_at && (!m.has(t.topic_id) || t.date < m.get(t.topic_id)!.date) && m.set(t.topic_id, t))
    return m
  }, [tasks])

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOpen((o) => !o)} className="grid min-w-0 flex-1 gap-2 text-left cursor-pointer" aria-expanded={open}>
          <div className="flex min-w-0 items-center gap-2">
            <ChevronDown size={15} className={cn('shrink-0 text-faint transition-transform', !open && '-rotate-90')} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{goal.title}</span>
            <StatusBadge status={status} progress={progress} expected={expected} />
          </div>
          <div className="flex items-center gap-2 pl-6">
            <ProgressBar value={progress} color={color} className="flex-1" />
            <span className="tabular shrink-0 font-mono text-xs text-muted">{counts.done}/{counts.total}</span>
          </div>
          <div className="pl-6 text-xs text-muted">
            {dueLabel(goal.target_date, today)}
            {status === 'behind' && <span> · {Math.round(progress * 100)}% done, {Math.round(expected * 100)}% expected</span>}
          </div>
        </button>
        <Button variant="ghost" size="icon" aria-label={`Edit goal ${goal.title}`} onClick={() => editGoal(goal)}><Pencil size={14} /></Button>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-3 pt-2">
          {mine.map((t) => <TopicRow key={t.id} topic={t} color={color} plannedTask={planned.get(t.id)} />)}
          <AddTopics goalId={goal.id} nextOrder={mine.length ? mine[mine.length - 1].sort_order + 1 : 0} />
        </div>
      )}
    </section>
  )
}

const fmtShort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function TopicRow({ topic, color, plannedTask }: { topic: LearningTopic; color: string; plannedTask?: Task }) {
  const { saveTopic } = useMutations()
  const { editTopic, editTask } = useEditor()
  const navigate = useNavigate()
  const done = !!topic.done_at
  const url = firstUrl(topic.notes)
  const hasMoreNotes = !!topic.notes && topic.notes.trim() !== url
  return (
    <div
      role="button" tabIndex={0} onClick={() => editTopic(topic)}
      onKeyDown={(e) => e.key === 'Enter' && editTopic(topic)}
      className="group -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 outline-none cursor-pointer hover:bg-panel-2 focus-visible:bg-panel-2 md:min-h-9"
    >
      <Check checked={done} color={color} label={`Mark "${topic.title}" ${done ? 'not done' : 'done'}`}
        onChange={() => saveTopic({ ...topic, done_at: done ? null : new Date().toISOString() })} />
      <span className={cn('min-w-0 flex-1 truncate text-sm md:text-[13px]', done && 'text-muted line-through')}>{topic.title}</span>
      {hasMoreNotes && <NotebookPen size={13} className="shrink-0 text-faint" aria-label="Has notes" />}
      {url && <OpenLink url={url} label={topic.title} />}
      {!done && (plannedTask ? (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(plannedTask.date === todayISO() ? '/' : `/?d=${plannedTask.date}`) }}
          className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent cursor-pointer"
        >
          Planned · {plannedTask.date === todayISO() ? 'Today' : fmtShort(plannedTask.date)}
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); editTask({ title: topic.title, date: todayISO(), topic_id: topic.id, notes: url }) }}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted hover:bg-panel hover:text-fg cursor-pointer md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
          aria-label={`Plan "${topic.title}"`}
        >
          <CalendarPlus size={13} /> Plan
        </button>
      ))}
    </div>
  )
}

function AddTopics({ goalId, nextOrder }: { goalId: string; nextOrder: number }) {
  const { saveTopics } = useMutations()
  const [value, setValue] = useState('')
  const parsed = parseTopicLines(value)

  const add = (items = parsed) => {
    if (!items.length) return
    saveTopics(items.map((t, i) => ({
      id: crypto.randomUUID(), goal_id: goalId, title: t.title, notes: t.url ?? null,
      done_at: t.done ? new Date().toISOString() : null, sort_order: nextOrder + i,
    })))
    setValue('')
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); add() }
  // Pasting a list adds one topic per line straight away.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const items = parseTopicLines(e.clipboardData.getData('text'))
    if (items.length > 1) { e.preventDefault(); add(items) }
  }

  return (
    <form onSubmit={onSubmit} className="mt-1 flex items-center gap-2">
      <Plus size={14} className="shrink-0 text-faint" />
      <input
        value={value} onChange={(e) => setValue(e.target.value)} onPaste={onPaste}
        placeholder="Add a topic or paste links (one per line)"
        aria-label="Add topics"
        className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:h-8 md:text-[13px]"
      />
      {value.trim() && <Button type="submit" size="sm" variant="subtle">Add</Button>}
    </form>
  )
}
