import { createContext, Suspense, useContext, useState, type ReactNode } from 'react'
import { preloadable } from '@/lib/preloadable'
import type { LearningGoal, LearningTopic, LearningTrack, Routine, Task } from '@/lib/types'

export type Editing =
  | { kind: 'task'; task: Partial<Task> & { id?: string } }
  | { kind: 'routine'; routine: Partial<Routine> & { id?: string } }
  | { kind: 'track'; track: Partial<LearningTrack> }
  | { kind: 'goal'; goal: Partial<LearningGoal> & { track_id: string } }
  | { kind: 'topic'; topic: LearningTopic }
  | null

export const EditorSheets = preloadable(() => import('./EditorSheets'))

type EditorApi = {
  editTask: (t: Partial<Task>) => void
  editRoutine: (r: Partial<Routine>) => void
  editTrack: (t: Partial<LearningTrack>) => void
  editGoal: (g: Partial<LearningGoal> & { track_id: string }) => void
  editTopic: (t: LearningTopic) => void
}
const noop = () => {}
const EditorContext = createContext<EditorApi>({ editTask: noop, editRoutine: noop, editTrack: noop, editGoal: noop, editTopic: noop })

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
        editTrack: (track) => open({ kind: 'track', track }),
        editGoal: (goal) => open({ kind: 'goal', goal }),
        editTopic: (topic) => open({ kind: 'topic', topic }),
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
