import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {startDeviceServer} from '../../server/device-test.mjs';

test('two authenticated Xiangqi players: directory, turn enforcement, SSE, chat, consent, replay and cold restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nobi-xiangqi-')),database=path.join(dir,'rooms.sqlite');let time=100000;
 const authenticate=async token=>{if(!['red','black','other'].includes(token))throw Error('fixture identity rejected');return {id:token,user_metadata:{nickname:token}};};
 let service=await startDeviceServer({database,port:0,authenticate,now:()=>time});let reader;
 const req=async(uid,url,body)=>{const r=await fetch(service.url+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const cmd=async(uid,room,type,payload={})=>{const state=(await req(uid,'/rooms/'+room)).data;const envelope={actionId:randomUUID(),matchId:room,expectedVersion:state.version,actionType:type,actionPayload:payload};return {envelope,...await req(uid,'/rooms/'+room+'/commands',envelope)};};
 try{
  assert.ok((await(await fetch(service.url+'/health')).json()).capabilities.includes('xiangqi'));
  const room=(await req('red','/rooms',{kind:'xiangqi'})).data,id=room.roomId;
  const list=(await req('red','/rooms?kind=xiangqi')).data;assert.equal(list.rooms[0].capacity,2);assert.equal(list.rooms[0].kind,'xiangqi');
  assert.equal((await req('black','/rooms/'+id)).status,403);
  assert.equal((await req('black','/rooms/'+id+'/join',{})).status,200);assert.equal((await req('other','/rooms/'+id+'/join',{})).status,409);
  assert.equal((await cmd('black',id,'start')).status,409);
  const begun=await cmd('red',id,'start');assert.equal(begun.status,200);assert.equal(begun.data.publicState.board.length,90);assert.equal(begun.data.turn,0);
  const stream=await fetch(service.url+'/rooms/'+id+'/events',{headers:{Authorization:'Bearer black'}});reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: state/);
  assert.equal((await cmd('black',id,'move',{from:27,to:36})).status,409);
  assert.equal((await cmd('red',id,'move',{from:54,to:44})).status,409);
  const moved=await cmd('red',id,'move',{from:54,to:45});assert.equal(moved.status,200);assert.equal(moved.data.turn,1);assert.equal(moved.data.publicState.board[45],7);
  assert.deepEqual((await req('red','/rooms/'+id+'/commands',moved.envelope)).data,moved.data);
  assert.match(new TextDecoder().decode((await reader.read()).value),/"ply":1/);
  assert.equal((await req('black','/rooms/'+id+'/commands',{...moved.envelope,actionId:randomUUID()})).status,409);
  assert.equal((await cmd('black',id,'move',{from:27,to:36})).status,200);
  const deadline=(await req('red','/rooms/'+id)).data.deadline;time+=1000;
  assert.equal((await cmd('red',id,'undo-request')).data.deadline,deadline);
  assert.equal((await cmd('red',id,'undo-accept')).status,409);
  const undo=await cmd('black',id,'undo-accept');assert.equal(undo.data.publicState.ply,0);assert.equal(undo.data.publicState.board[54],7);assert.equal(undo.data.turn,0);
  const message=await req('red','/rooms/'+id+'/chat',{messageId:randomUUID(),text:'好棋！'});assert.equal(message.status,200);assert.ok(JSON.stringify((await req('black','/rooms/'+id+'/chat')).data).includes('好棋'));
  await reader.cancel();reader=null;await service.close();service=await startDeviceServer({database,port:0,authenticate,now:()=>time});
  const restored=(await req('black','/rooms/'+id)).data;assert.equal(restored.publicState.ply,0);assert.equal(restored.version,undo.data.version);assert.equal(restored.players[1].nickname,'black');
  assert.equal((await cmd('red',id,'draw-request')).status,200);assert.equal((await cmd('red',id,'draw-accept')).status,409);
  const drawn=await cmd('black',id,'draw-accept');assert.equal(drawn.data.status,'ended');assert.equal(drawn.data.result.winner,null);assert.equal(drawn.data.result.ranked,false);
  assert.equal((await cmd('red',id,'move',{from:54,to:45})).status,409);assert.equal((await req('red','/rooms?kind=xiangqi')).data.total,0);
  const summary=(await req('red','/me/summary?game=xiangqi')).data;assert.equal(summary.rows[0].outcome,'draw');assert.equal(summary.friends[0].nickname,'black');
  const invitation=await req('red','/invitations',{kind:'xiangqi',friendKey:summary.friends[0].friendKey,requestId:randomUUID()});assert.equal(invitation.status,200);assert.equal(invitation.data.kind,'xiangqi');
  const accepted=await req('black','/invitations/'+invitation.data.id+'/accept',{});assert.equal(accepted.status,200);assert.equal((await req('black','/rooms/'+accepted.data.roomId)).data.players.length,2);
  const extra=(await req('red','/rooms',{kind:'xiangqi'})).data;await req('black','/rooms/'+extra.roomId+'/join',{});await cmd('red',extra.roomId,'start');time+=180001;await service.authority.sweep();
  const timed=(await req('black','/rooms/'+extra.roomId)).data;assert.equal(timed.result.reason,'turn-timeout');assert.equal(timed.result.winner,1);
  await service.close();service=await startDeviceServer({database,port:0,authenticate,now:()=>time});assert.equal((await req('red','/rooms/'+extra.roomId)).data.result.winner,1);
 }finally{await reader?.cancel();await service.close();assert.ok(dir.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
