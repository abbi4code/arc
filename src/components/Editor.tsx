import { createContext, Suspense, useContext, useState, type ReactNode } from 'react'
import { preloadable } from '@/lib/preloadable'
import type { Routine, Task } from '@/lib/types'

export type Editing =
  | { kind: 'task'; task: Partial<Task> & { id?: string } }
  | { kind: 'routine'; routine: Partial<Routine> & { id?: string } }
  | null

export const EditorSheets = preloadable(() => import('./EditorSheets'))

const EditorContext = createContext<{
  editTask: (t: Partial<Task>) => void
  editRoutine: (r: Partial<Routine>) => void
}>({ editTask: () => {}, editRoutine: () => {} })

export const useEditor = () => useContext(EditorContext)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<Editing>(null)
  const [opened, setOpened] = useState(false) // keep mounted after first use so close animations work
  const open = (e: Editing) => { setOpened(true); setEditing(e) }
  return (
    <EditorContext.Provider
      value={{
        editTask: (task) => open({ kind: 'task', task }),
        editRoutine: (routine) => open({ kind: 'routine', routine }),
      }}
    >
      {children}
      {opened && (
        <Suspense fallback={null}>
          <EditorSheets editing={editing} close={() => setEditing(null)} />
        </Suspense>
      )}
    </EditorContext.Provider>
  )
}
