export type ISODate = string // 'YYYY-MM-DD'

export interface Routine {
  id: string
  title: string
  days_of_week: number[] // 0 = Sun .. 6 = Sat
  start_time: string | null // 'HH:MM' or 'HH:MM:SS'
  duration_min: number | null
  color: string
  starts_on: ISODate
  archived_at: string | null
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface RoutineLog {
  id: string
  routine_id: string
  date: ISODate
  done_at: string
}

export interface Task {
  id: string
  title: string
  date: ISODate
  start_time: string | null
  duration_min: number | null
  notes: string | null
  done_at: string | null
  sort_order: number
  topic_id?: string | null
  group_id?: string | null
  subtasks?: Subtask[]
  created_at?: string
  updated_at?: string
}

export interface Settings {
  user_id?: string
  timezone: string
  reminder_lead_min: number
  week_start: number
}

export type TrackStatus = 'active' | 'paused' | 'completed'

export interface LearningTrack {
  id: string
  title: string
  color: string
  status: TrackStatus
  sort_order: number
  created_at?: string
}

export interface LearningGoal {
  id: string
  track_id: string
  title: string
  starts_on: ISODate
  target_date: ISODate
  sort_order: number
}

export interface LearningTopic {
  id: string
  goal_id: string
  title: string
  notes: string | null
  done_at: string | null
  sort_order: number
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface TaskGroup {
  id: string
  title: string
  color: string
  sort_order: number
}
