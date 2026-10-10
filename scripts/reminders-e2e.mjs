// End-to-end: pg_cron → send-reminders → selection → reminder_log claim.
// Uses a throwaway user with a fake push endpoint (delivery itself fails harmlessly).
import { admin, check, tempUser } from './_env.mjs'

const u = await tempUser('push')
try {
  const now = new Date()
  const start = new Date(now.getTime() + 60_000)
  const hm = start.toISOString().slice(11, 16)
  const date = start.toISOString().slice(0, 10)
  await u.client.from('settings').upsert({ timezone: 'UTC', reminder_lead_min: 0 })
  const { data: task } = await u.client.from('tasks').insert({ title: 'E2E reminder', date, start_time: hm }).select().single()
  const { data: done } = await u.client.from('tasks').insert({ title: 'Already done', date, start_time: hm, done_at: now.toISOString() }).select().single()
  await u.client.from('push_subscriptions').insert({
    endpoint: `https://push.invalid/${crypto.randomUUID()}`,
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  })
  console.log(`task at ${hm} UTC — waiting for cron…`)

  let rows = []
  for (let i = 0; i < 36 && !rows.length; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    rows = (await admin.from('reminder_log').select('*').eq('user_id', u.id)).data ?? []
  }
  check('cron claimed a reminder for the due task', rows.some((r) => r.item_id === task.id), `${rows.length} row(s)`)
  check('done task was skipped', !rows.some((r) => r.item_id === done.id))
  await new Promise((r) => setTimeout(r, 65_000)) // next tick must not claim it again
  const again = (await admin.from('reminder_log').select('*').eq('user_id', u.id)).data ?? []
  check('reminder is not duplicated on the next tick', again.filter((r) => r.item_id === task.id).length === 1)
} finally {
  await u.remove()
}
