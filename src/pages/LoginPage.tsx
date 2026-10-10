import { useState, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { Button, Input } from '@/components/primitives'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('sending')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) { setError(error.message); setState('error') } else setState('sent')
  }

  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Winter Arc</span>
        </div>
        {state === 'sent' ? (
          <div className="rounded-xl border border-line bg-panel p-6">
            <Mail className="text-accent" size={20} />
            <h1 className="mt-3 text-base font-semibold">Check your email</h1>
            <p className="mt-1 text-[13px] text-muted">We sent a sign-in link to <span className="text-fg">{email}</span>. Open it on this device.</p>
            <Button variant="ghost" size="sm" className="mt-4 -ml-2" onClick={() => setState('idle')}>Use a different email</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="-mt-1 mb-2 text-[13px] text-muted">Plan the day. Keep the streak.</p>
            <Input type="email" autoFocus required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="primary" className="h-9" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
            {state === 'error' && <p className="text-xs text-danger">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 21a8 8 0 0 1 16 0" fill="none" stroke="var(--accent-fg)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="11" r="2.2" fill="var(--accent-fg)" />
    </svg>
  )
}
