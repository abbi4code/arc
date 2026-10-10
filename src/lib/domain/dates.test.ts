import { addDaysISO, weekdayOf, toISODate, minutesOf, formatHM } from './dates'

describe('dates', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('adds days across month and year boundaries', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('returns weekday 0=Sun..6=Sat', () => {
    expect(weekdayOf('2026-10-10')).toBe(6) // Saturday
    expect(weekdayOf('2026-10-11')).toBe(0)
  })
  it('converts HH:MM[:SS] to minutes and back', () => {
    expect(minutesOf('08:30:00')).toBe(510)
    expect(minutesOf('00:00')).toBe(0)
    expect(formatHM(510)).toBe('08:30')
    expect(formatHM(24 * 60 + 15)).toBe('00:15')
  })
})
