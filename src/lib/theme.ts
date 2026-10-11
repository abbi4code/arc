import { useEffect, useState } from 'react'

// Token values live in index.css under [data-theme="<id>"]; themes.test.ts checks their contrast.
export const THEMES = [
  { id: 'midnight', name: 'Midnight', dark: true, note: 'Near-black, high focus' },
  { id: 'dusk', name: 'Dusk', dark: true, note: 'Soft slate, gentle at night' },
  { id: 'forest', name: 'Forest', dark: true, note: 'Calm green-grey' },
  { id: 'sepia', name: 'Sepia', dark: false, note: 'Warm beige paper' },
  { id: 'light', name: 'Light', dark: false, note: 'Soft off-white' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type ThemeChoice = ThemeId | 'system'

const KEY = 'theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

const readChoice = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark') return 'midnight' // pre-themes value
    if (v === 'system' || THEMES.some((t) => t.id === v)) return v as ThemeChoice
  } catch { /* storage blocked */ }
  return 'midnight'
}

export const resolveTheme = (c: ThemeChoice): ThemeId => (c === 'system' ? (media().matches ? 'midnight' : 'light') : c)
export const isDarkTheme = (id: ThemeId) => THEMES.find((t) => t.id === id)!.dark

function apply(choice: ThemeChoice) {
  const id = resolveTheme(choice)
  const root = document.documentElement
  root.dataset.theme = id
  root.classList.toggle('dark', isDarkTheme(id))
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  window.dispatchEvent(new Event('themechange'))
}

export function setTheme(choice: ThemeChoice) {
  try { localStorage.setItem(KEY, choice) } catch { /* storage blocked */ }
  apply(choice)
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  useEffect(() => {
    const onChange = () => setChoice(readChoice())
    const onSystem = () => readChoice() === 'system' && apply('system')
    window.addEventListener('themechange', onChange)
    media().addEventListener('change', onSystem)
    return () => {
      window.removeEventListener('themechange', onChange)
      media().removeEventListener('change', onSystem)
    }
  }, [])
  const resolved = resolveTheme(choice)
  return { choice, resolved, isDark: isDarkTheme(resolved), setTheme }
}
