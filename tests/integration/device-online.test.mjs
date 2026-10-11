import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {startDeviceServer,onlineAuthenticator} from '../../server/device-test.mjs';
import {Player,scenarios} from './scenarios.mjs';

test('USB authority with simulated identities: private hands, legal turns, streams, idempotency and cold restoration',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nobi-device-authority-'));
 const database=path.join(directory,'rooms.sqlite');
 const authenticate=async token=>{if(!/^device-[0-3]$/.test(token))throw Error('Invalid');return {id:token,user_metadata:{nickname:token,avatar_url:'https://example.invalid/'+token+'.png'}};};
 let instance=await startDeviceServer({port:0,database,authenticate});
 try{
  const unauthorized=await fetch(instance.url+'/rooms',{method:'POST',body:'{"kind":"guandan"}'});assert.equal(unauthorized.status,401);
  assert.equal((await fetch(instance.url+'/health',{headers:{Origin:'https://untrusted.example'}})).status,403);
  for(const origin of ['https://localhost','capacitor://localhost'])assert.equal((await fetch(instance.url+'/health',{method:'OPTIONS',headers:{Origin:origin}})).status,204);
  const players=[0,1,2,3].map(i=>new Player(instance.url,'device-'+i));
  const scenario=await scenarios(players);assert.equal(scenario.checks,10);
  const continuation=await players[0].request('/rooms/'+scenario.guandan+'/continue',{});
  assert.equal((await players[0].request('/rooms/'+scenario.guandan+'/continue',{})).roomId,continuation.roomId);
  assert.equal(continuation.players.length,4);assert.equal(continuation.status,'waiting');
  const room=await players[0].request('/rooms',{kind:'guandan'});
  for(let i=1;i<4;i++)await players[i].request('/rooms/'+room.id+'/join',{});
  const start=await players[0].command(room.id,'start');
  const before=await players[start.turn].request('/rooms/'+room.id);
  const envelope={matchId:room.id,actionId:randomUUID(),expectedVersion:before.version,actionType:'play',actionPayload:{cardIds:[before.hand[0].id]}};
  const played=await players[start.turn].request('/rooms/'+room.id+'/commands',envelope);
  await instance.close();instance=await startDeviceServer({port:0,database,authenticate});
  const restored=new Player(instance.url,'device-'+start.turn);
  const state=await restored.request('/rooms/'+room.id);assert.equal(state.version,played.version);assert.deepEqual(state.hand,played.hand);
  assert.deepEqual(await restored.request('/rooms/'+room.id+'/commands',envelope),played);
  const outsider=await fetch(instance.url+'/rooms/'+room.id,{headers:{Authorization:'Bearer device-9'}});assert.ok(outsider.status>=400);
 }finally{await instance.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
});

test('Online identity verification uses GET Auth user, rejects failed/anonymous identities, and never writes production data',async()=>{
 const calls=[];
 const config={SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON_KEY:'public-test-key'};
 const auth=onlineAuthenticator(config,async(url,options)=>{calls.push({url:String(url),method:options.method??'GET'});return {ok:true,json:async()=>({id:'verified-user',user_metadata:{nickname:'Account'}})};});
 assert.equal((await auth('a-session-token')).id,'verified-user');
 assert.deepEqual(calls,[{url:'https://auth.example.invalid/auth/v1/user',method:'GET'}]);
 await assert.rejects(onlineAuthenticator(config,async()=>({ok:false}))('invalid-token'),/登录已失效/);
 await assert.rejects(onlineAuthenticator(config,async()=>({ok:true,json:async()=>({id:'anon',is_anonymous:true})}))('anon-token'),/已注册账号/);
 assert.throws(()=>onlineAuthenticator({...config,SUPABASE_URL:'http://untrusted.example'}),/HTTPS/);
});
