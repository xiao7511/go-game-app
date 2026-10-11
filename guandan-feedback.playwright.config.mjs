import {defineConfig,devices} from './tooling/node_modules/@playwright/test/index.mjs';
export default defineConfig({
  testDir:'tests/browser',testMatch:'guandan-feedback.spec.mjs',outputDir:'test-results/guandan-feedback',workers:1,
  reporter:[['list']],timeout:40000,
  use:{...devices['Desktop Chrome'],channel:process.env.NOBI_BROWSER_CHANNEL||'msedge',trace:'off',video:'off'}
});
