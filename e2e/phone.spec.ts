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

test('phone: full titles, #groups, collapsible sections, checklists', async ({ page, context }) => {
  const u = await tempUser('groups')
  try {
    const { data: { session } } = await u.client.auth.getSession()
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(session)])
    const db = (t: string) => admin.from(t).select('*').eq('user_id', u.id)
    await page.goto('/')
    const composer = page.getByLabel('Quick add task')
    const chips = page.locator('form').filter({ has: composer })

    // A long title is shown in full, on several lines, without widening the page
    const long = 'Make an automated weekly report for the team and send it before the Monday standup'
    await composer.fill(long)
    await composer.press('Enter')
    const title = page.getByText(long, { exact: true })
    await expect(title).toBeVisible()
    const box = (await title.boundingBox())!
    expect(box.height).toBeGreaterThan(30) // wrapped onto 2+ lines
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    // #work creates the group; a second #work reuses it
    await composer.fill('#work Standup 10am')
    await expect(chips.getByText('#Work (new)')).toBeVisible()
    await composer.press('Enter')
    await composer.fill('#WORK Fix flaky test')
    await expect(chips.getByText('#Work', { exact: true })).toBeVisible()
    await composer.press('Enter')
    await composer.blur()
    const work = page.getByRole('region', { name: 'Work group' })
    await expect(work.getByText('Standup')).toBeVisible()
    await expect(work.getByText('Fix flaky test')).toBeVisible()
    await expect.poll(async () => (await db('task_groups')).data?.map((g: { title: string }) => g.title)).toEqual(['Work'])
    const groupId = (await db('task_groups')).data![0].id
    await expect.poll(async () => (await db('tasks')).data?.filter((t: { group_id: string }) => t.group_id === groupId).length).toBe(2)

    // Collapse is remembered across reloads
    await work.getByRole('button', { name: /Work/ }).first().tap()
    await expect(work.getByText('Standup')).toBeHidden()
    await page.reload()
    await expect(page.getByRole('region', { name: 'Work group' }).getByText('Standup')).toBeHidden()
    await page.getByRole('region', { name: 'Work group' }).getByRole('button', { name: /Work/ }).first().tap()
    await expect(work.getByText('Standup')).toBeVisible()

    // Checklist: add points in the editor (paste a list), tick them inline → task completes / re-opens
    await work.getByText('Fix flaky test').tap()
    const point = page.getByLabel('Add a point')
    await point.evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', '- Reproduce locally\n- Add retry guard')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(page.getByLabel('Point 2', { exact: true })).toHaveValue('Add retry guard')
    await page.getByRole('button', { name: 'Save' }).tap()
    await expect(work.getByRole('button', { name: 'Checklist 0 of 2', exact: true })).toBeVisible()
    const fixDone = async () => !!(await db('tasks')).data?.find((t: { title: string }) => t.title === 'Fix flaky test')?.done_at
    await work.getByLabel('Point "Reproduce locally"').check()
    await work.getByLabel('Point "Add retry guard"').check()
    await expect.poll(fixDone).toBe(true)
    await expect(work.getByRole('checkbox', { name: 'Mark "Fix flaky test" not done' })).toBeVisible()
    await work.getByRole('button', { name: 'Checklist 2 of 2', exact: true }).tap() // done task's checklist starts collapsed; open it
    await work.getByLabel('Point "Add retry guard"').uncheck()
    await expect.poll(fixDone).toBe(false)

    // Rename, then delete the group: its tasks stay, ungrouped
    await work.getByRole('button', { name: 'Edit group Work', exact: true }).tap()
    await page.getByLabel('Name', { exact: true }).fill('Office')
    await page.getByRole('button', { name: 'Save' }).tap()
    const office = page.getByRole('region', { name: 'Office group' })
    await expect(office.getByText('Standup')).toBeVisible()
    await office.getByRole('button', { name: 'Edit group Office', exact: true }).tap()
    await page.getByRole('button', { name: 'Delete group' }).tap()
    await page.getByRole('button', { name: /Delete group\? Tasks are kept/ }).tap()
    await expect(page.getByRole('region', { name: 'Tasks' }).getByText('Standup')).toBeVisible()
    await expect.poll(async () => (await db('task_groups')).data?.length).toBe(0)
    await expect.poll(async () => (await db('tasks')).data?.length).toBe(3)
  } finally {
    await u.remove()
  }
})
