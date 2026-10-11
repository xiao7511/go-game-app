// Disposable local Auth accounts for manual multi-browser testing. Never print credentials.
import fs from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '../tooling/node_modules/@supabase/supabase-js/dist/index.mjs';
import {localCredentials} from './local-supabase.mjs';
import {waitForLocalReady} from './local-ready.mjs';
import {createIsolatedFetch} from './isolated-env.mjs';
import {localSql,literal} from './local-db.mjs';
const file=new URL('../.nobi-isolated/phase3b/manual-accounts.json',import.meta.url);
const config=await localCredentials();await waitForLocalReady(config,true);
if(process.argv.includes('--cleanup')){
 if(process.env.NOBI_ISOLATED_ACK!=='LOCAL_DISPOSABLE_ONLY')throw new Error('BLOCKED: cleanup requires LOCAL_DISPOSABLE_ONLY acknowledgement');
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(data.url!==config.url||data.kind!=='DISPOSABLE_LOCAL_AUTH'||data.accounts.length!==4)throw new Error('BLOCKED: fixture identity mismatch');
 for(const account of data.accounts){if(!/^[0-9a-f-]{36}$/.test(account.id)||!/^nobi-[0-9a-f-]{36}@phase3b.manual.test$/.test(account.email))throw new Error('BLOCKED: unexpected account');
  if(localSql(`select count(*) from auth.users where id=${literal(account.id)}::uuid and email=${literal(account.email)}`)!=='1')throw new Error('BLOCKED: local account mapping mismatch');}
 const ids=data.accounts.map(a=>literal(a.id)+'::uuid').join(',');
 if(localSql(`select count(*) from game.room_members m join game.rooms r on r.id=m.room_id where m.user_id in(${ids}) and r.owner_id not in(${ids})`)!=='0')throw new Error('BLOCKED: manual accounts belong to externally owned rooms; clean those fixtures explicitly first');
 localSql(`begin;create temp table manual_rooms as select id from game.rooms where owner_id in(${ids});delete from game.command_receipts where room_id in(select id from manual_rooms);delete from game.room_members where room_id in(select id from manual_rooms) or user_id in(${ids});delete from game.match_records where id in(select id from manual_rooms);delete from game.rooms where id in(select id from manual_rooms);delete from auth.users where id in(${ids});commit;`);
 fs.unlinkSync(file);console.log('PASS: only recorded disposable manual fixtures cleaned');
}else{
 if(fs.existsSync(file))throw new Error('BLOCKED: manual fixture already exists; use it or explicitly clean it first');
 const accounts=[];
 for(let seat=0;seat<4;seat++){const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createIsolatedFetch(config.url)}});const account={email:'nobi-'+randomUUID()+'@phase3b.manual.test',password:randomBytes(24).toString('base64url')};const {data,error}=await client.auth.signUp({...account,options:{data:{nickname:'Nobi 测试 '+(seat+1)}}});if(error||!data.user)throw new Error('Local disposable account creation failed');accounts.push({...account,id:data.user.id});await client.removeAllChannels();}
 fs.mkdirSync(new URL('../.nobi-isolated/phase3b/',import.meta.url),{recursive:true});fs.writeFileSync(file,JSON.stringify({kind:'DISPOSABLE_LOCAL_AUTH',url:config.url,accounts},null,2),{mode:0o600});console.log('PASS: four local manual accounts saved in ignored .nobi-isolated/phase3b/manual-accounts.json; credentials not logged');
}
