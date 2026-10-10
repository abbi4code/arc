import type { ISODate } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

// Calendar-date math is done in UTC on 'YYYY-MM-DD' strings so DST never shifts a day.
const parseISO = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export const toISODate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayISO = (): ISODate => toISODate(new Date())

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const weekdayOf = (iso: ISODate): number => parseISO(iso).getUTCDay()

export const diffDaysISO = (a: ISODate, b: ISODate): number =>
  Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000)

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** minutes since midnight → 'HH:MM' (wraps past 24h) */
export function formatHM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes()
