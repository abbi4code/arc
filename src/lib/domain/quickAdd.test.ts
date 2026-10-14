import { parseQuickAdd } from './quickAdd'

describe('parseQuickAdd', () => {
  it('returns plain title when no tokens', () => {
    expect(parseQuickAdd('Review PR')).toEqual({ title: 'Review PR', startTime: null, durationMin: null, dayOffset: 0, url: null, group: null })
  })
  it('parses 24h time and hour duration', () => {
    expect(parseQuickAdd('Deep work 10:00 2h')).toMatchObject({ title: 'Deep work', startTime: '10:00', durationMin: 120 })
  })
  it('parses am/pm times and minute durations', () => {
    expect(parseQuickAdd('Call mom 6pm 30m')).toMatchObject({ title: 'Call mom', startTime: '18:00', durationMin: 30 })
    expect(parseQuickAdd('Standup 9:15am 15min')).toMatchObject({ startTime: '09:15', durationMin: 15 })
    expect(parseQuickAdd('Lunch 12am')).toMatchObject({ startTime: '00:00' })
  })
  it('parses compound durations', () => {
    expect(parseQuickAdd('Study 1h30m')).toMatchObject({ title: 'Study', durationMin: 90 })
    expect(parseQuickAdd('Study 1.5h')).toMatchObject({ durationMin: 90 })
  })
  it('parses time ranges into start + duration', () => {
    expect(parseQuickAdd('Focus 9:00-11:30')).toMatchObject({ title: 'Focus', startTime: '09:00', durationMin: 150 })
  })
  it('parses tomorrow / tmr', () => {
    expect(parseQuickAdd('Gym tomorrow 7:00')).toMatchObject({ title: 'Gym', startTime: '07:00', dayOffset: 1 })
    expect(parseQuickAdd('tmr dentist')).toMatchObject({ title: 'dentist', dayOffset: 1 })
  })
  it('does not treat numbers inside words as tokens', () => {
    expect(parseQuickAdd('Fix bug #42 in v2h')).toMatchObject({ title: 'Fix bug #42 in v2h', durationMin: null })
  })
  it('turns a pasted link into a titled task and keeps the link', () => {
    expect(parseQuickAdd('https://leetcode.com/problems/two-sum 9pm 30m')).toMatchObject({
      title: 'Two Sum', startTime: '21:00', durationMin: 30, url: 'https://leetcode.com/problems/two-sum',
    })
    expect(parseQuickAdd('Revise https://leetcode.com/problems/two-sum')).toMatchObject({ title: 'Revise', url: 'https://leetcode.com/problems/two-sum' })
    expect(parseQuickAdd('Review PR')).toMatchObject({ url: null })
  })
  it('reads a #group tag (must start with a letter)', () => {
    expect(parseQuickAdd('#work fix flaky test 10am')).toMatchObject({ title: 'fix flaky test', group: 'work', startTime: '10:00' })
    expect(parseQuickAdd('Call bank #Personal')).toMatchObject({ title: 'Call bank', group: 'Personal' })
    expect(parseQuickAdd('Review PR #42')).toMatchObject({ title: 'Review PR #42', group: null })
    expect(parseQuickAdd('#side-project ship v1')).toMatchObject({ group: 'side-project', title: 'ship v1' })
  })
  it('rejects invalid times as text', () => {
    expect(parseQuickAdd('Ship 25:00')).toMatchObject({ title: 'Ship 25:00', startTime: null })
  })
})
