// USB-only authority: online Auth verifies identity; rooms live only on this computer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Authority,GameError,randomUUID} from './authority.ts';
import {normalizeCommand} from './protocol.ts';
import {onlinePublicConfig} from '../scripts/online-public-config.mjs';
import {accountAvatar} from './account-avatar.mjs';
import {roomDirectory} from './room-directory.mjs';
import {createRoomChat} from './room-chat.mjs';
import {accountSummary} from './account-summary.mjs';
import {createInvitations} from './game-invitations.mjs';
import {RULES_VERSION} from '../ui/guandan-rules.mjs';

export function onlineAuthenticator(config,request=fetch) {
 const url=new URL(config.SUPABASE_URL);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('HTTPS Auth endpoint required');
 return async token=>{
  const response=await request(new URL(url.pathname.replace(/\/$/,'')+'/auth/v1/user',url),{
   headers:{apikey:config.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new GameError('登录已失效，请重新登录',401);
  const user=await response.json();
  if(!user?.id||user.is_anonymous)throw new GameError('请使用已注册账号登录',401);
  return user;
 };
}

export async function startDeviceServer({authenticate,database,port=55440,now,host='127.0.0.1',origins=[],production=false}={}) {
 if(typeof authenticate!=='function')throw new Error('Verified Auth required');
 const db=new DatabaseSync(database??'.nobi-isolated/mobile-device/rooms.sqlite');
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS continuations(previous TEXT PRIMARY KEY,next TEXT NOT NULL);');
 const store=db.prepare('INSERT INTO rooms(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state');
 const authority=new Authority({now,persist:async room=>save(room)});
 const chat=createRoomChat(db,{now});
 const save=room=>{try{return store.run(room.id,JSON.stringify(authority.exportState(room)));}catch(error){room.status='blocked';throw error;}};
 for(const row of db.prepare('SELECT state FROM rooms').all())await authority.restore(JSON.parse(row.state));
 const streams=new Set();
 authority.onChange=room=>{for(const stream of streams)if(stream.room===room.id){if(!room.seats.includes(stream.uid)){stream.response.write('event: removed\ndata: {"message":"房主已将你移出房间"}\n\n');stream.response.end();}else stream.response.write('event: state\ndata: '+JSON.stringify(authority.view(room,stream.uid))+'\n\n');}};
 // Joining changes only a waiting room. Publish after its snapshot has reached SQLite.
 const publish=authority.onChange;
 authority.onChange=room=>{save(room);publish(room);};
 const invitations=createInvitations(db,{rooms:authority.rooms,createRoom:(uid,user,kind)=>{
  if([...authority.rooms.values()].filter(r=>r.owner===uid&&r.status==='waiting').length>=10)throw new GameError('请先使用已有等待房间',429);
  const id=randomUUID();authority.create(id,kind,uid);const room=authority.rooms.get(id);room.names[uid]=user.name;room.avatars[uid]=user.avatar;try{save(room);return room;}catch(error){authority.rooms.delete(id);throw error;}
 },joinRoom:(room,uid,user)=>{const notify=authority.onChange;authority.onChange=()=>{};try{authority.join(room.id,uid,room.seats.length);room.names[uid]=user.name;room.avatars[uid]=user.avatar;save(room);}finally{authority.onChange=notify;}},changed:publish,now:now??Date.now});
 const allowed=new Set(['capacitor://localhost','http://localhost','https://localhost',...[5178,4173,4174,4175,5189].flatMap(port=>['127.0.0.1','localhost'].map(host=>'http://'+host+':'+port))]);
 for(const origin of origins)allowed.add(origin);
 const rates=new Map();
 const server=http.createServer(async(req,res)=>{
  try {
   res.setHeader('X-Content-Type-Options','nosniff');
   if(req.headers.origin){if(!allowed.has(req.headers.origin))throw new GameError('origin denied',403);res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end();return;}
   const url=new URL(req.url??'/','http://127.0.0.1');
   if(req.method==='GET'&&url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({service:production?'nobi-online-authority-v1':'nobi-device-authority-v1',ranked:false,persistent:true,transport:production?'https':'usb',capabilities:['room-chat']}));return;}
   if(production){const key=req.socket.remoteAddress,tick=Math.floor(Date.now()/60000);if(rates.size>10000)rates.clear();const count=rates.get(key);const next=count?.tick===tick?{tick,count:count.count+1}:{tick,count:1};rates.set(key,next);if(next.count>1200)throw new GameError('请求过于频繁，请稍后重试',429);}
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
   if(!token)throw new GameError('请先登录',401);
   const user=await authenticate(token),uid=user.id;
   if(typeof uid!=='string'||!uid)throw new GameError('authentication required',401);
   let body={};
   if(req.method==='POST'){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new GameError('body too large',413);chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new GameError('invalid JSON',400);}}
   const name=String(user.user_metadata?.nickname||user.user_metadata?.full_name||'Nobi 玩家').slice(0,128);
   const avatar=accountAvatar(user);
   const identity=room=>{room.names[uid]=name;room.avatars[uid]=avatar;};
   let result;
   if(req.method==='GET'&&url.pathname==='/me/summary')result=accountSummary(authority.rooms.values(),uid,url.searchParams.get('game'));
   else if(req.method==='GET'&&url.pathname==='/me/invitations')result=invitations.list(uid);
   else if(req.method==='POST'&&url.pathname==='/invitations')result=invitations.send(uid,{name,avatar},body);
   else if(req.method==='POST'&&/^\/invitations\/[a-f0-9-]{36}\/(accept|decline|cancel)$/.test(url.pathname)){const parts=url.pathname.split('/');result=await invitations.respond(uid,{name,avatar},parts[2],parts[3]);}
   else if(req.method==='GET'&&url.pathname==='/rooms')result=roomDirectory(authority.rooms.values(),uid,url.searchParams);
   else if(req.method==='POST'&&url.pathname==='/rooms'){
    if(body.competitive)throw new GameError('电脑联机测试暂不计入线上积分',400);
    if([...authority.rooms.values()].filter(r=>r.owner===uid&&r.status==='waiting').length>=10)throw new GameError('请先使用已创建的房间（最多 10 个等待房间）',429);
    const id=randomUUID();authority.create(id,body.kind,uid,null,body.kind==='guandan'?(body.rulesVersion??RULES_VERSION):undefined);const room=authority.rooms.get(id);identity(room);save(room);result=authority.view(room,uid);
   }else{
    const route=/^\/rooms\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(join|kick|commands|events|continue|chat))?$/.exec(url.pathname);
    if(!route)throw new GameError('route unavailable',404);
    const [,id,action]=route;
    let room=authority.rooms.get(id);
    if(!room)throw new GameError('房间不存在，请检查房间号',404);
    if(room.status==='blocked'){const row=db.prepare('SELECT state FROM rooms WHERE id=?').get(id);room=await authority.restore(JSON.parse(row.state));}
    if(room.seats.includes(uid)&&(room.names[uid]!==name||room.avatars[uid]!==avatar)){identity(room);authority.onChange(room);}
    if(req.method==='GET'&&action==='chat')result=chat.list(room,uid);
    else if(req.method==='POST'&&action==='chat'){
     const task=room.queue.then(()=>{
      const sent=chat.send(room,uid,body);
      if(!sent.duplicate)for(const stream of streams)if(stream.room===room.id&&room.seats.includes(stream.uid))stream.response.write('event: chat\ndata: '+JSON.stringify(sent.message)+'\n\n');
      return sent;
     });room.queue=task.catch(()=>{});result=await task;
    }else if(req.method==='POST'&&action==='kick'){
     const task=room.queue.then(()=>authority.removePlayer(id,uid,body));room.queue=task.catch(()=>{});result=await task;
    }else if(req.method==='POST'&&action==='join'){
     const task=room.queue.then(()=>{authority.join(id,uid,room.seats.includes(uid)?room.seats.indexOf(uid):room.seats.length);identity(room);save(room);publish(room);return authority.view(room,uid);});room.queue=task.catch(()=>{});result=await task;
    }else if(req.method==='GET'&&action==='events'){
     const snapshot=authority.touch(id,uid);if(streams.size>=128)throw new GameError('stream limit',429);
     res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write('event: state\ndata: '+JSON.stringify(snapshot)+'\n\n');
     const stream={room:id,uid,response:res};streams.add(stream);
     const expiry=setTimeout(()=>res.end(),45000),heartbeat=setInterval(()=>res.write(': keepalive\n\n'),10000);expiry.unref();heartbeat.unref();
     res.on('close',()=>{streams.delete(stream);clearTimeout(expiry);clearInterval(heartbeat);});return;
    }else if(req.method==='GET'&&!action)result=authority.touch(id,uid);
    else if(req.method==='POST'&&action==='commands'){
     let command;try{command=normalizeCommand(id,body);}catch{throw new GameError('invalid command envelope',400);}
     if(command.type==='server-timeout')throw new GameError('server operation denied',403);
     result=await authority.command(id,uid,command);
    }else if(req.method==='POST'&&action==='continue'){
     const previous=authority.room(id,uid);if(previous.owner!==uid)throw new GameError('房主才能进入下一副',403);
     const task=previous.queue.then(()=>{
      const existing=db.prepare('SELECT next FROM continuations WHERE previous=?').get(id);
      if(existing)return authority.view(authority.rooms.get(existing.next),uid);
      const next=authority.continuation(previous,randomUUID());
      try{db.exec('BEGIN');save(next);db.prepare('INSERT INTO continuations(previous,next) VALUES(?,?)').run(id,next.id);db.exec('COMMIT');}
      catch(error){db.exec('ROLLBACK');authority.rooms.delete(next.id);throw error;}
      return authority.view(next,uid);
     });previous.queue=task.catch(()=>{});result=await task;
    }else throw new GameError('route unavailable',404);
   }
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
  }catch(error){if(res.headersSent){res.end();return;}const known=error instanceof GameError||error.chatError;res.writeHead(known?error.status:503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:known?error.message:'联机服务暂不可用',...(known&&error.latestVersion!==undefined?{latestVersion:error.latestVersion}:{})}));}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 const timer=setInterval(()=>authority.sweep().catch(()=>{}),1000);timer.unref();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return {authority,url:'http://127.0.0.1:'+server.address().port,close:async()=>{clearInterval(timer);for(const stream of streams)stream.response.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const host=fs.readFileSync('CNAME','utf8').trim();const config=await onlinePublicConfig('https://'+host);
 fs.mkdirSync('.nobi-isolated/mobile-device',{recursive:true});
 const running=await startDeviceServer({authenticate:onlineAuthenticator(config)});
 console.log('Device authority ready at '+running.url+'; online Auth identity only, local unranked room storage.');
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await running.close();process.exit();});
}
