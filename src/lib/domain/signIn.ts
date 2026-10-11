// The sign-in email may contain a link (Supabase's default template) or a code (custom template).
// Both work in an installed iPhone app: copy the link from Mail and paste it, or type the code.

export type SignInInput =
  | { kind: 'link'; tokenHash: string; type: LinkType }
  | { kind: 'code'; code: string }
  | { kind: 'invalid' }

export type LinkType = 'magiclink' | 'signup' | 'email' | 'invite' | 'recovery' | 'email_change'
const TYPES: LinkType[] = ['magiclink', 'signup', 'email', 'invite', 'recovery', 'email_change']

function tokenFromUrl(raw: string, depth = 0): SignInInput {
  let url: URL
  try { url = new URL(raw) } catch { return { kind: 'invalid' } }
  const token = url.searchParams.get('token') ?? url.searchParams.get('token_hash')
  if (token) {
    const t = url.searchParams.get('type') as LinkType | null
    return { kind: 'link', tokenHash: token, type: t && TYPES.includes(t) ? t : 'email' }
  }
  // Outlook safe links (?url=) and Google redirects (?q=) wrap the real link.
  const inner = url.searchParams.get('url') ?? url.searchParams.get('q')
  return inner && depth < 2 ? tokenFromUrl(inner, depth + 1) : { kind: 'invalid' }
}

export function parseSignInInput(input: string): SignInInput {
  const text = input.trim()
  if (/^https?:\/\//i.test(text)) return tokenFromUrl(text)
  const digits = text.replace(/\s+/g, '')
  return /^\d{6,10}$/.test(digits) ? { kind: 'code', code: digits } : { kind: 'invalid' }
}
