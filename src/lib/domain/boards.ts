import type { Board, BoardFolder } from '../types'

// Folder-tree logic for Boards. Folders nest via parent_id (null = top level); boards sit in a folder or at the top.

const byOrder = <T extends { sort_order: number; title: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.title.localeCompare(b.title)

export const childFolders = (folders: BoardFolder[], parentId: string | null) =>
  folders.filter((f) => f.parent_id === parentId).sort(byOrder)

/** Most recently edited first; boards saved only on this device (no updated_at yet) count as newest. */
export const boardsIn = (boards: Board[], folderId: string | null) =>
  boards.filter((b) => b.folder_id === folderId)
    .sort((a, b) => (b.updated_at ?? '￿').localeCompare(a.updated_at ?? '￿') || a.title.localeCompare(b.title))

/** Every folder below `folderId` (not including it). Tolerates a corrupt cycle instead of looping forever. */
export function descendantFolderIds(folders: BoardFolder[], folderId: string): Set<string> {
  const out = new Set<string>()
  const queue = [folderId]
  while (queue.length) {
    const id = queue.shift()!
    for (const f of folders) if (f.parent_id === id && !out.has(f.id) && f.id !== folderId) { out.add(f.id); queue.push(f.id) }
  }
  return out
}

/** Root → … → folder, for breadcrumbs. Empty for the top level or an unknown id. */
export function folderPath(folders: BoardFolder[], folderId: string | null): BoardFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: BoardFolder[] = []
  const seen = new Set<string>()
  for (let f = folderId ? byId.get(folderId) : undefined; f && !seen.has(f.id); f = f.parent_id ? byId.get(f.parent_id) : undefined) {
    seen.add(f.id)
    path.unshift(f)
  }
  return path
}

export const pathLabel = (folders: BoardFolder[], folderId: string | null) =>
  folderPath(folders, folderId).map((f) => f.title).join(' / ')

/** A folder may move to the top level or into any folder that isn't itself or one of its subfolders. */
export function canMoveFolder(folders: BoardFolder[], folderId: string, targetParentId: string | null) {
  if (targetParentId === null) return true
  return targetParentId !== folderId && !descendantFolderIds(folders, folderId).has(targetParentId)
}

/** Everything deleting a folder removes (the database cascades the same way). */
export function folderContents(folders: BoardFolder[], boards: Board[], folderId: string) {
  const sub = descendantFolderIds(folders, folderId)
  const all = new Set([folderId, ...sub])
  return { folderIds: sub, boardIds: boards.filter((b) => b.folder_id && all.has(b.folder_id)).map((b) => b.id) }
}

/** Direct children count, shown on folder tiles. */
export const itemCount = (folders: BoardFolder[], boards: Board[], folderId: string) =>
  folders.filter((f) => f.parent_id === folderId).length + boards.filter((b) => b.folder_id === folderId).length

export type SearchHit =
  | { kind: 'folder'; folder: BoardFolder; path: string }
  | { kind: 'board'; board: Board; path: string }

/** Title search across the whole tree; every word must match. Folders first, then boards. */
export function searchBoards(folders: BoardFolder[], boards: Board[], query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const match = (title: string) => words.every((w) => title.toLowerCase().includes(w))
  return [
    ...folders.filter((f) => match(f.title)).sort(byOrder)
      .map((folder) => ({ kind: 'folder' as const, folder, path: pathLabel(folders, folder.parent_id) })),
    ...boards.filter((b) => match(b.title)).sort((a, b) => a.title.localeCompare(b.title))
      .map((board) => ({ kind: 'board' as const, board, path: pathLabel(folders, board.folder_id) })),
  ]
}

/** "just now" · "5m ago" · "3h ago" · "Yesterday" · "Oct 12" */
export function editedLabel(iso: string | undefined, now = new Date()) {
  if (!iso) return 'just now'
  const then = new Date(iso)
  const min = Math.round((now.getTime() - then.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  if (min < 24 * 60 && then.getDate() === now.getDate()) return `${Math.round(min / 60)}h ago`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(then.getFullYear() !== now.getFullYear() && { year: 'numeric' }) })
}
