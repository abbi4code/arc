import { WEEKDAY_NAMES } from './ui'

export function describeDays(days: number[]) {
  const s = [...days].sort().join(',')
  if (s === '0,1,2,3,4,5,6') return 'Every day'
  if (s === '1,2,3,4,5') return 'Weekdays'
  if (s === '0,6') return 'Weekends'
  // Monday-first reads more naturally
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_NAMES[d]).join(', ')
}
