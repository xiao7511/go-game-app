import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';
const project='https://kogjjfccyncdszuuwlun.supabase.co';
const gateway='https://api.nobistudio.com/nobi-online/auth/';
function transport(request,timeout=1000,base=project){
 const c=sandbox({Request,Response,Headers,setTimeout,clearTimeout,NobiConfig:{ready:Promise.resolve({})}});
 return load('supabaseClient.js',c,'createAuthFetch').createAuthFetch(base,request,timeout);
}
test('password and refresh requests keep their method, headers, query and body on the same project gateway',async()=>{
 const seen=[];
 const fetch=transport(async(input,init)=>{const r=new Request(input,init);seen.push(r);return new Response('{"ok":true}',{status:200});});
 for(const grant of ['password','refresh_token']){
  const r=await fetch(project+'/auth/v1/token?grant_type='+grant,{method:'POST',headers:{apikey:'public-fixture',authorization:'Bearer fixture','content-type':'application/json'},body:'{"fixture":true}'});
  expect(await r.json()).toEqual({ok:true});
 }
 expect(seen.map(r=>r.url)).toEqual(['password','refresh_token'].map(g=>gateway+'token?grant_type='+g));
 for(const r of seen){expect(r.method).toBe('POST');expect(r.headers.get('apikey')).toBe('public-fixture');expect(r.headers.get('authorization')).toBe('Bearer fixture');expect(await r.text()).toBe('{"fixture":true}');}
});
test('Request inputs retain authorization and payload',async()=>{
 let outgoing;
 const fetch=transport(async(input,init)=>{outgoing=new Request(input,init);return new Response(null,{status:204});});
 const response=await fetch(new Request(project+'/auth/v1/user',{method:'PUT',headers:{authorization:'Bearer fixture'},body:'{}'}));
 expect(response.status).toBe(204);expect(outgoing.url).toBe(gateway+'user');expect(outgoing.method).toBe('PUT');expect(await outgoing.text()).toBe('{}');expect(outgoing.headers.get('authorization')).toBe('Bearer fixture');
});
test('other projects, REST, storage and lookalike hosts never send data to this gateway',async()=>{
 const seen=[];const fetch=transport(async(input)=>{seen.push(input);return new Response('{}');});
 const urls=[project+'/rest/v1/profiles',project+'/storage/v1/object/a',project+'.invalid/auth/v1/token','https://other.supabase.co/auth/v1/token'];
 for(const url of urls)await fetch(url);
 expect(seen).toEqual(urls);
 let target;await transport(async url=>{target=url;return new Response('{}');},1000,'http://127.0.0.1:55421')('http://127.0.0.1:55421/auth/v1/token');
 expect(target).toBe('http://127.0.0.1:55421/auth/v1/token');
});
test('credentials, permission, rate limit and upstream errors pass through without retries',async()=>{
 for(const status of [400,401,403,429,500,502]){
  let calls=0;const fetch=transport(async()=>{calls++;return new Response('{"error":"fixture"}',{status,headers:{'retry-after':'60'}});});
  const r=await fetch(project+'/auth/v1/token');expect(r.status).toBe(status);expect(await r.json()).toEqual({error:'fixture'});expect(r.headers.get('retry-after')).toBe('60');expect(calls).toBe(1);
 }
});
test('network failure and timeout reject without an automatic password retry',async()=>{
 let calls=0;const fail=transport(async()=>{calls++;throw new TypeError('Failed to fetch');});
 await expect(fail(project+'/auth/v1/token')).rejects.toThrow('无法连接登录服务');expect(calls).toBe(1);
 const stall=transport((_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))),15);
 await expect(stall(project+'/auth/v1/token')).rejects.toThrow('连接超时');
});
test('caller cancellation is preserved',async()=>{
 const controller=new AbortController();
 const fetch=transport((_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))));
 const promise=fetch(project+'/auth/v1/user',{signal:controller.signal});controller.abort(new Error('caller cancelled'));
 await expect(promise).rejects.toThrow('caller cancelled');
});
test('SDK project URL and existing project based session storage remain unchanged',async()=>{
 let args;
 const config={SUPABASE_URL:project,SUPABASE_ANON_KEY:'public-fixture'};
 const c=sandbox({Request,Response,NobiConfig:{ready:Promise.resolve(config)},supabase:{createClient:(...a)=>{args=a;return {};}}});
 load('supabaseClient.js',c);await c.NobiServices.ready;
 expect(args[0]).toBe(project);expect(args[1]).toBe(config.SUPABASE_ANON_KEY);expect(args[2].auth.storageKey).toBeUndefined();expect(args[2].auth.persistSession).toBe(true);expect(typeof args[2].global.fetch).toBe('function');
});
