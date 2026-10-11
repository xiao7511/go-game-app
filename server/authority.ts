import { randomUUID,randomInt } from 'node:crypto';
import {competitiveConfig,guandanResult,scoreProposal} from './competitive-rules.ts';
import {canonicalJson} from './protocol.ts';
import {GuandanEngine} from './guandan-standard.ts';
import {RULES_VERSION,initialSeries,ruleConfig} from '../ui/guandan-rules.mjs';
import { rules } from './legacy-rules.ts';
export class GameError extends Error {
 status:number;
 constructor(message:string,status=409){super(message);this.status=status;}
}
const fail=(message:string,status=409):never=>{throw new GameError(message,status)};
type Kind='go'|'guandan';
type Command={requestId:string,expectedVersion:number,type:string,[key:string]:unknown};
export class Authority {
 rooms=new Map<string,any>();
 now:()=>number;
 record:(room:any,result:any)=>Promise<void>;
 persist:(room:any,uid:string,command:Command)=>Promise<void>;
 onChange:(room:any)=>void=()=>{};
 constructor(options:any={}) {this.now=options.now??Date.now;this.record=options.record??(async()=>{});this.persist=options.persist??(async()=>{});}
 create(id:string,kind:Kind,uid:string,competitive:any=null,rulesVersion:string=kind==='guandan'?RULES_VERSION:competitiveConfig.go.rules,series:any=null,configuration:any=null) {
  if(!['go','guandan'].includes(kind)) fail('invalid game',400);
  if(kind==='go'&&rulesVersion!==competitiveConfig.go.rules)fail('unsupported rules version',400);
  if(kind==='guandan'&&![RULES_VERSION,'nobi-single-hand-v1','legacy-guandan-v0'].includes(rulesVersion))fail('unsupported rules version',400);
  if(this.rooms.size>=100) fail('room capacity reached',429);
  const room={rulesVersion,initialSeries:kind==='guandan'&&rulesVersion===RULES_VERSION?structuredClone(series??{...initialSeries(),firstLeader:randomInt(4)}):null,rulesConfig:kind==='guandan'&&rulesVersion===RULES_VERSION?ruleConfig(configuration??{}):null,competitive,scoring:null,names:{},avatars:{},journal:[],deal:null,updatedAt:this.now(),lastAction:null,passCount:0,id,kind,owner:uid,seats:[uid],status:'waiting',version:0,turn:0,history:[],cache:new Map(),queue:Promise.resolve(),presence:new Map([[uid,this.now()]]),deadline:0,result:null,pending:null};
  this.rooms.set(id,room);return this.view(room,uid);
 }
 room(id:string,uid:string){const r=this.rooms.get(id);if(!r) fail('room unavailable',404);if(!r.seats.includes(uid)) fail('participant required',403);return r;}
 join(id:string,uid:string,seat:number) {
  const r=this.rooms.get(id);if(!r) fail('room unavailable',404);
  if(r.seats.includes(uid)) return this.view(r,uid);
  if(r.status!=='waiting'||seat!==r.seats.length||seat>=(r.kind==='go'?2:4)) fail('room full or seat conflict');
  r.seats.push(uid);r.presence.set(uid,this.now());r.version++;r.updatedAt=this.now();this.onChange(r);return this.view(r,uid);
 }
 view(r:any,uid:string) {
  const seat=r.seats.indexOf(uid);if(seat<0) fail('participant required',403);
  const state=r.engine?.api.state;
  const publicState=r.kind==='go'?{board:state?.board??[],blackCaptures:state?.blackCaptures??0,whiteCaptures:state?.whiteCaptures??0,moves:r.history.map((m:any)=>m.move),koPoint:r.engine?.api.getKo()??null,passCount:r.passCount,...(r.competitive?{scoring:r.scoring,rules:competitiveConfig.go}: {})}:{handCounts:state?.players.map((p:any)=>p.hand.length)??[],trick:state?.trick??null,lastPlayedTrick:state?.lastPlayedTrick??null,finishOrder:r.engine?.api.finishOrder()??[],level:r.engine instanceof GuandanEngine?r.engine.series.level:'2',...(r.rulesVersion===RULES_VERSION?{rulesVersion:r.rulesVersion,rulesConfig:r.rulesConfig,series:r.engine?.series??r.initialSeries,phase:r.engine?.state.phase??'waiting',tribute:r.engine?.publicTribute()??null}: {})};
  const protocol={rulesVersion:r.rulesVersion,matchId:r.id,roomId:r.id,gameType:r.kind,version:r.version,currentTurn:r.turn,players:r.seats.map((userId:string,seat:number)=>({userId,seat,nickname:r.names[userId]??("座位 "+(seat+1)),avatar:r.avatars?.[userId]??null})),publicState,privateState:r.kind==='guandan'?{seat,hand:state?.players[seat]?.hand??[],...(r.engine instanceof GuandanEngine?{tributeOptions:r.engine.tributeOptions(seat)}:{})}:{seat},status:r.status,lastAction:r.lastAction,updatedAt:new Date(r.updatedAt).toISOString(),deadline:r.deadline,...(r.competitive?{competitive:r.competitive}:{}),result:r.result?{matchId:r.id,gameType:r.kind,participants:r.seats,result:r.result,finishedAt:new Date(r.updatedAt).toISOString(),resultVersion:r.version,settlementStatus:r.result.ranked?'pending':'disabled'}:null};
  return structuredClone({...protocol,id:r.id,kind:r.kind,seats:r.seats,seat,status:r.status,version:r.version,turn:r.turn,result:r.result,pending:r.pending,trustedResult:protocol.result,
   ...(r.kind==='go'?{board:state?.board??[],blackCaptures:state?.blackCaptures??0,whiteCaptures:state?.whiteCaptures??0,moves:r.history.map((m:any)=>m.move),koPoint:r.engine?.api.getKo()??null}:{hand:state?.players[seat]?.hand??[],handCounts:state?.players.map((p:any)=>p.hand.length)??[],trick:state?.trick??null,finishOrder:r.engine?.api.finishOrder()??[]})});
 }
 continuation(previous:any,id:string){
  if(previous.kind!=='guandan'||previous.rulesVersion!==RULES_VERSION||previous.status!=='ended'||previous.result?.reason!=='rules-complete'||previous.result.champion!==null)fail('continuation unavailable');
  this.create(id,'guandan',previous.owner,previous.competitive,RULES_VERSION,previous.result.nextSeries,previous.rulesConfig);
  const next=this.rooms.get(id);for(let i=1;i<4;i++)this.join(id,previous.seats[i],i);next.names=structuredClone(previous.names);next.avatars=structuredClone(previous.avatars??{});return next;
 }
 touch(id:string,uid:string){const r=this.room(id,uid);r.presence.set(uid,this.now());return this.view(r,uid);}
 command(id:string,uid:string,c:Command) {
  const r=this.room(id,uid);
  const task=r.queue.then(()=>this.apply(r,uid,c));r.queue=task.catch(()=>{});return task;
 }
 async apply(r:any,uid:string,c:Command) {
  if(!c||typeof c.type!=='string'||typeof c.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(c.requestId)||!Number.isSafeInteger(c.expectedVersion)) fail('invalid command envelope',400);
  const key=uid+':'+c.requestId, body=canonicalJson(c), cached=r.cache.get(key);
  if(cached){if(cached.body!==body) fail('idempotency key reused with different operation');return cached.response;}
  if(c.expectedVersion!==r.version) {const error=new GameError('stale state version');Object.assign(error,{latestVersion:r.version});throw error;}
  if(r.cache.size>=10000) fail('operation limit reached',429);
  const seat=r.seats.indexOf(uid);
  if(c.type==='start') {
   if(r.status!=='waiting'||uid!==r.owner||r.seats.length!==(r.kind==='go'?2:4)) fail('start denied');
   r.engine=r.kind==='guandan'&&r.rulesVersion===RULES_VERSION?new GuandanEngine(r.deal??undefined,r.initialSeries,r.rulesConfig):rules(r.kind,!!r.competitive);
   if(r.kind==='guandan') {
    const hands=r.deal??(r.engine instanceof GuandanEngine?r.engine.state.players.map((p:any)=>p.hand):r.engine.GD.createNetworkDeal());r.deal=structuredClone(hands);
    if(!(r.engine instanceof GuandanEngine)&&!r.engine.GD.startNetworkGame(hands,r.seats.map((id:string)=>({uid:id,nickname:'Test player'})),0,0,()=>{},false)) fail('deal initialization failed',500);
   } else {
    Object.assign(r.engine.api.state,{board:Array.from({length:19},()=>Array(19).fill(0)),blackCaptures:0,whiteCaptures:0,koPoint:null});
   }
   r.status='playing';r.turn=r.kind==='guandan'?r.engine.api.state.currentTurn:0;
  } else {
   if(r.status!=='playing') fail('game is not active');
   if(c.type==='leave') await this.finish(r,{reason:'player-left',loser:seat,winner:r.kind==='go'?1-seat:(seat%2===0?1:0)});
   else if(c.type==='resign-request') {if(r.pending) fail('confirmation already pending');r.pending={type:'resign',seat};}
   else if(c.type==='resign-confirm') {
    if(r.pending?.type!=='resign'||r.pending.seat!==seat) fail('resignation must be confirmed by requester');
    await this.finish(r,{reason:'resignation',loser:seat,winner:r.kind==='go'?1-seat:(seat%2===0?1:0)});
   } else if(c.type==='cancel') {if(r.pending?.seat!==seat) fail('request owner required');r.pending=null;}
   else if(r.kind==='go') await this.go(r,seat,c);
   else {
    if(r.pending) fail('confirmation pending');
    if(seat!==r.turn) fail('wrong turn');
    if(!['play','pass',...(r.engine instanceof GuandanEngine?['tribute','return-tribute']:[])].includes(c.type)) fail('unsupported operation',400);
    const ids=c.cardIds;
    if(c.type==='play'&&(!Array.isArray(ids)||ids.length>27||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))) fail('invalid cards',400);
    const ok=r.engine instanceof GuandanEngine?(c.type==='play'?r.engine.play(seat,ids as string[],c.combination):c.type==='pass'?r.engine.pass(seat):((c.type==='tribute'&&r.engine.state.tribute?.phase==='give')||(c.type==='return-tribute'&&r.engine.state.tribute?.phase==='return'))&&typeof c.cardId==='string'?r.engine.tribute(seat,c.cardId):false):r.engine.GD.applyNetworkAction({type:c.type==='play'?'PLAY_CARDS':'PASS_TURN',seat,sequence:r.engine.api.state.network.sequence+1,cardIds:ids});
    if(!ok) fail('illegal guandan action');
    r.turn=r.engine.api.state.currentTurn;
    if(!r.engine.api.state.active){const order=r.engine.api.finishOrder();await this.finish(r,r.engine instanceof GuandanEngine?r.engine.result():r.competitive?guandanResult([...order,...[0,1,2,3].filter(seat=>!order.includes(seat))]):{reason:'rules-complete',winner:order[0]%2,finishOrder:order});}
   }
  }
  r.version++;r.updatedAt=this.now();r.deadline=r.scoring?0:this.now()+competitiveConfig.turnMs;r.presence.set(uid,this.now());r.lastAction={actionId:c.requestId,actionType:c.type,actor:uid,version:r.version};
  r.journal.push({uid,command:structuredClone(c),at:r.updatedAt});
  try{await this.persist(r,uid,c);}catch{r.status="blocked";fail("persistence failed; room blocked",503);}
  const response=this.view(r,uid);r.cache.set(key,{body,response});this.onChange(r);return response;
 }
 async go(r:any,seat:number,c:Command) {
  const s=r.engine.api.state;
  if(c.type.startsWith('score-')||c.type==='resume-play'){
   if(!r.competitive||!r.scoring)fail('scoring unavailable');if(r.pending)fail('confirmation pending');
   if(c.type==='resume-play'){r.scoring=null;r.passCount=0;return;}
   if(c.type==='score-dispute'){r.scoring={phase:'disputed',proposal:null,confirmed:[]};return;}
   if(c.type==='score-propose'){let proposal;try{proposal=scoreProposal(s.board,(c.dead??[]) as number[][],(c.neutral??[]) as number[][]);}catch{fail('invalid scoring proposal',400);}
    r.scoring={phase:'confirmation',proposal,confirmed:[seat]};return;}
   if(c.type==='score-confirm'){if(!r.scoring.proposal||c.proposalId!==r.scoring.proposal.proposalId||r.scoring.confirmed.includes(seat))fail('opponent scoring confirmation required');
    const proposal=r.scoring.proposal;r.scoring.confirmed.push(seat);await this.finish(r,{reason:'area-score',...proposal.score,proposalId:proposal.proposalId,confirmedBy:[...r.seats]});return;}
   fail('unsupported scoring operation',400);
  }
  if(r.scoring)fail('scoring confirmation pending');
  if(c.type==='undo-request') {
   if(r.pending||r.history.length<2) fail('full round unavailable');
   r.pending={type:'undo',seat};return;
  }
  if(c.type==='undo-reject'){if(r.pending?.type!=='undo'||r.pending.seat===seat)fail('opponent consent required');r.pending=null;return;}
  if(c.type==='undo-accept') {
   if(r.pending?.type!=='undo'||r.pending.seat===seat) fail('opponent consent required');
   const before=r.history[r.history.length-2].before;
   Object.assign(s,structuredClone(before));r.engine.api.setKo(before.koPoint);r.passCount=before.passCount??0;r.history.splice(-2);r.turn=r.history.length%2;r.pending=null;return;
  }
  if(r.pending) fail('confirmation pending');
  if(!['move','pass'].includes(c.type)) fail('unsupported operation',400);
  if(seat!==r.turn) fail('wrong turn');
  if(c.type==='move'&&(!Number.isInteger(c.row)||!Number.isInteger(c.col))) fail('integer coordinates required',400);
  const before=structuredClone({board:s.board,blackCaptures:s.blackCaptures,whiteCaptures:s.whiteCaptures,koPoint:r.engine.api.getKo(),passCount:r.passCount});
  if(c.type==='pass'){r.history.push({before,move:{pass:true,color:seat+1}});r.engine.api.setKo(null);r.passCount++;r.turn=1-seat;if(r.passCount===2){if(r.competitive)r.scoring={phase:'proposal',proposal:null,confirmed:[]};else await this.finish(r,{reason:'double-pass',winner:null,scoring:'not-adjudicated',ranked:false});}return;}
  const move=r.engine.api.placeStone(c.row,c.col,seat+1);
  if(!move.success) fail('illegal go move');
  r.history.push({before,move:{row:c.row,col:c.col,color:seat+1,captured:move.captured}});r.turn=1-seat;r.passCount=0;
 }
 async finish(r:any,result:any) {
  // Only rules, confirmed resignation, participant departure or server timeout create results.
  const eligible=!!r.competitive&&(r.kind==='guandan'?result.reason==='rules-complete': ['area-score','resignation','turn-timeout'].includes(result.reason)&&r.history.filter((m:any)=>!m.move.pass).length>=competitiveConfig.go.minMoves);
  const verified={...result,...(r.rulesVersion===RULES_VERSION?{rulesVersion:r.rulesVersion,rulesConfig:r.rulesConfig}:{}),verifiedBy:'nobi-authority-v1',ranked:eligible,...(r.competitive?{seasonId:r.competitive.seasonId,rulesVersion:r.kind==='guandan'&&r.rulesVersion===RULES_VERSION?RULES_VERSION:competitiveConfig.version,eligibility:eligible?'eligible':'excluded-abnormal-or-insufficient-play'}:{})};
  try{await this.record(r,verified);}catch{r.status="blocked";fail("result persistence failed; room blocked",503);}
  r.result=verified;r.pending=null;r.scoring=null;r.status='ended';
 }
 currentState(r:any){return {publicState:this.view(r,r.owner).publicState,privateHands:r.kind==='guandan'?(r.engine?.api.state.players.map((p:any)=>p.hand)??null):null,status:r.status,turn:r.turn,pending:r.pending,result:r.result,lastAction:r.lastAction,...(r.competitive?{scoring:r.scoring,competitive:r.competitive}:{})};}
 exportState(r:any){return {rulesVersion:r.rulesVersion,formatVersion:r.rulesVersion===RULES_VERSION?2:1,...(r.rulesVersion===RULES_VERSION?{rulesVersion:r.rulesVersion,rulesConfig:r.rulesConfig,initialSeries:r.initialSeries}:{}),current:this.currentState(r),id:r.id,kind:r.kind,owner:r.owner,seats:r.seats,names:r.names,avatars:r.avatars,...(r.competitive?{competitive:r.competitive}:{}),deal:r.deal,journal:r.journal,deadline:r.deadline,updatedAt:r.updatedAt,version:r.version};}
 async restore(data:any) {
  const isolated=new Authority({now:this.now});const room=await isolated.replay(data);this.rooms.set(data.id,room);return room;
 }
 async replay(data:any) {
  const clock=this.now;let at=data.updatedAt;this.now=()=>at;
  const persist=this.persist,record=this.record,change=this.onChange;this.persist=async()=>{};this.record=async()=>{};this.onChange=()=>{};
  try {
   if(data.formatVersion!==1&&data.formatVersion!==2)throw Error('unsupported snapshot format');
   if(data.formatVersion===2&&data.rulesVersion!==RULES_VERSION)throw Error('unsupported snapshot rules version');
   this.create(data.id,data.kind,data.owner,data.competitive??null,data.rulesVersion??(data.kind==='guandan'?(data.competitive?'nobi-single-hand-v1':'legacy-guandan-v0'):competitiveConfig.go.rules),data.initialSeries,data.rulesConfig);for(let i=1;i<data.seats.length;i++)this.join(data.id,data.seats[i],i);
   const room=this.rooms.get(data.id);room.deal=data.deal;room.names=data.names??{};room.avatars=data.avatars??{};
   for(const event of data.journal??[]){at=event.at;if(event.timeout){await this.sweep();room.lastAction.actionId=event.actionId;room.journal.at(-1).actionId=event.actionId;}else await this.command(data.id,event.uid,event.command);}
   room.deadline=data.deadline;room.updatedAt=data.updatedAt;if(room.version!==data.version)throw new Error('snapshot replay version mismatch');if(data.current&&canonicalJson(this.currentState(room))!==canonicalJson(data.current))throw new Error('snapshot and replay state mismatch');return room;
  } finally {this.now=clock;this.persist=persist;this.record=record;this.onChange=change;}
 }
 async sweep() {
  for(const r of this.rooms.values()) if(r.status==='playing'&&r.deadline&&this.now()>r.deadline) {
   const task=r.queue.then(async()=>{if(r.status!=='playing'||this.now()<=r.deadline)return; await this.finish(r,{reason:'turn-timeout',loser:r.turn,winner:r.kind==='go'?1-r.turn:(r.turn%2===0?1:0)});r.version++;r.updatedAt=this.now();r.lastAction={actionId:randomUUID(),actionType:'server-timeout',version:r.version};r.journal.push({timeout:true,at:r.updatedAt,actionId:r.lastAction.actionId});try{await this.persist(r,r.owner,{requestId:r.lastAction.actionId,expectedVersion:r.version-1,type:'server-timeout'});}catch{r.status='blocked';throw new GameError('timeout persistence failed',503);}this.onChange(r);});r.queue=task.catch(()=>{});await task;
  }
 }
}
export { randomUUID };
