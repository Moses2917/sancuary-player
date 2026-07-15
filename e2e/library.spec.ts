import { test, expect } from '@playwright/test'

/**
 * Drop browser test-adapter state so each spec starts with a clean library.
 */
async function resetAppData(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('sanctuary-player-test-storage')
  })
  await page.reload()
}

test.describe('navigation', () => {
  test('redirects / to /services and shows the brand', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/services$/)
    await expect(page.getByText('Sanctuary')).toBeVisible()
    await expect(page.getByRole('link', { name: /services/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /library/i })).toBeVisible()
  })

  test('switches between Services and Library via the nav', async ({ page }) => {
    await resetAppData(page)
    await page.getByRole('link', { name: /library/i }).click()
    await expect(page).toHaveURL(/\/library$/)
    await page.getByRole('link', { name: /services/i }).click()
    await expect(page).toHaveURL(/\/services$/)
  })
})

test.describe('library', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppData(page)
  })

  test('shows the empty state on a fresh database', async ({ page }) => {
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: /no songs yet/i })).toBeVisible()
  })

  test('adds a song from two audio files and lists it', async ({ page }) => {
    await page.goto('/library')

    await page.getByRole('button', { name: /add (your first )?song/i }).first().click()
    await expect(page.getByRole('heading', { name: /add song/i })).toBeVisible()

    // Two DOM-attached file inputs (piano first, choir second).
    const fileInputs = page.locator('input[type=file]')
    await expect(fileInputs).toHaveCount(2)
    await fileInputs.nth(0).setInputFiles('e2e/fixtures/piano-noise.wav')
    await fileInputs.nth(1).setInputFiles('e2e/fixtures/choir-noise.wav')

    await page.getByPlaceholder(/amazing grace/i).fill('Test Hymn')
    await page.getByRole('button', { name: /save song/i }).click()

    // Modal closes and the song shows up in the list.
    await expect(page.getByRole('heading', { name: /add song/i })).toBeHidden()
    await expect(page.getByText('Test Hymn')).toBeVisible()
    await expect(page.getByText('Piano').first()).toBeVisible()
    await expect(page.getByText('Choir').first()).toBeVisible()
  })

  test('derives the title from the filename when left blank', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: /add (your first )?song/i }).first().click()

    const inputs = page.locator('input[type=file]')
    await inputs.nth(0).setInputFiles('e2e/fixtures/piano-2.wav')
    await inputs.nth(1).setInputFiles('e2e/fixtures/choir-2.wav')
    await page.getByRole('button', { name: /save song/i }).click()

    // "piano-2" is the filename (extension stripped) → derived title.
    await expect(page.getByText('piano-2')).toBeVisible()
  })

  test('persists the song across a page reload', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: /add (your first )?song/i }).first().click()
    const inputs = page.locator('input[type=file]')
    await inputs.nth(0).setInputFiles('e2e/fixtures/piano-noise.wav')
    await inputs.nth(1).setInputFiles('e2e/fixtures/choir-noise.wav')
    await page.getByPlaceholder(/amazing grace/i).fill('Persisted Hymn')
    await page.getByRole('button', { name: /save song/i }).click()
    await expect(page.getByText('Persisted Hymn')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Persisted Hymn')).toBeVisible()
  })

  test('removes a song after confirming', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: /add (your first )?song/i }).first().click()
    const inputs = page.locator('input[type=file]')
    await inputs.nth(0).setInputFiles('e2e/fixtures/piano-noise.wav')
    await inputs.nth(1).setInputFiles('e2e/fixtures/choir-noise.wav')
    await page.getByPlaceholder(/amazing grace/i).fill('Doomed')
    await page.getByRole('button', { name: /save song/i }).click()
    await expect(page.getByText('Doomed')).toBeVisible()

    // First click reveals inline confirm, second click (Delete) removes it.
    await page.getByRole('button', { name: /remove/i }).click()
    await page.getByRole('button', { name: /^delete$/i }).click()
    await expect(page.getByText('Doomed')).toHaveCount(0)
  })
})
