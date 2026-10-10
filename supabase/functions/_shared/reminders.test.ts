import { localParts, selectDueReminders } from './reminders'

describe('localParts', () => {
  it('converts an instant to local date/minutes in a timezone', () => {
    const now = new Date('2026-10-10T02:30:00Z')
    expect(localParts(now, 'Asia/Kolkata')).toEqual({ date: '2026-10-10', weekday: 6, minutes: 8 * 60 }) // 08:00 IST
    expect(localParts(now, 'America/Los_Angeles')).toEqual({ date: '2026-10-09', weekday: 5, minutes: 19 * 60 + 30 })
  })
})

describe('selectDueReminders', () => {
  const routine = {
    id: 'r1', title: 'DSA', days_of_week: [6], start_time: '08:05:00', duration_min: 60,
    starts_on: '2026-10-01', archived_at: null,
  }
  const task = { id: 't1', title: 'Standup', date: '2026-10-10', start_time: '08:06:00', duration_min: null, done_at: null }
  const now = new Date('2026-10-10T02:30:00Z') // 08:00 IST

  it('selects items whose start - lead falls within the last 2 minutes', () => {
    const out = selectDueReminders({ now, timezone: 'Asia/Kolkata', leadMin: 5, routines: [routine], doneRoutineIds: new Set(), tasks: [task] })
    expect(out).toEqual([
      { itemType: 'routine', itemId: 'r1', date: '2026-10-10', title: 'DSA', startTime: '08:05', durationMin: 60 },
    ])
    const later = new Date('2026-10-10T02:31:00Z') // 08:01 → task (08:06 - 5) is due
    expect(selectDueReminders({ now: later, timezone: 'Asia/Kolkata', leadMin: 5, routines: [routine], doneRoutineIds: new Set(), tasks: [task] })
      .map((r) => r.itemId)).toEqual(['r1', 't1'])
  })
  it('skips done items, other days and untimed items', () => {
    const out = selectDueReminders({
      now, timezone: 'Asia/Kolkata', leadMin: 5,
      routines: [routine, { ...routine, id: 'r2', days_of_week: [1] }, { ...routine, id: 'r3', start_time: null }],
      doneRoutineIds: new Set(['r1']),
      tasks: [{ ...task, start_time: '08:05:00', done_at: 'x' }, { ...task, id: 't2', date: '2026-10-11', start_time: '08:05:00' }],
    })
    expect(out).toEqual([])
  })
  it('does not fire for items already past the window', () => {
    const out = selectDueReminders({ now, timezone: 'Asia/Kolkata', leadMin: 5, routines: [{ ...routine, start_time: '08:02:00' }], doneRoutineIds: new Set(), tasks: [] })
    expect(out).toEqual([])
  })
})
