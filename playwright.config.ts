import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  timeout: 30000,
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: '.e2e/report.json' }]
  ],
  use: {
    trace: 'on-first-retry',
  },
});
