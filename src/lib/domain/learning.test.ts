import { dueSoonGoals, goalStatus, parseTopicLines } from './learning'
import type { LearningGoal, LearningTopic, LearningTrack } from '../types'

const goal = (p: Partial<LearningGoal> = {}): LearningGoal => ({
  id: 'g', track_id: 't', title: 'Graphs', starts_on: '2026-10-01', target_date: '2026-10-31', sort_order: 0, ...p,
})

describe('goalStatus', () => {
  it('is done when every topic is done (even after the deadline)', () => {
    expect(goalStatus(goal(), { done: 5, total: 5 }, '2026-11-10').status).toBe('done')
  })
  it('is overdue past the target date when not done', () => {
    expect(goalStatus(goal(), { done: 4, total: 5 }, '2026-11-01').status).toBe('overdue')
    expect(goalStatus(goal(), { done: 0, total: 0 }, '2026-11-01').status).toBe('overdue')
  })
  it('is on track when progress keeps up with elapsed time (10pt tolerance)', () => {
    // Oct 16 → 15 of 30 days elapsed = 50% expected
    expect(goalStatus(goal(), { done: 2, total: 5 }, '2026-10-16')).toMatchObject({ status: 'on-track', progress: 0.4, expected: 0.5 })
  })
  it('is behind when progress is more than 10 points under expected', () => {
    expect(goalStatus(goal(), { done: 1, total: 5 }, '2026-10-16').status).toBe('behind')
  })
  it('is never behind with no topics yet, and handles same-day goals', () => {
    expect(goalStatus(goal(), { done: 0, total: 0 }, '2026-10-30').status).toBe('on-track')
    const sameDay = goal({ starts_on: '2026-10-10', target_date: '2026-10-10' })
    expect(goalStatus(sameDay, { done: 0, total: 2 }, '2026-10-10')).toMatchObject({ status: 'behind', expected: 1 })
  })
  it('expects nothing before the start date', () => {
    expect(goalStatus(goal(), { done: 0, total: 5 }, '2026-09-20')).toMatchObject({ status: 'on-track', expected: 0 })
  })
})

describe('parseTopicLines', () => {
  it('turns pasted lines into topics, stripping bullets and numbering', () => {
    expect(parseTopicLines('- BFS / DFS\n* Topological sort\n• Union-Find\n1. Dijkstra\n2) MST\n\n   \n')).toEqual([
      { title: 'BFS / DFS', done: false },
      { title: 'Topological sort', done: false },
      { title: 'Union-Find', done: false },
      { title: 'Dijkstra', done: false },
      { title: 'MST', done: false },
    ])
  })
  it('reads markdown checkboxes', () => {
    expect(parseTopicLines('- [x] Arrays\n- [ ] Trees\n[X] Heaps')).toEqual([
      { title: 'Arrays', done: true }, { title: 'Trees', done: false }, { title: 'Heaps', done: true },
    ])
  })
  it('keeps a single plain line as-is (numbers inside titles too)', () => {
    expect(parseTopicLines('LC 200. Number of Islands')).toEqual([{ title: 'LC 200. Number of Islands', done: false }])
  })
})

describe('dueSoonGoals', () => {
  const tracks: LearningTrack[] = [
    { id: 't', title: 'DSA', color: 'violet', status: 'active', sort_order: 0 },
    { id: 'p', title: 'Paused', color: 'blue', status: 'paused', sort_order: 1 },
  ]
  const topics: LearningTopic[] = [
    { id: 'a', goal_id: 'soon', title: 'a', notes: null, done_at: null, sort_order: 0 },
    { id: 'b', goal_id: 'done', title: 'b', notes: null, done_at: 'x', sort_order: 0 },
  ]
  it('lists active, unfinished goals due within 7 days or overdue, soonest first', () => {
    const goals = [
      goal({ id: 'soon', target_date: '2026-10-15' }),
      goal({ id: 'late', target_date: '2026-10-05' }),
      goal({ id: 'far', target_date: '2026-10-30' }),
      goal({ id: 'done', target_date: '2026-10-12' }),
      goal({ id: 'paused', track_id: 'p', target_date: '2026-10-12' }),
    ]
    expect(dueSoonGoals(goals, tracks, topics, '2026-10-10').map((g) => g.goal.id)).toEqual(['late', 'soon'])
  })
})
