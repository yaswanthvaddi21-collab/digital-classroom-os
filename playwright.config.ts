import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  // Tests run against the production build, which is what users get (service worker included).
  webServer: {
    command: `npm run build && npm run preview -w @dcos/web -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /chromium-only/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /chromium-only/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /(navigation|document|-touch)\.spec\.ts/ /* every *-touch spec (Phase 5: diagram touch flows) */ },
  ],
});
