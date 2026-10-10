import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npx vite preview --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
