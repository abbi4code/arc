import { useState, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { Button, Input } from '@/components/primitives'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

// Code (not link) sign-in: works inside an installed iPhone PWA, where email links open in Safari instead.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) setError(error.message)
    else { setStep('code'); setCode('') }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (error) setError(error.message === 'Token has expired or is invalid' ? 'That code is wrong or expired. Try again or resend.' : error.message)
  }

  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Winter Arc</span>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="grid grid-cols-1 gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="-mt-1 mb-2 text-sm text-muted md:text-[13px]">Plan the day. Keep the streak.</p>
            <Input type="email" autoComplete="email" autoFocus required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="grid grid-cols-1 gap-3">
            <Mail className="text-accent" size={20} />
            <h1 className="text-xl font-semibold tracking-tight">Enter your code</h1>
            <p className="-mt-1 mb-2 text-sm text-muted md:text-[13px]">
              We emailed a code to <span className="text-fg">{email}</span>.
            </p>
            <Input
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              placeholder="123456"
              aria-label="Sign-in code"
              className="text-center font-mono text-lg tracking-[0.4em] md:text-lg"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button type="submit" variant="primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</Button>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => { setStep('email'); setError('') }}>Change email</Button>
              <Button type="button" variant="ghost" size="sm" className="-mr-2" disabled={busy} onClick={() => sendCode()}>Resend code</Button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
