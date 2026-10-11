import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, CalendarPlus, CheckCircle2, Circle, Palette, Plus, Repeat, Settings } from 'lucide-react'
import { useEditor } from './Editor'
import { useLogs, useMutations, useRoutines, useTasks } from '@/lib/data'
import { addDaysISO, todayISO } from '@/lib/domain/dates'
import { routinesDueOn } from '@/lib/domain/routines'
import { logKey } from '@/lib/domain/stats'
import { THEMES, useTheme } from '@/lib/theme'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { editTask, editRoutine } = useEditor()
  const { choice, setTheme } = useTheme()
  const { data: routines = [] } = useRoutines()
  const { data: tasks = [] } = useTasks()
  const { keys } = useLogs()
  const { saveTask, setRoutineDone } = useMutations()
  const today = todayISO()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = (fn: () => void) => () => { setOpen(false); fn() }
  const item = 'flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] text-fg cursor-pointer data-[selected=true]:bg-panel-2'

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command menu"
      overlayClassName="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[14vh] z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
    >
      <Command.Input placeholder="Type a command or search today…" className="h-12 w-full border-b border-line bg-transparent px-4 text-base outline-none placeholder:text-faint md:text-sm" />
      <Command.List className="scrollbar-thin max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-[13px] text-faint">No results.</Command.Empty>
        <Command.Group heading="Create" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          <Command.Item className={item} onSelect={run(() => editTask({ date: today }))}><Plus size={15} /> New task</Command.Item>
          <Command.Item className={item} onSelect={run(() => editTask({ date: addDaysISO(today, 1) }))}><CalendarPlus size={15} /> New task for tomorrow</Command.Item>
          <Command.Item className={item} onSelect={run(() => editRoutine({ starts_on: today }))}><Repeat size={15} /> New routine</Command.Item>
        </Command.Group>
        <Command.Group heading="Today" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          {routinesDueOn(routines, today).map((r) => {
            const done = keys.has(logKey(r.id, today))
            return (
              <Command.Item key={r.id} value={`routine ${r.title}`} className={item} onSelect={run(() => setRoutineDone(r.id, today, !done))}>
                {done ? <CheckCircle2 size={15} className="text-accent" /> : <Circle size={15} />} {done ? 'Undo' : 'Done'}: {r.title}
              </Command.Item>
            )
          })}
          {tasks.filter((t) => t.date === today).map((t) => (
            <Command.Item key={t.id} value={`task ${t.title}`} className={item} onSelect={run(() => saveTask({ ...t, done_at: t.done_at ? null : new Date().toISOString() }))}>
              {t.done_at ? <CheckCircle2 size={15} className="text-accent" /> : <Circle size={15} />} {t.done_at ? 'Undo' : 'Done'}: {t.title}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Go to" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          <Command.Item className={item} onSelect={run(() => navigate('/'))}><CalendarDays size={15} /> Today</Command.Item>
          <Command.Item className={item} onSelect={run(() => navigate(`/?d=${addDaysISO(today, 1)}`))}><CalendarDays size={15} /> Tomorrow</Command.Item>
          <Command.Item className={item} onSelect={run(() => navigate('/routines'))}><Repeat size={15} /> Routines</Command.Item>
          <Command.Item className={item} onSelect={run(() => navigate('/stats'))}><BarChart3 size={15} /> Stats</Command.Item>
          <Command.Item className={item} onSelect={run(() => navigate('/settings'))}><Settings size={15} /> Settings</Command.Item>
        </Command.Group>
        <Command.Group heading="Theme" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          {[...THEMES.map((t) => ({ id: t.id, name: t.name })), { id: 'system' as const, name: 'System' }].map((t) => (
            <Command.Item key={t.id} value={`theme ${t.name}`} className={item} onSelect={run(() => setTheme(t.id))}>
              <Palette size={15} /> {t.name} {choice === t.id && <span className="ml-auto text-xs text-accent">Current</span>}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
