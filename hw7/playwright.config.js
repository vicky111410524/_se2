import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  },
  use: {
    headless: true,
    baseURL: 'http://localhost:3000'
  }
});
