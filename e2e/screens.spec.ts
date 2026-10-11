// Visual audit: captures every screen + dialog at phone and desktop sizes per theme.
// Run: SHOTS_DIR=/some/dir npx playwright test screens
import { expect, test, type Page } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { env, tempUser } from '../scripts/_env.mjs'

const SHOTS = process.env.SHOTS_DIR
test.skip(!SHOTS, 'set SHOTS_DIR to capture screenshots')

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function seed(client: any) {
  const routines = [
    { title: 'Gym', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '07:00', duration_min: 60, color: 'blue' },
    { title: 'DSA practice', days_of_week: [1, 2, 3, 4, 5], start_time: '08:00', duration_min: 60, color: 'violet' },
    { title: 'Read 20 pages', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: null, duration_min: 30, color: 'green' },
    { title: "Evening review and plan tomorrow's priorities", days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '21:00', duration_min: 30, color: 'amber' },
  ].map((r) => ({ ...r, starts_on: iso(-120) }))
  const { data: rs } = await client.from('routines').insert(routines).select()
  const logs = []
  for (let i = 1; i <= 120; i++)
    for (const [k, r] of rs.entries()) if ((i * (k + 3)) % 7 !== 0 && i % 11 !== 0) logs.push({ routine_id: r.id, date: iso(-i) })
  logs.push({ routine_id: rs[0].id, date: iso(0) })
  await client.from('routine_logs').insert(logs)
  await client.from('tasks').insert([
    { title: 'Deep work: auth refactor', date: iso(0), start_time: '10:00', duration_min: 120 },
    { title: 'Standup', date: iso(0), start_time: '09:30', duration_min: 15, done_at: new Date().toISOString() },
    { title: 'Review PR #42', date: iso(0) },
    { title: 'Reply to recruiter email', date: iso(-1) },
  ])
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

for (const theme of ['midnight', 'sepia']) {
  test(`screens · ${theme}`, async ({ page, context }) => {
    const u = await tempUser(`shots-${theme}`)
    try {
      await seed(u.client)
      const { data: { session } } = await u.client.auth.getSession()
      const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
      await context.addInitScript(([k, v, t]) => { localStorage.setItem(k, v); localStorage.setItem('theme', t) },
        [`sb-${ref}-auth-token`, JSON.stringify(session), theme])

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      await expect(page.getByText('Deep work: auth refactor').first()).toBeVisible()
      await shot(page, `${theme}-m-today`)
      await page.getByText('Deep work: auth refactor').first().click()
      await shot(page, `${theme}-m-task-dialog`)
      await page.keyboard.press('Escape')

      await page.getByRole('link', { name: 'Routines' }).last().click()
      await expect(page.getByText('DSA practice')).toBeVisible()
      await shot(page, `${theme}-m-routines`)
      await page.getByText('DSA practice').click()
      await shot(page, `${theme}-m-routine-dialog`)
      await page.keyboard.press('Escape')

      await page.getByRole('link', { name: 'Stats' }).last().click()
      await expect(page.getByRole('img', { name: 'Daily completion heatmap' })).toBeVisible()
      await shot(page, `${theme}-m-stats`)

      await page.getByRole('link', { name: 'Settings' }).last().click()
      await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
      await shot(page, `${theme}-m-settings`)
      await page.getByRole('radiogroup', { name: 'Theme' }).scrollIntoViewIfNeeded()
      await shot(page, `${theme}-m-settings-themes`)

      await page.setViewportSize({ width: 1280, height: 800 })
      await page.getByRole('link', { name: 'Today' }).first().click()
      await expect(page.getByText('Deep work: auth refactor').first()).toBeVisible()
      await shot(page, `${theme}-d-today`)
      await page.getByRole('link', { name: 'Settings' }).first().click()
      await shot(page, `${theme}-d-settings`)
    } finally {
      await u.remove()
    }
  })
}

test('login · phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await shot(page, 'login-m')
})
