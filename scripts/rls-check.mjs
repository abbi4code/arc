// Verifies row-level security: user B can never see or change user A's rows.
import { check, tempUser } from './_env.mjs'

const a = await tempUser('a')
const b = await tempUser('b')
try {
  const today = new Date().toISOString().slice(0, 10)
  const r = await a.client.from('routines').insert({ title: 'A routine', days_of_week: [1] }).select().single()
  const t = await a.client.from('tasks').insert({ title: 'A task', date: today }).select().single()
  check('A can create rows', !r.error && !t.error, r.error?.message ?? t.error?.message)

  for (const table of ['routines', 'tasks', 'routine_logs', 'settings', 'push_subscriptions']) {
    const { data } = await b.client.from(table).select('*')
    check(`B sees none of A's ${table}`, (data ?? []).every((row) => row.user_id === b.id))
  }

  const upd = await b.client.from('tasks').update({ title: 'hacked' }).eq('id', t.data.id).select()
  check('B cannot update A task', (upd.data ?? []).length === 0)
  const delr = await b.client.from('routines').delete().eq('id', r.data.id).select()
  check('B cannot delete A routine', (delr.data ?? []).length === 0)
  const forged = await b.client.from('tasks').insert({ title: 'forged', date: today, user_id: a.id })
  check('B cannot insert rows owned by A', !!forged.error, forged.error?.code)
  const logForge = await b.client.from('routine_logs').insert({ routine_id: r.data.id, date: today })
  check("B cannot log against A's routine", !!logForge.error, logForge.error?.code)
  const own = await a.client.from('routine_logs').insert({ routine_id: r.data.id, date: today })
  check('A can still log their routine', !own.error, own.error?.message)
  const rl = await b.client.from('reminder_log').select('*')
  check('clients cannot read reminder_log', !!rl.error, rl.error?.code)
  const rpc = await b.client.rpc('check_reminder_secret', { secret: 'x' })
  check('clients cannot call check_reminder_secret', !!rpc.error, rpc.error?.code)
} finally {
  await a.remove()
  await b.remove()
}
