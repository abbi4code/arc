import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Folder, FolderInput, FolderPlus, LayoutGrid, List, Pencil, Plus, Search, Shapes, Trash2, X } from 'lucide-react'
import { Button } from '@/components/primitives'
import { BoardThumb, DeleteFolderSheet, ItemMenu, MoveSheet, NameSheet, useBoardActions, type MenuAction, type Movable } from '@/components/boards'
import { useBoards, useFolders, useMutations } from '@/lib/data'
import { boardsIn, childFolders, editedLabel, folderPath, itemCount, searchBoards } from '@/lib/domain/boards'
import type { Board, BoardFolder } from '@/lib/types'
import { cn } from '@/lib/ui'

type View = 'grid' | 'list'
const readView = (): View => { try { return localStorage.getItem('boardsView') === 'list' ? 'list' : 'grid' } catch { return 'grid' } }

export default function BoardsPage() {
  const { folderId = null } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: folders = [], isLoading } = useFolders()
  const { data: boards = [] } = useBoards()
  const { saveFolder, saveBoard } = useMutations()
  const { createBoard, createFolder, removeBoard, removeFolder } = useBoardActions()
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem('boardsView', v) } catch { /* storage blocked */ } }
  const [query, setQuery] = useState('')
  const [naming, setNaming] = useState<null | { kind: 'new-folder' } | { kind: 'rename-folder'; folder: BoardFolder } | { kind: 'rename-board'; board: Board }>(null)
  const [moving, setMoving] = useState<Movable | null>(null)
  const [deleting, setDeleting] = useState<BoardFolder | null>(null)

  // ⌘K "New folder" lands here with a request to open the sheet.
  useEffect(() => {
    if ((location.state as { newFolder?: boolean } | null)?.newFolder) {
      setNaming({ kind: 'new-folder' })
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state])
  useEffect(() => setQuery(''), [folderId])

  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined
  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId])
  const subFolders = useMemo(() => childFolders(folders, folderId), [folders, folderId])
  const here = useMemo(() => boardsIn(boards, folderId), [boards, folderId])
  const hits = useMemo(() => searchBoards(folders, boards, query), [folders, boards, query])

  if (folderId && !folder) return isLoading ? null : <Navigate to="/boards" replace />

  const folderActions = (f: BoardFolder): MenuAction[] => [
    { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setNaming({ kind: 'rename-folder', folder: f }) },
    { label: 'Move to…', icon: <FolderInput size={14} />, onSelect: () => setMoving({ kind: 'folder', folder: f }) },
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(f) },
  ]
  const boardActions = (b: Board): MenuAction[] => [
    { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setNaming({ kind: 'rename-board', board: b }) },
    { label: 'Move to…', icon: <FolderInput size={14} />, onSelect: () => setMoving({ kind: 'board', board: b }) },
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => removeBoard(b) },
  ]
  const empty = subFolders.length === 0 && here.length === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      {folder && (
        <nav aria-label="Breadcrumb" className="-ml-1 mb-2 flex min-w-0 flex-wrap items-center gap-0.5 text-xs text-muted">
          <Link to="/boards" className="rounded px-1 py-0.5 hover:text-fg">Boards</Link>
          {path.slice(0, -1).map((p) => (
            <span key={p.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight size={12} className="shrink-0 text-faint" />
              <Link to={`/boards/f/${p.id}`} className="max-w-40 truncate rounded px-1 py-0.5 hover:text-fg">{p.title}</Link>
            </span>
          ))}
        </nav>
      )}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          {folder ? <Folder size={20} className="shrink-0 text-accent" /> : <Shapes size={20} className="shrink-0 text-accent" />}
          <h1 className="truncate text-2xl font-semibold tracking-tight">{folder?.title ?? 'Boards'}</h1>
          {folder && <ItemMenu label={folder.title} actions={folderActions(folder)} />}
        </div>
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => setNaming({ kind: 'new-folder' })}><FolderPlus size={14} /> New folder</Button>
          <Button variant="primary" onClick={() => createBoard(folderId)}><Plus size={14} /> New board</Button>
        </div>
      </header>

      <div className="mb-5 flex gap-2">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <Search size={15} className="shrink-0 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all boards and folders" aria-label="Search boards"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-[13px]" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-faint hover:text-fg cursor-pointer"><X size={15} /></button>}
        </div>
        <div className="flex rounded-lg border border-line bg-panel-2 p-0.5" role="group" aria-label="View">
          {([['grid', LayoutGrid, 'Grid view'], ['list', List, 'List view']] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" aria-label={label} aria-pressed={view === v} onClick={() => setView(v)}
              className={cn('grid w-10 place-items-center rounded-md transition-colors cursor-pointer md:w-9', view === v ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg')}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {query.trim() ? (
        <section aria-label="Search results">
          {hits.length === 0 && <p className="py-10 text-center text-[13px] text-faint">No boards or folders match “{query.trim()}”.</p>}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line empty:hidden">
            {hits.map((h) => h.kind === 'folder' ? (
              <ListRow key={h.folder.id} to={`/boards/f/${h.folder.id}`} icon={<Folder size={16} className="text-accent" />} title={h.folder.title}
                meta={h.path || 'Boards'} actions={folderActions(h.folder)} />
            ) : (
              <ListRow key={h.board.id} to={`/boards/${h.board.id}`} icon={<BoardThumb src={h.board.thumbnail} className="h-8 w-11 rounded border border-line" />}
                title={h.board.title} meta={`${h.path || 'Boards'} · ${editedLabel(h.board.updated_at)}`} actions={boardActions(h.board)} />
            ))}
          </div>
        </section>
      ) : empty ? (
        !isLoading && (
          <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center sm:p-12">
            <Shapes className="mx-auto text-accent" size={24} />
            <p className="mt-3 text-sm font-medium">{folder ? 'This folder is empty' : 'Design your systems here'}</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
              {folder ? 'Add a board, or a folder to group them further.' : 'Create a folder like “System Design”, then add boards such as “URL shortener” or “Chat app”.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="subtle" onClick={() => setNaming({ kind: 'new-folder' })}><FolderPlus size={14} /> New folder</Button>
              <Button variant="primary" onClick={() => createBoard(folderId)}><Plus size={14} /> New board</Button>
            </div>
          </div>
        )
      ) : view === 'grid' ? (
        <>
          {subFolders.length > 0 && (
            <section aria-label="Folders" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {subFolders.map((f) => (
                <div key={f.id} className="group relative">
                  <Link to={`/boards/f/${f.id}`} className="flex h-14 items-center gap-2.5 rounded-xl border border-line bg-panel pl-3 pr-11 transition-colors hover:border-line-strong">
                    <Folder size={17} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium md:text-[13px]">{f.title}</span>
                      <span className="block text-[11px] text-faint">{plural(itemCount(folders, boards, f.id), 'item')}</span>
                    </span>
                  </Link>
                  <ItemMenu label={f.title} actions={folderActions(f)} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
                </div>
              ))}
            </section>
          )}
          {here.length > 0 && (
            <section aria-label="Boards" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {here.map((b) => (
                <div key={b.id} className="group relative">
                  <Link to={`/boards/${b.id}`} className="block overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-line-strong">
                    <BoardThumb src={b.thumbnail} className="aspect-[4/3] border-b border-line" />
                    <div className="px-3 py-2 pr-10">
                      <div className="truncate text-sm font-medium md:text-[13px]">{b.title}</div>
                      <div className="text-[11px] text-faint">{editedLabel(b.updated_at)}</div>
                    </div>
                  </Link>
                  <ItemMenu label={b.title} actions={boardActions(b)} className="absolute bottom-1.5 right-1" />
                </div>
              ))}
            </section>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {subFolders.map((f) => (
            <ListRow key={f.id} to={`/boards/f/${f.id}`} icon={<Folder size={16} className="text-accent" />} title={f.title}
              meta={plural(itemCount(folders, boards, f.id), 'item')} actions={folderActions(f)} />
          ))}
          {here.map((b) => (
            <ListRow key={b.id} to={`/boards/${b.id}`} icon={<BoardThumb src={b.thumbnail} className="h-8 w-11 rounded border border-line" />}
              title={b.title} meta={editedLabel(b.updated_at)} actions={boardActions(b)} />
          ))}
        </div>
      )}

      <NameSheet
        open={!!naming}
        title={naming?.kind === 'new-folder' ? (folder ? `New folder in “${folder.title}”` : 'New folder') : 'Rename'}
        label={naming?.kind === 'rename-board' ? 'Board name' : 'Folder name'}
        initial={naming?.kind === 'rename-folder' ? naming.folder.title : naming?.kind === 'rename-board' ? naming.board.title : ''}
        submit={naming?.kind === 'new-folder' ? 'Create folder' : 'Save'}
        onSubmit={(name) => {
          if (naming?.kind === 'new-folder') createFolder(folderId, name)
          else if (naming?.kind === 'rename-folder') saveFolder({ ...naming.folder, title: name })
          else if (naming?.kind === 'rename-board') saveBoard({ ...naming.board, title: name })
        }}
        onClose={() => setNaming(null)}
      />
      <MoveSheet item={moving} folders={folders} onClose={() => setMoving(null)} />
      <DeleteFolderSheet folder={deleting} folders={folders} boards={boards} onClose={() => setDeleting(null)}
        onConfirm={(f) => { removeFolder(f); if (f.id === folderId || path.some((p) => p.id === f.id)) navigate(f.parent_id ? `/boards/f/${f.parent_id}` : '/boards') }} />
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function ListRow({ to, icon, title, meta, actions }: { to: string; icon: React.ReactNode; title: string; meta: string; actions: MenuAction[] }) {
  return (
    <div className="relative flex items-center bg-panel transition-colors hover:bg-panel-2">
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-12">
        <span className="grid w-11 shrink-0 place-items-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium md:text-[13px]">{title}</span>
          <span className="block truncate text-xs text-muted">{meta}</span>
        </span>
      </Link>
      <ItemMenu label={title} actions={actions} className="absolute right-2" />
    </div>
  )
}
