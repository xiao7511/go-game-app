import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium, expect} from '../tooling/node_modules/@playwright/test/index.mjs';
import {createClient} from '../tooling/node_modules/@supabase/supabase-js/dist/index.mjs';
import {localCredentials} from './local-supabase.mjs';
import {startDeviceServer} from '../server/device-test.mjs';
const config=await localCredentials();
const fixture=JSON.parse(fs.readFileSync('.nobi-isolated/phase3b/manual-accounts.json','utf8'));
assert.equal(fixture.kind,'DISPOSABLE_LOCAL_AUTH');assert.equal(fixture.url,config.url);
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
const output='.nobi-isolated/mobile-navigation';fs.mkdirSync(output,{recursive:true});
const service=await startDeviceServer({port:0,database:path.resolve(output,randomUUID()+'.sqlite'),authenticate:async token=>{const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw Error('Local Auth rejected');return data.user;}});
const browser=await chromium.launch({channel:'msedge'}),checks=[];
const context=await browser.newContext({viewport:{width:390,height:640},isMobile:true,hasTouch:true});
const base=path.resolve('dist/mobile'),origin='http://127.0.0.1:5178';
const mime=file=>({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wav':'audio/wav'}[path.extname(file)]||'application/octet-stream');
await context.grantPermissions(['local-network-access'],{origin});
const routeHandler=async route=>{
 const url=new URL(route.request().url());
 if(url.origin==='http://127.0.0.1:55440')return route.continue({url:service.url+url.pathname+url.search});
 if(url.origin===origin){
  if(url.pathname==='/config.local.js')return route.fulfill({contentType:'application/javascript',body:'window.CONFIG='+JSON.stringify({SUPABASE_URL:config.url,SUPABASE_ANON_KEY:config.key})+';'});
  if(url.pathname==='/online-config.js')return route.fulfill({contentType:'application/javascript',body:'window.NOBI_ONLINE_CONFIG='+JSON.stringify({mode:'usb-test',url:'http://127.0.0.1:55440',supabaseUrl:config.url,ranked:false})+';'});
  const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:mime(file),body:fs.readFileSync(file)});
 }
 if(url.origin===config.url)return route.continue();
 return route.abort();
};
await context.route('**/*',routeHandler);
const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function swipe(x,y,endX,endY,cancel=false){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let n=1;n<=12;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(endX-x)*n/12,y:y+(endY-y)*n/12}]});await new Promise(resolve=>setTimeout(resolve,18));}
 await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
}
const pass=name=>{checks.push(name);console.log('PASS: '+name);};
try{
 await page.goto(origin+'/online.html?game=guandan');await expect(page.locator('#connection')).toHaveText('请登录后加入房间');
 await page.locator('#auth-entry').click();await expect(page.locator('#login-form')).toBeVisible();await page.locator('#login-email').fill(fixture.accounts[0].email);await page.locator('#login-password').fill(fixture.accounts[0].password);await page.locator('#login-btn').click();await expect(page.locator('#rooms')).toBeVisible();
 await page.goto(origin+'/game.html#/me');await expect(page.locator('[data-avatar-preset="2"]')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).overflowY)).toBe('auto');
 await swipe(190,500,190,140);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(80);pass('Portrait profile scrolls vertically through native touch input');
 const before=await page.evaluate(()=>scrollY);
 await swipe(12,320,160,320,true);assert.match(page.url(),/#\/me$/);pass('Cancelled swipe keeps the current page');
 await page.locator('a[href="#/music"]').click();await expect(page.locator('#music-volume')).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 await swipe(12,320,165,324);await expect(page).toHaveURL(/#\/me$/);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(20);pass('Right edge swipe returns to the previous route and restores its scroll position');
 await page.locator('a[href="#/music"]').click();const slider=page.locator('#music-volume');const box=await slider.boundingBox();
 await swipe(box.x+5,box.y+box.height/2,box.x+box.width*.75,box.y+box.height/2);assert.match(page.url(),/#\/music$/);pass('Volume dragging never triggers back navigation');
 await swipe(12,480,22,190);assert.match(page.url(),/#\/music$/);pass('Vertical edge swipe scrolls without navigating');
 await page.locator('.mobile-back').click();await expect(page).toHaveURL(/#\/me$/);pass('Header back uses the actual previous page');
 await page.setViewportSize({width:806,height:360});
 await page.goto(origin+'/game.html#/games/guandan');await page.locator('#perfect-go-solo').click();await expect(page.locator('[data-gd-hand]')).toBeVisible();
 let confirmation=0;page.once('dialog',async dialog=>{confirmation++;await dialog.dismiss();});
 await page.evaluate(()=>NobiNavigation.back());await expect(page.locator('[data-gd-hand]')).toBeVisible();assert.equal(confirmation,1);pass('Back during a match asks for confirmation and cancellation keeps the match');
 await page.locator('.gd-header-tools [data-match-chat]').click();await expect(page.locator('dialog[open]')).toBeVisible();await page.evaluate(()=>NobiNavigation.back());await expect(page.locator('dialog[open]')).toHaveCount(0);pass('Back closes the open chat before leaving the match');
 page.once('dialog',dialog=>dialog.accept());await page.evaluate(()=>NobiNavigation.back());await expect(page.locator('body')).not.toHaveClass(/in-game-match/);pass('Confirmed single-player back exits through engine cleanup');
 await page.goto(origin+'/online.html?game=guandan');await expect(page.locator('#rooms')).toBeVisible();await page.locator('#create').click();
 await expect.poll(()=>page.evaluate(()=>NobiOnline.getConnection().connected)).toBe(true);page.once('dialog',dialog=>dialog.accept());await page.evaluate(()=>NobiNavigation.back());await expect(page.locator('#rooms')).toBeVisible();assert.equal(await page.evaluate(()=>NobiOnline.getSnapshot()),null);pass('Back from a waiting room returns to the room list without losing the room');

 await page.goto(origin+'/online.html?game=go');await expect(page.locator('#rooms')).toBeVisible();await page.locator('#create').click();
 await expect.poll(()=>page.evaluate(()=>NobiOnline.getSnapshot()?.status)).toBe('waiting');
 const roomId=await page.evaluate(()=>NobiOnline.getSnapshot().roomId);
 const opponentContext=await browser.newContext({viewport:{width:806,height:360},hasTouch:true,isMobile:true});await opponentContext.grantPermissions(['local-network-access'],{origin});await opponentContext.route('**/*',routeHandler);
 const opponent=await opponentContext.newPage();await opponent.goto(origin+'/online.html?game=go');await expect(opponent.locator('#auth-gate')).toBeVisible();await opponent.locator('#auth-entry').click();await expect(opponent.locator('#login-form')).toBeVisible();
 await opponent.locator('#login-email').fill(fixture.accounts[1].email);await opponent.locator('#login-password').fill(fixture.accounts[1].password);await opponent.locator('#login-btn').click();await expect(opponent.locator('[data-room-join="'+roomId+'"]')).toBeVisible();await opponent.locator('[data-room-join="'+roomId+'"]').click();
 await expect.poll(()=>page.evaluate(()=>NobiOnline.getSnapshot()?.players.length)).toBe(2);await expect(page.locator('#start')).toBeEnabled();await page.locator('#start').click();await expect.poll(()=>page.evaluate(()=>NobiOnline.getSnapshot()?.status)).toBe('playing');
 await context.setOffline(true);await expect.poll(()=>page.evaluate(()=>NobiOnline.getConnection().connected)).toBe(false);await page.evaluate(()=>NobiNavigation.back());assert.equal(await page.evaluate(()=>NobiOnline.getSnapshot()?.status),'playing');pass('Disconnected room back keeps room context until authority confirms exit');
 await context.setOffline(false);await expect.poll(()=>page.evaluate(()=>NobiOnline.getConnection().connected),{timeout:15000}).toBe(true);
 page.once('dialog',dialog=>dialog.accept());await swipe(12,280,165,280);await expect(page.locator('#rooms')).toBeVisible();await expect.poll(()=>opponent.evaluate(()=>NobiOnline.getSnapshot()?.result?.reason)).toBe('player-left');pass('Embedded Go right swipe exits through the server and synchronizes the opponent');
 await opponentContext.close();
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/rooms.png'});
 fs.writeFileSync(output+'/result.json',JSON.stringify({status:'PASS',checks},null,2));
}finally{await browser.close();await service.close();}
