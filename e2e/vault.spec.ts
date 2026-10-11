import { expect, test } from '@playwright/test'
// @ts-expect-error — plain JS helper shared with the scripts/ checks
import { admin, env, tempUser } from '../scripts/_env.mjs'

const SECRETS = ['HDFC NetBanking', 'cust-1234', 'S3cr3t!pass', 'MPIN', '4321', 'Branch: MG Road', 'netbanking.hdfcbank.com']

test('password vault: setup, encrypt, lock, Face ID + recovery unlock, rotate, delete', async ({ page, context }) => {
  const u = await tempUser('vault')
  const cspViolations: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text()) })
  try {
    const { data: { session } } = await u.client.auth.getSession()
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(session)])
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Simulated Face ID with PRF support
    const cdp = await context.newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true,
    } })

    // Setup from Settings
    await page.goto('/settings')
    await page.getByRole('link', { name: /Passwords/ }).click()
    await page.getByRole('button', { name: 'Create vault with Face ID' }).click()
    const recoveryKey = (await page.getByTestId('recovery-key').innerText()).trim()
    expect(recoveryKey).toMatch(/^WA(-[0-9A-Z]{4}){14}$/)
    await page.getByRole('button', { name: "I've saved it, continue" }).isDisabled()
    await page.getByLabel('Last 4 characters of the recovery key').fill(recoveryKey.slice(-4).toLowerCase())
    await page.getByRole('button', { name: "I've saved it, continue" }).click()

    // Add an entry with a custom hidden field
    await page.getByRole('button', { name: 'New' }).click()
    await page.getByLabel('Name', { exact: true }).fill('HDFC NetBanking')
    await page.getByLabel('Username / email / customer ID').fill('cust-1234')
    await page.getByLabel('Password', { exact: true }).fill('S3cr3t!pass')
    await page.getByLabel('Website').fill('netbanking.hdfcbank.com')
    await page.getByRole('button', { name: /Add field/ }).click()
    await page.getByLabel('Field 1 label').fill('MPIN')
    await page.getByLabel('Field 1 value').fill('4321')
    await page.getByLabel('Notes').fill('Branch: MG Road')
    await page.getByRole('button', { name: 'Save' }).click()

    // View: password masked until revealed; copy works
    await expect(page.getByTestId('field-Username')).toHaveText('cust-1234')
    await expect(page.getByTestId('field-Password')).not.toContainText('S3cr3t')
    await page.getByRole('button', { name: 'Show Password' }).click()
    await expect(page.getByTestId('field-Password')).toHaveText('S3cr3t!pass')
    await page.getByRole('button', { name: 'Copy MPIN' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('4321')
    await page.keyboard.press('Escape')

    // Only ciphertext reaches the database
    await expect.poll(async () => (await admin.from('vault_items').select('id').eq('user_id', u.id)).data?.length).toBe(1)
    const stored = JSON.stringify(await Promise.all(['vault', 'vault_passkeys', 'vault_items'].map(async (t) =>
      (await admin.from(t).select('*').eq('user_id', u.id)).data)))
    for (const s of [...SECRETS, recoveryKey, recoveryKey.replace(/-/g, '')]) expect(stored).not.toContain(s)

    // Search
    await page.getByLabel('Search passwords').fill('hdfc')
    await expect(page.getByRole('button', { name: /HDFC NetBanking/ })).toBeVisible()
    await page.getByLabel('Search passwords').fill('zzz')
    await expect(page.getByRole('button', { name: /HDFC NetBanking/ })).toHaveCount(0)

    // Lock → Face ID unlock
    await page.getByRole('button', { name: 'Lock' }).click()
    await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible()
    await expect(page.getByText('HDFC NetBanking')).toHaveCount(0) // plaintext gone from the page
    await page.getByRole('button', { name: 'Unlock with Face ID' }).click()
    await expect(page.getByRole('button', { name: /HDFC NetBanking/ })).toBeVisible()

    // Lock → recovery key unlock (typo rejected first)
    await page.getByRole('button', { name: 'Lock' }).click()
    await page.getByRole('button', { name: 'Use recovery key' }).click()
    const typo = recoveryKey.slice(0, 10) + (recoveryKey[10] === 'A' ? 'B' : 'A') + recoveryKey.slice(11)
    await page.getByLabel('Recovery key', { exact: true }).fill(typo)
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(/typo/i)
    await page.getByLabel('Recovery key', { exact: true }).fill(recoveryKey.toLowerCase().replace(/-/g, ' '))
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(page.getByRole('button', { name: /HDFC NetBanking/ })).toBeVisible()

    // Replace the recovery key (proved with Face ID) → old key stops working
    await page.getByText('Manage vault').click()
    await page.getByRole('button', { name: 'Replace recovery key' }).click()
    await page.getByRole('button', { name: 'Face ID', exact: true }).click()
    const newKey = (await page.getByTestId('recovery-key').innerText()).trim()
    expect(newKey).not.toBe(recoveryKey)
    await page.getByLabel('Last 4 characters of the recovery key').fill(newKey.slice(-4))
    await page.getByRole('button', { name: "I've saved it, continue" }).click()
    await page.getByRole('button', { name: 'Lock' }).click()
    await page.getByRole('button', { name: 'Use recovery key' }).click()
    await page.getByLabel('Recovery key', { exact: true }).fill(recoveryKey)
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(/doesn't open this vault/)
    await page.getByLabel('Recovery key', { exact: true }).fill(newKey)
    await page.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(page.getByRole('button', { name: /HDFC NetBanking/ })).toBeVisible()

    // Leaving the screen locks it
    await page.getByRole('link', { name: 'Settings' }).first().click()
    await page.getByRole('link', { name: /Passwords/ }).click()
    await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible()

    // Delete the vault
    await page.getByRole('button', { name: 'Unlock with Face ID' }).click()
    await page.getByText('Manage vault').click()
    await page.getByLabel('Type DELETE to confirm').fill('DELETE')
    await page.getByRole('button', { name: 'Delete everything' }).click()
    await expect(page.getByRole('button', { name: 'Create vault with Face ID' })).toBeVisible()
    for (const t of ['vault', 'vault_passkeys', 'vault_items'])
      expect((await admin.from(t).select('*').eq('user_id', u.id)).data).toEqual([])

    expect(cspViolations).toEqual([])
  } finally {
    await u.remove()
  }
})
