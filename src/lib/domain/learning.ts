import type { ISODate, LearningGoal, LearningTopic, LearningTrack } from '../types'
import { addDaysISO, diffDaysISO } from './dates'
import { topicFromUrl } from './links'

export type GoalStatus = 'done' | 'overdue' | 'behind' | 'on-track'

/** How far behind expected progress a goal may fall before it counts as "behind". */
export const BEHIND_TOLERANCE = 0.1

export function goalProgress(goalId: string, topics: LearningTopic[]) {
  const mine = topics.filter((t) => t.goal_id === goalId)
  return { done: mine.filter((t) => t.done_at).length, total: mine.length }
}

/**
 * done: every topic done · overdue: past target and not done ·
 * behind: progress more than 10pts under expected (elapsed share of the start→target window) · on-track otherwise.
 */
export function goalStatus(goal: Pick<LearningGoal, 'starts_on' | 'target_date'>, p: { done: number; total: number }, today: ISODate) {
  const progress = p.total ? p.done / p.total : 0
  const span = diffDaysISO(goal.target_date, goal.starts_on)
  const elapsed = diffDaysISO(today, goal.starts_on)
  const expected = elapsed < 0 ? 0 : span <= 0 ? 1 : Math.min(1, elapsed / span)

  let status: GoalStatus
  if (p.total > 0 && p.done === p.total) status = 'done'
  else if (today > goal.target_date) status = 'overdue'
  else if (p.total > 0 && progress + 1e-9 < expected - BEHIND_TOLERANCE) status = 'behind'
  else status = 'on-track'
  return { status, progress, expected }
}

/**
 * One topic per non-empty line; strips bullets/numbering and reads markdown checkboxes.
 * A line that is just a link becomes a readable title ("Number of Islands") and keeps the link.
 */
export function parseTopicLines(text: string): { title: string; done: boolean; url?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?(?:\[([ xX])\]\s*)?(.*?)\s*$/)!)
    .filter((m) => m[2].length > 0)
    .map((m) => {
      const done = m[1]?.toLowerCase() === 'x'
      const link = topicFromUrl(m[2])
      return link ? { title: link.title, done, url: link.url } : { title: m[2], done }
    })
}

export const DUE_SOON_DAYS = 7

/** Goals on active tracks that are unfinished and due within a week (or overdue), soonest first. */
export function dueSoonGoals(goals: LearningGoal[], tracks: LearningTrack[], topics: LearningTopic[], today: ISODate) {
  const active = new Map(tracks.filter((t) => t.status === 'active').map((t) => [t.id, t]))
  const horizon = addDaysISO(today, DUE_SOON_DAYS)
  return goals
    .filter((g) => active.has(g.track_id) && g.target_date <= horizon)
    .map((goal) => {
      const counts = goalProgress(goal.id, topics)
      return { goal, track: active.get(goal.track_id)!, counts, ...goalStatus(goal, counts, today) }
    })
    .filter((g) => g.status !== 'done')
    .sort((a, b) => a.goal.target_date.localeCompare(b.goal.target_date))
}
