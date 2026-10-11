import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { linkSource } from '@/lib/domain/links'
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

/** One-tap "open link" for rows; doesn't trigger the row's own click. */
export function OpenLink({ url, label, showSource = true }: { url: string; label: string; showSource?: boolean }) {
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      aria-label={`Open link for "${label}"`} title={url}
      className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-xs text-muted hover:bg-panel hover:text-accent"
    >
      {showSource && <span className="hidden max-w-24 truncate sm:inline">{linkSource(url)}</span>}
      <ArrowUpRight size={14} />
    </a>
  )
}

/** Clickable list of every link found in some notes. */
export function LinkList({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => /https?:\/\//.test(l))
  if (!lines.length) return null
  return (
    <div className="-mt-2 grid gap-1 text-xs text-muted">
      <span className="font-medium">Links</span>
      <p className="whitespace-pre-wrap leading-relaxed"><Linkified text={lines.join('\n')} /></p>
    </div>
  )
}
