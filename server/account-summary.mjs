// Only the authenticated participant's completed games; no hands or Auth identifiers.
export function accountSummary(rooms,uid,kind){
 if(kind&&!['go','guandan'].includes(kind))throw Object.assign(Error('游戏类型不正确'),{status:400,chatError:true});
 const completed=[...rooms].filter(r=>r.seats.includes(uid)&&r.status==='ended'&&r.result&&(!kind||r.kind===kind)).sort((a,b)=>b.updatedAt-a.updatedAt);
 const rows=completed.map(r=>{const seat=r.seats.indexOf(uid),team=r.kind==='go'?seat:seat%2,winner=r.result.winner;return {id:r.id,kind:r.kind,ended_at:new Date(r.updatedAt).toISOString(),ranked:!!r.result.ranked,outcome:winner===null||winner===undefined?'unjudged':winner===team?'win':'loss',reason:r.result.reason,players:r.seats.map(id=>r.names[id]||'Nobi 玩家')};});
 const wins=rows.filter(r=>r.outcome==='win').length,losses=rows.filter(r=>r.outcome==='loss').length;
 return {rows:rows.slice(0,50),summary:{games:rows.length,wins,losses,unjudged:rows.length-wins-losses,winRate:wins+losses?Math.round(wins/(wins+losses)*100):null,ranked:false}};
}
