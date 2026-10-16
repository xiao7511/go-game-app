import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDeviceServer} from '../../server/device-test.mjs';
let service;
test.beforeAll(async()=>{service=await startDeviceServer({database:':memory:',port:0,authenticate:async token=>{if(!['xq-red','xq-black'].includes(token))throw Error('fixture token rejected');return {id:token,user_metadata:{nickname:token==='xq-red'?'红方棋友':'黑方棋友'}};}});});
test.afterAll(async()=>{await service?.close();});

for(const [name,viewport] of [['desktop',{width:1440,height:940}],['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
 test('Xiangqi solo '+name+': selection, confirmation, worker AI, undo, orientation and exit',async({browser})=>{
  const context=await browser.newContext({viewport,hasTouch:name!=='desktop',isMobile:name!=='desktop'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4174/game.html?game=xiangqi&mode=SINGLE');
  const board=page.locator('.xq-board');await expect(board).toBeVisible();await expect(page.locator('.xq-cell.has-piece')).toHaveCount(32);
  const bounds=await board.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height+1);
  await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByLabel('选择象棋人机难度').selectOption('1');await page.getByRole('button',{name:'返回棋盘',exact:true}).click();
  const pawn=page.locator('[data-square="54"]');await pawn.click();await expect(pawn).toHaveAttribute('aria-pressed','true');await pawn.click();await expect(pawn).toHaveAttribute('aria-pressed','false');
  await pawn.click();await page.locator('[data-square="45"]').click();expect(await page.evaluate(()=>XQ.getView().ply)).toBe(0);
  await page.getByRole('button',{name:'确认走棋',exact:true}).click();await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(2);await expect(page.locator('#nobi-xiangqi')).toHaveAttribute('data-thinking','false');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();expect(await page.evaluate(()=>XQ.getView().ply)).toBe(0);await expect(page.locator('[data-square="54"]')).toHaveText('兵');
  await page.getByRole('button',{name:'走棋提示',exact:true}).click();await expect(page.getByRole('button',{name:'确认走棋',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'取消选择',exact:true}).click();await expect(page.getByRole('button',{name:'确认走棋',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'更多',exact:true}).click();
  const position=await page.evaluate(()=>XQ.getView().board);await page.getByRole('button',{name:'翻转棋盘',exact:true}).click();expect(await page.evaluate(()=>XQ.getView().board)).toEqual(position);await page.getByRole('button',{name:'翻转棋盘',exact:true}).click();
  const music=page.locator('[data-xq="music"]'),musicBefore=await music.textContent();await music.click();await expect(music).not.toHaveText(musicBefore);
  await page.getByRole('button',{name:'重新开局',exact:true}).click();await page.getByRole('button',{name:'返回棋盘',exact:true}).click();
  const screenshots=path.resolve('.nobi-isolated/xiangqi/screenshots');await fs.mkdir(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'solo-'+name+'.png'),fullPage:false});
  await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByLabel('选择执棋颜色').selectOption('1');await page.getByRole('button',{name:'返回棋盘',exact:true}).click();await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(1);expect(await page.evaluate(()=>XQ.getView().seat)).toBe(1);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'返回大厅',exact:true}).click();await expect(page.locator('#nobi-xiangqi')).toHaveCount(0);await expect(page.locator('[data-id="xiangqi"]')).toBeVisible();
  expect(errors).toEqual([]);await context.close();
 });
}
async function online(context,identity){
 const page=await context.newPage(),user={id:identity,user_metadata:{nickname:identity==='xq-red'?'红方棋友':'黑方棋友'}};
 const services=`(()=>{const user=${JSON.stringify(user)},session={user,access_token:${JSON.stringify(identity)}};const sdk={auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}},removeChannel:async()=>{}};window.NobiServices={ready:Promise.resolve(sdk),requireClient:async()=>sdk,getClient:()=>sdk,requireUser:async()=>user,signedUser:async()=>user,getProfile:async()=>({})};window.getSupabaseClient=()=>sdk;})();`;
 await context.route('**/supabaseClient.js',r=>r.fulfill({contentType:'application/javascript',body:services}));
 await context.route('**/config.local.js',r=>r.fulfill({contentType:'application/javascript',body:'window.CONFIG={SUPABASE_URL:"https://auth.fixture.invalid",SUPABASE_ANON_KEY:"fixture-public"};'}));
 await context.route('**/online-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.NOBI_ONLINE_CONFIG={mode:"usb-test",url:"http://127.0.0.1:55440",supabaseUrl:"https://auth.fixture.invalid",ranked:false};'}));
 await context.route('http://127.0.0.1:55440/**',r=>r.continue({url:r.request().url().replace('http://127.0.0.1:55440',service.url)}));
 await page.goto('http://127.0.0.1:4173/online.html?game=xiangqi');return page;
}
test('two browser accounts play, reconnect, consent to undo/draw and use unread room chat',async({browser})=>{
 const redContext=await browser.newContext({viewport:{width:390,height:844}}),blackContext=await browser.newContext({viewport:{width:844,height:390}});
 const red=await online(redContext,'xq-red'),black=await online(blackContext,'xq-black'),errors=[];red.on('pageerror',e=>errors.push(e.message));black.on('pageerror',e=>errors.push(e.message));
 await expect(red.locator('#setup h1')).toHaveText('中国象棋 · 好友对战');await red.getByRole('button',{name:'创建房间',exact:true}).click();
 await expect(red.locator('#room-roster li')).toHaveCount(2);
 await black.getByRole('button',{name:'刷新',exact:true}).click();await black.locator('#room-list [data-room-join]').first().click();
 await expect(red.getByRole('button',{name:'开始对局',exact:true})).toBeEnabled();await red.getByRole('button',{name:'开始对局',exact:true}).click();
 let redFrame=red.frameLocator('#game-frame iframe'),blackFrame=black.frameLocator('#game-frame iframe');
 await expect(redFrame.locator('.xq-board')).toBeVisible();await expect(blackFrame.locator('.xq-board')).toBeVisible();
 await expect(redFrame.locator('[data-player="self"]')).toContainText('红方棋友');await expect(blackFrame.locator('[data-player="self"]')).toContainText('黑方棋友');
 await redFrame.locator('[data-square="54"]').click();await redFrame.locator('[data-square="45"]').click();await redFrame.getByRole('button',{name:'确认走棋',exact:true}).click();
 await expect(blackFrame.locator('[data-square="45"]')).toHaveText('兵');await black.reload();blackFrame=black.frameLocator('#game-frame iframe');await expect(blackFrame.locator('[data-square="45"]')).toHaveText('兵');
 await blackFrame.locator('[data-square="27"]').click();await blackFrame.locator('[data-square="36"]').click();await blackFrame.getByRole('button',{name:'确认走棋',exact:true}).click();
 await expect(redFrame.locator('[data-square="36"]')).toHaveText('卒');await redFrame.getByRole('button',{name:'悔棋',exact:true}).click();await black.getByRole('button',{name:'同意悔棋',exact:true}).click();
 await expect(redFrame.locator('[data-square="54"]')).toHaveText('兵');await expect(blackFrame.locator('[data-square="27"]')).toHaveText('卒');
 await redFrame.locator('[data-xq="chat"]').click();await redFrame.getByRole('textbox',{name:'聊天消息',exact:true}).fill('象棋联机好棋！');await redFrame.getByRole('button',{name:'发送',exact:true}).click();
 await expect(blackFrame.locator('[data-xq="chat"]')).toHaveAttribute('data-chat-unread','1');await blackFrame.locator('[data-xq="chat"]').click();await expect(blackFrame.getByRole('list',{name:'房间消息'})).toContainText('象棋联机好棋！');
 await blackFrame.getByRole('button',{name:'关闭',exact:true}).click();await redFrame.getByRole('button',{name:'关闭',exact:true}).click();
 await redFrame.getByRole('button',{name:'更多',exact:true}).click();await redFrame.getByRole('button',{name:'申请和棋',exact:true}).click();await black.getByRole('button',{name:'同意和棋',exact:true}).click();await expect(redFrame.locator('.xq-dialog')).toContainText('和棋');
 await redFrame.getByRole('button',{name:'继续',exact:true}).click();await redFrame.getByRole('button',{name:'返回大厅',exact:true}).click();await expect(red).toHaveURL(/game.html#\/home$/);
 expect(errors).toEqual([]);await redContext.close();await blackContext.close();
});
// PC-only audio checks: real media playback with explicit fixture Auth and rooms.
async function watchXiangqiAudio(context){
 await context.addInitScript(()=>{
  if(!localStorage.getItem('nobi.audio.v1'))localStorage.setItem('nobi.audio.v1',JSON.stringify({musicEnabled:false,effectsEnabled:true,effectsVolume:.4}));
  window.xqAudioAttempts=[];const original=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){const event=/xiangqi-(move|capture)\.wav$/.test(this.src)?{src:this.src.split('/').at(-1),volume:this.volume,result:'pending'}:null;if(event)window.xqAudioAttempts.push(event);const result=original.call(this);if(event)result?.then(()=>event.result='played',()=>event.result='blocked');return result;};
 });
}
const audioAttempts=target=>target.locator('#nobi-xiangqi').evaluate(()=>window.xqAudioAttempts);

test('PC Xiangqi audio: confirmed solo/AI moves, capture, cancel, undo, mute and real decoding',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1440,height:940}});await watchXiangqiAudio(context);
 // A deterministic legal AI capture exercises the same real worker callback and engine.
 await context.route('**/xiangqi-worker.mjs',route=>route.fulfill({contentType:'application/javascript',body:`import {legalMoves} from './xiangqi-engine.mjs';self.onmessage=({data})=>{const moves=legalMoves(data.game),move=moves.find(m=>m.from===19&&m.to===82)||moves.find(m=>m.from===0&&m.to===1)||moves[0];self.postMessage({ticket:data.ticket,move});};`}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/game.html?game=xiangqi&mode=SINGLE');await expect(page.locator('.xq-board')).toBeVisible();
 await page.locator('[data-square="54"]').click();await page.locator('[data-square="54"]').click();await page.locator('[data-square="54"]').click();await page.locator('[data-square="46"]').click();
 await page.locator('[data-square="45"]').click();await page.getByRole('button',{name:'取消选择',exact:true}).click();expect(await audioAttempts(page)).toEqual([]);
 await page.locator('[data-square="54"]').click();await page.locator('[data-square="45"]').click();expect(await audioAttempts(page)).toEqual([]);
 await page.getByRole('button',{name:'确认走棋',exact:true}).click();await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(2);
 await expect.poll(async()=> (await audioAttempts(page)).map(e=>e.result)).toEqual(['played','played']);
 expect((await audioAttempts(page)).map(e=>e.src)).toEqual(['xiangqi-move.wav','xiangqi-capture.wav']);
 await page.getByRole('button',{name:'悔棋',exact:true}).click();expect(await audioAttempts(page)).toHaveLength(2);
 await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'音效：开',exact:true}).click();await expect(page.getByRole('button',{name:'音效：关',exact:true})).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:'返回棋盘',exact:true}).click();
 await page.locator('[data-square="64"]').click();await page.locator('[data-square="1"]').click();await page.getByRole('button',{name:'确认走棋',exact:true}).click();await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(2);expect(await audioAttempts(page)).toHaveLength(2);
 await page.getByRole('button',{name:'悔棋',exact:true}).click();await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'音效：关',exact:true}).click();await page.getByRole('button',{name:'返回棋盘',exact:true}).click();await page.evaluate(()=>NobiAudio.setSettings({effectsVolume:.25}));
 await page.locator('[data-square="64"]').click();await page.locator('[data-square="1"]').click();await page.getByRole('button',{name:'确认走棋',exact:true}).click();await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(2);
 await expect.poll(async()=> (await audioAttempts(page)).length).toBe(4);expect((await audioAttempts(page)).slice(2).map(e=>[e.src,e.volume])).toEqual([['xiangqi-capture.wav',.25],['xiangqi-capture.wav',.25]]);
 const decoded=await page.evaluate(async()=>{const context=new OfflineAudioContext(1,1,44100),out=[];for(const name of ['xiangqiMove','xiangqiCapture']){const response=await fetch(NobiAudioManifest.effects[name]),buffer=await context.decodeAudioData(await response.arrayBuffer()),data=buffer.getChannelData(0);out.push({name,duration:buffer.duration,peak:Math.max(...data.map(Math.abs))});}return out;});
 expect(decoded.map(x=>x.duration)).toEqual([.16,.26]);expect(decoded.every(x=>x.peak>.5&&x.peak<.8)).toBe(true);
 await fs.mkdir('.nobi-isolated/xiangqi',{recursive:true});await page.screenshot({path:'.nobi-isolated/xiangqi/audio-pc.png'});
 await page.reload();await expect(page.locator('.xq-board')).toBeVisible();expect(await audioAttempts(page)).toEqual([]);expect(await page.evaluate(()=>NobiAudio.getSettings().effectsVolume)).toBe(.25);
 expect(errors).toEqual([]);await context.close();
});

test('PC Xiangqi audio: two accounts hear each confirmed move once; snapshots, undo and reload are silent',async({browser})=>{
 const redContext=await browser.newContext({viewport:{width:1440,height:940}}),blackContext=await browser.newContext({viewport:{width:1440,height:940}});await watchXiangqiAudio(redContext);await watchXiangqiAudio(blackContext);
 const red=await online(redContext,'xq-red'),black=await online(blackContext,'xq-black');
 await red.getByRole('button',{name:'创建房间',exact:true}).click();await expect(red.locator('#room-roster li')).toHaveCount(2);await black.getByRole('button',{name:'刷新',exact:true}).click();await black.locator('#room-list [data-room-join]').first().click();await expect(red.getByRole('button',{name:'开始对局',exact:true})).toBeEnabled();await red.getByRole('button',{name:'开始对局',exact:true}).click();
 const redFrame=red.frameLocator('#game-frame iframe');let blackFrame=black.frameLocator('#game-frame iframe');await expect(redFrame.locator('.xq-board')).toBeVisible();await expect(blackFrame.locator('.xq-board')).toBeVisible();await redFrame.locator('.xq-status').click();await blackFrame.locator('.xq-status').click();
 expect(await audioAttempts(redFrame)).toEqual([]);expect(await audioAttempts(blackFrame)).toEqual([]);
 await redFrame.locator('[data-square="64"]').click();await redFrame.locator('[data-square="1"]').click();await redFrame.getByRole('button',{name:'确认走棋',exact:true}).click();
 for(const frame of [redFrame,blackFrame])await expect.poll(async()=> (await audioAttempts(frame)).map(e=>[e.src,e.result])).toEqual([['xiangqi-capture.wav','played']]);
 const id=await red.evaluate(()=>NobiOnline.getSnapshot().roomId);service.authority.onChange(service.authority.rooms.get(id));service.authority.onChange(service.authority.rooms.get(id));
 await black.reload();blackFrame=black.frameLocator('#game-frame iframe');await expect(blackFrame.locator('[data-square="1"]')).toHaveText('炮');expect(await audioAttempts(blackFrame)).toEqual([]);expect(await audioAttempts(redFrame)).toHaveLength(1);await blackFrame.locator('.xq-status').click();
 await blackFrame.locator('[data-square="27"]').click();await blackFrame.locator('[data-square="36"]').click();await blackFrame.getByRole('button',{name:'确认走棋',exact:true}).click();
 await expect.poll(async()=> (await audioAttempts(redFrame)).map(e=>e.src)).toEqual(['xiangqi-capture.wav','xiangqi-move.wav']);await expect.poll(async()=> (await audioAttempts(blackFrame)).map(e=>e.src)).toEqual(['xiangqi-move.wav']);
 await redFrame.getByRole('button',{name:'悔棋',exact:true}).click();await black.getByRole('button',{name:'同意悔棋',exact:true}).click();await expect(redFrame.locator('[data-square="64"]')).toHaveText('炮');expect(await audioAttempts(redFrame)).toHaveLength(2);expect(await audioAttempts(blackFrame)).toHaveLength(1);
 // A different room at an advanced position must establish a silent baseline.
 await red.evaluate(()=>{const snapshot=NobiOnline.getSnapshot(),frame=document.querySelector('iframe').contentWindow;frame.XQ.applyAuthoritySnapshot({...snapshot,roomId:'different-fixture-room'},NobiOnline.command,true);});expect(await audioAttempts(redFrame)).toHaveLength(2);
 await redContext.close();await blackContext.close();
});
