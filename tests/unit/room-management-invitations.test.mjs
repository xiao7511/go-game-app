import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {DatabaseSync} from 'node:sqlite';
import {Authority} from '../../server/authority.ts';
import {createInvitations} from '../../server/game-invitations.mjs';
import {friendKey} from '../../server/account-summary.mjs';
import {roomDirectory} from '../../server/room-directory.mjs';

test('only the waiting-room owner removes other players, preserving idempotency and replay across re-seating',async()=>{
 const a=new Authority({now:()=>1000});a.create('g','guandan','host');a.join('g','peer',1);a.join('g','other',2);
 const room=a.rooms.get('g'),input={requestId:'remove-1234',expectedVersion:2,target:'peer'};
 await expect(a.removePlayer('g','other',input)).rejects.toThrow('只有房主');await expect(a.removePlayer('g','host',{...input,target:'host'})).rejects.toThrow('不能移除');
 await a.removePlayer('g','host',input);expect(room.seats).toEqual(['host','other']);expect(a.view(room,'other').privateState.seat).toBe(1);await a.removePlayer('g','host',input);expect(room.version).toBe(3);
 expect(()=>a.join('g','peer',2)).toThrow('移出');expect(roomDirectory(a.rooms.values(),'peer').rooms[0].canJoin).toBe(false);
 a.join('g','new',2);a.join('g','last',3);await a.command('g','host',{type:'start',expectedVersion:5,requestId:'start-1234'});
 await expect(a.removePlayer('g','host',{...input,requestId:'remove-5678',expectedVersion:6,target:'new'})).rejects.toThrow('开始对局前');
 const restored=new Authority();const replay=await restored.restore(a.exportState(room));expect(replay.version).toBe(6);expect(replay.seats).toEqual(['host','other','new','last']);expect(replay.removedPlayers).toEqual(['peer']);expect(restored.currentState(replay)).toEqual(a.currentState(room));
});
test('waiting removal survives restart before the next join and persistence failure blocks the mutation',async()=>{
 const a=new Authority();a.create('g','go','host');a.join('g','peer',1);await a.removePlayer('g','host',{requestId:'remove-1234',expectedVersion:1,target:'peer'});
 const restored=new Authority();await restored.restore(a.exportState(a.rooms.get('g')));expect(()=>restored.join('g','peer',1)).toThrow('移出');restored.join('g','replacement',1);expect(restored.rooms.get('g').version).toBe(3);
 const broken=new Authority({persist:async()=>{throw Error('disk');}});broken.create('x','go','host');broken.join('x','peer',1);await expect(broken.removePlayer('x','host',{requestId:'remove-1234',expectedVersion:1,target:'peer'})).rejects.toThrow('保存失败');expect(broken.rooms.get('x').status).toBe('blocked');
});
function fixture(){
 let tick=1000;const db=new DatabaseSync(':memory:'),a=new Authority({now:()=>tick});
 a.create('history','go','host');a.join('history','peer',1);const past=a.rooms.get('history');past.status='ended';past.result={winner:0};past.names={host:'房主',peer:'棋友'};
 const user={name:'房主',avatar:null};let created=0;
 const invitations=createInvitations(db,{rooms:a.rooms,now:()=>tick,createRoom:(uid,user,kind)=>{const id='invited-'+(++created);a.create(id,kind,uid);const r=a.rooms.get(id);r.names[uid]=user.name;return r;},joinRoom:(r,uid,user)=>{a.join(r.id,uid,r.seats.length);r.names[uid]=user.name;}});
 return {a,db,user,invitations,advance:()=>{tick+=300001;}};
}
test('invites are addressed to a verified played peer, private, idempotent and accepted exactly once',async()=>{
 const f=fixture();try{
  expect(()=>f.invitations.send('host',f.user,{friendKey:friendKey('host','stranger'),kind:'go',requestId:'invite-1234'})).toThrow('一起对战');
  const input={friendKey:friendKey('host','peer'),kind:'go',requestId:'invite-1234'},sent=f.invitations.send('host',f.user,input);
  expect(f.invitations.send('host',f.user,input).id).toBe(sent.id);expect(f.invitations.send('host',f.user,{...input,requestId:'invite-5678'}).id).toBe(sent.id);
  expect(f.invitations.list('stranger').invitations).toEqual([]);expect(f.invitations.list('peer').invitations).toHaveLength(1);expect(JSON.stringify(sent)).not.toMatch(/recipient|sender|friendKey|"peer"|"host"/);
  await expect(f.invitations.respond('stranger',f.user,sent.id,'accept')).rejects.toThrow('权限');
  const [first,retry]=await Promise.all([f.invitations.respond('peer',{name:'棋友',avatar:null},sent.id,'accept'),f.invitations.respond('peer',{name:'棋友',avatar:null},sent.id,'accept')]);expect(first.status).toBe('accepted');expect(retry.status).toBe('accepted');expect(f.a.rooms.get(sent.roomId).seats).toEqual(['host','peer']);expect(f.invitations.list('peer').invitations).toHaveLength(0);
  expect(f.invitations.send('host',f.user,{...input,requestId:'invite-5678'})).toMatchObject({id:sent.id,status:'accepted'});expect(f.a.rooms.size).toBe(2);
 }finally{f.db.close();}
});
test('decline, cancellation, expiry and full-room acceptance do not silently join or corrupt rooms',async()=>{
 const f=fixture();try{
  const input={friendKey:friendKey('host','peer'),kind:'go',requestId:'invite-1234'};
  const declined=f.invitations.send('host',f.user,input);await f.invitations.respond('peer',f.user,declined.id,'decline');expect(f.a.rooms.get(declined.roomId).seats).toHaveLength(1);
  const cancelled=f.invitations.send('host',f.user,{...input,requestId:'invite-5678'});await f.invitations.respond('host',f.user,cancelled.id,'cancel');await expect(f.invitations.respond('peer',f.user,cancelled.id,'accept')).rejects.toThrow('结束');
  const full=f.invitations.send('host',f.user,{...input,requestId:'invite-9999'});f.a.join(full.roomId,'other',1);await expect(f.invitations.respond('peer',f.user,full.id,'accept')).rejects.toThrow('已满');expect(f.a.rooms.get(full.roomId).status).toBe('waiting');
  f.advance();expect(f.invitations.list('peer').invitations).toHaveLength(0);await expect(f.invitations.respond('peer',f.user,full.id,'accept')).rejects.toThrow('过期');
 }finally{f.db.close();}
});
