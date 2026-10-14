import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowUp, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, GraduationCap, ListChecks, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Check, Kbd } from '@/components/primitives'
import { Timeline, type Block } from '@/components/Timeline'
import { useEditor } from '@/components/Editor'
import { useGoals, useGroups, useLogs, useMutations, useRoutines, useTasks, useTopics, useTracks } from '@/lib/data'
import { addSubtasks, groupForTag, subtaskProgress } from '@/lib/domain/tasks'
import { dueSoonGoals } from '@/lib/domain/learning'
import { OpenLink, StatusBadge, dueLabel } from '@/components/learning'
import { firstUrl, linkSource } from '@/lib/domain/links'
import { addDaysISO, diffDaysISO, formatHM, minutesOf, todayISO } from '@/lib/domain/dates'
import { byScheduleOrder, routinesDueOn } from '@/lib/domain/routines'
import { dayCompletion, logKey } from '@/lib/domain/stats'
import { parseQuickAdd } from '@/lib/domain/quickAdd'
import type { Routine, Task, TaskGroup } from '@/lib/types'
import { COLORS, cn, colorOf, formatDuration, isTyping } from '@/lib/ui'
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
  const { saveTask, setTaskDone, setRoutineDone, deleteTask } = useMutations()
  const { data: tracks = [] } = useTracks()
  const { data: goals = [] } = useGoals()
  const { data: topics = [] } = useTopics()
  const navigate = useNavigate()
  const { editTask, editRoutine, editGroup } = useEditor()
  const { data: groupsData } = useGroups()
  const groups = useMemo(() => [...(groupsData ?? [])].sort((a, b) => a.sort_order - b.sort_order), [groupsData])
  const { toggleSubtask } = useMutations()

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

  // Tasks under their group (in group order), then ungrouped tasks. Empty groups are hidden.
  const sections = useMemo(() => {
    const byGroup = new Map<string, Task[]>()
    const loose: Task[] = []
    const known = new Set(groups.map((g) => g.id))
    dayTasks.forEach((t) => (t.group_id && known.has(t.group_id) ? (byGroup.get(t.group_id) ?? byGroup.set(t.group_id, []).get(t.group_id)!).push(t) : loose.push(t)))
    return [
      ...groups.filter((g) => byGroup.has(g.id)).map((g) => ({ key: g.id, group: g as TaskGroup | null, tasks: byGroup.get(g.id)! })),
      ...(loose.length ? [{ key: 'none', group: null as TaskGroup | null, tasks: loose }] : []),
    ]
  }, [dayTasks, groups])
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('collapsedGroups') ?? '[]')) } catch { return new Set() }
  })
  const toggleCollapsed = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    try { localStorage.setItem('collapsedGroups', JSON.stringify([...next])) } catch { /* storage blocked */ }
    return next
  })
  // Checklists: open by default while the task is open; remember explicit toggles for this session
  const [checklistOverride, setChecklistOverride] = useState<Record<string, boolean>>({})
  const checklistOpen = (t: Task) => checklistOverride[t.id] ?? !t.done_at

  const items: Item[] = [
    ...overdue.map((task) => ({ kind: 'task' as const, task, done: false, overdue: true })),
    ...due.map((routine) => ({ kind: 'routine' as const, routine, done: logKeys.has(logKey(routine.id, date)) })),
    ...sections.filter((sec) => !collapsed.has(sec.key)).flatMap((sec) => sec.tasks.map((task) => ({ kind: 'task' as const, task, done: !!task.done_at }))),
  ]

  const toggle = (i: Item) =>
    i.kind === 'routine'
      ? setRoutineDone(i.routine.id, date, !i.done)
      : setTaskDone(i.task, !i.done)
  const open = (i: Item) => (i.kind === 'routine' ? editRoutine(i.routine) : editTask(i.task))
  const moveToToday = (t: Task) => saveTask({ ...t, date: today })
  // Delete right away; the toast's Undo puts the exact same row back (same id, same queue).
  const removeTask = (t: Task) => {
    deleteTask(t.id)
    toast(`Deleted “${t.title}”`, { action: { label: 'Undo', onClick: () => saveTask(t) }, duration: 6000 })
  }

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
        case 'Delete':
        case 'Backspace': { const it = items[cursor]; if (it?.kind === 'task') { e.preventDefault(); removeTask(it.task) } break }
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
          {isDesktop && <QuickAdd inputRef={quickAddRef} date={date} onAdd={saveTask} groups={groups} />}

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
                    onToggle={() => toggle(item)} onOpen={() => open(item)} onDelete={() => removeTask(task)}
                    meta={fmt(task.date, { month: 'short', day: 'numeric' })}
                    group={task.group_id ? groupById.get(task.group_id) : undefined}
                    checklistOpen={checklistOpen(task)} onChecklistToggle={() => setChecklistOverride((o) => ({ ...o, [task.id]: !checklistOpen(task) }))}
                    onSubtaskToggle={(id) => toggleSubtask(task, id)} onAddSubtasks={(text) => saveTask(addSubtasks(task, text))}
                    trailing={
                      <button onClick={(e) => { e.stopPropagation(); moveToToday(task) }} className="flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/20 cursor-pointer" aria-label="Move to today">
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
                  className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors cursor-pointer hover:bg-panel-2 md:py-1.5"
                >
                  <GraduationCap size={16} className="mt-0.5 shrink-0" style={{ color: colorOf(track.color) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug [overflow-wrap:anywhere] md:text-[13px]">{goal.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span>{track.title}</span><span>·</span>
                      <span>{dueLabel(goal.target_date, today).replace(/^by [^·]+· /, '')}</span><span>·</span>
                      <span className="tabular font-mono">{counts.done}/{counts.total}</span>
                    </span>
                  </span>
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

          {sections.map(({ key, group, tasks: list }) => {
            const isCollapsed = collapsed.has(key)
            const doneCount = list.filter((t) => t.done_at).length
            return (
              <section key={key} className="mb-6" aria-label={group ? `${group.title} group` : 'Tasks'}>
                <div className="mb-1 flex h-8 items-center gap-1">
                  <button
                    onClick={() => toggleCollapsed(key)}
                    aria-expanded={!isCollapsed}
                    className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-medium text-muted hover:text-fg cursor-pointer"
                  >
                    <ChevronDown size={14} className={cn('shrink-0 transition-transform', isCollapsed && '-rotate-90')} />
                    {group && <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(group.color) }} />}
                    <span className="truncate">{group ? group.title : 'Tasks'}</span>
                    <span className="tabular ml-1 font-mono text-faint">{group ? `${doneCount}/${list.length}` : list.length}</span>
                  </button>
                  {group && (
                    <Button variant="ghost" size="icon" aria-label={`Edit group ${group.title}`} onClick={() => editGroup(group)}><MoreHorizontal size={15} /></Button>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="grid grid-cols-1">
                    {list.map((task) => {
                      const item: Item = { kind: 'task', task, done: !!task.done_at }
                      return (
                        <Row key={task.id} item={item} focused={items[cursor] && itemKey(items[cursor]) === itemKey(item)}
                          rowRef={(el) => (rowRefs.current[itemKey(item)] = el)} onToggle={() => toggle(item)} onOpen={() => open(item)}
                          chip={task.topic_id ? topicLabel.get(task.topic_id) : undefined} onDelete={() => removeTask(task)}
                          checklistOpen={checklistOpen(task)} onChecklistToggle={() => setChecklistOverride((o) => ({ ...o, [task.id]: !checklistOpen(task) }))}
                          onSubtaskToggle={(id) => toggleSubtask(task, id)} onAddSubtasks={(text) => saveTask(addSubtasks(task, text))} />
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}

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

      {!isDesktop && <Composer inputRef={quickAddRef} date={date} onAdd={saveTask} groups={groups} />}
    </div>
  )
}

/** Shared quick-add parsing: "Deep work 10:00 2h tomorrow" → task fields + preview chips. */
function useQuickAdd(date: string, onAdd: (t: Task) => void, groups: TaskGroup[]) {
  const { saveGroup } = useMutations()
  const [value, setValue] = useState('')
  const parsed = parseQuickAdd(value)
  const target = addDaysISO(date, parsed.dayOffset)
  const tag = parsed.group ? groupForTag(parsed.group, groups) : null
  const chips = [
    tag ? ('existing' in tag ? `#${tag.existing.title}` : `#${tag.create} (new)`) : null,
    parsed.dayOffset ? fmt(target, { weekday: 'short', month: 'short', day: 'numeric' }) : null,
    parsed.startTime,
    parsed.durationMin ? formatDuration(parsed.durationMin) : null,
    parsed.url ? `🔗 ${linkSource(parsed.url)}` : null,
  ].filter(Boolean) as string[]
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!parsed.title) return
    let groupId: string | null = null
    if (tag && 'existing' in tag) groupId = tag.existing.id
    else if (tag) { // new group first: same offline queue, so it's created before the task that uses it
      const palette = Object.keys(COLORS)
      const g: TaskGroup = { id: crypto.randomUUID(), title: tag.create, color: palette[groups.length % palette.length], sort_order: Date.now() }
      saveGroup(g)
      groupId = g.id
    }
    onAdd({
      id: crypto.randomUUID(), title: parsed.title, date: target, start_time: parsed.startTime,
      duration_min: parsed.durationMin ?? (parsed.startTime ? 30 : null), notes: parsed.url, done_at: null, sort_order: Date.now(),
      group_id: groupId, subtasks: [],
    })
    setValue('')
  }
  return { value, setValue, chips, submit, canSubmit: !!parsed.title }
}

/**
 * Phone composer pinned above the tab bar (thumb reach). While focused, the tab bar hides and the
 * composer rides on top of the keyboard. Enter adds and keeps the keyboard open for the next task.
 */
function Composer({ date, onAdd, inputRef, groups }: { date: string; onAdd: (t: Task) => void; inputRef: React.RefObject<HTMLInputElement | null>; groups: TaskGroup[] }) {
  const { value, setValue, chips, submit, canSubmit } = useQuickAdd(date, onAdd, groups)
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
          placeholder="Add a task…  e.g. #work Standup 10am"
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

function QuickAdd({ date, onAdd, inputRef, groups }: { date: string; onAdd: (t: Task) => void; inputRef: React.RefObject<HTMLInputElement | null>; groups: TaskGroup[] }) {
  const { value, setValue, chips, submit } = useQuickAdd(date, onAdd, groups)
  return (
    <form onSubmit={submit} className="mb-6">
      <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-[var(--ring)]">
        <span className="text-faint">+</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setValue(''))}
          placeholder="Add a task…  e.g. #work Deep work 10:00 2h"
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

function Row({ item, onToggle, onOpen, onDelete, meta, trailing, focused, rowRef, chip, group, checklistOpen, onChecklistToggle, onSubtaskToggle, onAddSubtasks }: {
  item: Item; onToggle: () => void; onOpen: () => void; onDelete?: () => void; meta?: string; trailing?: React.ReactNode; focused?: boolean; chip?: string
  rowRef: (el: HTMLDivElement | null) => void
  group?: TaskGroup
  checklistOpen?: boolean; onChecklistToggle?: () => void; onSubtaskToggle?: (id: string) => void; onAddSubtasks?: (text: string) => void
}) {
  const data = item.kind === 'routine' ? item.routine : item.task
  const color = item.kind === 'routine' ? colorOf(item.routine.color) : undefined
  const time = data.start_time
    ? `${data.start_time.slice(0, 5)}${data.duration_min ? `–${formatHM(minutesOf(data.start_time) + data.duration_min)}` : ''}`
    : data.duration_min ? formatDuration(data.duration_min) : ''
  const task = item.kind === 'task' ? item.task : null
  const checklist = task ? subtaskProgress(task) : null
  const url = task ? firstUrl(task.notes) : null
  const hasMeta = !!(time || meta || trailing || chip || group || checklist || url)

  return (
    <div
      ref={rowRef}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); onToggle() } }}
      className={cn(
        'group -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 outline-none transition-colors cursor-pointer hover:bg-panel-2 md:py-1.5',
        focused && 'bg-panel-2 ring-1 ring-line-strong',
      )}
    >
      <span className="pt-px md:pt-0"><Check checked={item.done} onChange={onToggle} color={color} label={`Mark "${data.title}" ${item.done ? 'not done' : 'done'}`} /></span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm leading-snug [overflow-wrap:anywhere] md:text-[13px]', item.done && 'text-muted line-through')}>
          {color && <span className="mr-2 inline-block size-1.5 -translate-y-px rounded-full align-middle" style={{ background: color }} />}
          {data.title}
        </div>
        {hasMeta && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            {time && <span className="tabular font-mono">{time}</span>}
            {meta && <span className="text-danger">{meta}</span>}
            {trailing}
            {group && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: colorOf(group.color) }} />{group.title}</span>}
            {chip && <span className="flex min-w-0 items-center gap-1"><GraduationCap size={12} className="shrink-0" /><span className="[overflow-wrap:anywhere]">{chip}</span></span>}
            {checklist && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChecklistToggle?.() }}
                aria-expanded={checklistOpen}
                aria-label={`Checklist ${checklist.done} of ${checklist.total}`}
                className="flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-panel hover:text-fg cursor-pointer"
              >
                <ListChecks size={12} /> <span className="tabular font-mono">{checklist.done}/{checklist.total}</span>
                <ChevronDown size={12} className={cn('transition-transform', !checklistOpen && '-rotate-90')} />
              </button>
            )}
            {url && <OpenLink url={url} label={data.title} showSource={false} />}
          </div>
        )}
        {task && checklist && checklistOpen && (
          <Checklist task={task} onToggle={(id) => onSubtaskToggle?.(id)} onAdd={(text) => onAddSubtasks?.(text)} />
        )}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          aria-label={`Delete "${data.title}"`}
          className="-mr-1 -mt-1.5 grid size-9 shrink-0 place-items-center rounded-md text-faint transition-colors cursor-pointer hover:bg-danger/10 hover:text-danger
                     md:-mt-0.5 md:size-7 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100 md:focus-visible:opacity-100"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}

/** Inline checklist under a task: tick points, add more (paste a list to add many). */
function Checklist({ task, onToggle, onAdd }: { task: Task; onToggle: (id: string) => void; onAdd: (text: string) => void }) {
  const [value, setValue] = useState('')
  // Flip the box on tap; the synced value takes over once the saved task re-renders.
  const [pending, setPending] = useState<Record<string, boolean>>({})
  useEffect(() => setPending({}), [task.subtasks])
  const submit = (e: FormEvent) => { e.preventDefault(); if (value.trim()) { onAdd(value); setValue('') } }
  return (
    <div className="mt-2 grid gap-0.5" onClick={(e) => e.stopPropagation()}>
      {(task.subtasks ?? []).map((s) => (
        <label key={s.id} className="flex cursor-pointer items-start gap-2.5 rounded py-1.5 md:py-1">
          <input
            type="checkbox" checked={pending[s.id] ?? s.done}
            onChange={() => { setPending((p) => ({ ...p, [s.id]: !(p[s.id] ?? s.done) })); onToggle(s.id) }}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]"
            aria-label={`Point "${s.title}"`}
          />
          <span className={cn('text-[13px] leading-snug [overflow-wrap:anywhere]', s.done && 'text-muted line-through')}>{s.title}</span>
        </label>
      ))}
      <form onSubmit={submit} className="flex items-center gap-2 py-1">
        <Plus size={14} className="shrink-0 text-faint" />
        <input
          value={value} onChange={(e) => setValue(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); onAdd(t) } }}
          placeholder="Add a point" aria-label={`Add a point to "${task.title}"`}
          className="h-8 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:h-6 md:text-[13px]"
        />
      </form>
    </div>
  )
}
