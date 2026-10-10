import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const read = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b0b0f' : '#fbfbfc')
  try { localStorage.setItem('theme', t) } catch { /* private mode */ }
  window.dispatchEvent(new Event('themechange'))
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    const on = () => setTheme(read())
    window.addEventListener('themechange', on)
    return () => window.removeEventListener('themechange', on)
  }, [])
  return { theme, setTheme: applyTheme, toggle: () => applyTheme(theme === 'dark' ? 'light' : 'dark') }
}
