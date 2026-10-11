// Never serialize engines, journals, participant IDs or private hands into the directory.
export function roomDirectory(rooms,uid,params=new URLSearchParams()) {
 const kind=params.get('kind'),offset=Math.max(0,Math.min(100000,Number(params.get('offset'))||0));
 const rows=[...rooms].filter(r=>r.status!=='blocked'&&(!kind||r.kind===kind)).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
 return {total:rows.length,offset,hasNext:offset+50<rows.length,rooms:rows.slice(offset,offset+50).map(r=>{
  const capacity=r.kind==='go'?2:4,member=r.seats.includes(uid);
  return {id:r.id,kind:r.kind,status:r.status,host:r.names[r.owner]||'Nobi 玩家',avatar:r.avatars[r.owner]??null,players:r.seats.length,capacity,updatedAt:new Date(r.updatedAt).toISOString(),member,canJoin:member||(r.status==='waiting'&&r.seats.length<capacity)};
 })};
}
