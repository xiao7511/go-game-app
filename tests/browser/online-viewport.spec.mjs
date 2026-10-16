import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import {randomUUID} from 'node:crypto';
import {startDeviceServer} from '../../server/device-test.mjs';
let server;
test.beforeAll(async()=>{server=await startDeviceServer({port:0,database:':memory:',authenticate:async token=>{if(!/^bounds-[0-3]$/.test(token))throw Error('Fixture identity rejected');return {id:token,user_metadata:{nickname:'手机联机测试棋友 '+token}};}});});
test.afterAll(async()=>{await server?.close();});
async function request(url,body,user=0){const response=await fetch(server.url+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer bounds-'+user,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});expect(response.ok).toBe(true);return response.json();}
const sdk=`(()=>{const user={id:'bounds-0',user_metadata:{nickname:'手机联机测试棋友 bounds-0'}},session={user,access_token:'bounds-0'},sdk={auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},removeChannel:async()=>{}};window.NobiServices={ready:Promise.resolve(sdk),requireClient:async()=>sdk,getClient:()=>sdk,requireUser:async()=>user,signedUser:async()=>user,getProfile:async()=>({})};window.getSupabaseClient=()=>sdk;})();`;
for(const kind of ['go','guandan','xiangqi'])test('Android online '+kind+' stays inside WebView through rotation and compact heights',async({browser})=>{
 const context=await browser.newContext({viewport:{width:720,height:360},hasTouch:true,isMobile:true});
 await context.route('**/supabaseClient.js',r=>r.fulfill({contentType:'application/javascript',body:sdk}));
 await context.route('**/config.local.js',r=>r.fulfill({contentType:'application/javascript',body:'window.CONFIG={SUPABASE_URL:"https://auth.fixture.invalid",SUPABASE_ANON_KEY:"fixture-public"};'}));
 await context.route('**/online-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.NOBI_ONLINE_CONFIG='+JSON.stringify({mode:'usb-test',url:'http://127.0.0.1:55440',supabaseUrl:'https://auth.fixture.invalid',ranked:false})}));
 await context.route('http://127.0.0.1:55440/**',r=>r.continue({url:r.request().url().replace('http://127.0.0.1:55440',server.url)}));
 const room=await request('/rooms',{kind});
 for(let user=1;user<(kind==='guandan'?4:2);user++)await request('/rooms/'+room.roomId+'/join',{},user);
 const state=await request('/rooms/'+room.roomId);
 await request('/rooms/'+room.roomId+'/commands',{actionId:randomUUID(),matchId:room.roomId,expectedVersion:state.version,actionType:'start',actionPayload:{}});
 await context.addInitScript(id=>localStorage.setItem('nobi-online-room:bounds-0',id),room.roomId);
 const page=await context.newPage();await page.goto('http://127.0.0.1:4174/online.html?game='+kind+'&room='+room.roomId);
 await expect(page.locator('body')).toHaveAttribute('data-room-phase','playing');
 const frame=page.frameLocator('#game-frame iframe'),root=kind==='guandan'?'#guandan-game-container':kind==='go'?'body.nobi-playing-go .app':'.nobi-xiangqi';
 await expect(frame.locator(root)).toBeVisible();
 for(const viewport of [{width:720,height:360},{width:568,height:320},{width:640,height:280},{width:360,height:720},{width:806,height:360}]){
  await page.setViewportSize(viewport);
  await expect.poll(()=>page.locator('#game-frame').evaluate(n=>{const r=n.getBoundingClientRect();return Math.abs(r.top)+Math.abs(r.left)+Math.abs(r.width-innerWidth)+Math.abs(r.height-innerHeight);})).toBeLessThan(2);
  const bounds=await frame.locator(root).evaluate(n=>({r:n.getBoundingClientRect().toJSON(),w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth}));
  expect(bounds.r.left).toBeGreaterThanOrEqual(-1);expect(bounds.r.right).toBeLessThanOrEqual(bounds.w+1);expect(bounds.r.bottom).toBeLessThanOrEqual(bounds.h+1);expect(bounds.scroll).toBeLessThanOrEqual(bounds.w+1);
  if(kind==='xiangqi'){
   await expect.poll(()=>frame.locator(root).evaluate(n=>n.scrollHeight-n.clientHeight)).toBeLessThanOrEqual(1);
   const primary=await frame.locator('.xq-header button,.xq-player,.xq-board,.xq-confirm-row button,.xq-quick-actions button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().toJSON()));
   for(const r of primary){expect(r.left).toBeGreaterThanOrEqual(-1);expect(r.right).toBeLessThanOrEqual(viewport.width+1);expect(r.top).toBeGreaterThanOrEqual(-1);expect(r.bottom).toBeLessThanOrEqual(viewport.height+1);}
   const board=await frame.locator('.xq-board').boundingBox();if(viewport.width>viewport.height)expect(board.height).toBeGreaterThan(viewport.height*.86);
  }
  if(viewport.width>viewport.height){
   const selectors=kind==='guandan'?'.gd-action-bar button,.gd-header-tools button':kind==='go'?'.board-shell,.go-rail button':'.xq-board,.xq-player,.xq-header button,.xq-confirm-row button,.xq-quick-actions button';
   const boxes=await frame.locator(selectors).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().toJSON()));
   for(const r of boxes){expect(r.left).toBeGreaterThanOrEqual(-1);expect(r.right).toBeLessThanOrEqual(viewport.width+1);expect(r.top).toBeGreaterThanOrEqual(-1);expect(r.bottom).toBeLessThanOrEqual(viewport.height+1);}
  }
 }
 await page.screenshot({path:'.nobi-isolated/mobile-overflow/'+kind+'.png'});
 // Ended rooms retain the same full-viewport frame.
 await request('/rooms/'+room.roomId+'/commands',{actionId:randomUUID(),matchId:room.roomId,expectedVersion:(await request('/rooms/'+room.roomId)).version,actionType:'leave',actionPayload:{}});
 await expect(page.locator('body')).toHaveAttribute('data-room-phase','ended');
 const ended=await page.locator('#game-frame').boundingBox();expect(ended.height).toBe(360);
 await context.close();
});
