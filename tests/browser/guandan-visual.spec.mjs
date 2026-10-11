import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import path from 'node:path';
import {accessibleHand} from './guandan-layout-helpers.mjs';

const shots=path.resolve(process.env.NOBI_GUANDAN_SCREENSHOT_DIR || 'docs/nobi-v2/screenshots/guandan-v21');
const overlap=(a,b)=>a.x<b.right-.5&&a.right>b.x+.5&&a.y<b.bottom-.5&&a.bottom>b.y+.5;

for(const [name,width,height,mobile] of [['pc',1440,900,false],['mobile-landscape',844,390,true],['small-landscape',568,320,true],['mobile-portrait',390,844,true],['landscape-852',852,393,true],['landscape-667',667,375,true],['pc-1920',1920,1080,false],['pc-1600',1600,900,false],['pc-1366',1366,768,false],['landscape-932',932,430,true],['portrait-393',393,852,true]]) {
  test(`V2.1 Guandan ${name}: separate seats, unobstructed PNG hand and reachable controls`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) Mobile'}:{})});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${mobile?4174:4173}/game.html`);
    await page.locator('[data-launch="guandan"]').click();
    await expect(page.locator('[data-gd-hand] .gd-card')).toHaveCount(27);
    await expect(page.locator('.gd-player-avatar')).toHaveCount(4);
    await expect(page.locator('.gd-player-info[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('[data-gd-score]')).toContainText('非积分');
    await expect.poll(()=>page.locator('[data-gd-hand] img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth===222&&i.naturalHeight===323&&new URL(i.src).pathname.includes('/images/cards/')))).toBe(true);
    if(width<height&&mobile){
      await expect(page.locator('#gd-landscape-tips')).toBeVisible();
      await expect(page.locator('#gd-landscape-tips h3')).toHaveText('请横向旋转手机，开始掼蛋对局');
      await expect(page.locator('.gd-arena')).toBeHidden();
      await page.screenshot({path:path.join(shots,`${name}.png`)});
      const before=await page.evaluate(()=>window.GD.state.players[0].hand.map(c=>c.id));
      await page.evaluate(()=>{Object.defineProperty(screen.orientation,'lock',{configurable:true,value:undefined});const container=document.querySelector('#guandan-game-container');container.requestFullscreen=undefined;container.webkitRequestFullscreen=undefined;});
      await page.locator('#gd-fullscreen-trigger').click();
      await expect(page.locator('[data-gd-orientation-notice]')).toContainText('请手动横向旋转手机');
      expect(await page.evaluate(()=>window.GD.state.players[0].hand.map(c=>c.id))).toEqual(before);
      await page.setViewportSize({width:852,height:393});
      await expect(page.locator('#gd-landscape-tips')).toBeHidden();await accessibleHand(page);
      expect(errors).toEqual([]);await context.close();return;
    }
    await page.locator('[data-gd-hint]').click();
    await expect(page.locator('[data-gd-play]')).toBeEnabled();
    await expect(page.locator('[data-gd-toast]')).toHaveCSS('opacity','0');
    const geometry=await page.evaluate(()=>{
      const boxes=selector=>Array.from(document.querySelectorAll(selector),node=>{
        const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};
      });
      return {toast:boxes('[data-gd-toast]')[0],arena:boxes('.gd-arena')[0],top:boxes('.gd-seat.top')[0],sideZones:boxes('.gd-seat.left,.gd-seat.right'),bottom:boxes('.gd-seat.bottom')[0],seats:boxes('.gd-player-info'),hand:boxes('[data-gd-hand] .gd-card'),controls:boxes('.gd-action-bar button,.gd-header-tools button'),self:boxes('[data-gd-player-zone] .gd-player-info')[0],toolbar:boxes('.gd-header-tools')[0],east:boxes('.gd-seat.right .gd-player-info')[0],center:boxes('.gd-center-table')[0],actions:boxes('.gd-action-bar')[0]};
    });
    for(let i=0;i<geometry.seats.length;i++) for(let j=i+1;j<geometry.seats.length;j++) expect(overlap(geometry.seats[i],geometry.seats[j])).toBe(false);
    await accessibleHand(page);
    const selection=await page.evaluate(()=>{const v=document.querySelector('[data-gd-hand-viewport]').getBoundingClientRect();return [...document.querySelectorAll('[data-gd-hand] .sel')].every(n=>{const r=n.getBoundingClientRect();return r.top-3>=v.top&&r.bottom+3<=v.bottom;});});
    expect(selection).toBe(true);
    if(!mobile){expect(geometry.center.w).toBeLessThanOrEqual(560);expect(geometry.seats.every(s=>!overlap(s,geometry.center))).toBe(true);expect(height-geometry.hand[0].bottom).toBeGreaterThan(70);expect(geometry.sideZones[0].x).toBeGreaterThan(60);}
    expect(geometry.hand.every(b=>b.y>=0&&b.bottom<=height+.5&&Math.abs(b.h/b.w-323/222)<.025)).toBe(true);
    // Compositor translations can report 43.9999847 for a 44px target.
    expect(geometry.controls.every(b=>b.w>=43.999&&b.h>=43.999&&b.x>=0&&b.right<=width+.5&&b.y>=0&&b.bottom<=height+.5),JSON.stringify(geometry.controls)).toBe(true);
    expect(geometry.controls.every(b=>geometry.hand.every(c=>!overlap(b,c)))).toBe(true);
    expect(geometry.hand.every(c=>!overlap(geometry.self,c))).toBe(true);
    expect(overlap(geometry.east,geometry.toolbar)).toBe(false);
    expect(overlap(geometry.center,geometry.actions)).toBe(false);
    if(mobile&&width>height){
      expect(geometry.controls.every(button=>!overlap(geometry.toast,button))).toBe(true);
      expect(geometry.hand.every(c=>!overlap(geometry.toast,c))).toBe(true);
      expect(geometry.center.h).toBeCloseTo(height<=340?height-240:Math.min(height*.28,110),0);
      expect(geometry.center.w).toBeLessThanOrEqual(310);
      expect(geometry.seats.every(seat=>!overlap(seat,geometry.center))).toBe(true);
      expect(geometry.top.h).toBeGreaterThanOrEqual(54);
      for(const zone of geometry.sideZones)expect(zone.w).toBeGreaterThanOrEqual(128);
      expect(geometry.bottom.bottom-geometry.actions.bottom).toBeGreaterThan(100);
      expect(geometry.hand[0].w).toBe(54);
      expect((geometry.hand[1].x-geometry.hand[0].x)/geometry.hand[0].w).toBeGreaterThanOrEqual(.42);
      expect(geometry.actions.bottom).toBeGreaterThan(height*.6);
      await expect(page.locator('.gd-table-wordmark')).toBeHidden();
      await expect(page.locator('.gd-seat.top .gd-opp-card-back').first()).toBeVisible();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const enabledHitTargets=await page.locator('.gd-action-bar button:enabled').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));expect(enabledHitTargets).toBe(true);
    await page.mouse.move(width/2,height/2);await page.mouse.wheel(0,200);expect(await page.evaluate(()=>scrollY)).toBe(0);
    await page.screenshot({path:path.join(shots,`${name}.png`)});
    await page.locator('[data-match-settings]').filter({visible:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button',{name:'关闭面板'}).click();
    await page.locator('[data-gd-clear]').click();
    expect(await page.evaluate(()=>window.GD.state.selected.size)).toBe(0);
    expect(await page.evaluate(()=>window.GD.state.players[0].hand.length)).toBe(27);
    const ids=await page.locator('[data-gd-hand] .gd-card').evaluateAll(cards=>cards.map(c=>c.dataset.cardId).sort());
    await page.locator('[data-gd-sort]').click();
    expect(await page.locator('[data-gd-hand] .gd-card').evaluateAll(cards=>cards.map(c=>c.dataset.cardId).sort())).toEqual(ids);
    await page.locator('[data-gd-hint]').click();
    await expect(page.locator('[data-gd-toast]')).toHaveCSS('opacity','0');
    await page.locator('[data-gd-play]').click();
    await expect(page.locator('[data-gd-trick] .gd-card').first()).toBeVisible();
    await page.screenshot({path:path.join(shots,`${name}-played.png`)});
    const played=await page.locator('[data-gd-trick] .gd-card').evaluateAll(cards=>cards.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    expect(played.every(b=>geometry.controls.every(c=>!overlap(b,c)))).toBe(true);
    if(mobile&&width>height)expect(played.every(b=>b.x>=geometry.center.x-.5&&b.right<=geometry.center.right+.5&&b.y>=geometry.center.y-.5&&b.bottom<=geometry.center.bottom+.5)).toBe(true);
    expect(errors).toEqual([]);await context.close();
  });
}
