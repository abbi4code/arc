import { expect, test } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { admin, env, tempUser } from '../scripts/_env.mjs'

const SHOTS = process.env.SHOTS_DIR

test('plan a day end to end', async ({ page, context }) => {
  const u = await tempUser('e2e')
  try {
    const { data: { session } } = await u.client.auth.getSession()
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(session)])

    const dbTask = async (title: string) => (await admin.from('tasks').select('*').eq('user_id', u.id).eq('title', title)).data?.[0]

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Quick add with natural time + duration → list row + timeline block + DB row
    const quick = page.getByLabel('Quick add task')
    await quick.fill('Deep work 10:00 2h')
    await expect(page.getByText('2h', { exact: true })).toBeVisible() // live parse chip
    await quick.press('Enter')
    await expect(page.getByRole('button', { name: /Deep work/ }).first()).toBeVisible()
    await expect(page.getByTestId('timeline').getByText('10:00–12:00')).toBeVisible()
    await expect.poll(async () => (await dbTask('Deep work'))?.start_time).toBe('10:00:00')

    // Check it off
    await page.getByRole('checkbox', { name: 'Mark "Deep work" done' }).click()
    await expect.poll(async () => !!(await dbTask('Deep work'))?.done_at).toBe(true)

    // Create a routine and complete it on Today
    await page.getByRole('link', { name: 'Routines' }).first().click()
    await page.getByRole('button', { name: /New routine/ }).first().click()
    await page.getByLabel('Title').fill('Gym')
    await page.getByRole('button', { name: 'Every day' }).click()
    await page.locator('input[type="time"]').fill('07:00')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Every day · 07:00')).toBeVisible()

    await page.getByRole('link', { name: 'Today' }).first().click()
    await page.getByRole('checkbox', { name: 'Mark "Gym" done' }).click()
    await expect.poll(async () => (await admin.from('routine_logs').select('id').eq('user_id', u.id)).data?.length).toBe(1)
    await expect(page.getByLabel('2 of 2 done')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-desktop.png` })

    // Command palette
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByPlaceholder('Type a command or search today…')).toBeVisible()
    await page.keyboard.press('Escape')

    // Offline: queue a change, then sync on reconnect
    await context.setOffline(true)
    await quick.fill('Offline task 15:00')
    await quick.press('Enter')
    await expect(page.getByText(/Offline · 1 pending/).first()).toBeVisible()
    await context.setOffline(false)
    await expect(page.getByText('Synced').first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await dbTask('Offline task'))?.start_time).toBe('15:00:00')

    // Stats shows the routine streak
    await page.getByRole('link', { name: 'Stats' }).first().click()
    await expect(page.getByText('Gym').first()).toBeVisible()
    await expect(page.getByRole('img', { name: 'Daily completion heatmap' })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/stats-desktop.png` })

    if (SHOTS) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('link', { name: 'Today' }).last().click()
      await expect(page.getByLabel('Quick add task')).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/today-mobile.png` })
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.evaluate(() => { document.documentElement.classList.remove('dark') })
      await page.waitForTimeout(400) // let color transitions settle
      await page.screenshot({ path: `${SHOTS}/today-light.png` })
    }
  } finally {
    await u.remove()
  }
})
