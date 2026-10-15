import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import path from 'node:path';
import {accessibleHand} from './guandan-layout-helpers.mjs';
import {dealHuaianTurn} from './guandan-fixture.mjs';
const shots=path.resolve(process.env.NOBI_MATCH_SCREENSHOT_DIR || 'docs/nobi-v2/screenshots/phase-2');
const mobile={hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) Mobile'};
async function launch(page,game,port=4173) {
  await page.goto(`http://127.0.0.1:${port}/game.html`);
  await page.locator(`[data-launch="${game}"]`).click();
  if(game==='guandan')await dealHuaianTurn(page);
}

test('touch tap, drag, cancellation and vertical swipe cannot accidentally play cards',async({browser})=>{
  const context=await browser.newContext({...mobile,viewport:{width:844,height:390}});
  const page=await context.newPage();await launch(page,'guandan',4174);
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  const boxes=await page.locator('[data-gd-hand] .gd-card').evaluateAll(cards=>cards.map(c=>{const b=c.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  const a={x:boxes[2].x+3,y:boxes[2].y+35},b={x:boxes[6].x+3,y:boxes[6].y+35};
  await page.touchscreen.tap(a.x,a.y);expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(1);
  await page.touchscreen.tap(a.x,a.y);expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(0);
  const cdp=await context.newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,id:0}))});
  await touch('touchStart',[a]);await touch('touchMove',[b]);await touch('touchCancel',[]);
  expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(0);
  await touch('touchStart',[a]);await touch('touchMove',[b]);await touch('touchEnd',[]);
  expect(await page.evaluate(()=>window.GD.state.selected.size)).toBeGreaterThan(1);
  await page.locator('[data-gd-clear]').click();
  await touch('touchStart',[a]);await touch('touchMove',[{x:a.x,y:a.y-80}]);await touch('touchEnd',[]);
  expect(await page.evaluate(()=>window.GD.state.players[0].hand.length)).toBe(27);
  // Selection/entry transitions can move cards after the initial touch coordinates were captured.
  // Compare controls with the current complete hand, retaining the same size/clearance assertion.
  await expect.poll(()=>page.evaluate(()=>{
    const top=Math.min(...Array.from(document.querySelectorAll('[data-gd-hand] .gd-card'),card=>card.getBoundingClientRect().top));
    return Array.from(document.querySelectorAll('.gd-action-bar button,.gd-header-tools button')).every(button=>{
      const b=button.getBoundingClientRect();return b.height>=44&&b.width>=44&&b.bottom<=top;
    });
  })).toBe(true);
  await page.setViewportSize({width:568,height:320});
  await accessibleHand(page);
  await context.close();
});

test('landscape Guandan keeps all cards proportional and supports drag selection without playing',async({browser})=>{
  const context=await browser.newContext({...mobile,viewport:{width:844,height:390}});
  const page=await context.newPage();await launch(page,'guandan',4174);
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  await expect.poll(()=>page.locator('[data-gd-hand] img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth===222))).toBe(true);
  const boxes=await page.locator('[data-gd-hand] .gd-card').evaluateAll(cards=>cards.map(c=>{const b=c.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};}));
  expect(boxes.every(b=>Math.abs(b.h/b.w-323/222)<.025&&b.x>=0&&b.x+b.w<=844&&b.y+b.h<=390)).toBe(true);
  const a=boxes[1],b=boxes[5];
  await page.mouse.move(a.x+3,a.y+30);await page.mouse.down();await page.mouse.move(b.x+3,b.y+30,{steps:16});await page.mouse.up();
  expect(await page.evaluate(()=>window.GD.state.selected.size)).toBeGreaterThan(1);
  expect(await page.evaluate(()=>window.GD.state.players[0].hand.length)).toBe(27);
  await expect(page.locator('[data-gd-hint]')).toBeVisible();
  await expect(page.locator('[data-gd-clear]')).toBeVisible();
  await page.locator('[data-gd-clear]').click();expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(0);
  await page.locator('[data-gd-hint]').click();expect(await page.evaluate(()=>window.GD.state.selected.size)).toBeGreaterThan(0);
  await expect(page.locator('[data-gd-toast]')).toHaveCSS('opacity','0');
  await page.screenshot({path:path.join(shots,'guandan-mobile-landscape.png')});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#gd-landscape-tips')).toBeVisible();await expect(page.locator('.gd-arena')).toBeHidden();
  await page.setViewportSize({width:844,height:390});
  await page.locator('[data-gd-exit]').click();await expect(page.locator('.nobi-bottom-nav')).toBeVisible();
  expect(await page.evaluate(()=>!!window.GD.state.root)).toBe(false);await context.close();
});

test('PC Guandan exposes four seats, safe hint, keyboard selection and settings',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await launch(page,'guandan');
  await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  await expect(page.locator('.gd-player-info')).toHaveCount(4);
  const card=page.locator('[data-gd-hand] .gd-card').first();await card.focus();await card.press('Space');
  expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(1);
  await page.locator('[data-gd-clear]').click();await page.locator('[data-gd-hint]').click();
  await expect(page.locator('[data-gd-play]')).toBeEnabled();
  await page.locator('[data-match-settings]').filter({visible:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('最后 10 秒倒计时提示');
  await page.getByRole('button',{name:'关闭面板'}).click();
  await expect(page.locator('[data-gd-toast]')).toHaveCSS('opacity','0');await page.screenshot({path:path.join(shots,'guandan-pc.png')});
});

test('mobile five-page review keeps navigation, touch targets, scroll and safe resource previews',async({browser})=>{
  const context=await browser.newContext({...mobile,viewport:{width:390,height:844}});const page=await context.newPage();
  await page.goto('http://127.0.0.1:4174/game.html');
  for(const [route,label,file] of [['home','首页','home'],['games','游戏','games'],['rank','排行','rank'],['friends','好友','friends'],['me','我的','profile']]) {
    await page.locator('.nobi-bottom-nav').getByRole('link',{name:label,exact:true}).click();
    await expect(page.locator('#app-perfect-selector-mask')).toHaveAttribute('data-route',route);
    if(route==='rank') await expect(page.locator('[data-ranking-status]')).toHaveAttribute('data-ranking-status','unavailable');
    await expect(page.locator('[data-id="cs16"]')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
    for(const width of [320,360,390]) {
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const targets=await page.locator('.nobi-bottom-nav a').evaluateAll(items=>items.map(i=>i.getBoundingClientRect()));
      expect(targets.every(b=>b.width>=44&&b.height>=44&&b.bottom<=844)).toBe(true);
    }
    await page.screenshot({path:path.join(shots,`mobile-${file}.png`)});
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    await expect(page.locator('.nobi-bottom-nav')).toBeInViewport();
  }
  await context.close();
});

test('Go original board stays square across DPR and rotations; record uses actual moves',async({browser})=>{
  for(const [name,viewport,options,port] of [['pc',{width:1440,height:900},{},4173],['mobile',{width:390,height:844},{...mobile,deviceScaleFactor:2},4174]]) {
    const context=await browser.newContext({...options,viewport});const page=await context.newPage();await launch(page,'go',port);
    const canvas=page.locator('#goBoard');await expect(canvas).toBeVisible();
    const box=await canvas.boundingBox();expect(Math.abs(box.width-box.height)).toBeLessThan(1);
    expect(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height).toBe(true);
    await canvas.click({position:{x:box.width/2,y:box.height/2}});
    await expect.poll(()=>page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(2);
    await expect(page.locator('[data-go-hint]')).toContainText('最近一步');
    await page.waitForFunction(()=>window.MP.getViewState().latestVisible);
    await page.screenshot({path:path.join(shots,`go-${name}.png`)});
    await page.locator('[data-go-record]').click();await expect(page.getByRole('dialog')).toContainText('黑');
    await expect(page.locator('[data-record-list] li')).toHaveCount(2);await page.getByRole('button',{name:'关闭面板'}).click();
    if(name==='mobile') {
      await page.setViewportSize({width:844,height:390});await expect.poll(async()=>{const b=await canvas.boundingBox();return b.x>=0&&b.y>=0&&b.x+b.width<=844&&b.y+b.height<=390;}).toBe(true);
      await page.setViewportSize(viewport);await expect.poll(async()=>Math.round((await canvas.boundingBox()).width)).toBeGreaterThan(330);
      expect(await page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(2);
    }
    await page.locator('#quit-game-btn').click();await expect(page.locator('#app-perfect-selector-mask')).toBeVisible();await context.close();
  }
});

test('mobile Go previews before confirming, cancels on rotation and undoes a full solo turn',async({browser})=>{
  const context=await browser.newContext({...mobile,viewport:{width:390,height:844},deviceScaleFactor:2});
  const page=await context.newPage();await launch(page,'go',4174);
  const canvas=page.locator('#goBoard');const box=await canvas.boundingBox();
  const summary=await page.locator('.nobi-go-summary').boundingBox();expect(summary.y+summary.height<=box.y).toBe(true);
  const center={x:box.x+box.width/2,y:box.y+box.height/2};
  await page.touchscreen.tap(center.x,center.y);
  expect(await page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(0);
  await expect(page.locator('[data-go-preview]')).toBeVisible();
  const marker=await page.locator('[data-go-preview]').boundingBox();
  expect(Math.abs(marker.x+marker.width/2-center.x)).toBeLessThan(1);
  expect(Math.abs(marker.y+marker.height/2-center.y)).toBeLessThan(1);
  await page.locator('[data-go-cancel]').click();await expect(page.locator('[data-go-preview]')).toBeHidden();
  await page.touchscreen.tap(center.x,center.y);await page.setViewportSize({width:844,height:390});
  await expect(page.locator('[data-go-preview]')).toBeHidden();expect(await page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(0);
  const landscape=await canvas.boundingBox();
  await page.touchscreen.tap(landscape.x+landscape.width/2,landscape.y+landscape.height/2);
  await expect(page.locator('[data-go-confirm]')).toBeInViewport();
  await page.locator('[data-go-confirm]').click();await expect.poll(()=>page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(2);
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-go-undo]').click();await expect.poll(()=>page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(0);
  await expect(page.locator('[data-go-undo]')).toBeDisabled();
  const next=await canvas.boundingBox();await page.touchscreen.tap(next.x+next.width/2,next.y+next.height/2);
  await page.screenshot({path:path.join(shots,'go-mobile-preview.png')});
  await page.locator('[data-go-confirm]').click();await expect.poll(()=>page.evaluate(()=>window.MP.getViewState().moveNumber)).toBe(2);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#surrender-btn').click();
  expect(await page.evaluate(()=>window.MP.getViewState().ended)).toBe(true);
  await expect(page.locator('[data-go-hint]')).toContainText('本局已结束');
  await expect(page.locator('[data-go-undo]')).toBeDisabled();
  await context.close();
});

test('game audio scenes, mute and settings persist across game/lobby boundaries',async({page})=>{
  await launch(page,'guandan');await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
  expect(await page.evaluate(()=>window.NobiAudio.getStatus().scene)).toBe('guandan');
  await page.locator('[data-match-settings]').filter({visible:true}).click();await page.locator('[data-match-mute]').click();
  expect(await page.evaluate(()=>window.NobiAudio.getSettings())).toMatchObject({musicEnabled:false,effectsEnabled:false,promptEnabled:false});
  await page.getByRole('button',{name:'关闭面板'}).click();await page.locator('[data-gd-exit]').click();
  expect(await page.evaluate(()=>window.NobiAudio.getStatus().scene)).toBe('lobby');
  await page.locator('[data-launch="go"]').click();expect(await page.evaluate(()=>window.NobiAudio.getStatus().scene)).toBe('go');
  expect(await page.evaluate(()=>window.NobiAudio.getStatus().available)).toBe(true);
  await page.reload();expect(await page.evaluate(()=>window.NobiAudio.getSettings().effectsEnabled)).toBe(false);
});
