import {test,expect} from '../../tooling/node_modules/@playwright/test/index.mjs';
import {verifyDevServer} from '../../scripts/verify-dev-server.mjs';
const base='http://127.0.0.1:5178';
test.beforeAll(async()=>{await verifyDevServer();});

test('5178 serves current source and a working online Auth configuration',async({page})=>{
  await page.goto(base+'/');
  await expect(page).toHaveURL(base+'/login.html');
  await expect(page.locator('#login-form')).toBeVisible();
  const readiness=await page.evaluate(async()=>{
    const config=await window.NobiConfig.ready;
    const client=await window.NobiServices.requireClient();
    const response=await fetch(config.SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:config.SUPABASE_ANON_KEY}});
    return {clientReady:!!client,https:new URL(config.SUPABASE_URL).protocol==='https:',authStatus:response.status};
  });
  expect(readiness).toEqual({clientReady:true,https:true,authStatus:200});
  await page.screenshot({path:'test-results/login-5178/login-ready.png'});
});

async function fixture(context,result){
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let configRequested;
  const requested=new Promise(resolve=>{configRequested=resolve;});
  let tokens=0;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();
    if(url.pathname==='/config.local.js')return route.fulfill({contentType:'application/javascript',body:'window.CONFIG={};'});
    if(url.pathname==='/get-config'){
      configRequested();await gate;
      return route.fulfill({json:{SUPABASE_URL:base+'/__auth_fixture',SUPABASE_ANON_KEY:'anonymous-test-fixture'}});
    }
    if(url.pathname==='/__auth_fixture/auth/v1/token'){
      tokens++;
      return route.fulfill({status:result==='success'?200:400,json:result==='success'?session():{error:'invalid_grant',error_description:'Invalid login credentials'}});
    }
    if(url.pathname==='/__auth_fixture/auth/v1/signup')return route.fulfill({status:400,json:{error:'signup_rejected',error_description:'Test registration rejected'}});
    if(url.pathname.startsWith('/__auth_fixture/'))return route.fulfill({status:404,json:{error:'test endpoint'}});
    return route.continue();
  });
  return {release,requested,count:()=>tokens};
}
function session(){
  const id='00000000-0000-4000-8000-000000000777',expires=Math.floor(Date.now()/1000)+3600;
  const payload=Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:expires})).toString('base64url');
  return {access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.fixture',refresh_token:'local-only-fixture',token_type:'bearer',expires_in:3600,expires_at:expires,user:{id,aud:'authenticated',role:'authenticated',email:'login-fixture@example.test',user_metadata:{nickname:'登录流程测试'}}};
}

test('login waits for delayed config and restores the button after rejected credentials',async({context,page})=>{
  const auth=await fixture(context,'rejected');
  await page.goto(base+'/login.html');await auth.requested;
  await page.locator('#login-email').fill('login-fixture@example.test');
  await page.locator('#login-password').fill('local-test-only-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-btn')).toBeDisabled();
  expect(auth.count()).toBe(0);
  auth.release();
  await expect(page.locator('#login-error')).toContainText('Invalid login credentials');
  await expect(page.locator('#login-btn')).toBeEnabled();
  expect(auth.count()).toBe(1);
});

test('a valid mocked Auth session redirects to the game without contacting production accounts',async({context,page})=>{
  const auth=await fixture(context,'success');
  await page.goto(base+'/login.html');await auth.requested;auth.release();
  await page.locator('#login-email').fill('login-fixture@example.test');
  await page.locator('#login-password').fill('local-test-only-password');
  await page.locator('#login-btn').click();
  await expect(page).toHaveURL(base+'/game.html');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('userInfo')).nickname)).toBe('登录流程测试');
  await expect(page.locator('[data-launch="guandan"]')).toBeVisible();
});

test('registration also waits for config and reports a mocked rejection',async({context,page})=>{
  const auth=await fixture(context,'rejected');
  await page.goto(base+'/register.html');await auth.requested;
  await page.locator('#reg-email').fill('login-fixture@example.test');
  await page.locator('#reg-password').fill('local-test-only-password');
  await page.locator('#reg-btn').click();
  await expect(page.locator('#reg-btn')).toBeDisabled();
  auth.release();
  await expect(page.locator('#reg-error')).toContainText('Test registration rejected');
  await expect(page.locator('#reg-btn')).toBeEnabled();
});
