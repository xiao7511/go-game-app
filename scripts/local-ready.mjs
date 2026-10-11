import {localCredentials,localUrl} from './local-supabase.mjs';
export async function waitForLocalReady(config,requireContract=false) {
 config ??= await localCredentials();
 if(config.url!==localUrl)throw new Error('BLOCKED: readiness is restricted to dedicated loopback API');
 const deadline=Date.now()+60000;let last='services still initializing';
 while(Date.now()<deadline) {
  try {
   const endpoints=['/auth/v1/health','/realtime/v1/api/tenants/realtime-dev/health'];
   if(requireContract)endpoints.push('/rest/v1/rpc/nobi_isolated_fixture');
   const results=await Promise.all(endpoints.map(endpoint=>fetch(localUrl+endpoint,{method:endpoint.includes('/rpc/')?'POST':'GET',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:endpoint.includes('/rpc/')?'{}':undefined,redirect:'error',signal:AbortSignal.timeout(3000)})));
   if(results.every(r=>r.ok)&&(!requireContract||await results[2].json()==='nobi-phase3a-local-v1')){console.log('PASS: local Auth, Realtime'+(requireContract?' and migrated PostgREST contract':'')+' are ready');return;}
   last=results.map(r=>r.status).join('/');
  }catch{last='local health connection unavailable';}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw new Error('BLOCKED: local service readiness deadline; '+last);
}
if(process.argv[1]?.endsWith('local-ready.mjs'))await waitForLocalReady(undefined,true);
