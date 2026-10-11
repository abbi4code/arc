import { Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell, CommandPalette } from './components/AppShell'
import { EditorProvider, EditorSheets } from './components/Editor'
import { useAuth } from './lib/auth'
import { preloadable } from './lib/preloadable'
import LoginPage from './pages/LoginPage'
import TodayPage from './pages/TodayPage'

// Today (and the tiny login screen) render immediately; the rest are separate chunks.
const RoutinesPage = preloadable(() => import('./pages/RoutinesPage'))
const StatsPage = preloadable(() => import('./pages/StatsPage'))
const SettingsPage = preloadable(() => import('./pages/SettingsPage'))
const LearningPage = preloadable(() => import('./pages/LearningPage'))
const TrackPage = preloadable(() => import('./pages/TrackPage'))
const VaultPage = preloadable(() => import('./pages/VaultPage'))

/** After first paint, warm the other chunks so navigation and dialogs never wait. */
function usePrefetch(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
    const id = idle(() => [RoutinesPage, LearningPage, TrackPage, StatsPage, SettingsPage, EditorSheets, CommandPalette].forEach((c) => c.preload()))
    return () => window.cancelIdleCallback?.(id as number)
  }, [enabled])
}

export default function App() {
  const { session, loading } = useAuth()
  usePrefetch(!!session)
  if (loading) return null
  if (!session) return <LoginPage />
  return (
    <BrowserRouter>
      <EditorProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<TodayPage />} />
              <Route path="routines" element={<RoutinesPage />} />
              <Route path="learning" element={<LearningPage />} />
              <Route path="learning/:trackId" element={<TrackPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/passwords" element={<VaultPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </EditorProvider>
    </BrowserRouter>
  )
}
