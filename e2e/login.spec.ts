import { expect, test } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { admin, tempUser } from '../scripts/_env.mjs'

test('sign in with a 6-digit email code', async ({ page }) => {
  const u = await tempUser('otp')
  try {
    // Supabase's built-in mailer only delivers to team addresses, so stub the "send" call…
    let sentTo = ''
    await page.route('**/auth/v1/otp*', async (route) => {
      sentTo = JSON.parse(route.request().postData() ?? '{}').email
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
    await page.goto('/')
    await page.getByLabel('Email').fill(u.email)
    await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
    expect(sentTo).toBe(u.email)

    // …and mint a real code with the admin API. Verification runs against the real server.
    await page.getByLabel('Sign-in code').fill('000000')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText(/wrong or expired/)

    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email })
    if (error) throw error
    await page.getByLabel('Sign-in code').fill(data.properties.email_otp)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByLabel('Quick add task')).toBeVisible()

    // Session survives a reload (same storage key as before the client swap)
    await page.reload()
    await expect(page.getByLabel('Quick add task')).toBeVisible()
  } finally {
    await u.remove()
  }
})
