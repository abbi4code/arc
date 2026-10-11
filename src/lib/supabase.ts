// Only the two Supabase pieces this app uses (auth + database). The full `@supabase/supabase-js`
// client also bundles storage, realtime and functions (~11% of the app's JavaScript).
import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')

const auth = new AuthClient({
  url: `${url}/auth/v1`,
  headers: { Authorization: `Bearer ${key}`, apikey: key },
  // Same key supabase-js uses, so existing sessions keep working.
  storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
})

// Mirrors supabase-js: send the user's access token when signed in, the publishable key otherwise.
const fetchWithAuth: typeof fetch = async (input, init) => {
  const { data } = await auth.getSession()
  const headers = new Headers(init?.headers)
  if (!headers.has('apikey')) headers.set('apikey', key)
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${data.session?.access_token ?? key}`)
  return fetch(input, { ...init, headers })
}

const db = new PostgrestClient<any>(`${url}/rest/v1`, { fetch: fetchWithAuth })

export const supabase = {
  auth,
  from: (table: string) => db.from(table),
}
