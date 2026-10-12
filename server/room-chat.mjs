import {randomUUID} from 'node:crypto';

export function createRoomChat(db,{now=Date.now}={}) {
 db.exec('CREATE TABLE IF NOT EXISTS room_messages(room TEXT NOT NULL, uid TEXT NOT NULL, message_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(room,uid,message_id)); CREATE INDEX IF NOT EXISTS room_messages_time ON room_messages(room,created_at);');
 const history=db.prepare('SELECT * FROM room_messages WHERE room=? ORDER BY created_at DESC,rowid DESC LIMIT 50');
 const find=db.prepare('SELECT * FROM room_messages WHERE room=? AND uid=? AND message_id=?');
 const insert=db.prepare('INSERT INTO room_messages(room,uid,message_id,content,created_at) VALUES(?,?,?,?,?)');
 const prune=db.prepare('DELETE FROM room_messages WHERE room=? AND rowid NOT IN (SELECT rowid FROM room_messages WHERE room=? ORDER BY created_at DESC,rowid DESC LIMIT 500)');
 const rates=new Map();
 const fail=(message,status)=>{const error=new Error(message);error.status=status;error.chatError=true;throw error;};
 const member=(room,uid)=>{if(!room.seats.includes(uid))fail('只有房间成员可以聊天',403);};
 const view=(room,row)=>({id:row.message_id,seat:room.seats.indexOf(row.uid),nickname:room.names[row.uid]||'Nobi 玩家',avatar:room.avatars[row.uid]??null,text:row.content,sentAt:new Date(row.created_at).toISOString()});
 return {
  list(room,uid){member(room,uid);return {messages:history.all(room.id).reverse().map(row=>view(room,row)),limit:50};},
  send(room,uid,input){
   member(room,uid);
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['messageId','text'].includes(key)))fail('消息格式不正确',400);
   const id=input.messageId??randomUUID();
   if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))fail('消息标识不正确',400);
   if(typeof input.text!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.text))fail('消息包含无效字符',400);
   const text=input.text.trim();
   if(!text||Array.from(text).length>200)fail('请输入 1 到 200 个字的消息',400);
   const existing=find.get(room.id,uid,id);
   if(existing){if(existing.content!==text)fail('消息已发送，请刷新后重试',409);return {message:view(room,existing),duplicate:true};}
   const key=room.id+':'+uid,time=now();
   if(rates.has(key)&&time-rates.get(key)<800)fail('消息发送太快，请稍候',429);
   const row={room:room.id,uid,message_id:id,content:text,created_at:time};
   db.exec('BEGIN');
   try{insert.run(room.id,uid,id,text,time);prune.run(room.id,room.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
   if(rates.size>10000)rates.clear();rates.set(key,time);
   return {message:view(room,row),duplicate:false};
  }
 };
}
