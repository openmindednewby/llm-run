import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e/acceptance',
  timeout: 180_000,
  // One worker: the fixture server's /__stats and /__cut are global state (ruling #17).
  workers: 1,
  fullyParallel: false,
  // not 'html': a failing run hangs with the html reporter
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npx vite build --config e2e/vite.config.ts && node e2e/fixtures/server.ts',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', launchOptions: { args: ['--enable-unsafe-webgpu'] } } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
