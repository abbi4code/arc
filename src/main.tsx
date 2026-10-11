import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Toaster } from 'sonner'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './lib/auth'
import { persister, queryClient } from './lib/queryClient'
import { useTheme } from './lib/theme'
import { ErrorBoundary } from './components/ErrorBoundary'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import './index.css'

registerSW({ immediate: true })

function ThemedToaster() {
  const { isDark } = useTheme()
  return <Toaster theme={isDark ? 'dark' : 'light'} position="bottom-right" toastOptions={{ className: '!bg-panel !border-line !text-fg' }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: 'v1' }}
        onSuccess={() => queryClient.resumePausedMutations()}
      >
        <AuthProvider>
          <App />
        </AuthProvider>
        <ThemedToaster />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
