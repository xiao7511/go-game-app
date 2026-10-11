import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import {randomUUID,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {createClient} from '../../tooling/node_modules/@supabase/supabase-js/dist/index.mjs';
import {localCredentials} from '../../scripts/local-supabase.mjs';
import {localSql,literal} from '../../scripts/local-db.mjs';
import {startServer} from '../../server/http.ts';
let service,accounts=[],clients=[];const rooms=new Set(),contexts=[];
const pictures=process.env.NOBI_ONLINE_SCREENSHOT_DIR||'docs/nobi-v2/screenshots/phase-3b';
const base='http://127.0.0.1:5189',snap=page=>page.evaluate(()=>window.NobiOnline.getSnapshot());
async function connected(page){await expect.poll(()=>page.evaluate(()=>window.NobiOnline.getConnection().connected)).toBe(true);}
async function version(pages,n){for(const page of pages)await expect.poll(async()=> (await snap(page))?.version).toBe(n);}
async function login(browser,index,options={}){const context=await browser.newContext(options);contexts.push(context);await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:','ws:','wss:'].includes(u.protocol)&&u.hostname!=='127.0.0.1'&&u.hostname!=='localhost')return route.abort();return route.continue();});const page=await context.newPage();await page.goto(base+'/online.html');await expect(page.locator('#connection')).toHaveText('隔离环境就绪');await page.locator('#email').fill(accounts[index].email);await page.locator('#password').fill(accounts[index].password);await page.locator('#login button').click();await expect(page.locator('#rooms')).toBeVisible();return page;}
async function create(page,kind){await page.locator('#kind').selectOption(kind);await page.locator('#create').click();await connected(page);const id=(await snap(page)).roomId;rooms.add(id);return id;}
async function join(page,id){await page.locator('#room-input').fill(id);await page.locator('#join').click();await connected(page);}
async function call(page,type,payload={},extra={}){return page.evaluate(async({type,payload,extra})=>{const s=window.NobiOnline.getSnapshot(),client=await window.NobiServices.requireClient(),{data}=await client.auth.getSession();const response=await fetch(window.NOBI_ONLINE_CONFIG.url+'/rooms/'+s.roomId+'/commands',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({matchId:s.matchId,actionId:crypto.randomUUID(),expectedVersion:s.version,actionType:type,actionPayload:payload,...extra})});return {status:response.status,body:await response.json()};},{type,payload,extra});}
async function move(page,row,col){const frame=page.frames()[1],canvas=frame.locator('#goBoard'),position=await canvas.evaluate((_canvas,{row,col})=>({x:window.gamePadding+col*window.gameCellSize,y:window.gamePadding+row*window.gameCellSize}),{row,col});if(await page.evaluate(()=>navigator.maxTouchPoints>0)){await canvas.tap({position});await frame.locator('[data-go-confirm]').click();}else await canvas.click({position});}
async function game(browser,kind,count,options={}){const pages=[];for(let i=0;i<count;i++)pages.push(await login(browser,i,options));const room=await create(pages[0],kind);await Promise.all(pages.slice(1).map(page=>join(page,room)));await version(pages,count-1);let full;if(count===4){full=await login(browser,4);await full.locator('#room-input').fill(room);const rejected=full.waitForResponse(r=>r.url().endsWith('/join')&&r.request().method()==='POST');await full.locator('#join').click();expect((await rejected).status()).toBe(409);await expect(full.locator('#notice')).toContainText('房间无法加入');}await pages[0].locator('#start').click();await version(pages,count);for(const page of pages)await expect.poll(()=>page.evaluate(()=>window.NobiOnline.getConnection().realtime)).toBe('subscribed');return {pages,room,full};}
test.beforeAll(async()=>{const config=await localCredentials();const marker=await fetch(base+'/online-config.js').then(r=>r.text());expect(marker).toContain('127.0.0.1:55430');service=await startServer();for(let i=0;i<5;i++){const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);const account={email:'nobi-'+randomUUID()+'@phase3b.test',password:randomBytes(24).toString('base64url')};const {data,error}=await client.auth.signUp({...account,options:{data:{nickname:'测试玩家 '+(i+1)}}});expect(error).toBeNull();accounts.push({...account,id:data.user.id});}});
test.afterEach(async()=>{for(const context of contexts.splice(0))await context.close();});
test.afterAll(async()=>{if(service)await service.close();for(const client of clients)await client.removeAllChannels();for(const id of rooms){localSql(`delete from game.command_receipts where room_id=${literal(id)}::uuid; delete from game.room_members where room_id=${literal(id)}::uuid; delete from game.match_records where id=${literal(id)}::uuid; delete from game.rooms where id=${literal(id)}::uuid;`);}for(const account of accounts)localSql(`delete from auth.users where id=${literal(account.id)}::uuid;`);});
test('four real Edge accounts: private PNG hands, room race, play/pass, offline/refresh and server restart',async({browser})=>{
 const {pages:p,room,full}=await game(browser,'guandan',4);const states=await Promise.all(p.map(snap));expect(new Set(states.map(s=>s.privateState.seat)).size).toBe(4);expect(states.flatMap(s=>s.privateState.hand)).toHaveLength(108);expect(new Set(states.flatMap(s=>s.privateState.hand.map(c=>c.id))).size).toBe(108);
 for(const page of p){await expect(page.frames()[1].locator('[data-gd-hand] img')).toHaveCount(27);expect(await page.frames()[1].locator('[data-gd-hand] img').first().getAttribute('src')).toContain('images/cards/');expect((await snap(page)).publicState.hands).toBeUndefined();}
 expect((await call(p[1],'play',{cardIds:[states[0].privateState.hand[0].id]})).status).toBe(409);
 const lead=states.findIndex(s=>s.privateState.seat===states[0].currentTurn),card=states[lead].privateState.hand[0];await p[lead].frames()[1].locator(`[data-gd-hand] [data-card-id="${card.id}"]`).click({position:{x:5,y:28}});await p[lead].frames()[1].locator('[data-gd-play]').click();await version(p,5);expect((await snap(p[lead])).privateState.hand).toHaveLength(26);for(const page of p)await expect.poll(()=>page.evaluate(()=>window.NobiOnline.getConnection().realtimeEvents)).toBeGreaterThan(0);
 const current=(await snap(p[0])).currentTurn,currentPage=p[(await Promise.all(p.map(snap))).findIndex(s=>s.privateState.seat===current)];await currentPage.frames()[1].locator('[data-gd-pass]').click();await version(p,6);
 const publicState=(await snap(p[0])).publicState;for(const page of p)expect((await snap(page)).publicState).toEqual(publicState);
 await p[0].context().setOffline(true);await expect.poll(()=>p[0].evaluate(()=>window.NobiOnline.getConnection().connected)).toBe(false);await p[0].context().setOffline(false);await connected(p[0]);expect((await snap(p[0])).privateState.seat).toBe(0);
 await p[2].reload();await connected(p[2]);expect((await snap(p[2])).publicState).toEqual(publicState);
 const retry={matchId:room,actionId:randomUUID(),expectedVersion:6,actionType:'pass',actionPayload:{}};const turn=(await snap(p[0])).currentTurn,actor=p[(await Promise.all(p.map(snap))).findIndex(s=>s.privateState.seat===turn)];const first=await call(actor,'pass',{},retry);expect(first.status).toBe(200);await version(p,7);
 await service.close();for(const page of p)await expect.poll(()=>page.evaluate(()=>window.NobiOnline.getConnection().connected)).toBe(false);service=await startServer();for(const page of p)await connected(page);expect((await call(actor,'pass',{},retry)).body).toEqual(first.body);await version(p,7);
 const restored=await Promise.all(p.map(snap));expect(restored.every(s=>s.version===7)).toBe(true);expect((await call(p[0],'move',{}, {expectedVersion:0})).body.latestVersion).toBe(7);
 const fifth=full;const closed=fifth.waitForResponse(r=>r.url().endsWith('/join')&&r.request().method()==='POST');await fifth.locator('#join').click();expect((await closed).status()).toBe(409);await expect(fifth.locator('#notice')).toContainText('房间无法加入');
 await p[1].locator('#leave').click();await version(p,8);expect((await snap(p[0])).trustedResult.settlementStatus).toBe('disabled');expect((await call(p[0],'play',{cardIds:[]})).status).toBe(409);
 fs.mkdirSync(pictures,{recursive:true});await p[0].screenshot({path:pictures+'/guandan-online.png',fullPage:true});
});
test('two real touch clients: preview/confirm, captures, undo consent, reconnect, pass and finished guard',async({browser})=>{
 const {pages:p}=await game(browser,'go',2,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 const frame=p[0].frames()[1],canvas=frame.locator('#goBoard');await canvas.tap({position:{x:50,y:50}});await expect(frame.locator('[data-go-confirm]')).toBeEnabled();expect((await snap(p[0])).publicState.moves).toHaveLength(0);await frame.locator('[data-go-cancel]').click();expect((await snap(p[0])).publicState.moves).toHaveLength(0);
 await move(p[0],1,0);await version(p,3);await move(p[1],0,0);await version(p,4);await move(p[0],0,1);await version(p,5);expect((await snap(p[1])).publicState.blackCaptures).toBe(1);
 expect((await call(p[1],'move',{row:1,col:0})).status).toBe(409);await p[0].locator('#undo').click();await version(p,6);expect((await call(p[0],'undo-accept')).status).toBe(409);await p[1].locator('#accept').click();await version(p,7);expect((await snap(p[0])).publicState.moves).toHaveLength(1);expect((await snap(p[0])).publicState.blackCaptures).toBe(0);
 await p[1].reload();await connected(p[1]);expect((await snap(p[1])).publicState).toEqual((await snap(p[0])).publicState);
 await p[1].context().setOffline(true);await expect.poll(()=>p[1].evaluate(()=>window.NobiOnline.getConnection().connected)).toBe(false);await p[1].context().setOffline(false);await connected(p[1]);
 await p[1].locator('#pass').click();await version(p,8);await p[0].locator('#pass').click();await version(p,9);expect((await snap(p[0])).status).toBe('ended');expect((await call(p[0],'move',{row:5,col:5})).status).toBe(409);
 await p[0].screenshot({path:pictures+'/go-online-mobile.png',fullPage:true});
});

test('real Auth boundaries, lost acknowledgement retry, atomic rollback and concurrent version conflicts',async({browser})=>{
 const {pages:p,room}=await game(browser,'go',2);let dropped=false;
 await p[0].context().route('**/rooms/*/commands',async route=>{if(!dropped){dropped=true;const response=await route.fetch();expect(response.status()).toBe(200);await new Promise(resolve=>setTimeout(resolve,300));await route.abort('failed');}else await route.continue();});
 await move(p[0],4,4);await version(p,3);await expect.poll(()=>p[0].evaluate(()=>window.NobiOnline.getConnection().pending)).toBe(false);expect(localSql(`select count(*) from game.command_receipts where room_id=${literal(room)}::uuid and action='move'`)).toBe('1');
 const snapshot=(await snap(p[0]));expect(snapshot.publicState.board[4][4]).toBe(1);
 const race=await Promise.all([call(p[1],'move',{row:5,col:5}),call(p[1],'move',{row:6,col:6})]);expect(race.map(r=>r.status).sort()).toEqual([200,409]);await version(p,4);expect((await call(p[0],'move',{row:8,col:8},{expectedVersion:999})).body.latestVersion).toBe(4);
 expect((await call(p[1],'move',{row:9,col:9,userId:accounts[0].id})).status).toBe(409);
 expect(await p[0].evaluate(async()=>{const client=await window.NobiServices.requireClient();return !!(await client.schema('nobi_private').from('room_snapshots').select('*')).error;})).toBe(true);
 expect(await p[0].evaluate(async()=>{const client=await window.NobiServices.requireClient(),id=window.NobiOnline.getSnapshot().roomId;return !!(await client.schema('game').from('rooms').update({status:'ended'}).eq('id',id)).error;})).toBe(true);
 const outsider=await login(browser,4);const denied=await outsider.evaluate(async room=>{const client=await window.NobiServices.requireClient(),{data}=await client.auth.getSession();return (await fetch(window.NOBI_ONLINE_CONFIG.url+'/rooms/'+room,{headers:{Authorization:'Bearer '+data.session.access_token}})).status;},room);expect(denied).toBe(403);expect((await fetch(service.url+'/rooms/'+room)).status).toBe(401);
 const brokenId=randomUUID(),retry={matchId:room,actionId:randomUUID(),expectedVersion:4,actionType:'move',actionPayload:{row:7,col:7}};
 localSql(`insert into game.command_receipts(room_id,actor_id,request_id,state_version,action,payload_sha256) values(${literal(room)}::uuid,${literal(accounts[0].id)}::uuid,${literal(brokenId)},5,'injected-test-conflict',repeat('0',64));`);
 expect((await call(p[0],'move',{},retry)).status).toBe(503);expect(localSql(`select version from nobi_private.room_snapshots where room_id=${literal(room)}::uuid`)).toBe('4');expect(localSql(`select version from game.rooms where id=${literal(room)}::uuid`)).toBe('4');
 localSql(`delete from game.command_receipts where room_id=${literal(room)}::uuid and request_id=${literal(brokenId)};`);
 expect((await call(p[0],'move',{},retry)).status).toBe(200);await version(p,5);expect((await snap(p[1])).publicState.board[7][7]).toBe(1);
 await p[1].locator('#resign').click();await version(p,6);expect((await call(p[0],'resign-confirm')).status).toBe(409);await p[1].locator('#confirm').click();await version(p,7);expect((await snap(p[0])).trustedResult.result.winner).toBe(0);expect((await call(p[0],'move',{row:10,col:10})).status).toBe(409);
});

test('real service outage reaches bounded retries and manual reconnect restores authoritative clocks',async({browser})=>{
 const {pages:p}=await game(browser,'go',2);await move(p[0],3,3);await version(p,3);const before=await snap(p[0]);
 await service.close();
 for(const page of p){await expect(page.locator('#retry')).toBeVisible({timeout:45000});expect(await page.evaluate(()=>window.NobiOnline.getConnection().failures)).toBe(8);expect((await snap(page)).version).toBe(3);}
 service=await startServer();for(const page of p){await page.locator('#retry').click();await connected(page);expect((await snap(page)).deadline).toBe(before.deadline);expect((await snap(page)).publicState.board).toEqual(before.publicState.board);}
 await p[0].locator('#resign').click();await version(p,4);await p[0].locator('#confirm').click();await version(p,5);expect((await snap(p[1])).status).toBe('ended');
 await p[0].locator('#new-room').click();await expect(p[0].locator('#rooms')).toBeVisible();
});
