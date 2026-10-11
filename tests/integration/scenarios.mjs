import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export class Player {
 constructor(url,token){this.url=url;this.token=token;this.sequence=0;}
 async request(route,body,status=200) {
  const response=await fetch(this.url+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
 }
 async command(id,type,extra={},status=200){const state=await this.request(`/rooms/${id}`);return this.request(`/rooms/${id}/commands`,{requestId:randomUUID(),expectedVersion:state.version,type,...extra},status);}
 async stream(id) {
  const controller=new AbortController();const response=await fetch(this.url+`/rooms/${id}/events`,{headers:{Authorization:`Bearer ${this.token}`},signal:controller.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader();let text='';
  const next=async()=>{
   const until=Date.now()+10000;
   while(!text.includes('\n\n')) {assert.ok(Date.now()<until,'SSE deadline');const result=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE timeout')),10000).unref())]);if(result.done)throw new Error('SSE ended');text+=new TextDecoder().decode(result.value);}
   const end=text.indexOf('\n\n'),event=text.slice(0,end);text=text.slice(end+2);return JSON.parse(event.split('\ndata: ')[1]);
  };
  return {next,close:()=>{controller.abort();reader.cancel().catch(()=>{});}};
 }
}
function weight(c){return c.kind==='joker'?c.value:c.rank==='2'?(15):({'J':11,'Q':12,'K':13,'A':14}[c.rank]??Number(c.rank));}
export async function scenarios(players) {
 const checks=[];const pass=name=>{checks.push(name);console.log('PASS: '+name);};
 const gd=await players[0].request('/rooms',{kind:'guandan'}),id=gd.id;
 for(let seat=1;seat<4;seat++) assert.equal((await players[seat].request(`/rooms/${id}/join`,{})).seat,seat);
 assert.equal((await players[2].request(`/rooms/${id}/join`,{})).seat,2);
 pass('Guandan: four authenticated clients / unique seats / idempotent join');
 const streams=await Promise.all(players.map(p=>p.stream(id)));await Promise.all(streams.map(s=>s.next()));
 let state=await players[0].command(id,'start');
 const starts=await Promise.all(streams.map(s=>s.next()));assert.ok(starts.every(s=>s.status==='playing'));
 const snapshots=await Promise.all(players.map(p=>p.request(`/rooms/${id}`)));
 assert.equal(snapshots.flatMap(s=>s.hand).length,108);assert.equal(new Set(snapshots.flatMap(s=>s.hand.map(c=>c.id))).size,108);
 assert.ok(snapshots.every(s=>s.hand.length===27&&!('hands' in s)));
 pass('Guandan: server start / 108-card deal / private hands / SSE synchronization');
 const leader=state.turn,wrong=(leader+1)%4;
 await players[wrong].command(id,'play',{cardIds:[snapshots[wrong].hand[0].id]},409);
 await players[leader].command(id,'pass',{},409);
 await players[leader].command(id,'play',{cardIds:[snapshots[wrong].hand[0].id]},409);
 await players[leader].command(id,'play',{cardIds:[snapshots[leader].hand[0].id,snapshots[leader].hand[0].id]},400);
 await players[leader].command(id,'result',{winner:0},400);
 pass('Guandan: wrong turn / opening pass / stolen card / duplicate card / forged result denied');
 const operation={requestId:randomUUID(),expectedVersion:state.version,type:'play',cardIds:[snapshots[leader].hand[0].id]};
 const played=await players[leader].request(`/rooms/${id}/commands`,operation);
 assert.deepEqual(await players[leader].request(`/rooms/${id}/commands`,operation),played);
 await players[leader].request(`/rooms/${id}/commands`,{...operation,type:'pass'},409);
 await players[1].request(`/rooms/${id}/commands`,{requestId:randomUUID(),expectedVersion:state.version,type:'pass'},409);
 pass('Guandan: operation idempotency / request-key conflict / stale version denied');
 const observed=await Promise.all(streams.map(s=>s.next()));assert.ok(observed.every(s=>s.version===played.version&&s.turn===played.turn));
 streams[2].close();const reconnect=await players[2].stream(id);const restored=await reconnect.next();assert.equal(restored.version,played.version);assert.equal(restored.seat,2);reconnect.close();streams.forEach(s=>s.close());
 pass('Guandan: disconnect / authenticated reconnect / versioned snapshot recovery');
 let actions=0,passes=0;
 while(true) {
  const s=await players[0].request(`/rooms/${id}`);if(s.status==='ended'){assert.equal(s.result.reason,'rules-complete');assert.equal(s.result.ranked,false);assert.equal(s.result.winner,s.finishOrder[0]%2);break;}
  assert.ok(actions++<2500,'match must terminate');
  const actor=players[s.turn],view=await actor.request(`/rooms/${id}`);
  const card=view.hand.filter(c=>!view.trick||weight(c)>view.trick.weight).sort((a,b)=>weight(a)-weight(b))[0];
  if(card) await actor.command(id,'play',{cardIds:[card.id]});else{await actor.command(id,'pass');passes++;}
 }
 assert.ok(passes>0);pass(`Guandan: legal play / pass / turn progression / server rules terminal result (${actions} actions)`);
 await players[0].command(id,'play',{cardIds:[]},409);
 const exit=await players[0].request('/rooms',{kind:'guandan'});for(let i=1;i<4;i++)await players[i].request(`/rooms/${exit.id}/join`,{});
 await players[0].command(exit.id,'start');assert.equal((await players[3].command(exit.id,'leave')).result.reason,'player-left');
 pass('Guandan: participant exit / server-confirmed unranked end');
 const go=await players[0].request('/rooms',{kind:'go'}),gid=go.id;
 assert.equal((await players[1].request(`/rooms/${gid}/join`,{})).seat,1);
 await players[2].request(`/rooms/${gid}/join`,{},409);
 state=await players[0].command(gid,'start');assert.equal(state.turn,0);assert.equal(state.board.length,19);
 const gs=await players[1].stream(gid);assert.equal((await gs.next()).seat,1);
 await players[0].command(gid,'move',{row:0,col:1});assert.equal((await gs.next()).board[0][1],1);
 await players[1].command(gid,'move',{row:0,col:0});await gs.next();
 state=await players[0].command(gid,'move',{row:1,col:0});await gs.next();assert.equal(state.blackCaptures,1);assert.equal(state.board[0][0],0);
 state=await players[1].command(gid,'move',{row:5,col:5});await gs.next();
 await players[0].command(gid,'move',{row:0,col:1},409);
 await players[1].command(gid,'move',{row:2,col:2},409);
 await players[0].command(gid,'move',{row:-1,col:19},409);
 pass('Go: two clients / black-white seats / move SSE / capture / occupied and wrong-turn rejection');
 gs.close();const recovered=await players[1].stream(gid);assert.equal((await recovered.next()).version,state.version);recovered.close();
 await players[0].command(gid,'undo-request');await players[0].command(gid,'undo-accept',{},409);
 state=await players[1].command(gid,'undo-accept');assert.equal(state.moves.length,2);assert.equal(state.blackCaptures,0);assert.equal(state.board[0][0],2);assert.equal(state.board[1][0],0);assert.equal(state.turn,0);
 pass('Go: reconnect / opponent consent / full-round undo restores board, capture, turn and journal');
 await players[0].command(gid,'move',{row:1,col:0});await players[1].command(gid,'move',{row:5,col:5});await players[0].command(gid,'move',{row:9,col:9});await players[1].command(gid,'move',{row:0,col:0},409);
 await players[1].command(gid,'move',{row:6,col:6});
 await players[0].command(gid,'resign-request');await players[1].command(gid,'resign-confirm',{},409);
 state=await players[0].command(gid,'resign-confirm');assert.equal(state.status,'ended');assert.equal(state.result.winner,1);assert.equal(state.result.ranked,false);
 await players[1].command(gid,'move',{row:8,col:8},409);
 pass('Go: suicide denied / resignation confirmation / server terminal result / ended game blocks input');
 return {checks:checks.length,names:checks,guandan:id,go:gid};
}
