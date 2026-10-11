import { expect, test, type Page } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { admin, tempUser } from '../scripts/_env.mjs'

// Supabase's built-in mailer only delivers to team addresses, so stub the "send" call and mint
// the email's link/code with the admin API. Verification always runs against the real server.
async function startSignIn(page: Page, email: string) {
  await page.route('**/auth/v1/otp*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  return page.getByLabel('Sign-in link or code')
}

const paste = (box: ReturnType<Page['getByLabel']>, text: string) =>
  box.evaluate((el, t) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)

test('sign in by pasting the link from the email (installed iPhone app flow)', async ({ page }) => {
  const u = await tempUser('link')
  try {
    const box = await startSignIn(page, u.email)
    await box.fill('not a link')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText(/doesn't look like the sign-in link/)

    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email })
    if (error) throw error
    await box.fill('')
    await paste(box, data.properties.action_link) // pasting signs in straight away
    await expect(page.getByLabel('Quick add task')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Quick add task')).toBeVisible()

    // The same link can't be used twice
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    const again = await startSignIn(page, u.email)
    await paste(again, data.properties.action_link)
    await expect(page.getByRole('alert')).toContainText(/expired or was already used/)
  } finally {
    await u.remove()
  }
})

test('sign in with a code (if the email template sends one)', async ({ page }) => {
  const u = await tempUser('code')
  try {
    const box = await startSignIn(page, u.email)
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email })
    if (error) throw error
    await box.fill(data.properties.email_otp)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByLabel('Quick add task')).toBeVisible()
  } finally {
    await u.remove()
  }
})
