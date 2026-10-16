import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
const project='https://kogjjfccyncdszuuwlun.supabase.co';
const gateway='https://api.nobistudio.com/nobi-online/auth/';
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{nickname:'测试玩家'}};
async function config(page){
 await page.route('**/config.local.js',r=>r.fulfill({contentType:'application/javascript',body:`window.CONFIG=${JSON.stringify({SUPABASE_URL:project,SUPABASE_ANON_KEY:'public-fixture'})};`}));
 await page.route('**/game.html',r=>r.fulfill({contentType:'text/html',body:'<p>Fixture lobby</p>'}));
}
test('bundled iOS login uses the gateway when the direct Auth project is unreachable',async({page})=>{
 await config(page);let direct=0,passwords=0;
 await page.route(project+'/**',r=>{direct++;return r.abort();});
 await page.route(gateway+'**',async r=>{
  const path=new URL(r.request().url()).pathname;
  if(path.endsWith('/token')){passwords++;expect(r.request().method()).toBe('POST');expect(r.request().postDataJSON()).toMatchObject({email:user.email,password:'fixture-password'});}
  await r.fulfill({json:path.endsWith('/user')?user:{access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_in:3600,token_type:'bearer',user}});
 });
 await page.goto('http://127.0.0.1:4174/login.html');
 await page.locator('#login-email').fill(user.email);await page.locator('#login-password').fill('fixture-password');await page.locator('#login-btn').click();
 await expect(page).toHaveURL('http://127.0.0.1:4174/game.html');
 expect(direct).toBe(0);expect(passwords).toBe(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sb-kogjjfccyncdszuuwlun-auth-token')).user.id)).toBe(user.id);
});
test('existing sessions survive a network outage and recover without another password login',async({page})=>{
 await config(page);let reachable=false,passwords=0;
 await page.addInitScript(({user})=>localStorage.setItem('sb-kogjjfccyncdszuuwlun-auth-token',JSON.stringify({access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user});
 await page.route(gateway+'**',r=>{
  if(r.request().url().includes('/token'))passwords++;
  if(!reachable)return r.abort();
  return r.fulfill({json:r.request().url().endsWith('/health')?{name:'GoTrue'}:user});
 });
 await page.goto('http://127.0.0.1:4174/login.html');
 await expect(page.getByRole('button',{name:'重试连接'})).toBeVisible();
 await expect(page.locator('#login-form')).toBeHidden();
 expect(await page.evaluate(()=>!!localStorage.getItem('sb-kogjjfccyncdszuuwlun-auth-token'))).toBe(true);
 reachable=true;await page.getByRole('button',{name:'检测登录网络'}).click();
 await expect(page).toHaveURL('http://127.0.0.1:4174/game.html');expect(passwords).toBe(0);
});
test('network diagnosis distinguishes reachability and HTTP failures without submitting credentials',async({page})=>{
 await config(page);let status=503;const requests=[];
 await page.route(gateway+'**',r=>{requests.push(r.request());return r.fulfill({status,json:status===200?{name:'GoTrue'}:{message:'fixture unavailable'}});});
 await page.goto('http://127.0.0.1:4174/login.html');
 await page.getByRole('button',{name:'检测登录网络'}).click();
 await expect(page.locator('.auth-network-status')).toContainText('HTTP 503');
 status=200;await page.getByRole('button',{name:'检测登录网络'}).click();
 await expect(page.locator('.auth-network-status')).toHaveText('登录服务连接正常。');
 expect(requests).toHaveLength(2);expect(requests.every(r=>r.method()==='GET'&&r.postData()===null&&r.url()===gateway+'health')).toBe(true);
});
