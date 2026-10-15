import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check as CheckIcon, Folder, MoreHorizontal, Shapes } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Field, Input } from './primitives'
import { Sheet } from './Sheet'
import { useMutations } from '@/lib/data'
import { canMoveFolder, childFolders, folderContents } from '@/lib/domain/boards'
import { queryClient } from '@/lib/queryClient'
import type { Board, BoardFolder } from '@/lib/types'
import { cn } from '@/lib/ui'

/** Create + delete helpers shared by the browser, the editor and ⌘K. */
export function useBoardActions() {
  const { saveBoard, saveFolder, deleteBoard, deleteFolder } = useMutations()
  const navigate = useNavigate()
  return {
    createBoard(folderId: string | null) {
      const id = crypto.randomUUID()
      saveBoard({ id, folder_id: folderId, title: 'Untitled board', sort_order: Date.now(), thumbnail: null })
      navigate(`/boards/${id}`, { state: { fresh: true } })
    },
    createFolder(parentId: string | null, title: string) {
      saveFolder({ id: crypto.randomUUID(), parent_id: parentId, title, sort_order: Date.now() })
    },
    /** Hide right away; the delete itself waits until the Undo toast is gone. */
    removeBoard(b: Board) {
      queryClient.setQueryData<Board[]>(['whiteboards'], (old) => old?.filter((x) => x.id !== b.id))
      let settled = false
      const commit = () => { if (!settled) { settled = true; deleteBoard(b.id) } }
      toast(`Deleted “${b.title}”`, {
        duration: 6000,
        action: {
          label: 'Undo',
          onClick: () => { settled = true; queryClient.setQueryData<Board[]>(['whiteboards'], (old) => [...(old ?? []), b]) },
        },
        onAutoClose: commit,
        onDismiss: commit,
      })
    },
    removeFolder: (f: BoardFolder) => deleteFolder(f.id),
  }
}

export type MenuAction = { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }

/** Small "…" menu (no extra dependency): closes on outside click, Escape or after picking. */
export function ItemMenu({ label, actions, className }: { label: string; actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    // Outer box takes the caller's positioning (often `absolute`); the inner one anchors the dropdown.
    <div className={className}>
      <div ref={ref} className="relative">
        <Button variant="ghost" size="icon" aria-label={`More actions for “${label}”`} aria-haspopup="menu" aria-expanded={open}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}>
          <MoreHorizontal size={16} />
        </Button>
        {open && (
          <div role="menu" className="absolute right-0 top-full z-30 mt-1 grid min-w-44 rounded-lg border border-line bg-panel p-1 shadow-xl">
            {actions.map((a) => (
              <button key={a.label} role="menuitem" type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); a.onSelect() }}
                className={cn('flex h-10 items-center gap-2.5 rounded-md px-2.5 text-left text-sm cursor-pointer md:h-8 md:text-[13px]',
                  a.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-panel-2')}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Create / rename a folder or board. */
export function NameSheet({ open, title, label, initial, submit, onSubmit, onClose }: {
  open: boolean; title: string; label: string; initial: string; submit: string; onSubmit: (name: string) => void; onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => { if (open) setValue(initial) }, [open, initial])
  const go = (e: FormEvent) => {
    e.preventDefault()
    const name = value.trim()
    if (!name) return
    onSubmit(name)
    onClose()
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      <form onSubmit={go} className="grid grid-cols-1 gap-4">
        <Field label={label}>
          <Input autoFocus value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} required />
        </Field>
        <div className="flex justify-end"><Button type="submit" variant="primary" disabled={!value.trim()}>{submit}</Button></div>
      </form>
    </Sheet>
  )
}

export type Movable = { kind: 'folder'; folder: BoardFolder } | { kind: 'board'; board: Board }

/** Pick a destination folder from the whole tree; places the item can't go are disabled. */
export function MoveSheet({ item, folders, onClose }: { item: Movable | null; folders: BoardFolder[]; onClose: () => void }) {
  const { saveFolder, saveBoard } = useMutations()
  const rows: { id: string | null; title: string; depth: number }[] = [{ id: null, title: 'Boards', depth: 0 }]
  const walk = (parent: string | null, depth: number) => childFolders(folders, parent).forEach((f) => { rows.push({ id: f.id, title: f.title, depth }); walk(f.id, depth + 1) })
  walk(null, 1)
  const current = item?.kind === 'folder' ? item.folder.parent_id : item?.board.folder_id ?? null
  const allowed = (target: string | null) => !item || target === current ? false
    : item.kind === 'folder' ? canMoveFolder(folders, item.folder.id, target) : true
  const move = (target: string | null) => {
    if (!item || !allowed(target)) return
    if (item.kind === 'folder') saveFolder({ ...item.folder, parent_id: target })
    else saveBoard({ ...item.board, folder_id: target })
    toast(`Moved to ${rows.find((r) => r.id === target)?.title ?? 'Boards'}`)
    onClose()
  }
  const name = item?.kind === 'folder' ? item.folder.title : item?.board.title
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()} title={`Move “${name ?? ''}”`}>
      <div className="-mx-2 grid max-h-[55dvh] overflow-y-auto" role="listbox" aria-label="Destination folder">
        {rows.map((r) => {
          const ok = allowed(r.id)
          return (
            <button key={r.id ?? 'root'} type="button" role="option" aria-selected={r.id === current} disabled={!ok} onClick={() => move(r.id)}
              className="flex h-11 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors enabled:cursor-pointer enabled:hover:bg-panel-2 disabled:opacity-40 md:h-9 md:text-[13px]"
              style={{ paddingLeft: `${0.5 + r.depth * 1.1}rem` }}>
              {r.id ? <Folder size={15} className="shrink-0 text-faint" /> : <Shapes size={15} className="shrink-0 text-faint" />}
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              {r.id === current && <span className="flex items-center gap-1 text-xs text-faint"><CheckIcon size={13} /> Here</span>}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/** Deleting a folder takes everything inside it, so say exactly what. */
export function DeleteFolderSheet({ folder, folders, boards, onConfirm, onClose }: {
  folder: BoardFolder | null; folders: BoardFolder[]; boards: Board[]; onConfirm: (f: BoardFolder) => void; onClose: () => void
}) {
  const c = folder ? folderContents(folders, boards, folder.id) : { folderIds: new Set<string>(), boardIds: [] }
  const parts = [
    c.folderIds.size && `${c.folderIds.size} folder${c.folderIds.size === 1 ? '' : 's'}`,
    c.boardIds.length && `${c.boardIds.length} board${c.boardIds.length === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return (
    <Sheet open={!!folder} onOpenChange={(o) => !o && onClose()} title="Delete folder">
      <p className="text-sm md:text-[13px]">
        Delete <span className="font-medium">“{folder?.title}”</span>{parts.length ? <> and the <span className="font-medium">{parts.join(' and ')}</span> inside it</> : ''}?
      </p>
      <p className="mt-1 text-xs text-muted">This can't be undone.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => { if (folder) onConfirm(folder); onClose() }}>Delete</Button>
      </div>
    </Sheet>
  )
}

/** Thumbnails are rendered light; dark themes invert them the way Excalidraw's own dark mode does. */
export function BoardThumb({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div className={cn('overflow-hidden bg-[#fbfbfb] dark:bg-[#121212]', className)}>
      {src
        ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="board-thumb size-full object-contain" />
        : <div className="grid size-full place-items-center"><Shapes size={22} className="text-[#b9b9c3] dark:text-[#4a4a55]" /></div>}
    </div>
  )
}
