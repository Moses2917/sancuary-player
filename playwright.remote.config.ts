import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'remote.spec.ts',
  timeout: 45_000,
  use: { baseURL: 'http://localhost:1420', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    { command: 'bun run dev', port: 1420, reuseExistingServer: !process.env.CI },
    { command: 'bun run relay', port: 8787, reuseExistingServer: !process.env.CI },
  ],
})
