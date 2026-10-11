import { expect, test } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { admin, env, tempUser } from '../scripts/_env.mjs'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test('learning: track → goal → pasted topics → plan → done on Today', async ({ page, context }) => {
  const u = await tempUser('learn')
  try {
    const { data: { session } } = await u.client.auth.getSession()
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(session)])
    const topic = async (title: string) => (await admin.from('learning_topics').select('*').eq('user_id', u.id).eq('title', title)).data?.[0]

    // Track
    await page.goto('/learning')
    await page.getByRole('button', { name: 'New track' }).click()
    await page.getByLabel('Title', { exact: true }).fill('DSA')
    await page.getByRole('button', { name: 'Create track' }).click()
    await expect(page.getByRole('heading', { name: 'DSA' })).toBeVisible()

    // Goal due in 5 days
    await page.getByRole('button', { name: 'New goal' }).first().click()
    await page.getByLabel('Goal', { exact: true }).fill('Graphs')
    await page.getByLabel('Complete by').fill(iso(5))
    await page.getByRole('button', { name: 'Add goal' }).click()
    await expect(page.getByText('Graphs')).toBeVisible()

    // Paste a list → one topic per line
    const add = page.getByLabel('Add topics')
    await add.focus()
    await add.evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', '- BFS / DFS\n- Topological sort\n- Dijkstra')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(page.getByText('0/3')).toBeVisible()
    await expect.poll(async () => (await admin.from('learning_topics').select('id').eq('user_id', u.id)).data?.length).toBe(3)

    // Paste links → readable titles, link kept and openable in one tap
    await add.evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'https://leetcode.com/problems/number-of-islands/\nhttps://leetcode.com/problems/network-delay-time/')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(page.getByText('0/5')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open link for "Number of Islands"' }))
      .toHaveAttribute('href', 'https://leetcode.com/problems/number-of-islands/')
    expect((await topic('Network Delay Time'))?.notes).toBe('https://leetcode.com/problems/network-delay-time/')

    // Plan a link topic → the Today task carries the link
    await page.getByRole('button', { name: 'Plan "Network Delay Time"', exact: true }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(async () => (await admin.from('tasks').select('notes').eq('user_id', u.id).eq('title', 'Network Delay Time')).data?.[0]?.notes)
      .toBe('https://leetcode.com/problems/network-delay-time/')

    // Tick one directly
    await page.getByRole('checkbox', { name: 'Mark "BFS / DFS" done' }).click()
    await expect(page.getByText('1/5')).toBeVisible()

    // Plan another onto Today at 18:00
    await page.getByRole('button', { name: 'Plan "Dijkstra"', exact: true }).click()
    await expect(page.getByText('DSA · Graphs')).toBeVisible() // chip in the task editor
    await page.locator('input[type="time"]').fill('18:00')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[role="button"]', { hasText: 'Dijkstra' }).getByRole('button', { name: 'Planned · Today' })).toBeVisible()

    // Today: nudge strip + chip; completing the task completes the topic
    await page.getByRole('link', { name: 'Today' }).first().click()
    await expect(page.getByRole('heading', { name: /Learning deadlines/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Graphs · DSA/ })).toContainText('1/5')
    await expect(page.getByRole('link', { name: 'Open link for "Network Delay Time"' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Mark "Dijkstra" done' }).click()
    await expect.poll(async () => !!(await topic('Dijkstra'))?.done_at).toBe(true)
    await expect(page.getByRole('button', { name: /Graphs · DSA/ })).toContainText('2/5')

    // …and un-checking reverts it
    await page.getByRole('checkbox', { name: 'Mark "Dijkstra" not done' }).click()
    await expect.poll(async () => !!(await topic('Dijkstra'))?.done_at).toBe(false)

    // Pause the track → it moves to Archived and the nudge disappears from Today
    await page.getByRole('button', { name: /Graphs · DSA/ }).click()
    await page.getByRole('button', { name: 'Edit track' }).click()
    await page.getByRole('button', { name: 'Paused' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('link', { name: 'Today' }).first().click()
    await expect(page.getByLabel('Quick add task')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Learning deadlines/ })).toHaveCount(0)

    // Delete the track → goals/topics cascade, the planned task stays but is unlinked
    await page.getByRole('link', { name: 'Learning' }).first().click()
    await page.getByRole('button', { name: /Archived/ }).click()
    await page.getByRole('link', { name: /DSA/ }).click()
    await page.getByRole('button', { name: 'Edit track' }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: /Delete track, goals/ }).click()
    await expect(page.getByRole('heading', { name: 'Learning' })).toBeVisible()
    await expect.poll(async () => (await admin.from('learning_topics').select('id').eq('user_id', u.id)).data?.length).toBe(0)
    const task = (await admin.from('tasks').select('*').eq('user_id', u.id).eq('title', 'Dijkstra')).data?.[0]
    expect(task?.topic_id).toBeNull()
  } finally {
    await u.remove()
  }
})
