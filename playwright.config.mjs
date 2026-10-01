import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  use: { baseURL: process.env.AUTH_TEST_BASE_URL || 'http://127.0.0.1:3009', headless: true, launchOptions: process.env.AUTH_TEST_CHROMIUM ? { executablePath: process.env.AUTH_TEST_CHROMIUM, args: ['--no-sandbox','--disable-dev-shm-usage'] } : {} },
  reporter: 'list',
})
