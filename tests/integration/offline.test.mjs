import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { startServer } from '../../server/http.ts';
import { Player,scenarios } from './scenarios.mjs';
test('OFFLINE HTTP authority framework: four/two simulated identities (not Supabase verification)',async()=>{
 const instance=await startServer({port:0,backend:{url:'http://127.0.0.1:55421',key:'unused'},authenticate:async token=>{if(!/^offline-[0-3]$/.test(token))throw new Error('invalid');return token;},createRoom:async()=>randomUUID(),joinRoom:async(id,uid,room)=>room.seats.includes(uid)?room.seats.indexOf(uid):room.seats.length,record:async()=>{},persist:async()=>{}});
 try {
 for(const origin of ['capacitor://localhost','http://localhost','https://localhost']) {const response=await fetch(instance.url+'/health',{method:'OPTIONS',headers:{Origin:origin}});assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),origin);}
 const rejected=await fetch(instance.url+'/health',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}});assert.equal(rejected.status,403);
 const result=await scenarios([0,1,2,3].map(i=>new Player(instance.url,'offline-'+i)));assert.equal(result.checks,10);}finally{await instance.close();}
});

test('HTTP snapshots publish each authenticated account portrait and reject invalid avatar sources',async()=>{
 const portraits={alice:'https://example.invalid/alice.png',bob:'javascript:alert(1)',carol:'https://example.invalid/carol.png'};
 const instance=await startServer({port:0,backend:{url:'http://127.0.0.1:55421',key:'unused'},authenticate:async token=>({id:token,user_metadata:{nickname:token,avatar_url:portraits[token]}}),createRoom:async()=>randomUUID(),joinRoom:async(id,uid,room)=>room.seats.length,persist:async()=>{}});
 const post=async(path,token,body)=>{const response=await fetch(instance.url+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
 try {
  const created=await post('/rooms','alice',{kind:'guandan'});
  assert.equal(created.players[0].avatar,portraits.alice);
  const second=await post('/rooms/'+created.roomId+'/join','bob',{});
  assert.equal(second.players[1].avatar,null);
  const third=await post('/rooms/'+created.roomId+'/join','carol',{});
  assert.equal(third.players[0].avatar,portraits.alice);assert.equal(third.players[2].avatar,portraits.carol);
 }finally{await instance.close();}
});
