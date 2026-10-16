// Read-only transport checks. Uses only the site's verified public anon key.
// No user password/session, email action or Auth mutation is performed.
import assert from 'node:assert/strict';
import {onlinePublicConfig} from './online-public-config.mjs';
const gateway='https://api.nobistudio.com/nobi-online/auth/';
const config=await onlinePublicConfig('https://game.nobistudio.com');
assert.equal(config.SUPABASE_URL,'https://kogjjfccyncdszuuwlun.supabase.co');
const request=(url,init={})=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
const original=await request(config.SUPABASE_URL+'/auth/v1/health',{headers:{apikey:config.SUPABASE_ANON_KEY}});
assert.equal(original.status,200);const originalHealth=await original.json();assert.equal(originalHealth.name,'GoTrue');
const result=await request(gateway+'health',{headers:{apikey:config.SUPABASE_ANON_KEY}});
assert.equal(result.status,200);const health=await result.json();assert.equal(health.name,'GoTrue');assert.equal(health.version,originalHealth.version);
const noKey=await request(gateway+'health');assert.equal(noKey.status,401);
const invalidSession=await request(gateway+'user',{headers:{apikey:config.SUPABASE_ANON_KEY,Authorization:'Bearer invalid-transport-fixture'}});
const originalInvalid=await request(config.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:config.SUPABASE_ANON_KEY,Authorization:'Bearer invalid-transport-fixture'}});
assert.ok([401,403].includes(originalInvalid.status));assert.equal(invalidSession.status,originalInvalid.status);
assert.equal((await invalidSession.json()).code,(await originalInvalid.json()).code);
for(const origin of ['capacitor://localhost','https://localhost','https://game.nobistudio.com']){
 const response=await request(gateway+'token?grant_type=password',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,authorization,content-type,x-client-info'}});
 assert.ok(response.ok,`CORS status ${response.status}`);
 assert.ok(['*',origin].includes(response.headers.get('access-control-allow-origin')),`CORS origin ${origin}`);
 assert.match(response.headers.get('access-control-allow-methods'),/POST/i);
 for(const header of ['apikey','authorization','content-type','x-client-info'])assert.ok(response.headers.get('access-control-allow-headers')?.toLowerCase().split(',').some(h=>h.trim()===header),`CORS header ${header}`);
}
const online=await request('https://api.nobistudio.com/nobi-online/health');assert.equal(online.status,200);
console.log(JSON.stringify({gateway,authHealth:200,upstreamVersion:health.version,missingKey:401,invalidSession:invalidSession.status,corsOrigins:3,onlineHealth:200}));
