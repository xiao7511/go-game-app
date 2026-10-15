import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import {createHash} from 'node:crypto';
import {appRelease,webDownloadAssets} from '../../scripts/app-download-assets.mjs';

test('web install entries expose the current APK and provided TestFlight invitation',async({page,request})=>{
  const release=await appRelease();
  for(const name of ['login.html','register.html','game.html','online.html?game=guandan']){
    await page.goto('http://127.0.0.1:4173/'+name);
    const android=page.getByRole('link',{name:`下载安卓 App ${release.android.version} 测试版`,exact:true});
    await expect(android).toBeVisible();
    await expect(android).toHaveAttribute('href','app-downloads/'+release.android.file);
    await expect(android).toHaveAttribute('download',release.android.file);
    await expect(page.getByRole('link',{name:'加入 iOS TestFlight 测试',exact:true})).toHaveAttribute('href',release.ios.invitationUrl);
  }
  const response=await request.get('http://127.0.0.1:4173/app-downloads/'+release.android.file);
  expect(response.status()).toBe(200);
  const bytes=await response.body();
  expect(bytes.length).toBe(release.android.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(release.android.sha256);
});

test('native build omits Web download metadata and APKs without breaking the lobby',async({page,request})=>{
  await page.goto('http://127.0.0.1:4174/game.html');
  await expect(page.locator('[data-launch="guandan"]')).toBeVisible();
  await expect(page.locator('.nobi-app-downloads')).toHaveCount(0);
  expect(await page.evaluate(()=>typeof window.NobiAppDownloads)).toBe('undefined');
  for(const name of webDownloadAssets){
    const response=await request.get('http://127.0.0.1:4174/'+name);
    // Vite's SPA preview may return index.html for an absent asset. It must
    // never return a download script/style; the build guard also checks disk.
    if(response.status()===200){
      expect(response.headers()['content-type']).toContain('text/html');
      expect((await response.text()).trimStart()).toMatch(/^<!doctype html>/i);
    }else expect(response.status()).toBe(404);
  }
});
