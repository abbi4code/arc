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
  const { data: [dsa, ml] } = await client.from('learning_tracks').insert([
    { title: 'DSA', color: 'violet', sort_order: 0 }, { title: 'AI / ML', color: 'cyan', sort_order: 1 },
  ]).select()
  const { data: gs } = await client.from('learning_goals').insert([
    { track_id: dsa.id, title: 'Graphs', starts_on: iso(-20), target_date: iso(4) },
    { track_id: dsa.id, title: 'Dynamic programming patterns', starts_on: iso(-5), target_date: iso(40) },
    { track_id: dsa.id, title: 'Arrays & hashing', starts_on: iso(-30), target_date: iso(-2) },
    { track_id: ml.id, title: 'Transformers from scratch', starts_on: iso(-3), target_date: iso(25) },
  ]).select()
  const topic = (g: number, title: string, done = false, notes: string | null = null, i = 0) =>
    ({ goal_id: gs[g].id, title, notes, done_at: done ? new Date().toISOString() : null, sort_order: i })
  const { data: ts } = await client.from('learning_topics').insert([
    topic(0, 'BFS / DFS', true, null, 0), topic(0, 'Topological sort', true, null, 1),
    topic(0, 'Union-Find', false, 'https://leetcode.com/tag/union-find/', 2), topic(0, 'Dijkstra', false, null, 3), topic(0, 'Minimum spanning tree (Kruskal / Prim)', false, null, 4),
    topic(1, 'Knapsack', true), topic(1, 'Longest Increasing Subsequence', false, 'https://leetcode.com/problems/longest-increasing-subsequence/'), topic(1, 'Interval DP'),
    topic(2, 'Two pointers', true), topic(2, 'Sliding window'),
    topic(3, 'Attention', true), topic(3, 'Tokenization'), topic(3, 'Train a tiny GPT'),
  ]).select()
  await client.from('tasks').insert({ title: 'Dijkstra', date: iso(0), start_time: '18:00', duration_min: 60, topic_id: ts.find((t: { title: string }) => t.title === 'Dijkstra').id })
  const { data: [work, personal] } = await client.from('task_groups').insert([
    { title: 'Work', color: 'blue', sort_order: 0 }, { title: 'Personal', color: 'green', sort_order: 1 },
  ]).select()
  await client.from('tasks').insert([
    { title: 'Deep work: auth refactor', date: iso(0), start_time: '10:00', duration_min: 120, group_id: work.id },
    { title: 'Standup', date: iso(0), start_time: '09:30', duration_min: 15, done_at: new Date().toISOString(), group_id: work.id },
    { title: 'Make an automated weekly report for the team and send it before the Monday standup', date: iso(0), group_id: work.id,
      subtasks: [{ id: 's1', title: 'Pull metrics from the dashboard', done: true }, { id: 's2', title: 'Write the summary', done: false }, { id: 's3', title: 'Send to #team-updates', done: false }] },
    { title: 'Pay electricity bill', date: iso(0), group_id: personal.id },
    { title: 'Review PR #42', date: iso(0) },
    { title: 'Remind Varinder about the visa appointment documents', date: iso(-1), start_time: '11:30', duration_min: 15, group_id: personal.id },
  ].map((t) => ({ start_time: null, duration_min: null, done_at: null, group_id: null, subtasks: [], ...t }))) // bulk insert needs identical keys
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
      await page.getByRole('region', { name: 'Work group' }).scrollIntoViewIfNeeded()
      await page.getByRole('region', { name: 'Work group' }).evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot(page, `${theme}-m-today-groups`)
      await page.locator('main section').first().evaluate((el) => el.scrollTo({ top: 0 }))
      await page.getByLabel('Quick add task').click()
      await page.getByLabel('Quick add task').fill('Gym tomorrow 7am 1h')
      await shot(page, `${theme}-m-composing`)
      await page.getByLabel('Quick add task').fill('')
      await page.getByLabel('Quick add task').blur()
      await page.getByRole('tab', { name: 'Timeline' }).click()
      await shot(page, `${theme}-m-timeline`)
      await page.getByRole('tab', { name: 'List' }).click()
      await page.getByText('Deep work: auth refactor').first().click()
      await shot(page, `${theme}-m-task-dialog`)
      await page.keyboard.press('Escape')

      await page.getByRole('link', { name: 'Routines' }).last().click()
      await expect(page.getByRole('heading', { name: 'Routines', level: 1 })).toBeVisible()
      await shot(page, `${theme}-m-routines`)
      await page.getByRole('button', { name: /^DSA practice Weekdays/ }).click()
      await shot(page, `${theme}-m-routine-dialog`)
      await page.keyboard.press('Escape')

      await page.getByRole('link', { name: 'Learning' }).last().click()
      await expect(page.getByText('AI / ML')).toBeVisible()
      await shot(page, `${theme}-m-learning`)
      await page.getByRole('link', { name: /DSA/ }).click()
      await expect(page.getByText('Union-Find')).toBeVisible()
      await shot(page, `${theme}-m-track`)
      await page.getByText('Longest Increasing Subsequence').scrollIntoViewIfNeeded()
      await shot(page, `${theme}-m-track-links`)
      await page.getByText('Union-Find').click()
      await shot(page, `${theme}-m-topic`)
      await page.keyboard.press('Escape')

      await page.getByRole('link', { name: 'Settings' }).last().click()
      await page.getByRole('link', { name: /Stats/ }).click()
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
      await page.getByRole('link', { name: 'Learning' }).first().click()
      await page.getByRole('link', { name: /DSA/ }).click()
      await expect(page.getByText('Union-Find')).toBeVisible()
      await shot(page, `${theme}-d-track`)
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
  await page.route('**/auth/v1/otp*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.getByLabel('Email').fill('you@example.com')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await shot(page, 'login-m-verify')
})

test('vault · phone', async ({ page, context }) => {
  const u = await tempUser('shots-vault')
  try {
    const { data: { session } } = await u.client.auth.getSession()
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
    await context.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('theme', 'sepia') }, [`sb-${ref}-auth-token`, JSON.stringify(session)])
    const cdp = await context.newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true,
    } })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/settings/passwords')
    await shot(page, 'vault-m-setup')
    await page.getByRole('button', { name: 'Create vault with Face ID' }).click()
    const key = (await page.getByTestId('recovery-key').innerText()).trim()
    await shot(page, 'vault-m-recovery')
    await page.getByLabel('Last 4 characters of the recovery key').fill(key.slice(-4))
    await page.getByRole('button', { name: "I've saved it, continue" }).click()
    for (const [name, user, cat] of [['HDFC NetBanking', 'cust-1234', 'Bank'], ['Gmail', 'me@gmail.com', 'Email'], ['GitHub', 'octocat', 'Work'], ['SBI YONO', '9876543210', 'Bank']]) {
      await page.getByRole('button', { name: 'New' }).click()
      await page.getByLabel('Name', { exact: true }).fill(name)
      await page.getByLabel('Category').fill(cat)
      await page.getByLabel('Username / email / customer ID').fill(user)
      await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
      if (name === 'HDFC NetBanking') {
        await page.getByRole('button', { name: /Add field/ }).click()
        await page.getByLabel('Field 1 label').fill('MPIN')
        await page.getByLabel('Field 1 value').fill('4321')
        await shot(page, 'vault-m-form')
      }
      await page.getByRole('button', { name: 'Save' }).click()
      if (name === 'HDFC NetBanking') await shot(page, 'vault-m-entry')
      await page.keyboard.press('Escape')
    }
    await shot(page, 'vault-m-list')
    await page.getByRole('button', { name: 'Lock' }).click()
    await shot(page, 'vault-m-locked')
  } finally {
    await u.remove()
  }
})
