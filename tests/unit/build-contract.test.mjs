import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../tooling/node_modules/vitest/dist/index.js';
import { root } from '../../scripts/verify-assets.mjs';

test('local validation uses port 5178 consistently without changing preview ports', () => {
  const frontend=fs.readFileSync(path.join(root,'scripts/frontend.mjs'),'utf8');
  const browserConfig=fs.readFileSync(path.join(root,'playwright.config.mjs'),'utf8');
  const browserTests=fs.readFileSync(path.join(root,'tests/browser/foundation.spec.mjs'),'utf8');
  expect(frontend).toContain("server: { host: '127.0.0.1', port: 5178, strictPort: true");
  expect(frontend).toContain("port: subpath ? 4175 : target === 'mobile' ? 4174 : 4173");
  expect(browserConfig).toContain("url:'http://127.0.0.1:5178/login.html'");
  expect(browserTests).toContain('[5178,4173,4174]');
  for (const source of [frontend,browserConfig,browserTests]) expect(source).not.toMatch(/\b5173\b/);
});

test('Capacitor only consumes generated mobile output, never historical www', () => {
  expect(fs.readFileSync(path.join(root,'capacitor.config.ts'),'utf8')).toContain("webDir: 'dist/mobile'");
});
test('Android instrumentation identity matches applicationId', () => {
  const gradle=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
  const check=fs.readFileSync(path.join(root,'android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java'),'utf8');
  const id=gradle.match(/applicationId\s+"([^"]+)"/)[1];
  expect(check).toContain(`assertEquals("${id}", appContext.getPackageName())`);
});

test('native display names use Nobi without changing bundle id or runtime scheme',()=>{
  const android=fs.readFileSync(path.join(root,'android/app/src/main/res/values/strings.xml'),'utf8');
  const ios=fs.readFileSync(path.join(root,'ios/App/App/Info.plist'),'utf8');
  const cap=fs.readFileSync(path.join(root,'capacitor.config.ts'),'utf8');
  expect(android).toContain('<string name="app_name">Nobi 游戏</string>');
  expect(android).toContain('<string name="custom_url_scheme">cn.obsmd.gogame</string>');
  expect(ios).toContain('<string>Nobi 游戏</string>');
  expect(ios).toContain('$(PRODUCT_BUNDLE_IDENTIFIER)');
  expect(cap).toContain("appId: 'cn.obsmd.gogame'");
});
