import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { formatHM, nowMinutes } from '@/lib/domain/dates'
import type { Routine, Task } from '@/lib/types'
import { cn, colorOf, formatDuration } from '@/lib/ui'

export const HOUR_PX = 52
const SNAP = 15
const MIN_BLOCK = 20 // visual minimum for untimed-duration items (minutes)
const pxPerMin = HOUR_PX / 60

export type Block = {
  key: string
  kind: 'routine' | 'task'
  title: string
  start: number
  duration: number | null
  color: string
  done: boolean
  task?: Task
  routine?: Routine
}

type Placed = Block & { lane: number; lanes: number }

/** Assign overlapping blocks to side-by-side lanes. */
function layout(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || (b.duration ?? 0) - (a.duration ?? 0))
  const end = (b: Block) => b.start + Math.max(b.duration ?? 0, 30)
  const out: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1))
    cluster.forEach((b) => (b.lanes = lanes))
    out.push(...cluster)
    cluster = []
  }
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush()
    const laneEnds: number[] = []
    cluster.forEach((p) => (laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? -1, end(p))))
    let lane = laneEnds.findIndex((e) => e <= b.start)
    if (lane === -1) lane = laneEnds.length
    cluster.push({ ...b, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, end(b))
  }
  if (cluster.length) flush()
  return out
}

type Drag = { key: string; mode: 'move' | 'resize'; y0: number; start: number; duration: number; moved: boolean }

export function Timeline({
  blocks, isToday, onCreateAt, onOpen, onMoveTask,
}: {
  blocks: Block[]
  isToday: boolean
  onCreateAt: (minutes: number) => void
  onOpen: (b: Block) => void
  onMoveTask: (task: Task, start: number, duration: number | null) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(nowMinutes())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [preview, setPreview] = useState<{ key: string; start: number; duration: number } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 30_000)
    return () => clearInterval(t)
  }, [])

  useLayoutEffect(() => {
    const first = blocks.length ? Math.min(...blocks.map((b) => b.start)) : 8 * 60
    const target = isToday ? nowMinutes() - 60 : first - 30
    scroller.current?.scrollTo({ top: Math.max(0, target * pxPerMin) })
    // Re-scroll only when the day (or emptiness) changes, not on every block edit.
  }, [isToday, blocks.length === 0])

  const placed = layout(blocks)

  const onPointerDown = (e: RPointerEvent, b: Placed, mode: Drag['mode']) => {
    e.stopPropagation()
    if (b.kind !== 'task' || e.pointerType !== 'mouse' || e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ key: b.key, mode, y0: e.clientY, start: b.start, duration: b.duration ?? 30, moved: false })
  }
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag) return
    const delta = Math.round((e.clientY - drag.y0) / pxPerMin / SNAP) * SNAP
    if (delta === 0 && !drag.moved) return
    if (!drag.moved) setDrag({ ...drag, moved: true })
    if (drag.mode === 'move') {
      const start = Math.min(Math.max(0, drag.start + delta), 24 * 60 - SNAP)
      setPreview({ key: drag.key, start, duration: drag.duration })
    } else {
      setPreview({ key: drag.key, start: drag.start, duration: Math.max(SNAP, drag.duration + delta) })
    }
  }
  const onPointerUp = (b: Placed) => {
    if (drag?.moved && preview && b.task) onMoveTask(b.task, preview.start, preview.duration)
    else if (!drag?.moved) onOpen(b)
    setDrag(null)
    setPreview(null)
  }

  return (
    <div ref={scroller} className="scrollbar-thin relative h-full overflow-y-auto overscroll-contain">
      <div
        className="relative ml-12 mr-2 cursor-cell"
        style={{ height: 24 * HOUR_PX }}
        onClick={(e) => {
          const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top
          onCreateAt(Math.floor(y / pxPerMin / SNAP) * SNAP)
        }}
        data-testid="timeline"
      >
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: h * HOUR_PX }}>
            <span className="tabular absolute -left-12 -top-2 w-10 text-right font-mono text-[10px] text-faint">
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
          </div>
        ))}

        {placed.map((b) => {
          const p = preview?.key === b.key ? preview : null
          const start = p?.start ?? b.start
          const duration = p?.duration ?? b.duration
          const height = Math.max((duration ?? MIN_BLOCK) * pxPerMin, 18)
          const compact = height < 34
          const color = colorOf(b.color)
          return (
            <div
              key={b.key}
              role="button"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => onPointerDown(e, b, 'move')}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(b)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(b)}
              className={cn(
                'group absolute overflow-hidden rounded-md border-l-2 px-2 text-xs transition-[box-shadow,opacity] select-none',
                b.kind === 'task' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                b.done && 'opacity-50',
                p && 'z-10 shadow-lg ring-1 ring-[var(--ring)]',
                compact ? 'flex items-center gap-2' : 'py-1',
              )}
              style={{
                top: start * pxPerMin + 1,
                height: height - 2,
                left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                width: `calc(${100 / b.lanes}% - 4px)`,
                borderColor: color,
                background: `color-mix(in oklab, ${color} 16%, var(--panel))`,
              }}
            >
              <div className={cn('truncate font-medium', b.done && 'line-through')}>{b.title}</div>
              <div className="tabular truncate font-mono text-[10px] text-muted">
                {formatHM(start)}{duration ? `–${formatHM(start + duration)}` : ''}
                {!compact && duration ? ` · ${formatDuration(duration)}` : ''}
              </div>
              {b.kind === 'task' && (
                <div
                  className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
                  onPointerDown={(e) => onPointerDown(e, b, 'resize')}
                />
              )}
            </div>
          )
        })}

        {isToday && (
          <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: now * pxPerMin }}>
            <div className="absolute -left-1.5 -top-[4px] size-2 rounded-full bg-accent" />
            <div className="h-px bg-accent" />
          </div>
        )}
      </div>
    </div>
  )
}
