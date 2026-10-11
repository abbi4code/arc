import { useState, type ClipboardEvent, type FormEvent } from 'react'
import { Mail } from 'lucide-react'
import { Button, Input } from '@/components/primitives'
import { Logo } from '@/components/Logo'
import { parseSignInInput } from '@/lib/domain/signIn'
import { supabase } from '@/lib/supabase'

/*
 * Email sign-in that also works inside an installed iPhone PWA, where tapping an email link opens
 * Safari instead of the app: paste the link from the email (or type a code, if the template sends one).
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [value, setValue] = useState('')
  const [step, setStep] = useState<'email' | 'verify'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setError(error.message)
    else { setStep('verify'); setValue('') }
  }

  const verify = async (input: string) => {
    const parsed = parseSignInInput(input)
    if (parsed.kind === 'invalid') {
      setError("That doesn't look like the sign-in link or a code. Copy the whole link from the email.")
      return
    }
    setBusy(true)
    setError('')
    const { error } = parsed.kind === 'link'
      ? await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type })
      : await supabase.auth.verifyOtp({ email, token: parsed.code, type: 'email' })
    setBusy(false)
    if (error) setError(/expired|invalid/i.test(error.message)
      ? 'That link or code has expired or was already used. Send a new email.'
      : error.message)
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); verify(value) }
  // Pasting the link signs in straight away.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (parseSignInInput(text).kind === 'link') { e.preventDefault(); setValue(text); verify(text) }
  }

  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Winter Arc</span>
        </div>

        {step === 'email' ? (
          <form onSubmit={send} className="grid grid-cols-1 gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="-mt-1 mb-2 text-sm text-muted md:text-[13px]">Plan the day. Keep the streak.</p>
            <Input type="email" autoComplete="email" autoFocus required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
            <Mail className="text-accent" size={20} />
            <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
            <p className="-mt-1 text-sm text-muted md:text-[13px]">
              We sent a sign-in email to <span className="text-fg">{email}</span>.
            </p>
            <ol className="mb-1 grid list-decimal gap-1 pl-5 text-sm text-muted md:text-[13px]">
              <li>In the email, <span className="text-fg">press and hold “Sign in”</span> → Copy Link.</li>
              <li>Paste it below.</li>
            </ol>
            <Input
              autoFocus
              required
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Paste the link (or type a code)"
              aria-label="Sign-in link or code"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPaste={onPaste}
            />
            <Button type="submit" variant="primary" disabled={busy || !value.trim()}>{busy ? 'Signing in…' : 'Sign in'}</Button>
            <p className="text-xs text-faint">On a computer you can also just click the link in the email.</p>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => { setStep('email'); setError('') }}>Change email</Button>
              <Button type="button" variant="ghost" size="sm" className="-mr-2" disabled={busy} onClick={() => send()}>Send again</Button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
