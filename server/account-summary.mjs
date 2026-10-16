import {createHash} from 'node:crypto';
// Viewer-scoped address for invitations; never expose an Auth identifier in a friend list.
export const friendKey=(viewer,peer)=>createHash('sha256').update('nobi-friend:'+viewer+':'+peer).digest('hex');
// Only the authenticated participant's games and played companions; no hands or Auth identifiers.
export function accountSummary(rooms,uid,kind){
 if(kind&&!['go','guandan','xiangqi'].includes(kind))throw Object.assign(Error('游戏类型不正确'),{status:400,chatError:true});
 const participated=[...rooms].filter(r=>r.seats.includes(uid)&&(!kind||r.kind===kind)).sort((a,b)=>b.updatedAt-a.updatedAt);
 const completed=participated.filter(r=>r.status==='ended'&&r.result);
 const rows=completed.map(r=>{const seat=r.seats.indexOf(uid),team=r.kind==='go'?seat:seat%2,winner=r.result.winner;return {id:r.id,kind:r.kind,ended_at:new Date(r.updatedAt).toISOString(),ranked:!!r.result.ranked,outcome:winner===null&&r.kind==='xiangqi'?'draw':winner===null||winner===undefined?'unjudged':winner===team?'win':'loss',reason:r.result.reason,players:r.seats.map(id=>r.names[id]||'Nobi 玩家')};});
 const wins=rows.filter(r=>r.outcome==='win').length,losses=rows.filter(r=>r.outcome==='loss').length;
 // Deduplicate by verified identity, not nickname; waiting seats have not played together.
 // Only return public portraits/names to this participant, never Auth IDs or private state.
 const friends=new Map();
 for(const room of participated.filter(r=>r.status==='playing'||(r.status==='ended'&&r.result))) {
  for(const id of new Set(room.seats)) {
   if(id===uid)continue;
   let friend=friends.get(id);
   if(!friend){friend={friendKey:friendKey(uid,id),nickname:room.names[id]||'Nobi 玩家',avatar:room.avatars?.[id]??null,games:0,kinds:[],lastPlayedAt:new Date(room.updatedAt).toISOString()};friends.set(id,friend);}
   friend.games++;if(!friend.kinds.includes(room.kind))friend.kinds.push(room.kind);
  }
 }
 return {rows:rows.slice(0,50),friends:[...friends.values()],summary:{games:rows.length,wins,losses,draws:rows.filter(r=>r.outcome==='draw').length,unjudged:rows.filter(r=>r.outcome==='unjudged').length,winRate:wins+losses?Math.round(wins/(wins+losses)*100):null,ranked:false}};
}
