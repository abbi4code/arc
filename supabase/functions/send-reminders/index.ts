// Invoked every minute by pg_cron. Sends Web Push for routines/tasks starting soon.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { selectDueReminders, type DueReminder } from '../_shared/reminders.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))

function message(r: DueReminder, lead: number) {
  const range = r.durationMin ? `${r.startTime}–${fmt(toMin(r.startTime) + r.durationMin)}` : r.startTime
  return {
    title: lead > 0 ? `${r.title} in ${lead} min` : `${r.title} starts now`,
    body: range,
    tag: `${r.itemType}:${r.itemId}:${r.date}`,
    url: '/',
  }
}

async function remindUser(userId: string, subs: Sub[], now: Date) {
  const { data: settings } = await supabase.from('settings').select('timezone, reminder_lead_min').eq('user_id', userId).maybeSingle()
  const timezone = settings?.timezone ?? 'UTC'
  const leadMin = settings?.reminder_lead_min ?? 5

  // ±1 day around UTC "today" covers every timezone's local date.
  const d = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  const [routines, tasks, logs] = await Promise.all([
    supabase.from('routines').select('id,title,days_of_week,start_time,duration_min,starts_on,archived_at')
      .eq('user_id', userId).is('archived_at', null).not('start_time', 'is', null),
    supabase.from('tasks').select('id,title,date,start_time,duration_min,done_at')
      .eq('user_id', userId).gte('date', d(-1)).lte('date', d(1)).is('done_at', null).not('start_time', 'is', null),
    supabase.from('routine_logs').select('routine_id,date').eq('user_id', userId).gte('date', d(-1)).lte('date', d(1)),
  ])
  for (const r of [routines, tasks, logs]) if (r.error) throw r.error

  const due = selectDueReminders({ now, timezone, leadMin, routines: routines.data!, tasks: tasks.data!, doneRoutineIds: new Set() })
    .filter((r) => r.itemType === 'task' || !logs.data!.some((l) => l.routine_id === r.itemId && l.date === r.date))
  if (!due.length) return { sent: 0 }

  // Claim each reminder once; rows that already exist are skipped and not returned.
  const { data: claimed, error } = await supabase
    .from('reminder_log')
    .upsert(due.map((r) => ({ user_id: userId, item_type: r.itemType, item_id: r.itemId, date: r.date })),
      { onConflict: 'user_id,item_type,item_id,date', ignoreDuplicates: true })
    .select('item_type,item_id,date')
  if (error) throw error
  const fresh = due.filter((r) => claimed!.some((c) => c.item_type === r.itemType && c.item_id === r.itemId && c.date === r.date))

  let sent = 0
  for (const r of fresh) {
    const payload = JSON.stringify(message(r, leadMin))
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 300 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id)
        else console.error('push failed', status, (e as Error).message)
      }
    }))
  }
  return { sent }
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-reminder-secret') ?? ''
  const { data: ok, error } = await supabase.rpc('check_reminder_secret', { secret })
  if (error) {
    console.error('secret check failed', error)
    return new Response(`secret check failed: ${error.message}`, { status: 500 })
  }
  if (!ok) return new Response('unauthorized', { status: 401 })

  const now = new Date()
  const { data: subs, error: subErr } = await supabase.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth')
  if (subErr) return new Response(subErr.message, { status: 500 })

  const byUser = new Map<string, Sub[]>()
  for (const s of subs as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  const results = await Promise.allSettled([...byUser].map(([u, ss]) => remindUser(u, ss, now)))
  results.forEach((r) => r.status === 'rejected' && console.error(r.reason))
  const sent = results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value.sent : 0), 0)
  return Response.json({ users: byUser.size, sent })
})
