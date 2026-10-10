import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const COLORS: Record<string, string> = {
  blue: '#4f8ff7',
  violet: '#8e7cf0',
  green: '#3fb68b',
  amber: '#e0a43a',
  rose: '#e8657d',
  cyan: '#3bb5c9',
  slate: '#8a8f98',
}
export const colorOf = (c: string | null | undefined) => COLORS[c ?? 'slate'] ?? COLORS.slate

export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatDuration(min: number | null | undefined) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

/** Ignore global shortcuts while typing. */
export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}
