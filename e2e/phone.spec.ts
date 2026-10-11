import { expect, test } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { admin, env, tempUser } from '../scripts/_env.mjs'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test('phone: add tasks from the bottom composer, switch list/timeline', async ({ page, context }) => {
  const u = await tempUser('phone')
  try {
    const { data: { session } } = await u.client.auth.getSession()
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(session)])
    await page.goto('/')

    const composer = page.getByLabel('Quick add task')
    const tabbar = page.locator('.mobile-tabbar')
    await expect(page.getByText('Nothing planned yet')).toBeVisible()
    await expect(tabbar).toBeVisible()

    // Composer sits in the bottom third of the screen (thumb reach), above the tab bar
    const box = (await composer.boundingBox())!
    const bar = (await tabbar.boundingBox())!
    expect(box.y).toBeGreaterThan(844 * 0.66)
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y)

    await composer.tap()
    await expect(tabbar).toBeHidden() // steps aside while typing
    await composer.fill('Read docs 9:00 30m')
    await expect(page.locator('form').filter({ has: composer }).getByText('09:00', { exact: true })).toBeVisible() // parsed chips preview
    await composer.press('Enter')
    await expect(composer).toBeFocused() // keyboard stays for the next one
    await composer.fill('Call bank')
    await page.getByRole('button', { name: 'Add task' }).tap()
    await expect(composer).toBeFocused()
    await expect(composer).toHaveValue('')

    await composer.fill('https://leetcode.com/problems/two-sum/ 9pm')
    await expect(page.locator('form').filter({ has: composer }).getByText('🔗 LeetCode')).toBeVisible()
    await composer.press('Enter')
    await expect(page.getByRole('link', { name: 'Open link for "Two Sum"' })).toHaveAttribute('href', 'https://leetcode.com/problems/two-sum/')

    await expect(page.getByRole('button', { name: /Read docs/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Call bank/ }).first()).toBeVisible()
    await expect.poll(async () => (await admin.from('tasks').select('title').eq('user_id', u.id)).data?.map((t: { title: string }) => t.title).sort())
      .toEqual(['Call bank', 'Read docs', 'Two Sum'])

    await composer.blur()
    await expect(tabbar).toBeVisible()

    // Trash icon on each task row; Undo restores it
    await page.getByRole('button', { name: 'Delete "Call bank"', exact: true }).tap()
    await expect(page.getByRole('button', { name: /Call bank/ })).toHaveCount(0)
    await expect.poll(async () => (await admin.from('tasks').select('id').eq('user_id', u.id).eq('title', 'Call bank')).data?.length).toBe(0)
    await page.getByRole('button', { name: 'Undo' }).tap()
    await expect(page.getByRole('button', { name: /Call bank/ }).first()).toBeVisible()
    await expect.poll(async () => (await admin.from('tasks').select('id').eq('user_id', u.id).eq('title', 'Call bank')).data?.length).toBe(1)
    await page.getByRole('button', { name: 'Delete "Read docs"', exact: true }).tap()
    await expect.poll(async () => (await admin.from('tasks').select('id').eq('user_id', u.id).eq('title', 'Read docs')).data?.length).toBe(0)

    // List / Timeline switch (remembered)
    await page.getByRole('tab', { name: 'Timeline' }).tap()
    await expect(page.getByTestId('timeline')).toBeVisible()
    await expect(page.getByRole('button', { name: /Call bank/ }).first()).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('timeline')).toBeVisible()
    await page.getByRole('tab', { name: 'List' }).tap()
    await expect(page.getByRole('button', { name: /Call bank/ }).first()).toBeVisible()
  } finally {
    await u.remove()
  }
})
