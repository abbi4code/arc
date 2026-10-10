import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { EditorProvider } from './components/Editor'
import { useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import RoutinesPage from './pages/RoutinesPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import TodayPage from './pages/TodayPage'

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <LoginPage />
  return (
    <BrowserRouter>
      <EditorProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="routines" element={<RoutinesPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </EditorProvider>
    </BrowserRouter>
  )
}
