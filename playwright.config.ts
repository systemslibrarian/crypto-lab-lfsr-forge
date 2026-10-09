import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4217/crypto-lab-lfsr-forge/', colorScheme: 'dark' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4217 --strictPort',
    url: 'http://localhost:4217/crypto-lab-lfsr-forge/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
