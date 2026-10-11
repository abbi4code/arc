import { parseSignInInput } from './signIn'

const link = 'https://abc.supabase.co/auth/v1/verify?token=pkce_3f9a1b2c&type=magiclink&redirect_to=https://arc.vercel.app'

describe('parseSignInInput', () => {
  it('reads the one-time token from a pasted email link', () => {
    expect(parseSignInInput(link)).toEqual({ kind: 'link', tokenHash: 'pkce_3f9a1b2c', type: 'magiclink' })
    expect(parseSignInInput(`  ${link}\n`)).toMatchObject({ kind: 'link' })
  })
  it('keeps the link type (first sign-up emails use "signup")', () => {
    expect(parseSignInInput(link.replace('magiclink', 'signup'))).toMatchObject({ type: 'signup' })
    expect(parseSignInInput('https://abc.supabase.co/auth/v1/verify?token=t1')).toMatchObject({ type: 'email' })
  })
  it('unwraps links rewritten by email apps', () => {
    const outlook = `https://eur01.safelinks.protection.outlook.com/?url=${encodeURIComponent(link)}&data=x`
    expect(parseSignInInput(outlook)).toMatchObject({ kind: 'link', tokenHash: 'pkce_3f9a1b2c' })
    const google = `https://www.google.com/url?q=${encodeURIComponent(link)}&sa=D`
    expect(parseSignInInput(google)).toMatchObject({ kind: 'link', tokenHash: 'pkce_3f9a1b2c' })
  })
  it('accepts a 6–10 digit code, ignoring spaces', () => {
    expect(parseSignInInput('123 456')).toEqual({ kind: 'code', code: '123456' })
    expect(parseSignInInput('12345678')).toEqual({ kind: 'code', code: '12345678' })
  })
  it('rejects anything else', () => {
    expect(parseSignInInput('')).toEqual({ kind: 'invalid' })
    expect(parseSignInInput('12345')).toEqual({ kind: 'invalid' })
    expect(parseSignInInput('https://example.com/no-token')).toEqual({ kind: 'invalid' })
  })
})
