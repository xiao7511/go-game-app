import { defineConfig, devices } from './tooling/node_modules/@playwright/test/index.mjs';
const reuseDev=process.env.NOBI_REUSE_DEV_SERVER==='1';
if(reuseDev) await (await import('./scripts/verify-dev-server.mjs')).verifyDevServer();
export default defineConfig({outputDir:'test-results/pages',
  testDir:'tests/browser',timeout:30000,fullyParallel:false,workers:1,
  reporter:[['list']],use:{...devices['Desktop Chrome'],channel:process.env.NOBI_BROWSER_CHANNEL || undefined,launchOptions:process.env.NOBI_BROWSER_EXECUTABLE?{executablePath:process.env.NOBI_BROWSER_EXECUTABLE}:{},trace:'retain-on-failure'},
  webServer:[
    {command:'npm run dev',url:'http://127.0.0.1:5178/login.html',reuseExistingServer:reuseDev,timeout:30000},
    {command:'npm run preview',url:'http://127.0.0.1:4173/login.html',reuseExistingServer:process.env.NOBI_REUSE_PREVIEW_SERVERS==='1',timeout:30000},
    {command:'node scripts/frontend.mjs preview mobile',url:'http://127.0.0.1:4174/login.html',reuseExistingServer:process.env.NOBI_REUSE_PREVIEW_SERVERS==='1',timeout:30000},
    {command:'node scripts/frontend.mjs preview subpath',url:'http://127.0.0.1:4175/go-game-app/login.html',reuseExistingServer:process.env.NOBI_REUSE_PREVIEW_SERVERS==='1',timeout:30000}
  ]
});
