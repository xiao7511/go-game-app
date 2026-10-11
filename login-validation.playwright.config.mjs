import { defineConfig, devices } from './tooling/node_modules/@playwright/test/index.mjs';
export default defineConfig({
  testDir:'tests/login-browser',outputDir:'test-results/login-5178',workers:1,
  reporter:[['list']],timeout:30000,
  use:{...devices['Desktop Chrome'],channel:process.env.NOBI_BROWSER_CHANNEL || 'msedge',trace:'off',video:'off'}
});
