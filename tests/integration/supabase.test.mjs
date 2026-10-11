// Real Supabase Auth/PostgREST/Realtime + real HTTP authority. No .env or production config is read.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID,randomBytes } from 'node:crypto';
import { createClient } from '../../tooling/node_modules/@supabase/supabase-js/dist/index.mjs';
import { localCredentials,localUrl } from '../../scripts/local-supabase.mjs';
import { localSql,literal } from '../../scripts/local-db.mjs';
import { createIsolatedFetch } from '../../scripts/isolated-env.mjs';
import { startServer } from '../../server/http.ts';
import { Player,scenarios } from './scenarios.mjs';
import { waitForLocalReady } from '../../scripts/local-ready.mjs';
const report={kind:'REAL_LOCAL_SUPABASE',status:'FAIL',checks:[]};
const pass=name=>{report.checks.push({name,status:'PASS'});console.log('PASS: '+name);};
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data;};
const channels=[],clients=[];let service;
async function subscribed(channel){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime subscription timeout')),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error('Realtime subscription rejected'));}});});}
async function until(predicate){const deadline=Date.now()+15000;while(!predicate()){assert.ok(Date.now()<deadline,'Realtime delivery deadline');await new Promise(resolve=>setTimeout(resolve,40));}}
try {
 const config=await localCredentials();assert.equal(config.url,localUrl);await waitForLocalReady(config,true);
 const anon=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createIsolatedFetch(config.url)}});clients.push(anon);
 assert.equal(ok(await anon.rpc('nobi_isolated_fixture')),'nobi-phase3a-local-v1');
 const users=[],tokens=[];
 for(let seat=0;seat<4;seat++) {
  const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createIsolatedFetch(config.url)}});clients.push(client);
  const account={email:`nobi-${randomUUID()}@phase3a.test`,password:randomBytes(24).toString('base64url')};
  const created=ok(await client.auth.signUp({...account,options:{data:{nickname:'Isolated seat '+seat}}}));
  assert.ok(created.user&&created.session);const signed=ok(await client.auth.signInWithPassword(account));users.push(signed.user);tokens.push(signed.session.access_token);await client.realtime.setAuth(signed.session.access_token);
 }
 assert.equal(new Set(users.map(u=>u.id)).size,4);pass('four distinct disposable Auth signups / logins / identities');
 const players=clients.slice(1);
 assert.equal(ok(await players[0].rpc('get_player_profile',{player_id:users[1].id}))[0].user_id,users[1].id);
 assert.ok((await anon.rpc('get_player_profile',{player_id:users[0].id})).error);pass('public profile RPC signature / authenticated grant / anonymous denial');
 const room=ok(await players[0].schema('game').rpc('create_room',{game_kind:'guandan'}));
 const seats=await Promise.all(players.slice(1).map(p=>p.schema('game').rpc('join_room',{target:room}).then(ok)));assert.deepEqual(seats.sort(),[1,2,3]);
 assert.equal(ok(await players[2].schema('game').rpc('join_room',{target:room})),seats.includes(2)?(ok(await players[2].schema('game').from('room_members').select('seat').eq('room_id',room).eq('user_id',users[2].id).single())).seat:-1);
 assert.equal(ok(await players[0].schema('game').from('room_members').select('*').eq('room_id',room)).length,4);pass('atomic concurrent seat allocation / repeat join / membership read');
 const privateRoom=ok(await players[0].schema('game').rpc('create_room',{game_kind:'go'}));
 assert.deepEqual(ok(await players[3].schema('game').from('rooms').select('*').eq('id',privateRoom)),[]);
 assert.ok((await players[0].schema('game').from('rooms').update({status:'ended'}).eq('id',room)).error);
 assert.ok((await players[0].schema('game').from('moves').insert({session_id:room,user_id:users[0].id,x:0,y:0,player:'black',turn_number:0})).error);
 pass('room RLS hides outsider / direct state and move writes denied');
 const code='T'+randomUUID().replaceAll('-','').slice(0,9).toUpperCase();
 ok(await players[0].schema('game').from('game_rooms').insert({code,black_id:users[0].id}));ok(await players[1].schema('game').rpc('join_go_room',{room_code:code}));
 assert.equal(ok(await players[1].schema('game').from('game_rooms').select('*').eq('code',code).single()).white_id,users[1].id);
 assert.ok((await players[1].schema('game').from('game_rooms').update({next_turn:'black'}).eq('code',code)).error);pass('legacy Go room columns / atomic join RPC / untrusted snapshot write denied');
 const events=[];const channel=players[0].channel('phase3a-contract-'+randomUUID()).on('system',{},payload=>{if(payload.status==='error')console.error('Realtime system:',payload.message);}).on('postgres_changes',{event:'UPDATE',schema:'game',table:'rooms',filter:'id=eq.'+room},event=>events.push(event));channels.push(channel);await subscribed(channel);
 // A fresh self-hosted tenant lazily creates its logical slot on first subscription.
 // Do not publish the first fixture mutation before that worker is actually attached.
 await until(()=>localSql("select exists(select 1 from pg_replication_slots where slot_name='supabase_realtime_replication_slot_' and active)")==='t');
 await until(()=>localSql(`select exists(select 1 from realtime.subscription where entity='game.rooms'::regclass and claims->>'sub'=${literal(users[0].id)})`)==='t');
 localSql(`begin; set local role nobi_authority; update game.rooms set status='playing',version=1 where id=${literal(room)}::uuid; commit;`);
 await until(()=>events.length===1);assert.equal(events[0].new.status,'playing');
 await players[0].removeChannel(channel);
 const restoredChannel=players[0].channel('phase3a-restored-'+randomUUID()).on('postgres_changes',{event:'UPDATE',schema:'game',table:'rooms',filter:'id=eq.'+room},event=>events.push(event));channels.push(restoredChannel);await subscribed(restoredChannel);
 localSql(`begin; set local role nobi_authority; update game.rooms set version=2 where id=${literal(room)}::uuid; commit;`);await until(()=>events.length===2);assert.equal(events[1].new.version,2);
 pass('real Realtime WebSocket / published postgres change / participant RLS / reconnect');
 const season=randomUUID();localSql(`insert into game.seasons(id,name,starts_at,ends_at) values(${literal(season)}::uuid,'Disposable Phase3A',now(),now()+interval '1 day'); insert into game.ratings(user_id,kind,season_id) values ${users.flatMap(u=>['go','guandan'].map(kind=>`(${literal(u.id)}::uuid,${literal(kind)},${literal(season)}::uuid)`)).join(',')};`);
 const ranked=ok(await players[0].schema('game').from('rankings').select('*').eq('season_id',season));assert.equal(ranked.length,8);assert.ok(ranked.every(r=>r.rank===1&&r.rating===1500&&r.games===0));
 assert.ok((await players[0].schema('game').from('ratings').update({rating:9999}).eq('user_id',users[0].id)).error);
 assert.ok((await players[0].schema('game').from('rating_events').insert({user_id:users[0].id,season_id:season,kind:'go',before_rating:1500,delta:1,after_rating:1501})).error);
 assert.ok((await players[0].schema('game').from('match_records').insert({id:randomUUID(),kind:'go',participants:users.map(u=>u.id),result:{winner:0},verified_by:'nobi-authority-v1'})).error);
 pass('Go/Guandan season rankings / tie ranking / client rating, history and result writes denied');
 service=await startServer({port:0});
 const simulated=players.map((_,i)=>new Player(service.url,tokens[i]));
 const result=await scenarios(simulated);for(const name of result.names)report.checks.push({name,status:'PASS'});
 await new Player(service.url,'invalid-token').request('/rooms',{kind:'go'},401);
 await simulated[2].request(`/rooms/${result.go}`,undefined,403);pass('authority rejects invalid token and nonparticipant recovery');
 const records=ok(await players[0].schema('game').from('match_records').select('*').in('id',[result.guandan,result.go]));assert.equal(records.length,2);assert.ok(records.every(r=>r.ranked===false&&r.verified_by==='nobi-authority-v1'));
 const receipts=ok(await players[0].schema('game').from('command_receipts').select('*').eq('room_id',result.guandan));assert.equal(new Set(receipts.map(r=>r.state_version)).size,receipts.length);assert.ok(receipts.length>100);
 assert.ok(ok(await players[0].schema('game').from('ratings').select('rating,games').eq('season_id',season)).every(r=>r.rating===1500&&r.games===0));
 pass('verified unranked SQL records / unique operation receipts / ratings unchanged');
 report.status='PASS';report.total=report.checks.length;
} catch(error) {report.error=error instanceof Error?error.message:'integration failure';console.error('FAIL: '+report.error);process.exitCode=1;}
finally {
 if(service)await service.close();for(const client of clients)await client.removeAllChannels();
 fs.mkdirSync('.nobi-isolated/phase3a',{recursive:true});fs.writeFileSync('.nobi-isolated/phase3a/integration-result.json',JSON.stringify(report,null,2));
 console.log(`${report.kind}: ${report.status}; ${report.checks.length} checks`);
}
