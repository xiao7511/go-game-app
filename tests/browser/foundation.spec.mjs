import { test, expect } from '../../tooling/node_modules/@playwright/test/index.mjs';
import { cards } from '../../scripts/verify-assets.mjs';

test('dev and real build pages/resources load; private files are not served', async ({request}) => {
  for(const port of [5178,4173,4174]) {
    const base=`http://127.0.0.1:${port}`;
    for(const name of ['index.html','login.html','register.html','game.html','config.js','supabaseClient.js','vendor/supabase.js','guandan-game.js','guandan-mp-ext.js','multiplayer-ext.js','assets/sounds/button-22.mp3',...cards.map(c=>c.path)]) {
      const response=await request.get(base+'/'+name);
      expect(response.status(),`${port}/${name}`).toBe(200);
      expect((await response.body()).length).toBeGreaterThan(0);
    }
    // SPA fallback may return HTML; it must never disclose protected bytes.
    for(const name of ['ios_development.key','my-release-key.jks','.git/config']) {
      const response=await request.get(base+'/'+name);
      const body=await response.body();
      expect(body.toString()).not.toMatch(/BEGIN .*PRIVATE KEY|repositoryformatversion/);
      expect(body.subarray(0,4).toString('hex')).not.toBe('feedfeed');
    }
  }
});

test('login/register load bundled SDK and index redirects under a subpath', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4175/go-game-app/index.html');
  await expect(page).toHaveURL('http://127.0.0.1:4175/go-game-app/login.html');
  await expect(page.locator('#login-btn')).toBeVisible();
  expect(await page.evaluate(()=>typeof window.supabase.createClient)).toBe('function');
  await page.goto('http://127.0.0.1:4173/register.html');
  await expect(page.locator('#reg-btn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('missing Auth/config cannot launch a network room or strand the lobby', async ({page}) => {
  await page.goto('http://127.0.0.1:4174/game.html');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#perfect-go-net').click();
  await expect(page.locator('#app-perfect-selector-mask')).toBeVisible();
  expect(await page.evaluate(()=>document.body.classList.contains('in-game-match'))).toBe(false);
});

test('PC retains adapter; Android browser and mobile artifact have no CS entry', async ({browser}) => {
  for(const [port,mobile] of [[4173,false],[4173,true],[4174,false]]) {
    const context=await browser.newContext(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) Mobile',viewport:{width:390,height:844}}:{});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/game.html`);
    await expect(page.locator('#app-perfect-selector-mask')).toBeVisible();
    await expect(page.locator('[data-id="cs16"]')).toHaveCount(port===4173&&!mobile?1:0);
    expect(await page.evaluate(()=>!!window.NobiPC)).toBe(port===4173&&!mobile);
    expect(errors).toEqual([]);await context.close();
  }
});

test('Guandan solo uses original PNG; Go board renders and accepts a stone', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4174/game.html');
  await page.locator('#perfect-go-solo').click();
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  await expect.poll(()=>page.locator('[data-gd-hand] img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth===222&&img.src.includes('/images/cards/')))).toBe(true);
  expect(await page.locator('[data-gd-hand] img').evaluateAll(images=>images.every(img=>!img.dataset.assetError))).toBe(true);
  await page.evaluate(()=>{ window.GD.destroy();window.backToCentralLobby(); });
  await page.locator('[data-id="go"]').click();
  await page.locator('#perfect-go-solo').click();
  const canvas=page.locator('#goBoard');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(c=>c.width>0&&c.height>0)).toBe(true);
  // Pixel variance proves grid/wood/stones render, without claiming device visual acceptance.
  expect(await canvas.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return new Set(d).size>20;})).toBe(true);
  const point=await canvas.evaluate(c=>({x:c.width/2+5,y:c.height/2}));
  const before=await canvas.evaluate((c,p)=>Array.from(c.getContext('2d').getImageData(p.x,p.y,1,1).data),point);
  const box=await canvas.boundingBox();
  await canvas.click({position:{x:box.width/2,y:box.height/2}});
  const after=await canvas.evaluate((c,p)=>Array.from(c.getContext('2d').getImageData(p.x,p.y,1,1).data),point);
  expect(after.slice(0,3).reduce((a,b)=>a+b,0)).toBeLessThan(before.slice(0,3).reduce((a,b)=>a+b,0));
  expect(errors).toEqual([]);
});

test('Android/iOS-sized mobile pages retain PNGs and complete board in both orientations', async ({browser}) => {
  for(const userAgent of ['Mozilla/5.0 (Linux; Android 14) Mobile','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)']) {
    const context=await browser.newContext({userAgent,viewport:{width:390,height:844},hasTouch:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4174/game.html');
    await page.locator('#perfect-go-solo').click();
    await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
    await expect.poll(()=>page.locator('[data-gd-hand] img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth===222))).toBe(true);
    await page.evaluate(()=>{window.GD.destroy();window.backToCentralLobby();});
    await page.locator('[data-id="go"]').click(); await page.locator('#perfect-go-solo').click();
    for(const viewport of [{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize(viewport);
      const canvas=page.locator('#goBoard');await expect(canvas).toBeVisible();
      expect(await canvas.evaluate(c=>c.width===c.height&&c.width>0)).toBe(true);
      await expect.poll(async()=>{
        const box=await canvas.boundingBox();
        return !!box && box.x >= -1 && box.y >= -1 && box.x+box.width <= viewport.width+1 && box.y+box.height <= viewport.height+1;
      }).toBe(true);
      console.log('Mobile board bounds', JSON.stringify({viewport,box:await canvas.boundingBox()}));
    }
    expect(errors).toEqual([]);await context.close();
  }
});
