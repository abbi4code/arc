import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check as CheckIcon, ChevronRight, KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { del } from 'idb-keyval'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { useAuth } from '@/lib/auth'
import { DEFAULT_SETTINGS, useMutations, useSettings } from '@/lib/data'
import { disablePush, enablePush, getPushState, testNotification, type PushState } from '@/lib/push'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import { THEMES, useTheme, type ThemeChoice } from '@/lib/theme'
import { cn } from '@/lib/ui'

const selectCls = 'h-9 rounded-md border border-line bg-panel-2 px-2 text-base outline-none focus:border-accent/60 md:h-8 md:text-[13px]'

export default function SettingsPage() {
  const { session } = useAuth()
  const { data } = useSettings()
  const settings = data ?? DEFAULT_SETTINGS
  const { saveSettings } = useMutations()
  const { choice, setTheme } = useTheme()
  const [push, setPush] = useState<PushState | 'loading'>('loading')
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), [])
  const deviceTz = DEFAULT_SETTINGS.timezone

  useEffect(() => { getPushState().then(setPush).catch(() => setPush('unsupported')) }, [])

  const togglePush = async () => {
    try {
      setPush('loading')
      setPush(push === 'on' ? await disablePush() : await enablePush())
    } catch (e) {
      toast.error('Could not change notifications', { description: (e as Error).message })
      setPush(await getPushState())
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    await del('winter-arc-cache')
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-medium text-muted">Security</h2>
        <Link to="/settings/passwords" className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 transition-colors hover:bg-panel-2">
          <KeyRound size={16} className="text-accent" />
          <span className="flex-1">
            <span className="block text-sm md:text-[13px]">Passwords</span>
            <span className="block text-xs text-faint">End-to-end encrypted · unlock with Face ID</span>
          </span>
          <ChevronRight size={15} className="text-faint" />
        </Link>
      </section>

      <Section title="Schedule">
        <Row label="Timezone" hint={settings.timezone !== deviceTz ? `This device is on ${deviceTz}` : 'Used for reminders'}>
          <select className={cn(selectCls, 'max-w-48')} value={settings.timezone} onChange={(e) => saveSettings({ ...settings, timezone: e.target.value })}>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </Row>
        <Row label="Week starts on">
          <select className={selectCls} value={settings.week_start} onChange={(e) => saveSettings({ ...settings, week_start: Number(e.target.value) })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </Row>
      </Section>

      <Section title="Reminders">
        <Row label="Notify me" hint="Before items with a start time">
          <select className={selectCls} value={settings.reminder_lead_min} onChange={(e) => saveSettings({ ...settings, reminder_lead_min: Number(e.target.value) })}>
            {[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m === 0 ? 'At start time' : `${m} min before`}</option>)}
          </select>
        </Row>
        <Row
          label="Push on this device"
          hint={
            push === 'unsupported' ? 'Not supported here. On iPhone, add to Home Screen first.'
              : push === 'denied' ? 'Blocked in browser settings for this site.'
              : push === 'on' ? 'Enabled on this device' : 'Each device is enabled separately'
          }
        >
          <div className="flex gap-2">
            {push === 'on' && <Button size="sm" variant="ghost" onClick={() => testNotification()}>Test</Button>}
            <Button size="sm" variant={push === 'on' ? 'subtle' : 'primary'} disabled={push === 'loading' || push === 'unsupported' || push === 'denied'} onClick={togglePush}>
              {push === 'on' ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </Row>
      </Section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-medium text-muted">Theme</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <ThemeCard key={t.id} id={t.id} name={t.name} note={t.note} selected={choice === t.id} onSelect={() => setTheme(t.id)} />
          ))}
          <ThemeCard id="system" name="System" note="Light by day, Midnight at night" selected={choice === 'system'} onSelect={() => setTheme('system')} />
        </div>
        <p className="mt-2 text-xs text-faint">Saved on this device. Every theme is checked for WCAG AA contrast.</p>
      </section>

      <Section title="Account">
        <Row label={session?.user.email ?? ''}>
          <Button size="sm" variant="subtle" onClick={signOut}>Sign out</Button>
        </Row>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-medium text-muted">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-40">
        <div className="truncate text-sm md:text-[13px]">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/** Mini preview rendered in the theme's own tokens (data-theme scopes the CSS variables). */
function ThemeCard({ id, name, note, selected, onSelect }: { id: ThemeChoice; name: string; note: string; selected: boolean; onSelect: () => void }) {
  const preview = (theme: string, className = '') => (
    <div data-theme={theme} className={cn('flex h-full flex-col gap-1.5 p-2.5', className)} style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-1.5 rounded-md p-1.5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <span className="size-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
        <span className="h-1.5 w-10 rounded-full" style={{ background: 'var(--fg)' }} />
      </div>
      <span className="h-1.5 w-14 rounded-full" style={{ background: 'var(--muted)' }} />
      <span className="h-1.5 w-8 rounded-full" style={{ background: 'var(--faint)' }} />
    </div>
  )
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group overflow-hidden rounded-xl border text-left transition-colors cursor-pointer',
        selected ? 'border-accent ring-2 ring-[var(--ring)]' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="h-[72px] overflow-hidden border-b border-line">
        {id === 'system'
          ? <div className="grid h-full grid-cols-2">{preview('light')}{preview('midnight')}</div>
          : preview(id)}
      </div>
      <div className="flex items-start justify-between gap-2 bg-panel px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium md:text-[13px]">{name}</div>
          <div className="truncate text-xs text-muted">{note}</div>
        </div>
        {selected && <CheckIcon size={15} className="mt-0.5 shrink-0 text-accent" />}
      </div>
    </button>
  )
}
