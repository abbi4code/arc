// Verifies row-level security: user B can never see or change user A's rows.
import { check, tempUser } from './_env.mjs'

const a = await tempUser('a')
const b = await tempUser('b')
try {
  const today = new Date().toISOString().slice(0, 10)
  const r = await a.client.from('routines').insert({ title: 'A routine', days_of_week: [1] }).select().single()
  const t = await a.client.from('tasks').insert({ title: 'A task', date: today }).select().single()
  check('A can create rows', !r.error && !t.error, r.error?.message ?? t.error?.message)

  const tr = await a.client.from('learning_tracks').insert({ title: 'A track' }).select().single()
  const gl = await a.client.from('learning_goals').insert({ track_id: tr.data?.id, title: 'A goal', target_date: today }).select().single()
  const tp = await a.client.from('learning_topics').insert({ goal_id: gl.data?.id, title: 'A topic' }).select().single()
  check('A can create learning rows', !tr.error && !gl.error && !tp.error, tr.error?.message ?? gl.error?.message ?? tp.error?.message)

  const grp = await a.client.from('task_groups').insert({ title: 'A work' }).select().single()
  check('A can create a task group', !grp.error, grp.error?.message)
  const grouped = await a.client.from('tasks').insert({ title: 'grouped', date: today, group_id: grp.data?.id, subtasks: [{ id: '1', title: 'x', done: false }] })
  check('A can put a task (with checklist) in their group', !grouped.error, grouped.error?.message)

  const v = await a.client.from('vault').insert({ recovery_wrapped_key: 'ct', recovery_iv: 'iv' })
  const vi = await a.client.from('vault_items').insert({ ciphertext: 'ct', iv: 'iv' }).select().single()
  check('A can create vault rows', !v.error && !vi.error, v.error?.message ?? vi.error?.message)

  for (const table of ['routines', 'tasks', 'routine_logs', 'settings', 'push_subscriptions', 'learning_tracks', 'learning_goals', 'learning_topics', 'vault', 'vault_passkeys', 'vault_items', 'task_groups']) {
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
  const g2 = await b.client.from('learning_goals').insert({ track_id: tr.data.id, title: 'x', target_date: today })
  check("B cannot add a goal to A's track", !!g2.error, g2.error?.code)
  const t2 = await b.client.from('learning_topics').insert({ goal_id: gl.data.id, title: 'x' })
  check("B cannot add a topic to A's goal", !!t2.error, t2.error?.code)
  const k2 = await b.client.from('tasks').insert({ title: 'x', date: today, topic_id: tp.data.id })
  check("B cannot link a task to A's topic", !!k2.error, k2.error?.code)
  const k3 = await a.client.from('tasks').insert({ title: 'plan', date: today, topic_id: tp.data.id })
  check('A can link a task to their own topic', !k3.error, k3.error?.message)

  const gx = await b.client.from('tasks').insert({ title: 'x', date: today, group_id: grp.data.id })
  check("B cannot put a task in A's group", !!gx.error, gx.error?.code)
  const bad = await a.client.from('tasks').insert({ title: 'x', date: today, subtasks: { not: 'an array' } })
  check('checklist must be a list', !!bad.error, bad.error?.code)

  const vf = await b.client.from('vault_items').insert({ ciphertext: 'x', iv: 'x', user_id: a.id })
  check("B cannot write into A's vault", !!vf.error, vf.error?.code)
  const vu = await b.client.from('vault_items').update({ ciphertext: 'tampered' }).eq('id', vi.data.id).select()
  check("B cannot overwrite A's vault entry", (vu.data ?? []).length === 0)

  const rl = await b.client.from('reminder_log').select('*')
  check('clients cannot read reminder_log', !!rl.error, rl.error?.code)
  const rpc = await b.client.rpc('check_reminder_secret', { secret: 'x' })
  check('clients cannot call check_reminder_secret', !!rpc.error, rpc.error?.code)
} finally {
  await a.remove()
  await b.remove()
}
