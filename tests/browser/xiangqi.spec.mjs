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
  await page.getByLabel('选择象棋人机难度').selectOption('1');
  const pawn=page.locator('[data-square="54"]');await pawn.click();await expect(pawn).toHaveAttribute('aria-pressed','true');await pawn.click();await expect(pawn).toHaveAttribute('aria-pressed','false');
  await pawn.click();await page.locator('[data-square="45"]').click();expect(await page.evaluate(()=>XQ.getView().ply)).toBe(0);
  await page.getByRole('button',{name:'确认走棋',exact:true}).click();await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(2);await expect(page.locator('#nobi-xiangqi')).toHaveAttribute('data-thinking','false');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();expect(await page.evaluate(()=>XQ.getView().ply)).toBe(0);await expect(page.locator('[data-square="54"]')).toHaveText('兵');
  await page.getByRole('button',{name:'走棋提示',exact:true}).click();await expect(page.getByRole('button',{name:'确认走棋',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'取消选择',exact:true}).click();await expect(page.getByRole('button',{name:'确认走棋',exact:true})).toBeDisabled();
  const position=await page.evaluate(()=>XQ.getView().board);await page.getByRole('button',{name:'翻转棋盘',exact:true}).click();expect(await page.evaluate(()=>XQ.getView().board)).toEqual(position);await page.getByRole('button',{name:'翻转棋盘',exact:true}).click();
  const music=page.locator('[data-xq="music"]'),musicBefore=await music.textContent();await music.click();await expect(music).not.toHaveText(musicBefore);
  await page.getByRole('button',{name:'重新开局',exact:true}).click();await page.locator('.xq-header').scrollIntoViewIfNeeded();
  const screenshots=path.resolve('.nobi-isolated/xiangqi/screenshots');await fs.mkdir(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'solo-'+name+'.png'),fullPage:false});
  await page.getByLabel('选择执棋颜色').selectOption('1');await expect.poll(()=>page.evaluate(()=>XQ.getView().ply)).toBe(1);expect(await page.evaluate(()=>XQ.getView().seat)).toBe(1);
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
 await redFrame.getByRole('button',{name:'申请和棋',exact:true}).click();await black.getByRole('button',{name:'同意和棋',exact:true}).click();await expect(redFrame.locator('.xq-dialog')).toContainText('和棋');
 await redFrame.getByRole('button',{name:'继续',exact:true}).click();await redFrame.getByRole('button',{name:'返回大厅',exact:true}).click();await expect(red).toHaveURL(/game.html#\/home$/);
 expect(errors).toEqual([]);await redContext.close();await blackContext.close();
});
