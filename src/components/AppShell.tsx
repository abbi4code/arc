import { useEffect, useSyncExternalStore } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { onlineManager, useMutationState } from '@tanstack/react-query'
import { BarChart3, CalendarDays, Cloud, CloudOff, Command, Loader2, Repeat, Settings } from 'lucide-react'
import { CommandPalette } from './CommandPalette'
import { Logo } from '@/pages/LoginPage'
import { DEFAULT_SETTINGS, useMutations, useSettings } from '@/lib/data'
import { cn } from '@/lib/ui'

const NAV = [
  { to: '/', label: 'Today', icon: CalendarDays },
  { to: '/routines', label: 'Routines', icon: Repeat },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const settings = useSettings()
  const { saveSettings } = useMutations()

  // First run: create the settings row with this device's timezone.
  useEffect(() => {
    if (settings.isSuccess && settings.data === null) saveSettings(DEFAULT_SETTINGS)
  }, [settings.isSuccess, settings.data])

  return (
    <div className="flex h-dvh">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Winter Arc</span>
        </div>
        <nav className="grid gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn('flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors', isActive ? 'bg-panel-2 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg')
              }
            >
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid gap-2 px-2">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="flex h-8 items-center gap-2 rounded-md border border-line px-2 text-xs text-muted hover:text-fg cursor-pointer"
          >
            <Command size={13} /> Command menu <span className="ml-auto font-mono text-[10px]">⌘K</span>
          </button>
          <SyncStatus />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <div className="flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-12 items-center gap-2"><Logo size={18} /><span className="text-sm font-semibold">Winter Arc</span></div>
          <SyncStatus />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end className={({ isActive }) => cn('flex h-14 flex-col items-center justify-center gap-1 text-[10px]', isActive ? 'text-fg' : 'text-faint')}>
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </nav>

      <CommandPalette />
    </div>
  )
}

function SyncStatus() {
  const online = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline())
  const pending = useMutationState({ filters: { status: 'pending' } }).length
  const [Icon, text, cls] = !online
    ? [CloudOff, pending ? `Offline · ${pending} pending` : 'Offline', 'text-amber-500']
    : pending
      ? [Loader2, `Syncing ${pending}`, 'text-muted']
      : [Cloud, 'Synced', 'text-faint']
  return (
    <div className={cn('flex items-center gap-1.5 text-[11px]', cls)} aria-live="polite">
      <Icon size={12} className={cn(Icon === Loader2 && 'animate-spin')} /> {text}
    </div>
  )
}
