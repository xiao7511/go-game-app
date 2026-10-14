import {test,expect} from '../../tooling/node_modules/vitest/dist/index.js';
import {accountSummary,friendKey} from '../../server/account-summary.mjs';
import {roomDirectory} from '../../server/room-directory.mjs';
import {sandbox,load} from './legacy-harness.mjs';

const room=(id,seats,status='ended',kind='go',updatedAt=1000)=>({id,kind,status,seats,owner:seats[0],updatedAt,names:Object.fromEntries(seats.map(uid=>[uid,uid==='self'?'自己':'同名玩家'])),avatars:{},result:status==='ended'?{winner:0}:null,engine:{hand:'SECRET'},journal:['SECRET']});
test('played friends deduplicate by account across games, include teammates, and keep latest portraits',()=>{
 const older=room('old',['self','peer']),latest=room('new',['self','other','peer','partner'],'playing','guandan',3000);
 latest.names.peer='新昵称';latest.avatars.peer='ui/avatar-presets/2.svg';
 const result=accountSummary([older,latest,room('waiting',['self','unplayed'],'waiting'),room('private',['stranger','private-id'])],'self');
 expect(result.friends).toHaveLength(3);
 expect(result.friends.find(p=>p.nickname==='新昵称')).toEqual({friendKey:friendKey('self','peer'),nickname:'新昵称',avatar:'ui/avatar-presets/2.svg',games:2,kinds:['guandan','go'],lastPlayedAt:new Date(3000).toISOString()});
 expect(result.friends.filter(p=>p.nickname==='同名玩家')).toHaveLength(2);
 expect(JSON.stringify(result)).not.toMatch(/SECRET|private-id|unplayed|"self"|"peer"|journal|engine|seats/);
 expect(accountSummary([older,latest],'self','go').friends).toHaveLength(1);
 expect(accountSummary([latest],'stranger').friends).toEqual([]);
});
test('friends use all played history rather than only the latest fifty matches',()=>{
 const rooms=Array.from({length:60},(_,i)=>{const r=room(String(i),['self','player-'+i],'ended','go',i);r.names['player-'+i]='棋手'+i;return r;});
 const result=accountSummary(rooms,'self');expect(result.rows).toHaveLength(50);expect(result.friends).toHaveLength(60);expect(result.friends[0].nickname).toBe('棋手59');
});
test('playing directory filters before pagination and totals; finished rooms cannot be requested',()=>{
 const rooms=Array.from({length:120},(_,i)=>room(String(i),['self','peer'],i%2?'playing':'waiting','go',i));
 const first=roomDirectory(rooms,'self',new URLSearchParams('status=playing'));expect(first.total).toBe(60);expect(first.rooms).toHaveLength(50);expect(first.hasNext).toBe(true);expect(first.rooms.every(r=>r.status==='playing'&&r.member)).toBe(true);
 const next=roomDirectory(rooms,'visitor',new URLSearchParams('status=playing&offset=50'));expect(next.rooms).toHaveLength(10);expect(next.rooms.every(r=>!r.member&&!r.canJoin)).toBe(true);
 expect(()=>roomDirectory(rooms,'self',new URLSearchParams('status=ended'))).toThrow('房间状态');
});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('room directory drops late responses after account changes and clears on logout',async()=>{
 let identity='alice';const requests=[];
 const context=sandbox({document:{hidden:false,body:{classList:{contains:()=>false}},addEventListener(){}},NOBI_ONLINE_CONFIG:{url:'https://example.test'},NobiRequestTimeout:()=>undefined,NobiServices:{requireClient:async()=>({auth:{getSession:async()=>({data:{session:{user:{id:identity},access_token:'fixture'}}})}})},fetch:async()=>new Promise(resolve=>requests.push(resolve))});
 load('ui/lobby-rooms.js',context);const api=context.NobiLobbyRooms;api.setVisible(true);api.setUser({id:'alice'});await flush();identity='bob';api.setUser({id:'bob'});await flush();
 requests[1]({ok:true,json:async()=>({total:1,rooms:[{id:'bob-room',kind:'go',status:'playing'}],hasNext:false})});await flush();
 requests[0]({ok:true,json:async()=>({total:1,rooms:[{id:'alice-room',kind:'go',status:'playing'}],hasNext:false})});await flush();
 expect(api.get().owner).toBe('bob');expect(api.get().rooms[0].id).toBe('bob-room');api.setUser(null);expect(api.get().rooms).toEqual([]);expect(api.get().status).toBe('login-required');
});
test('network or Auth errors show retry state and do not masquerade as an empty room list',async()=>{
 const context=sandbox({document:{hidden:false,body:{classList:{contains:()=>false}},addEventListener(){}},NOBI_ONLINE_CONFIG:{url:'https://example.test'},NobiRequestTimeout:()=>undefined,NobiServices:{requireClient:async()=>({auth:{getSession:async()=>({error:Error('offline'),data:{}})}})},fetch:async()=>{throw Error('must not fetch');}});
 load('ui/lobby-rooms.js',context);context.NobiLobbyRooms.setVisible(true);context.NobiLobbyRooms.setUser({id:'alice'});await flush();expect(context.NobiLobbyRooms.get().status).toBe('error');
});
