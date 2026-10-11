import type { ReactNode } from 'react'
import type { GoalStatus } from '@/lib/domain/learning'
import { diffDaysISO } from '@/lib/domain/dates'
import { cn } from '@/lib/ui'

const STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  'on-track': { label: 'On track', cls: 'bg-accent/15 text-accent' },
  behind: { label: 'Behind', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  overdue: { label: 'Overdue', cls: 'bg-danger/15 text-danger' },
  done: { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
}

export function StatusBadge({ status, progress, expected }: { status: GoalStatus; progress?: number; expected?: number }) {
  const s = STATUS[status]
  const title = progress !== undefined && expected !== undefined && status !== 'done'
    ? `${Math.round(progress * 100)}% done, ${Math.round(expected * 100)}% expected by now` : undefined
  return <span title={title} className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', s.cls)}>{s.label}</span>
}

export function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-panel-2', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(value * 100)}%`, background: color ?? 'var(--accent)' }} />
    </div>
  )
}

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** "by Nov 15 · in 4d" / "by Nov 15 · today" / "by Nov 5 · 3d late" */
export function dueLabel(target: string, today: string) {
  const d = diffDaysISO(target, today)
  const rel = d === 0 ? 'today' : d > 0 ? `in ${d}d` : `${-d}d late`
  return `by ${fmtDate(target)} · ${rel}`
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g

/** Notes with clickable links. */
export function Linkified({ text }: { text: string }): ReactNode {
  return text.split(URL_RE).map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
        {part.replace(/^https?:\/\/(www\.)?/, '')}
      </a>
    ) : <span key={i}>{part}</span>,
  )
}
