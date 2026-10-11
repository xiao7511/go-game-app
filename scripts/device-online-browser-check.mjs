// Real local Auth accounts + the USB authority transport; never uses production users.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '../tooling/node_modules/@playwright/test/index.mjs';
import {createClient} from '../tooling/node_modules/@supabase/supabase-js/dist/index.mjs';
import {localCredentials} from './local-supabase.mjs';
import {startDeviceServer} from '../server/device-test.mjs';
const output='.nobi-isolated/mobile-device-refresh';fs.mkdirSync(output,{recursive:true});
const config=await localCredentials();
const fixture=JSON.parse(fs.readFileSync('.nobi-isolated/phase3b/manual-accounts.json','utf8'));
assert.equal(fixture.kind,'DISPOSABLE_LOCAL_AUTH');assert.equal(fixture.url,config.url);assert.equal(fixture.accounts.length,4);
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
const database=path.resolve(output,'browser-'+randomUUID()+'.sqlite');
const authenticate=async token=>{const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw Error('Local Auth rejected identity');return data.user;};
let service=await startDeviceServer({port:0,database,authenticate});
const browser=await chromium.launch({channel:'msedge'}),contexts=[],pages=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS: '+name);};
const snapshot=page=>page.evaluate(()=>NobiOnline.getSnapshot());
async function versions(version){for(const page of pages)await expect.poll(async()=>(await snapshot(page))?.version,{timeout:15000}).toBe(version);}
const mime=name=>({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav'}[path.extname(name)]||'application/octet-stream');
try{
 for(let i=0;i<4;i++){
  const context=await browser.newContext({viewport:{width:806,height:360},isMobile:true,hasTouch:true});contexts.push(context);
  await context.grantPermissions(['local-network-access'],{origin:'http://127.0.0.1:5178'});
  // Exercise the same fallback found missing on the ZTE's WebView 101.
  await context.addInitScript(()=>{Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true});});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:55440')return route.continue({url:service.url+url.pathname+url.search});
   if(url.origin==='http://127.0.0.1:5178'){
    if(url.pathname==='/config.local.js')return route.fulfill({contentType:'application/javascript',body:'window.CONFIG='+JSON.stringify({SUPABASE_URL:config.url,SUPABASE_ANON_KEY:config.key})+';'});
    if(url.pathname==='/online-config.js')return route.fulfill({contentType:'application/javascript',body:'window.NOBI_ONLINE_CONFIG='+JSON.stringify({mode:'usb-test',url:'http://127.0.0.1:55440',supabaseUrl:config.url,ranked:false})+';'});
    const base=path.resolve('dist/mobile'),file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:mime(file),body:fs.readFileSync(file)});
   }
   if(url.hostname==='127.0.0.1'&&url.port==='55421')return route.continue();
   return route.abort();
  });
  const page=await context.newPage();pages.push(page);page.on('pageerror',error=>console.log('Page code error: '+error.message));page.on('requestfailed',request=>{if(request.url().endsWith('/health'))console.log('Health request failed: '+request.failure()?.errorText);});page.on('console',message=>{if(message.type()==='error'&&/health|CORS|Access-Control|Private Network|local network/i.test(message.text()))console.log(message.text());});await page.goto('http://127.0.0.1:5178/online.html?game=guandan');
  await expect(page.locator('#connection')).toHaveText('电脑联机服务就绪');
  await page.locator('#email').fill(fixture.accounts[i].email);await page.locator('#password').fill(fixture.accounts[i].password);await page.locator('#login button').click();await expect(page.locator('#rooms')).toBeVisible();
 }
 pass('Four independent browser sessions signed in through real isolated Auth');
 await pages[0].goto('http://127.0.0.1:5178/game.html#/me');
 await expect(pages[0].locator('[data-avatar-preset="2"]')).toBeVisible();await pages[0].locator('[data-avatar-preset="2"]').click();await expect(pages[0].locator('.nobi-status')).toHaveText('头像已同步到账号');
 await pages[0].evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('nobi.avatar.v1'))localStorage.removeItem(key);});await pages[0].reload();await expect(pages[0].locator('[data-avatar-preset="2"]')).toHaveAttribute('aria-pressed','true');
 await pages[0].locator('[data-avatar-upload]').setInputFiles('ui/lobby-night-v3.jpg');await expect(pages[0].locator('.nobi-status')).toHaveText('头像已上传');
 await pages[0].goto('http://127.0.0.1:5178/online.html?game=guandan');await expect(pages[0].locator('#rooms')).toBeVisible();
 pass('Preset and uploaded photo persist in real Auth metadata and reload after clearing device avatar cache');
 await pages[0].locator('#create').click();await expect.poll(async()=>(await snapshot(pages[0]))?.status).toBe('waiting');
 const id=(await snapshot(pages[0])).roomId;
 await expect(pages[0].locator('#game-frame')).toBeHidden();await expect(pages[0].locator('#room-roster li')).toHaveCount(4);
 for(let i=1;i<4;i++){await pages[i].locator('#refresh-rooms').click();const card=pages[i].locator('[data-room-join="'+id+'"]');await expect(card).toBeEnabled();await card.click();await expect.poll(async()=>(await snapshot(pages[i]))?.players.length).toBe(i+1);}
 await versions(3);assert.match((await snapshot(pages[1])).players[0].avatar,/^data:image\/jpeg;base64,/);pass('Room list joins the selected room and other players receive the account photo');pass('Create/join four unique seats, waiting roster and WebView 101 timeout fallback');
 await pages[0].locator('#start').click();await versions(4);
 const states=await Promise.all(pages.map(snapshot));assert.equal(new Set(states.flatMap(s=>s.privateState.hand.map(c=>c.id))).size,108);
 for(const page of pages){await expect(page.frames()[1].locator('[data-gd-hand] img')).toHaveCount(27);const box=await page.locator('#game-frame').boundingBox();assert.equal(box.x,0);assert.equal(box.y,0);assert.equal(box.height,360);}
 pass('108 private cards, 27 per player, full landscape viewport without outer room frame');
 const actor=states[0].currentTurn,frame=pages[actor].frames()[1];
 await frame.locator('[data-gd-hint]').click();await frame.locator('[data-gd-play]').click();await versions(5);
 pass('Touch-enabled table controls submit one legal move and all four clients synchronize');
 await pages[0].locator('#room-controls-toggle').click();await expect(pages[0].locator('#room-code')).toBeVisible();await pages[0].locator('#copy').click();await expect(pages[0].locator('#notice')).toContainText(/房间号已/);await pages[0].locator('#room-controls-toggle').click();
 pass('Room drawer and clipboard fallback work without covering the running table');
 const before=await snapshot(pages[2]);await contexts[2].setOffline(true);await expect.poll(()=>pages[2].evaluate(()=>NobiOnline.getConnection().connected)).toBe(false);await contexts[2].setOffline(false);await pages[2].reload();await expect.poll(()=>pages[2].evaluate(()=>NobiOnline.getConnection().connected),{timeout:15000}).toBe(true);
 assert.deepEqual((await snapshot(pages[2])).privateState.hand,before.privateState.hand);pass('Offline/reload restores the same private hand and room version');
 const durableHands=await Promise.all(pages.map(async page=>(await snapshot(page)).privateState.hand));
 await service.close();service=await startDeviceServer({port:0,database,authenticate});
 await Promise.all(pages.map(page=>page.reload()));await versions(5);for(let i=0;i<4;i++)assert.deepEqual((await snapshot(pages[i])).privateState.hand,durableHands[i]);
 pass('SQLite cold restart restores all four rooms, hands and accepted action version');
 await pages[0].screenshot({path:output+'/four-auth-landscape.png'});
 fs.writeFileSync(output+'/browser-result.json',JSON.stringify({status:'PASS',scope:'Four real isolated Auth accounts; actual production account verified separately on phone',checks},null,2));
}catch(error){for(const page of pages)console.log(await page.evaluate(()=>({notice:document.getElementById('notice')?.textContent,services:typeof NobiServices,online:typeof NobiOnline,timeout:typeof NobiRequestTimeout})));throw error;}finally{await browser.close();await service.close();await client.removeAllChannels();}
