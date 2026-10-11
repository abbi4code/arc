import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowUp, CalendarRange, ChevronLeft, ChevronRight, CornerDownLeft, GraduationCap, ListChecks } from 'lucide-react'
import { Button, Check, Kbd } from '@/components/primitives'
import { Timeline, type Block } from '@/components/Timeline'
import { useEditor } from '@/components/Editor'
import { useGoals, useLogs, useMutations, useRoutines, useTasks, useTopics, useTracks } from '@/lib/data'
import { dueSoonGoals } from '@/lib/domain/learning'
import { StatusBadge, dueLabel } from '@/components/learning'
import { addDaysISO, diffDaysISO, formatHM, minutesOf, todayISO } from '@/lib/domain/dates'
import { byScheduleOrder, routinesDueOn } from '@/lib/domain/routines'
import { dayCompletion, logKey } from '@/lib/domain/stats'
import { parseQuickAdd } from '@/lib/domain/quickAdd'
import type { Routine, Task } from '@/lib/types'
import { cn, colorOf, formatDuration, isTyping } from '@/lib/ui'
import { useIsDesktop, useKeyboardOffset } from '@/lib/viewport'

type Item =
  | { kind: 'routine'; routine: Routine; done: boolean }
  | { kind: 'task'; task: Task; done: boolean; overdue?: boolean }

const itemKey = (i: Item) => (i.kind === 'routine' ? `r:${i.routine.id}` : `t:${i.task.id}`)

function relativeLabel(date: string, today: string) {
  const d = diffDaysISO(date, today)
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : null
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts)

export default function TodayPage() {
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const date = params.get('d') ?? today
  const setDate = (d: string) => setParams(d === today ? {} : { d }, { replace: true })
  const isToday = date === today

  const { data: routines = [] } = useRoutines()
  const { data: tasks = [] } = useTasks()
  const { keys: logKeys } = useLogs()
  const { saveTask, setTaskDone, setRoutineDone } = useMutations()
  const { data: tracks = [] } = useTracks()
  const { data: goals = [] } = useGoals()
  const { data: topics = [] } = useTopics()
  const navigate = useNavigate()
  const { editTask, editRoutine } = useEditor()

  const due = useMemo(() => routinesDueOn(routines, date), [routines, date])
  const dayTasks = useMemo(() => tasks.filter((t) => t.date === date).sort(byScheduleOrder), [tasks, date])
  const overdue = useMemo(
    () => (isToday ? tasks.filter((t) => t.date < today && !t.done_at).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [tasks, isToday, today],
  )
  const progress = useMemo(() => dayCompletion(date, routines, logKeys, tasks), [date, routines, logKeys, tasks])
  const dueGoals = useMemo(() => (isToday ? dueSoonGoals(goals, tracks, topics, today) : []), [isToday, goals, tracks, topics, today])
  // "Track · Goal" label for tasks planned from a learning topic
  const topicLabel = useMemo(() => {
    const goalById = new Map(goals.map((g) => [g.id, g]))
    const trackById = new Map(tracks.map((t) => [t.id, t]))
    return new Map(topics.map((t) => {
      const g = goalById.get(t.goal_id)
      const tr = g && trackById.get(g.track_id)
      return [t.id, g && tr ? `${tr.title} · ${g.title}` : '']
    }))
  }, [topics, goals, tracks])

  const items: Item[] = [
    ...overdue.map((task) => ({ kind: 'task' as const, task, done: false, overdue: true })),
    ...due.map((routine) => ({ kind: 'routine' as const, routine, done: logKeys.has(logKey(routine.id, date)) })),
    ...dayTasks.map((task) => ({ kind: 'task' as const, task, done: !!task.done_at })),
  ]

  const toggle = (i: Item) =>
    i.kind === 'routine'
      ? setRoutineDone(i.routine.id, date, !i.done)
      : setTaskDone(i.task, !i.done)
  const open = (i: Item) => (i.kind === 'routine' ? editRoutine(i.routine) : editTask(i.task))
  const moveToToday = (t: Task) => saveTask({ ...t, date: today })

  const blocks: Block[] = [
    ...due.filter((r) => r.start_time).map((r) => ({
      key: `r:${r.id}`, kind: 'routine' as const, title: r.title, start: minutesOf(r.start_time!), duration: r.duration_min,
      color: r.color, done: logKeys.has(logKey(r.id, date)), routine: r,
    })),
    ...dayTasks.filter((t) => t.start_time).map((t) => ({
      key: `t:${t.id}`, kind: 'task' as const, title: t.title, start: minutesOf(t.start_time!), duration: t.duration_min,
      color: 'accent', done: !!t.done_at, task: t,
    })),
  ]

  // Keyboard: n quick-add · ←/→ day · t today · j/k move · x toggle · Enter open
  const quickAddRef = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState(-1)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => setCursor(-1), [date])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return
      const move = (to: number) => {
        e.preventDefault()
        const next = Math.max(0, Math.min(items.length - 1, to))
        setCursor(next)
        rowRefs.current[itemKey(items[next])]?.focus()
      }
      switch (e.key) {
        case 'n': e.preventDefault(); quickAddRef.current?.focus(); break
        case 'ArrowLeft': setDate(addDaysISO(date, -1)); break
        case 'ArrowRight': setDate(addDaysISO(date, 1)); break
        case 't': setDate(today); break
        case 'j': if (items.length) move(cursor + 1); break
        case 'k': if (items.length) move(cursor - 1); break
        case 'x': if (items[cursor]) { e.preventDefault(); toggle(items[cursor]) } break
        case 'Enter': if (items[cursor]) { e.preventDefault(); open(items[cursor]) } break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const isDesktop = useIsDesktop()
  const [view, setViewState] = useState<'list' | 'timeline'>(() => {
    try { return localStorage.getItem('todayView') === 'timeline' ? 'timeline' : 'list' } catch { return 'list' }
  })
  const setView = (v: 'list' | 'timeline') => {
    setViewState(v)
    try { localStorage.setItem('todayView', v) } catch { /* storage blocked */ }
  }
  const nothingPlanned = items.length === 0 && dueGoals.length === 0

  const rel = relativeLabel(date, today)
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3 border-b border-line px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted">
            {rel && <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">{rel}</span>}
            <span>{fmt(date, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{fmt(date, { weekday: 'long' })}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" aria-label={`${progress.done} of ${progress.total} done`}>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-2 sm:w-24">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular font-mono text-xs text-muted">{progress.done}/{progress.total}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDate(addDaysISO(date, -1))}><ChevronLeft size={16} /></Button>
            {!isToday && <Button variant="subtle" size="sm" onClick={() => setDate(today)}>Today</Button>}
            <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => setDate(addDaysISO(date, 1))}><ChevronRight size={16} /></Button>
          </div>
        </div>
        <div className="flex w-full rounded-lg border border-line bg-panel-2 p-0.5 md:hidden" role="tablist" aria-label="Today view">
          {([['list', 'List', ListChecks], ['timeline', 'Timeline', CalendarRange]] as const).map(([v, label, Icon]) => (
            <button
              key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-colors cursor-pointer',
                view === v ? 'bg-panel font-medium text-fg shadow-sm' : 'text-muted')}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className={cn(
          'scrollbar-thin min-h-0 overflow-y-auto border-line px-4 pb-32 pt-4 md:border-r md:px-6 md:pb-4',
          view === 'timeline' && 'hidden md:block',
        )}>
          {isDesktop && <QuickAdd inputRef={quickAddRef} date={date} onAdd={saveTask} />}

          {nothingPlanned && (
            <div className="grid place-items-center px-6 py-16 text-center">
              <ListChecks size={22} className="text-faint" />
              <p className="mt-3 text-sm font-medium">Nothing planned{isToday ? ' yet' : ''}</p>
              <p className="mt-1 text-[13px] text-muted">
                {isDesktop ? 'Type above' : 'Type below'}: “Deep work 10:00 2h”, “Gym tomorrow 7am”.
              </p>
            </div>
          )}

          {overdue.length > 0 && (
            <Group
              title="Overdue"
              count={overdue.length}
              action={<Button variant="ghost" size="sm" onClick={() => overdue.forEach(moveToToday)}>Move all to today</Button>}
            >
              {overdue.map((task) => {
                const item: Item = { kind: 'task', task, done: false, overdue: true }
                return (
                  <Row
                    key={task.id} item={item} focused={items[cursor] && itemKey(items[cursor]) === itemKey(item)}
                    rowRef={(el) => (rowRefs.current[itemKey(item)] = el)}
                    onToggle={() => toggle(item)} onOpen={() => open(item)}
                    meta={fmt(task.date, { month: 'short', day: 'numeric' })}
                    trailing={
                      <button onClick={(e) => { e.stopPropagation(); moveToToday(task) }} className="flex shrink-0 items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer md:opacity-0 md:group-hover:opacity-100" aria-label="Move to today">
                        Today <ArrowRight size={12} />
                      </button>
                    }
                  />
                )
              })}
            </Group>
          )}

          {dueGoals.length > 0 && (
            <Group title="Learning deadlines" count={dueGoals.length}>
              {dueGoals.map(({ goal, track, counts, status, progress, expected }) => (
                <button
                  key={goal.id}
                  onClick={() => navigate(`/learning/${track.id}`)}
                  className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 text-left transition-colors cursor-pointer hover:bg-panel-2 md:min-h-9"
                >
                  <GraduationCap size={16} className="shrink-0" style={{ color: colorOf(track.color) }} />
                  <span className="min-w-0 flex-1 truncate text-sm md:text-[13px]">
                    {goal.title} <span className="text-muted">· {track.title}</span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">{dueLabel(goal.target_date, today).replace(/^by [^·]+· /, '')}</span>
                  <span className="tabular shrink-0 font-mono text-[11px] text-muted">{counts.done}/{counts.total}</span>
                  <StatusBadge status={status} progress={progress} expected={expected} />
                </button>
              ))}
            </Group>
          )}

          {due.length > 0 && <Group title="Routines" count={due.length}>
            {due.map((routine) => {
              const item: Item = { kind: 'routine', routine, done: logKeys.has(logKey(routine.id, date)) }
              return (
                <Row key={routine.id} item={item} focused={items[cursor] && itemKey(items[cursor]) === itemKey(item)}
                  rowRef={(el) => (rowRefs.current[itemKey(item)] = el)} onToggle={() => toggle(item)} onOpen={() => open(item)} />
              )
            })}
          </Group>}

          {dayTasks.length > 0 && <Group title="Tasks" count={dayTasks.length}>
            {dayTasks.map((task) => {
              const item: Item = { kind: 'task', task, done: !!task.done_at }
              return (
                <Row key={task.id} item={item} focused={items[cursor] && itemKey(items[cursor]) === itemKey(item)}
                  rowRef={(el) => (rowRefs.current[itemKey(item)] = el)} onToggle={() => toggle(item)} onOpen={() => open(item)}
                  chip={task.topic_id ? topicLabel.get(task.topic_id) : undefined} />
              )
            })}
          </Group>}

          <p className="mt-8 hidden gap-3 text-[11px] text-faint md:flex">
            <span><Kbd>n</Kbd> add</span><span><Kbd>j</Kbd><Kbd>k</Kbd> move</span><span><Kbd>x</Kbd> done</span>
            <span><Kbd>←</Kbd><Kbd>→</Kbd> day</span><span><Kbd>⌘K</Kbd> commands</span>
          </p>
        </section>

        <section className={cn('min-h-0 pb-28 pt-3 md:pb-0', view === 'list' && 'hidden md:block')}>
          <Timeline
            // On phones the timeline mounts hidden; remount when shown so it scrolls to "now".
            key={isDesktop ? 'desktop' : view}
            blocks={blocks}
            isToday={isToday}
            onCreateAt={(m) => editTask({ date, start_time: formatHM(m), duration_min: 30 })}
            onOpen={(b) => (b.routine ? editRoutine(b.routine) : b.task && editTask(b.task))}
            onMoveTask={(task, start, duration) => saveTask({ ...task, start_time: formatHM(start), duration_min: duration })}
          />
        </section>
      </div>

      {!isDesktop && <Composer inputRef={quickAddRef} date={date} onAdd={saveTask} />}
    </div>
  )
}

/** Shared quick-add parsing: "Deep work 10:00 2h tomorrow" → task fields + preview chips. */
function useQuickAdd(date: string, onAdd: (t: Task) => void) {
  const [value, setValue] = useState('')
  const parsed = parseQuickAdd(value)
  const target = addDaysISO(date, parsed.dayOffset)
  const chips = [
    parsed.dayOffset ? fmt(target, { weekday: 'short', month: 'short', day: 'numeric' }) : null,
    parsed.startTime,
    parsed.durationMin ? formatDuration(parsed.durationMin) : null,
  ].filter(Boolean) as string[]
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!parsed.title) return
    onAdd({
      id: crypto.randomUUID(), title: parsed.title, date: target, start_time: parsed.startTime,
      duration_min: parsed.durationMin ?? (parsed.startTime ? 30 : null), notes: null, done_at: null, sort_order: Date.now(),
    })
    setValue('')
  }
  return { value, setValue, chips, submit, canSubmit: !!parsed.title }
}

/**
 * Phone composer pinned above the tab bar (thumb reach). While focused, the tab bar hides and the
 * composer rides on top of the keyboard. Enter adds and keeps the keyboard open for the next task.
 */
function Composer({ date, onAdd, inputRef }: { date: string; onAdd: (t: Task) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { value, setValue, chips, submit, canSubmit } = useQuickAdd(date, onAdd)
  const [focused, setFocused] = useState(false)
  const keyboard = useKeyboardOffset(focused)

  useEffect(() => {
    document.documentElement.toggleAttribute('data-composing', focused)
    return () => document.documentElement.removeAttribute('data-composing')
  }, [focused])

  return (
    <form
      onSubmit={submit}
      className="fixed inset-x-0 z-30 border-t border-line bg-bg/95 px-3 pt-2 backdrop-blur"
      style={{
        bottom: focused ? 0 : 'calc(56px + env(safe-area-inset-bottom))',
        transform: keyboard ? `translateY(${-keyboard}px)` : undefined,
        paddingBottom: focused ? 'max(0.5rem, env(safe-area-inset-bottom))' : '0.5rem',
      }}
    >
      {chips.length > 0 && (
        <div className="mb-2 flex gap-1.5 px-1" aria-live="polite">
          {chips.map((c) => <span key={c} className="tabular rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">{c}</span>)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setValue(''))}
          enterKeyHint="send"
          autoComplete="off"
          placeholder="Add a task…  e.g. Gym 7am 1h"
          aria-label="Quick add task"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-base outline-none placeholder:text-faint focus:border-accent/60"
        />
        <button
          type="submit"
          aria-label="Add task"
          disabled={!canSubmit}
          // keep focus (and the keyboard) in the input when tapping send
          onPointerDown={(e) => e.preventDefault()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-40 cursor-pointer"
        >
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </div>
    </form>
  )
}

function QuickAdd({ date, onAdd, inputRef }: { date: string; onAdd: (t: Task) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { value, setValue, chips, submit } = useQuickAdd(date, onAdd)
  return (
    <form onSubmit={submit} className="mb-6">
      <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-[var(--ring)]">
        <span className="text-faint">+</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setValue(''))}
          placeholder="Add a task…  e.g. Deep work 10:00 2h"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
          aria-label="Quick add task"
        />
        {chips.map((c) => (
          <span key={c} className="tabular shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">{c}</span>
        ))}
        {value && <CornerDownLeft size={14} className="shrink-0 text-faint" />}
      </div>
    </form>
  )
}

function Group({ title, count, empty, action, children }: { title: string; count: number; empty?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-1 flex h-7 items-center justify-between">
        <h2 className="text-xs font-medium text-muted">
          {title} <span className="tabular ml-1 font-mono text-faint">{count}</span>
        </h2>
        {action}
      </div>
      {count === 0 && empty ? <p className="py-2 text-[13px] text-faint">{empty}</p> : <div className="grid grid-cols-1">{children}</div>}
    </div>
  )
}

function Row({ item, onToggle, onOpen, meta, trailing, focused, rowRef, chip }: {
  item: Item; onToggle: () => void; onOpen: () => void; meta?: string; trailing?: React.ReactNode; focused?: boolean; chip?: string
  rowRef: (el: HTMLDivElement | null) => void
}) {
  const data = item.kind === 'routine' ? item.routine : item.task
  const color = item.kind === 'routine' ? colorOf(item.routine.color) : undefined
  const time = data.start_time
    ? `${data.start_time.slice(0, 5)}${data.duration_min ? `–${formatHM(minutesOf(data.start_time) + data.duration_min)}` : ''}`
    : data.duration_min ? formatDuration(data.duration_min) : ''
  return (
    <div
      ref={rowRef}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={cn(
        'group -mx-2 flex h-11 items-center gap-3 rounded-md px-2 outline-none transition-colors cursor-pointer hover:bg-panel-2 md:h-9',
        focused && 'bg-panel-2 ring-1 ring-line-strong',
      )}
    >
      <Check checked={item.done} onChange={onToggle} color={color} label={`Mark "${data.title}" ${item.done ? 'not done' : 'done'}`} />
      {color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className={cn('min-w-0 flex-1 truncate text-sm md:text-[13px]', item.done && 'text-muted line-through')}>{data.title}</span>
      {chip && (
        <span className="flex min-w-0 max-w-[40%] shrink items-center gap-1 text-[11px] text-muted" title={chip}>
          <GraduationCap size={12} className="shrink-0" /> <span className="truncate">{chip}</span>
        </span>
      )}
      {trailing}
      {meta && <span className="shrink-0 text-xs text-danger/80">{meta}</span>}
      {time && <span className="tabular shrink-0 font-mono text-[11px] text-faint">{time}</span>}
    </div>
  )
}
