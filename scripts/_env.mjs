import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

export const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
export const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts)

/** Create a confirmed throwaway user and return a client signed in as them. */
export async function tempUser(tag) {
  const email = `wa-test-${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`
  const password = crypto.randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, opts)
  const { error: e2 } = await client.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { id: data.user.id, email, client, remove: () => admin.auth.admin.deleteUser(data.user.id) }
}

export function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
