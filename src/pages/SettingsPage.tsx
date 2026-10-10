import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { del } from 'idb-keyval'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { useAuth } from '@/lib/auth'
import { DEFAULT_SETTINGS, useMutations, useSettings } from '@/lib/data'
import { disablePush, enablePush, getPushState, testNotification, type PushState } from '@/lib/push'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/ui'

const selectCls = 'h-8 rounded-md border border-line bg-panel-2 px-2 text-[13px] outline-none focus:border-accent/60'

export default function SettingsPage() {
  const { session } = useAuth()
  const { data } = useSettings()
  const settings = data ?? DEFAULT_SETTINGS
  const { saveSettings } = useMutations()
  const { theme, setTheme } = useTheme()
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

      <Section title="Appearance">
        <Row label="Theme">
          <div className="flex rounded-md border border-line bg-panel-2 p-0.5">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)} className={cn('h-7 rounded px-3 text-xs capitalize cursor-pointer', theme === t ? 'bg-panel text-fg shadow-sm' : 'text-muted')}>
                {t}
              </button>
            ))}
          </div>
        </Row>
      </Section>

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
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-[13px]">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
