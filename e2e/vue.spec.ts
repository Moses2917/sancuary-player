import { test, expect } from '@playwright/test'

test('redirects to services and shows brand', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/services$/)
  await expect(page.getByText('Sanctuary')).toBeVisible()
  await expect(page.getByRole('link', { name: /services/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /library/i })).toBeVisible()
})

test('library page shows empty state', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: /no songs yet/i })).toBeVisible()
})
