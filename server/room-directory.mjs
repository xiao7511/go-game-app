// Never serialize engines, journals, participant IDs or private hands into the directory.
export function roomDirectory(rooms,uid,params=new URLSearchParams()) {
 const kind=params.get('kind'),status=params.get('status'),offset=Math.max(0,Math.min(100000,Math.floor(Number(params.get('offset'))||0)));
 if(status&&!['waiting','playing'].includes(status))throw Object.assign(Error('房间状态不正确'),{status:400,chatError:true});
 const rows=[...rooms].filter(r=>['waiting','playing'].includes(r.status)&&(!kind||r.kind===kind)&&(!status||r.status===status)).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
 return {total:rows.length,offset,hasNext:offset+50<rows.length,rooms:rows.slice(offset,offset+50).map(r=>{
  const capacity=r.kind==='go'?2:4,member=r.seats.includes(uid);
  return {id:r.id,kind:r.kind,status:r.status,host:r.names[r.owner]||'Nobi 玩家',avatar:r.avatars?.[r.owner]??null,players:r.seats.length,capacity,updatedAt:new Date(r.updatedAt).toISOString(),member,canJoin:member||(r.status==='waiting'&&r.seats.length<capacity&&!r.removedPlayers?.includes(uid))};
 })};
}
