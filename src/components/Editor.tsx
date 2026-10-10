import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button, Field, Input, Sheet } from './primitives'
import { useMutations } from '@/lib/data'
import { todayISO } from '@/lib/domain/dates'
import type { Routine, Task } from '@/lib/types'
import { COLORS, WEEKDAY_NAMES, cn } from '@/lib/ui'

type Editing =
  | { kind: 'task'; task: Partial<Task> & { id?: string } }
  | { kind: 'routine'; routine: Partial<Routine> & { id?: string } }
  | null

const EditorContext = createContext<{
  editTask: (t: Partial<Task>) => void
  editRoutine: (r: Partial<Routine>) => void
}>({ editTask: () => {}, editRoutine: () => {} })

export const useEditor = () => useContext(EditorContext)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<Editing>(null)
  const close = () => setEditing(null)
  return (
    <EditorContext.Provider
      value={{
        editTask: (task) => setEditing({ kind: 'task', task }),
        editRoutine: (routine) => setEditing({ kind: 'routine', routine }),
      }}
    >
      {children}
      <Sheet open={editing?.kind === 'task'} onOpenChange={(o) => !o && close()} title={editing?.kind === 'task' && editing.task.id ? 'Edit task' : 'New task'}>
        {editing?.kind === 'task' && <TaskForm initial={editing.task} onDone={close} />}
      </Sheet>
      <Sheet open={editing?.kind === 'routine'} onOpenChange={(o) => !o && close()} title={editing?.kind === 'routine' && editing.routine.id ? 'Edit routine' : 'New routine'}>
        {editing?.kind === 'routine' && <RoutineForm initial={editing.routine} onDone={close} />}
      </Sheet>
    </EditorContext.Provider>
  )
}

const DURATIONS = [0, 15, 30, 45, 60, 90, 120, 180, 240]
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

function DurationSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const options = DURATIONS.includes(value) ? DURATIONS : [...DURATIONS, value].sort((a, b) => a - b)
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-full rounded-md border border-line bg-panel-2 px-2 text-[13px] outline-none focus:border-accent/60"
    >
      {options.map((m) => (
        <option key={m} value={m}>{m === 0 ? 'No duration' : m < 60 ? `${m} min` : `${m / 60} h`}</option>
      ))}
    </select>
  )
}

function TaskForm({ initial, onDone }: { initial: Partial<Task>; onDone: () => void }) {
  const { saveTask, deleteTask } = useMutations()
  const [title, setTitle] = useState(initial.title ?? '')
  const [date, setDate] = useState(initial.date ?? todayISO())
  const [time, setTime] = useState(hm(initial.start_time))
  const [duration, setDuration] = useState(initial.duration_min ?? (initial.start_time ? 30 : 0))
  const [notes, setNotes] = useState(initial.notes ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    saveTask({
      id: initial.id ?? crypto.randomUUID(),
      title: title.trim(),
      date,
      start_time: time || null,
      duration_min: duration || null,
      notes: notes.trim() || null,
      done_at: initial.done_at ?? null,
      sort_order: initial.sort_order ?? Date.now(),
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Title">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you working on?" required />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Start"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Duration"><DurationSelect value={duration} onChange={setDuration} /></Field>
      </div>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-accent/60"
          placeholder="Optional"
        />
      </Field>
      <div className="flex items-center justify-between pt-1">
        {initial.id ? (
          <Button type="button" variant="danger" size="sm" onClick={() => { deleteTask(initial.id!); onDone() }}>
            <Trash2 size={14} /> Delete
          </Button>
        ) : <span />}
        <Button type="submit" variant="primary">Save</Button>
      </div>
    </form>
  )
}

const PRESETS: [string, number[]][] = [['Every day', [0, 1, 2, 3, 4, 5, 6]], ['Weekdays', [1, 2, 3, 4, 5]], ['Weekends', [0, 6]]]

function RoutineForm({ initial, onDone }: { initial: Partial<Routine>; onDone: () => void }) {
  const { saveRoutine, deleteRoutine } = useMutations()
  const [title, setTitle] = useState(initial.title ?? '')
  const [days, setDays] = useState<number[]>(initial.days_of_week ?? [1, 2, 3, 4, 5])
  const [time, setTime] = useState(hm(initial.start_time))
  const [duration, setDuration] = useState(initial.duration_min ?? 0)
  const [color, setColor] = useState(initial.color ?? 'blue')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setConfirmDelete(false), [initial.id])

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()))

  const build = (patch: Partial<Routine> = {}): Routine => ({
    id: initial.id ?? crypto.randomUUID(),
    title: title.trim(),
    days_of_week: days,
    start_time: time || null,
    duration_min: duration || null,
    color,
    starts_on: initial.starts_on ?? todayISO(),
    archived_at: initial.archived_at ?? null,
    sort_order: initial.sort_order ?? Date.now(),
    ...patch,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || days.length === 0) return
    saveRoutine(build())
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Title">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DSA practice" required />
      </Field>
      <Field label="Repeats on">
        <div className="grid gap-2">
          <div className="flex gap-1">
            {WEEKDAY_NAMES.map((name, d) => (
              <button
                type="button"
                key={name}
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className={cn(
                  'h-8 flex-1 rounded-md border text-xs font-medium transition-colors cursor-pointer',
                  days.includes(d) ? 'border-accent/50 bg-accent/15 text-fg' : 'border-line bg-panel-2 text-muted hover:text-fg',
                )}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {PRESETS.map(([label, ds]) => (
              <Button key={label} type="button" variant="ghost" size="sm" onClick={() => setDays(ds)}>{label}</Button>
            ))}
          </div>
          {days.length === 0 && <span className="text-xs text-danger">Pick at least one day</span>}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start (optional)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Duration"><DurationSelect value={duration} onChange={setDuration} /></Field>
      </div>
      <Field label="Color">
        <div className="flex gap-2">
          {Object.entries(COLORS).map(([name, hex]) => (
            <button
              type="button"
              key={name}
              aria-label={name}
              aria-pressed={color === name}
              onClick={() => setColor(name)}
              className={cn('size-6 rounded-full transition-transform cursor-pointer', color === name ? 'ring-2 ring-offset-2 ring-offset-[var(--panel)] scale-110' : 'hover:scale-110')}
              style={{ background: hex, ['--tw-ring-color' as string]: hex }}
            />
          ))}
        </div>
      </Field>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-1">
          {initial.id && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { saveRoutine(build({ archived_at: initial.archived_at ? null : new Date().toISOString() })); onDone() }}
            >
              {initial.archived_at ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}
            </Button>
          )}
          {initial.id && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => (confirmDelete ? (deleteRoutine(initial.id!), onDone()) : setConfirmDelete(true))}
            >
              <Trash2 size={14} /> {confirmDelete ? 'Delete + history?' : 'Delete'}
            </Button>
          )}
        </div>
        <Button type="submit" variant="primary" disabled={days.length === 0}>Save</Button>
      </div>
    </form>
  )
}
