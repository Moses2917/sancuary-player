import { test, expect, type Page } from '@playwright/test'

async function resetAppData(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('sanctuary-player')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })
}

/** Import a single library song (used to seed data for service tests). */
async function importSong(
  page: Page,
  title: string,
  piano: string,
  choir: string,
) {
  await page.goto('/library')
  await page.getByRole('button', { name: /add (your first )?song/i }).first().click()
  const inputs = page.locator('input[type=file]')
  await inputs.nth(0).setInputFiles(piano)
  await inputs.nth(1).setInputFiles(choir)
  await page.getByPlaceholder(/amazing grace/i).fill(title)
  await page.getByRole('button', { name: /save song/i }).click()
  await expect(page.getByText(title)).toBeVisible()
}

test.describe('services', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppData(page)
  })

  test('shows the empty state on a fresh database', async ({ page }) => {
    await page.goto('/services')
    await expect(page.getByRole('heading', { name: /no services yet/i })).toBeVisible()
  })

  test('creates a service and navigates to its empty playlist', async ({ page }) => {
    await page.goto('/services')
    await page.getByRole('button', { name: /new service/i }).click()
    await page.getByPlaceholder(/sunday morning/i).fill('Sunday Morning')
    await page.getByRole('button', { name: /^create$/i }).click()

    await expect(page).toHaveURL(/\/services\//)
    await expect(page.getByRole('heading', { name: 'Sunday Morning' })).toBeVisible()
    await expect(page.getByText(/empty playlist/i)).toBeVisible()
  })

  test('builds a playlist and plays it', async ({ page }) => {
    await importSong(
      page,
      'Amazing Grace',
      'e2e/fixtures/piano-noise.wav',
      'e2e/fixtures/choir-noise.wav',
    )

    await page.goto('/services')
    await page.getByRole('button', { name: /new service/i }).click()
    await page.getByPlaceholder(/sunday morning/i).fill('Service One')
    await page.getByRole('button', { name: /^create$/i }).click()

    // Add the song from the library picker.
    await page.getByRole('button', { name: /add songs/i }).first().click()
    await page.getByText('Amazing Grace').click()
    await page.getByRole('button', { name: /^add \d+$/i }).click()

    // The playlist row is present.
    await expect(page.getByText('Amazing Grace')).toHaveCount(1)

    // Play the service — the player bar should reflect the current song.
    await page.getByRole('button', { name: /play service/i }).click()
    await expect(page.locator('.np__title')).toContainText('Amazing Grace')
    await expect(page.locator('.np__sub')).toContainText('Service One')
    // The transport shows a pause glyph while playing (data via .icon-btn--lg).
    await expect(page.locator('.icon-btn--lg')).toBeVisible()
  })

  test('independent piano/choir mute toggles in the player bar', async ({ page }) => {
    await importSong(
      page,
      'Mute Test',
      'e2e/fixtures/piano-noise.wav',
      'e2e/fixtures/choir-noise.wav',
    )

    await page.goto('/services')
    await page.getByRole('button', { name: /new service/i }).click()
    await page.getByPlaceholder(/sunday morning/i).fill('Mute Service')
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.getByRole('button', { name: /add songs/i }).first().click()
    await page.getByText('Mute Test').click()
    await page.getByRole('button', { name: /^add \d+$/i }).click()
    await page.getByRole('button', { name: /play service/i }).click()

    // Click the PlayerBar's Piano mix tag (PlaylistRow also has .mix__tag
    // spans that aren't buttons, so scope to the player bar).
    const pianoTag = page.locator('.player-bar .mix__tag').first()
    await pianoTag.click()
    await expect(pianoTag).toHaveClass(/mix__tag--muted/)
    // The choir tag is unaffected.
    const choirTag = page.locator('.player-bar .mix__tag').nth(1)
    await expect(choirTag).not.toHaveClass(/mix__tag--muted/)
  })

  test('persists a service and its playlist across reload', async ({ page }) => {
    await importSong(
      page,
      'Persist Song',
      'e2e/fixtures/piano-noise.wav',
      'e2e/fixtures/choir-noise.wav',
    )
    await page.goto('/services')
    await page.getByRole('button', { name: /new service/i }).click()
    await page.getByPlaceholder(/sunday morning/i).fill('Persisted Service')
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.getByRole('button', { name: /add songs/i }).first().click()
    await page.getByText('Persist Song').click()
    await page.getByRole('button', { name: /^add \d+$/i }).click()

    // The row renders before the reload.
    await expect(page.locator('.row__title').getByText('Persist Song')).toBeVisible()

    await page.reload()

    await expect(page.getByText('Persisted Service')).toBeVisible()
    await expect(page.locator('.row__title').getByText('Persist Song')).toBeVisible()
  })
})
