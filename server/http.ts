import http from 'node:http';
import {createHash} from 'node:crypto';
import {currentSeason,seasons,isAdmin,leaderboard,personal,history,matchResult,audits,manageSeason} from './ratings.ts';
import {normalizeCommand} from './protocol.ts';
import {loadRoom,saveRoom,saveContinuation} from './persistence.ts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Authority, GameError, randomUUID } from './authority.ts';
import { localCredentials, localUrl } from '../scripts/local-supabase.mjs';
import { localSql, literal } from '../scripts/local-db.mjs';
import {accountAvatar} from './account-avatar.mjs';
import {roomDirectory} from './room-directory.mjs';
import {RULES_VERSION} from '../ui/guandan-rules.mjs';
export async function startServer(options:any={}) {
 const config=options.backend??await localCredentials();
 if(config.url!==localUrl) throw new Error('BLOCKED: authority only supports the dedicated local Supabase');
 const request=async(endpoint:string,token:string,body?:any,schema?:string)=>{
  const response=await fetch(config.url+endpoint,{method:body===undefined?'GET':'POST',headers:{apikey:config.key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(schema?{'Content-Profile':schema,'Accept-Profile':schema}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new GameError('local backend request rejected',endpoint.startsWith('/auth/')?401:409);
  const text=await response.text();return text?JSON.parse(text):null;
 };
 if(!options.backend) {
  const marker=await request('/rest/v1/rpc/nobi_isolated_fixture',config.key,{});
  if(marker!=='nobi-phase3a-local-v1') throw new Error('BLOCKED: local fixture identity mismatch');
 }
 const auth=options.authenticate??(async(token:string)=>{
  const user=await request('/auth/v1/user',token);if(!user?.id) throw new GameError('authentication required',401);return user;
 });
 const durable=!options.backend;
 const authority=new Authority({record:options.record??(async()=>{}),persist:options.persist??(async(room:any,uid:string,command:any)=>saveRoom(authority,room,uid,command)),now:options.now});
 const ensureRoom=async(id:string)=>{
  if(!durable)return authority.rooms.get(id);
  const data=loadRoom(id);if(!data)throw new GameError('room unavailable',404);
  let room=authority.rooms.get(id);
  if(data.snapshot&&(!room||room.status==='blocked'||room.storedVersion!==data.snapshot.version)) {room=await authority.restore(data.snapshot);room.storedVersion=data.snapshot.version;}
  if(!room){authority.create(id,data.kind,data.owner,null,data.kind==='guandan'?RULES_VERSION:undefined);room=authority.rooms.get(id);for(let seat=1;seat<data.seats.length;seat++)authority.join(id,data.seats[seat],seat);}
  if(room.owner!==data.owner||room.kind!==data.kind||!room.seats.every((uid:string,seat:number)=>data.seats[seat]===uid))throw new GameError('room identity integrity failure',503);
  if(room.status==='waiting'&&data.seats.length>room.seats.length){for(let seat=room.seats.length;seat<data.seats.length;seat++)authority.join(id,data.seats[seat],seat);saveRoom(authority,room);authority.onChange(room);}
  return room;
 };
 const hydration=new Map<string,Promise<any>>();
 const ensure=async(id:string)=>{if(hydration.has(id))return hydration.get(id);const task=ensureRoom(id);hydration.set(id,task);try{return await task;}finally{hydration.delete(id);}};
 const streams=new Set<any>();
 authority.onChange=(room:any)=>{
  if(durable&&room.storedVersion!==room.version)return;
  for(const stream of streams) if(stream.room===room.id) stream.response.write(`event: state\ndata: ${JSON.stringify(authority.view(room,stream.uid))}\n\n`);
 };
 const server=http.createServer(async(req,res)=>{
  try {
   const origin=req.headers.origin;
   if(origin){const allowed=['capacitor://localhost','http://localhost','https://localhost',...[5178,4173,4174,4175,5189].flatMap(port=>['127.0.0.1','localhost'].map(host=>'http://'+host+':'+port))];if(!allowed.includes(origin))throw new GameError('origin denied',403);res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end();return;}
   const url=new URL(req.url??'/', 'http://127.0.0.1');
   if(req.method==='GET'&&url.pathname==='/health') {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({service:'nobi-local-authority-v1',ranked:false,localCompetitiveOptIn:durable}));return;}
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];if(!token) throw new GameError('authentication required',401);
   const identity=await auth(token),uid=typeof identity==='string'?identity:identity.id,nickname=(typeof identity?.user_metadata?.nickname==='string'?identity.user_metadata.nickname:'Nobi 玩家').slice(0,128);
   const avatar=accountAvatar(identity);
   let body:any={};
   if(req.method==='POST') {
    let size=0;const chunks=[];
    for await(const chunk of req) {size+=chunk.length;if(size>16384) throw new GameError('body too large',413);chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new GameError('invalid JSON',400);}
   }
   let result:any;
   if(url.pathname.startsWith('/admin/')||['/leaderboards','/me/ratings','/me/history','/seasons'].includes(url.pathname)||url.pathname.startsWith('/results/')){
    if(!durable)throw new GameError('isolated competitive storage required',503);
    const admin=url.pathname.startsWith('/admin/');if(admin&&!isAdmin(uid))throw new GameError('administrator required',403);
    if(req.method==='GET'&&url.pathname==='/leaderboards')result=leaderboard(uid,url.searchParams);
    else if(req.method==='GET'&&url.pathname==='/me/ratings')result=personal(uid,url.searchParams);
    else if(req.method==='GET'&&url.pathname==='/me/history')result=history(uid,url.searchParams);
    else if(req.method==='GET'&&['/seasons','/admin/seasons'].includes(url.pathname))result=seasons();
    else if(req.method==='POST'&&url.pathname==='/admin/seasons')result=manageSeason(body);
    else if(req.method==='GET'&&url.pathname==='/admin/settlements')result=audits();
    else if(req.method==='GET'&&url.pathname==='/admin/history')result=history((await import('./ratings.ts')).uuid(url.searchParams.get('userId')),url.searchParams);
    else if(req.method==='GET'&&url.pathname.startsWith('/admin/results/'))result=matchResult(uid,url.pathname.slice(15),true);
    else if(req.method==='GET'&&url.pathname.startsWith('/results/'))result=matchResult(uid,url.pathname.slice(9));
    else throw new GameError('route unavailable',404);
   } else if(req.method==='GET'&&url.pathname==='/rooms') {
    if(durable){const ids=JSON.parse(localSql("select coalesce(json_agg(id),'[]'::json) from game.rooms;")||'[]');for(const id of ids)await ensure(id);}
    result=roomDirectory(authority.rooms.values(),uid,url.searchParams);
   } else if(req.method==='POST'&&url.pathname==='/rooms') {
    if(!['go','guandan'].includes(body.kind)) throw new GameError('invalid game',400);
    if(body.competitive!==undefined&&typeof body.competitive!=='boolean')throw new GameError('invalid competitive mode',400);
    if(body.competitive&&identity?.is_anonymous)throw new GameError('registered identity required',403);
    const competition=body.competitive&&durable?currentSeason():null;if(body.competitive&&!competition)throw new GameError('no active isolated test season',409);
    const id=options.createRoom?await options.createRoom(body.kind,uid):await request('/rest/v1/rpc/create_room',token,{game_kind:body.kind},'game');
    // The existing isolated rating schema is locked to its historical rules profile.
    authority.create(id,body.kind,uid,competition,body.kind==='guandan'?RULES_VERSION:undefined);const created=authority.rooms.get(id);created.names[uid]=nickname;created.avatars[uid]=avatar;result=authority.view(created,uid);if(durable)saveRoom(authority,authority.rooms.get(id));
   } else {
    const route=/^\/rooms\/([0-9a-f-]{36})(?:\/(join|commands|events|continue))?$/.exec(url.pathname);
    if(!route) throw new GameError('route unavailable',404);
    const [,id,action]=route;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new GameError('invalid room identifier',400);await ensure(id);if(authority.rooms.get(id)?.competitive&&identity?.is_anonymous)throw new GameError('registered identity required',403);await authority.sweep();
    if(req.method==='POST'&&action==='continue'){
     if(!durable)throw new GameError('isolated persistence required',503);
     const previous=authority.room(id,uid);const hash=createHash('sha256').update('nobi-continuation:'+id).digest('hex'),nextId=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);
     if(loadRoom(nextId)){await ensure(nextId);result=authority.view(authority.rooms.get(nextId),uid);}
     else{if(previous.owner!==uid)throw new GameError('owner must begin next round',403);if(previous.competitive&&currentSeason()?.seasonId!==previous.competitive.seasonId)throw new GameError('test season is not active',409);const next=authority.continuation(previous,nextId);try{saveContinuation(authority,previous,next);}catch{authority.rooms.delete(nextId);throw new GameError('continuation transaction failed',503);}result=authority.view(next,uid);}
    }else if(req.method==='POST'&&action==='join') {
     const room=authority.rooms.get(id);if(!room) throw new GameError('room unavailable',404);
     const task=room.queue.then(async()=>{
      const seat=options.joinRoom?await options.joinRoom(id,uid,room):await request('/rest/v1/rpc/join_room',token,{target:id},'game');
      room.names[uid]??=nickname;room.avatars[uid]=avatar;const snapshot=authority.join(id,uid,seat);if(durable){saveRoom(authority,room);authority.onChange(room);}return snapshot;
     });room.queue=task.catch(()=>{});result=await task;
    } else if(req.method==='GET'&&action==='events') {
     const snapshot=authority.touch(id,uid);
     if(streams.size>=128) throw new GameError('stream limit',429);
     res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
     res.write(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`);
     const stream={room:id,uid,response:res};streams.add(stream);
     // Auth is checked again on every command/reconnect; streams expire within one minute.
     const expiry=setTimeout(()=>res.end(),60000);expiry.unref();
     res.on('close',()=>{streams.delete(stream);clearTimeout(expiry);});return;
    } else if(req.method==='GET'&&!action) result=authority.touch(id,uid);
    else if(req.method==='POST'&&action==='commands') {let command;try{command=normalizeCommand(id,body);}catch{throw new GameError('invalid command envelope',400);}if(command?.type==='start'&&authority.rooms.get(id)?.competitive&&currentSeason()?.seasonId!==authority.rooms.get(id).competitive.seasonId)throw new GameError('test season is not active',409);if(command?.type==='server-timeout')throw new GameError('server operation denied',403);result=await authority.command(id,uid,command);}
    else throw new GameError('route unavailable',404);
   }
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
  } catch(error) {
   const known=error instanceof GameError;res.writeHead(known?error.status:500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:known?error.message:'internal local service failure',...(known&&'latestVersion' in error?{latestVersion:(error as any).latestVersion}:{})}));
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 const timer=setInterval(()=>authority.sweep().catch(()=>{}),1000);timer.unref();
 await new Promise<void>(resolve=>server.listen(options.port??55430,'127.0.0.1',resolve));
 const address=server.address() as any;
 return {authority,url:`http://127.0.0.1:${address.port}`,close:async()=>{clearInterval(timer);for(const stream of streams) stream.response.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const running=await startServer();console.log(`PASS: local authority listening at ${running.url}; competitive settlement is local opt-in only`);
 for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await running.close();process.exit();});
}
