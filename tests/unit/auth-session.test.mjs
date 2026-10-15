import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {sandbox,load} from './legacy-harness.mjs';
function auth({session=null,user=null,error=null}={}){
 let attempts=0;
 const sdk={auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user},error}),signInWithPassword:async()=>{attempts++;await Promise.resolve();return {data:{user:{id:'new'},session:{access_token:'fixture'}},error:null};}}};
 const c=sandbox({NobiConfig:{ready:Promise.resolve({SUPABASE_URL:'https://fixture',SUPABASE_ANON_KEY:'public'})},supabase:{createClient:()=>sdk}});load('supabaseClient.js',c);return {c,attempts:()=>attempts};
}
test('an authenticated account is kept instead of another password login',async()=>{const a=auth({session:{user:{id:'a'}},user:{id:'a'}});const result=await a.c.NobiServices.signInOnce({email:'other',password:'fixture'});expect(result.alreadySignedIn).toBe(true);expect(result.data.user.id).toBe('a');expect(a.attempts()).toBe(0);});
test('simultaneous login submits share a single Auth request',async()=>{const a=auth();await Promise.all([a.c.NobiServices.signInOnce({}),a.c.NobiServices.signInOnce({})]);expect(a.attempts()).toBe(1);});
test('a session verification outage never replaces an existing account',async()=>{const a=auth({session:{user:{id:'a'}},error:new Error('network')});await expect(a.c.NobiServices.signInOnce({})).rejects.toThrow('network');expect(a.attempts()).toBe(0);});
