import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react'
import { Button, Check, Kbd } from '@/components/primitives'
import { Timeline, type Block } from '@/components/Timeline'
import { useEditor } from '@/components/Editor'
import { useLogs, useMutations, useRoutines, useTasks } from '@/lib/data'
import { addDaysISO, diffDaysISO, formatHM, minutesOf, todayISO } from '@/lib/domain/dates'
import { byScheduleOrder, routinesDueOn } from '@/lib/domain/routines'
import { dayCompletion, logKey } from '@/lib/domain/stats'
import { parseQuickAdd } from '@/lib/domain/quickAdd'
import type { Routine, Task } from '@/lib/types'
import { cn, colorOf, formatDuration, isTyping } from '@/lib/ui'

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
  const { saveTask, setRoutineDone } = useMutations()
  const { editTask, editRoutine } = useEditor()

  const due = useMemo(() => routinesDueOn(routines, date), [routines, date])
  const dayTasks = useMemo(() => tasks.filter((t) => t.date === date).sort(byScheduleOrder), [tasks, date])
  const overdue = useMemo(
    () => (isToday ? tasks.filter((t) => t.date < today && !t.done_at).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [tasks, isToday, today],
  )
  const progress = useMemo(() => dayCompletion(date, routines, logKeys, tasks), [date, routines, logKeys, tasks])

  const items: Item[] = [
    ...overdue.map((task) => ({ kind: 'task' as const, task, done: false, overdue: true })),
    ...due.map((routine) => ({ kind: 'routine' as const, routine, done: logKeys.has(logKey(routine.id, date)) })),
    ...dayTasks.map((task) => ({ kind: 'task' as const, task, done: !!task.done_at })),
  ]

  const toggle = (i: Item) =>
    i.kind === 'routine'
      ? setRoutineDone(i.routine.id, date, !i.done)
      : saveTask({ ...i.task, done_at: i.done ? null : new Date().toISOString() })
  const open = (i: Item) => (i.kind === 'routine' ? editRoutine(i.routine) : editTask(i.task))
  const moveToToday = (t: Task) => saveTask({ ...t, date: today })

  const blocks: Block[] = [
    ...due.filter((r) => r.start_time).map((r) => ({
      key: `r:${r.id}`, kind: 'routine' as const, title: r.title, start: minutesOf(r.start_time!), duration: r.duration_min,
      color: r.color, done: logKeys.has(logKey(r.id, date)), routine: r,
    })),
    ...dayTasks.filter((t) => t.start_time).map((t) => ({
      key: `t:${t.id}`, kind: 'task' as const, title: t.title, start: minutesOf(t.start_time!), duration: t.duration_min,
      color: 'slate', done: !!t.done_at, task: t,
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

  const rel = relativeLabel(date, today)
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 pb-4 pt-5 md:px-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted">
            {rel && <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">{rel}</span>}
            <span>{fmt(date, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{fmt(date, { weekday: 'long' })}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex" aria-label={`${progress.done} of ${progress.total} done`}>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-panel-2">
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
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="scrollbar-thin min-h-0 overflow-y-auto border-line px-4 py-4 md:border-r md:px-6">
          <QuickAdd inputRef={quickAddRef} date={date} onAdd={saveTask} />

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
                      <button onClick={(e) => { e.stopPropagation(); moveToToday(task) }} className="flex items-center gap-1 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-fg cursor-pointer" aria-label="Move to today">
                        Today <ArrowRight size={12} />
                      </button>
                    }
                  />
                )
              })}
            </Group>
          )}

          <Group title="Routines" count={due.length} empty="No routines scheduled for this day.">
            {due.map((routine) => {
              const item: Item = { kind: 'routine', routine, done: logKeys.has(logKey(routine.id, date)) }
              return (
                <Row key={routine.id} item={item} focused={items[cursor] && itemKey(items[cursor]) === itemKey(item)}
                  rowRef={(el) => (rowRefs.current[itemKey(item)] = el)} onToggle={() => toggle(item)} onOpen={() => open(item)} />
              )
            })}
          </Group>

          <Group title="Tasks" count={dayTasks.length} empty="Nothing planned yet. Type above to add.">
            {dayTasks.map((task) => {
              const item: Item = { kind: 'task', task, done: !!task.done_at }
              return (
                <Row key={task.id} item={item} focused={items[cursor] && itemKey(items[cursor]) === itemKey(item)}
                  rowRef={(el) => (rowRefs.current[itemKey(item)] = el)} onToggle={() => toggle(item)} onOpen={() => open(item)} />
              )
            })}
          </Group>

          <p className="mt-8 hidden gap-3 text-[11px] text-faint md:flex">
            <span><Kbd>n</Kbd> add</span><span><Kbd>j</Kbd><Kbd>k</Kbd> move</span><span><Kbd>x</Kbd> done</span>
            <span><Kbd>←</Kbd><Kbd>→</Kbd> day</span><span><Kbd>⌘K</Kbd> commands</span>
          </p>
        </section>

        <section className="h-[70dvh] min-h-0 border-t border-line pt-3 md:h-auto md:border-t-0">
          <Timeline
            blocks={blocks}
            isToday={isToday}
            onCreateAt={(m) => editTask({ date, start_time: formatHM(m), duration_min: 30 })}
            onOpen={(b) => (b.routine ? editRoutine(b.routine) : b.task && editTask(b.task))}
            onMoveTask={(task, start, duration) => saveTask({ ...task, start_time: formatHM(start), duration_min: duration })}
          />
        </section>
      </div>
    </div>
  )
}

function QuickAdd({ date, onAdd, inputRef }: { date: string; onAdd: (t: Task) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [value, setValue] = useState('')
  const parsed = parseQuickAdd(value)
  const target = addDaysISO(date, parsed.dayOffset)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!parsed.title) return
    onAdd({
      id: crypto.randomUUID(), title: parsed.title, date: target, start_time: parsed.startTime,
      duration_min: parsed.durationMin ?? (parsed.startTime ? 30 : null), notes: null, done_at: null, sort_order: Date.now(),
    })
    setValue('')
  }

  const chips = [
    parsed.dayOffset ? fmt(target, { weekday: 'short', month: 'short', day: 'numeric' }) : null,
    parsed.startTime,
    parsed.durationMin ? formatDuration(parsed.durationMin) : null,
  ].filter(Boolean)

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
      {count === 0 && empty ? <p className="py-2 text-[13px] text-faint">{empty}</p> : <div className="grid">{children}</div>}
    </div>
  )
}

function Row({ item, onToggle, onOpen, meta, trailing, focused, rowRef }: {
  item: Item; onToggle: () => void; onOpen: () => void; meta?: string; trailing?: React.ReactNode; focused?: boolean
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
        'group -mx-2 flex h-9 items-center gap-3 rounded-md px-2 outline-none transition-colors cursor-pointer hover:bg-panel-2',
        focused && 'bg-panel-2 ring-1 ring-line-strong',
      )}
    >
      <Check checked={item.done} onChange={onToggle} color={color} label={`Mark "${data.title}" ${item.done ? 'not done' : 'done'}`} />
      {color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className={cn('min-w-0 flex-1 truncate text-[13px]', item.done && 'text-faint line-through')}>{data.title}</span>
      {trailing}
      {meta && <span className="shrink-0 text-xs text-danger/80">{meta}</span>}
      {time && <span className="tabular shrink-0 font-mono text-[11px] text-faint">{time}</span>}
    </div>
  )
}
