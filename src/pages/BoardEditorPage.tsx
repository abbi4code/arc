// The only module that imports Excalidraw, so it (and its CSS) load only when a board is opened.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CaptureUpdateAction, Excalidraw, MainMenu, WelcomeScreen, exportToBlob, getLibraryItemsHash, hashElementsVersion, useHandleLibrary,
} from '@excalidraw/excalidraw'
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, LibraryItems } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { ChevronLeft, Cloud, CloudOff, Command, GitMerge, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { useBoardActions } from '@/components/boards'
import { useBoards, useFolders, useMutations } from '@/lib/data'
import { boardSync, useBoardStatus } from '@/lib/boards'
import { fileStore, libraryStore, readView, writeView, type Elements, type SavedAppState, type StoredFile } from '@/lib/boards/store'
import type { OpenResult } from '@/lib/boards/sync'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import type { Board } from '@/lib/types'
import { cn } from '@/lib/ui'

const MAX_IMAGE_CHARS = 5_600_000 // matches the whiteboard_files check (~4 MB image)
const THUMB_MAX_CHARS = 60_000

/** The board-level settings that sync; everything else in appState is per session or per device. */
const pickAppState = (a: Partial<AppState>): SavedAppState => ({
  viewBackgroundColor: a.viewBackgroundColor,
  gridModeEnabled: a.gridModeEnabled,
  gridSize: a.gridSize,
  gridStep: a.gridStep,
})
const changeKey = (elements: Elements, a: SavedAppState) => `${hashElementsVersion(elements)}|${JSON.stringify(a)}`

const blobToDataURL = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result as string)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(b)
})

type Loaded = Extract<OpenResult, { kind: 'ready' }> & { files: BinaryFileData[] }

export default function BoardEditorPage() {
  const { boardId = '' } = useParams()
  const { data: boards = [] } = useBoards()
  const board = boards.find((b) => b.id === boardId)
  const [opened, setOpened] = useState<{ id: string; result: Loaded | Exclude<OpenResult, { kind: 'ready' }> } | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const lastKey = useRef('')

  // Full-screen on phones: the app header and tab bar step aside (see index.css).
  useEffect(() => {
    document.documentElement.setAttribute('data-board', '')
    return () => document.documentElement.removeAttribute('data-board')
  }, [])

  useEffect(() => {
    let cancelled = false
    setOpened(null)
    const hooks = {
      onRemote: (elements: Elements, appState: SavedAppState) => {
        lastKey.current = changeKey(elements, appState) // not a local edit: don't upload it straight back
        apiRef.current?.updateScene({ elements, appState: appState as never, captureUpdate: CaptureUpdateAction.NEVER })
      },
      getAppState: () => apiRef.current?.getAppState(),
      thumbnail: () => renderThumbnail(apiRef.current),
    }
    ;(async () => {
      const result = await boardSync.open(boardId, hooks)
      if (cancelled) return
      if (result.kind !== 'ready') return setOpened({ id: boardId, result })
      const files = Object.values(await fileStore.get(boardId)) as BinaryFileData[]
      lastKey.current = changeKey(result.draft.elements, result.draft.appState)
      setOpened({ id: boardId, result: { ...result, files } })
      void boardSync.refresh(boardId)
    })()
    return () => {
      cancelled = true
      boardSync.close(boardId)
    }
  }, [boardId])

  // Upload right away when the app is backgrounded (phones may not come back to finish later).
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void boardSync.flush(boardId)
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [boardId])

  const result = opened?.id === boardId ? opened.result : null
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar board={board} boardId={boardId} />
      {result?.kind === 'ready' ? (
        <Canvas key={boardId} boardId={boardId} loaded={result} apiRef={apiRef} lastKey={lastKey} />
      ) : result ? (
        <Gone kind={result.kind} />
      ) : null}
    </div>
  )
}

function Gone({ kind }: { kind: 'missing' | 'unavailable' }) {
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium">{kind === 'missing' ? 'This board no longer exists' : "This board isn't on this device yet"}</p>
        <p className="mt-1 text-[13px] text-muted">{kind === 'missing' ? 'It may have been deleted on another device.' : 'Connect to the internet once to open it here; after that it works offline.'}</p>
        <Link to="/boards" className="mt-4 inline-block text-[13px] text-accent underline underline-offset-2">Back to Boards</Link>
      </div>
    </div>
  )
}

function TopBar({ board, boardId }: { board?: Board; boardId: string }) {
  const { data: folders = [] } = useFolders()
  const { saveBoard } = useMutations()
  const location = useLocation()
  const folder = board?.folder_id ? folders.find((f) => f.id === board.folder_id) : undefined
  const [title, setTitle] = useState(board?.title ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => setTitle(board?.title ?? ''), [board?.title])
  // A board created a moment ago: name it first.
  useEffect(() => {
    if ((location.state as { fresh?: boolean } | null)?.fresh && board) { inputRef.current?.focus(); inputRef.current?.select() }
  }, [board?.id])

  const cancelled = useRef(false)
  // Blur is the one place the name is saved (Enter and Escape both blur, so it's never saved twice).
  const commit = () => {
    const t = title.trim()
    if (!cancelled.current && board && t && t !== board.title) saveBoard({ ...board, title: t })
    else setTitle(board?.title ?? '')
    cancelled.current = false
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    inputRef.current?.blur()
    focusCanvas() // straight back to drawing
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 pt-[env(safe-area-inset-top)] box-content md:px-3 md:pt-0">
      <Link to={folder ? `/boards/f/${folder.id}` : '/boards'} aria-label={`Back to ${folder?.title ?? 'Boards'}`}
        className="flex h-9 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs text-muted hover:bg-panel-2 hover:text-fg">
        <ChevronLeft size={16} /> <span className="hidden max-w-36 truncate sm:inline">{folder?.title ?? 'Boards'}</span>
      </Link>
      <form onSubmit={submit} className="min-w-0 flex-1">
        <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} maxLength={120}
          onKeyDown={(e) => e.key === 'Escape' && ((cancelled.current = true), e.currentTarget.blur())}
          aria-label="Board name" disabled={!board} placeholder="Untitled board"
          className="h-9 w-full min-w-0 rounded-md bg-transparent px-2 text-base font-medium outline-none hover:bg-panel-2 focus:bg-panel-2 focus:ring-2 focus:ring-[var(--ring)] md:text-sm" />
      </form>
      <SyncPill boardId={boardId} />
      <Button variant="ghost" size="icon" aria-label="Command menu" title="Command menu"
        onClick={() => window.dispatchEvent(new Event('winter-arc:palette'))}><Command size={15} /></Button>
    </div>
  )
}

/** Excalidraw's shortcuts listen on its container, which may still be mounting right after a board is created. */
function focusCanvas(tries = 40) {
  const el = document.querySelector<HTMLElement>('.excalidraw-container')
  if (el) el.focus()
  else if (tries > 0) setTimeout(() => focusCanvas(tries - 1), 50)
}

function SyncPill({ boardId }: { boardId: string }) {
  const s = useBoardStatus(boardId)
  const [showMerged, setShowMerged] = useState(false)
  useEffect(() => {
    if (!s.mergedAt) return
    setShowMerged(true)
    const t = setTimeout(() => setShowMerged(false), 4000)
    return () => clearTimeout(t)
  }, [s.mergedAt])
  const [Icon, text, cls] = showMerged ? [GitMerge, 'Merged changes from another device', 'text-accent']
    : s.state === 'offline' ? [CloudOff, 'Offline · saved on this device', 'text-amber-500']
    : s.state === 'retrying' ? [TriangleAlert, "Couldn't sync · retrying", 'text-amber-500']
    : s.state === 'saving' ? [Loader2, 'Saving…', 'text-muted']
    : s.state === 'deleted' ? [TriangleAlert, 'Deleted elsewhere', 'text-danger']
    : [Cloud, s.large ? 'Saved · this board is very large' : 'Saved', 'text-faint']
  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 px-1 text-[11px]', cls)} aria-live="polite" title={text} data-testid="board-sync">
      <Icon size={13} className={cn(Icon === Loader2 && 'animate-spin')} /> <span className="hidden sm:inline">{text}</span>
    </span>
  )
}

async function renderThumbnail(api: ExcalidrawImperativeAPI | null): Promise<string | undefined> {
  if (!api) return undefined
  const elements = api.getSceneElements()
  if (!elements.length) return ''
  const appState = { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }
  for (const [mimeType, size, quality] of [['image/webp', 400, 0.7], ['image/jpeg', 400, 0.7], ['image/jpeg', 280, 0.55]] as const) {
    const blob = await exportToBlob({ elements, appState, files: api.getFiles(), mimeType, quality, maxWidthOrHeight: size, exportPadding: 16 })
    if (blob.type !== mimeType) continue // Safari can't encode WebP: fall through to JPEG
    const url = await blobToDataURL(blob)
    if (url.length <= THUMB_MAX_CHARS) return url
  }
  return undefined
}

function Canvas({ boardId, loaded, apiRef, lastKey }: {
  boardId: string; loaded: Loaded; apiRef: React.RefObject<ExcalidrawImperativeAPI | null>; lastKey: React.RefObject<string>
}) {
  const { isDark } = useTheme()
  const { saveBoard, saveBoardFile, saveLibrary } = useMutations()
  const { data: folders = [] } = useFolders()
  const { data: boards = [] } = useBoards()
  const { removeBoard, createBoard } = useBoardActions()
  const navigate = useNavigate()
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const status = useBoardStatus(boardId)
  const known = useRef(new Set<string>(loaded.files.map((f) => f.id))) // images already uploaded or stored here
  const viewTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const libraryHash = useRef<number | null>(null)
  const board = boards.find((b) => b.id === boardId)

  const initialData = useMemo<ExcalidrawInitialDataState>(() => {
    const view = readView(boardId)
    return {
      elements: loaded.draft.elements,
      appState: { ...loaded.draft.appState, ...(view && { scrollX: view.scrollX, scrollY: view.scrollY, zoom: { value: view.zoom as never } }) },
      files: loaded.files,
      scrollToContent: !view,
    } as unknown as ExcalidrawInitialDataState
  }, []) // first render only: later changes flow through updateScene

  // Images: fetch the server's copies once, remember them on the device, and clean up unused ones.
  useEffect(() => {
    if (!api) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('whiteboard_files').select('id,mime_type,data_url,created_at').eq('board_id', boardId)
      if (cancelled || error || !data) return
      const local = await fileStore.get(boardId)
      const add: BinaryFileData[] = []
      for (const f of data as { id: string; mime_type: string; data_url: string; created_at: string }[]) {
        known.current.add(f.id)
        if (!local[f.id]) {
          const file = { id: f.id, mimeType: f.mime_type, dataURL: f.data_url, created: Date.parse(f.created_at) } as StoredFile
          local[f.id] = file
          add.push(file as unknown as BinaryFileData)
        }
      }
      if (add.length) { api.addFiles(add); await fileStore.set(boardId, local) }
      // Images no longer used anywhere in the scene (undo history doesn't survive a reload, so this is safe).
      // Only old ones: another device uploads an image ~2 s before the scene that uses it.
      const used = new Set<string>(api.getSceneElementsIncludingDeleted().flatMap((e) => (e.type === 'image' && e.fileId ? [e.fileId] : [])))
      const hourAgo = Date.now() - 60 * 60_000
      const orphans = (data as { id: string; created_at: string }[])
        .filter((f) => !used.has(f.id) && Date.parse(f.created_at) < hourAgo).map((f) => f.id)
      if (orphans.length) {
        await supabase.from('whiteboard_files').delete().eq('board_id', boardId).in('id', orphans)
        orphans.forEach((id) => { delete local[id]; known.current.delete(id) })
        await fileStore.set(boardId, local)
      }
    })()
    return () => { cancelled = true }
  }, [api, boardId, status.remoteAt])

  // Shape libraries: this device's copy first, then the account's (unless this device has an upload queued).
  const adapter = useMemo(() => ({
    load: async () => ({ libraryItems: (await libraryStore.get()) ?? [] }),
    save: async ({ libraryItems }: { libraryItems: LibraryItems }) => {
      await libraryStore.set(libraryItems)
      const hash = getLibraryItemsHash(libraryItems)
      if (hash !== libraryHash.current) { libraryHash.current = hash; saveLibrary(libraryItems) }
    },
  }), [])
  useHandleLibrary({ excalidrawAPI: api, adapter })
  useEffect(() => {
    if (!api) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('whiteboard_library').select('items').maybeSingle()
      if (cancelled || !data) return
      const items = data.items as LibraryItems
      const queued = queryClient.getMutationCache().findAll({ mutationKey: ['library'], status: 'pending' }).length > 0
      const local = (await libraryStore.get()) ?? []
      if (queued || getLibraryItemsHash(items) === getLibraryItemsHash(local)) return
      libraryHash.current = getLibraryItemsHash(items)
      await libraryStore.set(items)
      await api.updateLibrary({ libraryItems: items, merge: false })
    })()
    return () => { cancelled = true }
  }, [api])

  const onChange = useCallback((elements: Elements, appState: AppState, files: BinaryFiles) => {
    const saved = pickAppState(appState)
    const key = changeKey(elements, saved)
    if (key !== lastKey.current) {
      lastKey.current = key
      boardSync.edit(boardId, elements, saved)
    }
    const fresh = Object.values(files).filter((f) => !known.current.has(f.id))
    if (fresh.length) void storeFiles(fresh)
    clearTimeout(viewTimer.current)
    viewTimer.current = setTimeout(() => writeView(boardId, { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value }), 400)
  }, [boardId])

  const storeFiles = async (fresh: BinaryFileData[]) => {
    const local = await fileStore.get(boardId)
    for (const f of fresh) {
      known.current.add(f.id)
      local[f.id] = { id: f.id, mimeType: f.mimeType, dataURL: f.dataURL, created: f.created }
      if (f.dataURL.length > MAX_IMAGE_CHARS) toast.error('Image too large to sync', { description: 'It stays on this device only (limit ~4 MB).' })
      else saveBoardFile({ board_id: boardId, id: f.id, mime_type: f.mimeType, data_url: f.dataURL })
    }
    await fileStore.set(boardId, local)
  }

  const keepCopy = async () => {
    const id = crypto.randomUUID()
    const folderOk = board?.folder_id && folders.some((f) => f.id === board.folder_id)
    const copy: Board = { id, folder_id: folderOk ? board!.folder_id : null, title: `${board?.title ?? 'Board'} (copy)`, sort_order: Date.now(), thumbnail: null }
    saveBoard(copy) // queued insert; the scene upload waits for it
    await boardSync.adopt(id, { elements: apiRef.current?.getSceneElementsIncludingDeleted() ?? [], appState: pickAppState(apiRef.current?.getAppState() ?? {}) })
    const files = Object.values(apiRef.current?.getFiles() ?? {})
    await fileStore.set(id, Object.fromEntries(files.map((f) => [f.id, { id: f.id, mimeType: f.mimeType, dataURL: f.dataURL, created: f.created }])))
    files.forEach((f) => f.dataURL.length <= MAX_IMAGE_CHARS && saveBoardFile({ board_id: id, id: f.id, mime_type: f.mimeType, data_url: f.dataURL }))
    boardSync.forget(boardId)
    navigate(`/boards/${id}`, { replace: true })
  }

  return (
    <div className="relative min-h-0 flex-1">
      {status.state === 'deleted' && (
        <div role="alert" className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 text-[13px]">
          <TriangleAlert size={15} className="shrink-0 text-danger" />
          <span className="min-w-0 flex-1">This board was deleted on another device.</span>
          <Button size="sm" variant="primary" onClick={keepCopy}>Keep a copy</Button>
          <Button size="sm" variant="ghost" onClick={() => { boardSync.forget(boardId); navigate('/boards', { replace: true }) }}>Discard</Button>
        </div>
      )}
      <div className="absolute inset-0">
        <Excalidraw
          excalidrawAPI={(a) => { apiRef.current = a; setApi(a) }}
          initialData={initialData}
          onChange={onChange}
          theme={isDark ? 'dark' : 'light'}
          name={board?.title}
          libraryReturnUrl={`${window.location.origin}/boards/${boardId}`}
          validateEmbeddable={false}
          UIOptions={{ canvasActions: { toggleTheme: false, saveToActiveFile: false }, tools: { image: true } }}
        >
          <MainMenu>
            <MainMenu.Item onSelect={() => createBoard(board?.folder_id ?? null)}>New board</MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            {board && (
              <>
                <MainMenu.Separator />
                <MainMenu.Item onSelect={() => { removeBoard(board); navigate(board.folder_id ? `/boards/f/${board.folder_id}` : '/boards') }}>Delete board</MainMenu.Item>
              </>
            )}
          </MainMenu>
          <WelcomeScreen>
            <WelcomeScreen.Hints.MenuHint />
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Hints.HelpHint />
          </WelcomeScreen>
        </Excalidraw>
      </div>
    </div>
  )
}
