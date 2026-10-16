import {randomUUID} from 'node:crypto';
import {friendKey} from './account-summary.mjs';
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status,chatError:true});};
export function createInvitations(db,{rooms,createRoom,joinRoom,changed=()=>{},now=Date.now}) {
 db.exec('CREATE TABLE IF NOT EXISTS game_invitations(id TEXT PRIMARY KEY,sender TEXT NOT NULL,recipient TEXT NOT NULL,request_id TEXT NOT NULL,room_id TEXT NOT NULL,kind TEXT NOT NULL,sender_name TEXT NOT NULL,sender_avatar TEXT,recipient_name TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL,UNIQUE(sender,request_id)); CREATE INDEX IF NOT EXISTS invitations_recipient ON game_invitations(recipient,status,expires_at);');
 db.exec('CREATE TABLE IF NOT EXISTS invitation_requests(sender TEXT NOT NULL,request_id TEXT NOT NULL,invitation_id TEXT NOT NULL,PRIMARY KEY(sender,request_id));');
 const publicRow=(row,uid)=>({id:row.id,roomId:row.room_id,kind:row.kind,fromName:row.sender_name,fromAvatar:row.sender_avatar,toName:row.recipient_name,direction:row.sender===uid?'sent':'received',status:row.status,expiresAt:new Date(row.expires_at).toISOString()});
 function expire(uid){db.prepare("UPDATE game_invitations SET status='expired' WHERE status='pending' AND expires_at<=?").run(now());const pending=db.prepare("SELECT * FROM game_invitations WHERE status='pending' AND (sender=? OR recipient=?)").all(uid,uid);for(const row of pending){const room=rooms.get(row.room_id);if(!room||room.status!=='waiting'||room.removedPlayers?.includes(row.recipient))db.prepare("UPDATE game_invitations SET status='expired' WHERE id=?").run(row.id);}}
 function list(uid){expire(uid);return {invitations:db.prepare("SELECT * FROM game_invitations WHERE (recipient=? AND status='pending') OR (sender=? AND created_at>?) ORDER BY created_at DESC LIMIT 50").all(uid,uid,now()-86400000).map(row=>publicRow(row,uid))};}
 function send(uid,user,input){
  if(!/^[a-f0-9]{64}$/.test(input?.friendKey??'')||!['go','guandan','xiangqi'].includes(input?.kind)||!/^[a-zA-Z0-9_-]{8,80}$/.test(input?.requestId??''))fail('邀请参数不正确',400);
  expire(uid);const replay=db.prepare('SELECT * FROM game_invitations WHERE sender=? AND request_id=? UNION SELECT i.* FROM invitation_requests r JOIN game_invitations i ON i.id=r.invitation_id WHERE r.sender=? AND r.request_id=? LIMIT 1').get(uid,input.requestId,uid,input.requestId);
  if(replay){if(replay.kind!==input.kind||friendKey(uid,replay.recipient)!==input.friendKey)fail('邀请请求编号已被使用');return publicRow(replay,uid);}
  let peer;
  for(const room of [...rooms.values()].sort((a,b)=>b.updatedAt-a.updatedAt)){
   if(!room.seats.includes(uid)||!(room.status==='playing'||room.status==='ended'&&room.result))continue;
   const id=room.seats.find(id=>id!==uid&&friendKey(uid,id)===input.friendKey);
   if(id){peer={id,name:room.names[id]||'Nobi 玩家'};break;}
  }
  if(!peer)fail('只能邀请已经一起对战过的玩家',403);
  const duplicate=db.prepare("SELECT * FROM game_invitations WHERE sender=? AND recipient=? AND kind=? AND status='pending'").get(uid,peer.id,input.kind);
  if(duplicate){db.prepare('INSERT INTO invitation_requests VALUES(?,?,?)').run(uid,input.requestId,duplicate.id);return publicRow(duplicate,uid);}
  if(db.prepare("SELECT count(*) AS n FROM game_invitations WHERE sender=? AND status='pending'").get(uid).n>=10)fail('待处理邀请过多，请等待好友回复',429);
  const capacity=input.kind==='guandan'?4:2;
  let room=[...rooms.values()].filter(r=>r.owner===uid&&r.kind===input.kind&&r.status==='waiting'&&(r.seats.includes(peer.id)||r.seats.length<capacity)&&!r.removedPlayers?.includes(peer.id)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  const created=!room;db.exec('BEGIN');
  try {
   if(!room)room=createRoom(uid,user,input.kind);
   const id=randomUUID(),status=room.seats.includes(peer.id)?'accepted':'pending';
   db.prepare('INSERT INTO game_invitations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,uid,peer.id,input.requestId,room.id,input.kind,user.name,user.avatar,peer.name,now(),now()+300000,status);
   db.exec('COMMIT');return publicRow(db.prepare('SELECT * FROM game_invitations WHERE id=?').get(id),uid);
  }catch(error){db.exec('ROLLBACK');if(created&&room)rooms.delete(room.id);throw error;}
 }
 async function respond(uid,user,id,action){
  if(!['accept','decline','cancel'].includes(action))fail('邀请操作不正确',400);
  expire(uid);let row=db.prepare('SELECT * FROM game_invitations WHERE id=?').get(id);
  if(!row||(action==='cancel'?row.sender!==uid:row.recipient!==uid))fail('没有此邀请的操作权限',403);
  if(row.status==='accepted'&&action==='accept')return publicRow(row,uid);
  const desired=action==='decline'?'declined':action==='cancel'?'cancelled':'accepted';
  if(row.status===desired)return publicRow(row,uid);
  if(row.status!=='pending')fail('邀请已结束或过期，请重新邀请');
  if(action!=='accept'){db.prepare('UPDATE game_invitations SET status=? WHERE id=?').run(desired,id);return publicRow({...row,status:desired},uid);}
  const room=rooms.get(row.room_id);if(!room)fail('邀请房间已不存在');
  const task=room.queue.then(()=>{
   row=db.prepare('SELECT * FROM game_invitations WHERE id=?').get(id);
   if(row.status==='accepted')return publicRow(row,uid);
   if(row.status!=='pending'||row.expires_at<=now()||room.status!=='waiting'||room.owner!==row.sender)fail('邀请已过期或对局已开始');
   if(room.removedPlayers?.includes(uid))fail('房主已将你移出此房间',403);
   if(!room.seats.includes(uid)&&room.seats.length>=(room.kind==='guandan'?4:2))fail('房间已满，请让好友重新邀请');
   db.exec('BEGIN');
   try{joinRoom(room,uid,user);db.prepare("UPDATE game_invitations SET status='accepted' WHERE id=?").run(id);db.exec('COMMIT');}
   catch(error){db.exec('ROLLBACK');room.status='blocked';throw error;}
   changed(room);return publicRow({...row,status:'accepted'},uid);
  });room.queue=task.catch(()=>{});return task;
 }
 return {list,send,respond};
}
