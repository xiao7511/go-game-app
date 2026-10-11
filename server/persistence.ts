import crypto from 'node:crypto';
import {clearRankingCache} from './ratings.ts';
import {canonicalJson} from './protocol.ts';
import { localSql,literal } from '../scripts/local-db.mjs';
import { GameError } from './authority.ts';
export function loadRoom(id:string) {
 const value=localSql(`select json_build_object('snapshot',(select state from nobi_private.room_snapshots where room_id=r.id),'id',r.id,'kind',r.kind,'owner',r.owner_id,'seats',(select json_agg(user_id order by seat) from game.room_members where room_id=r.id)) from game.rooms r where r.id=${literal(id)}::uuid;`);
 return value?JSON.parse(value):null;
}
export function saveRoom(authority:any, room:any, uid?:string, command?:any) {
 const state=authority.exportState(room),id=literal(room.id),previous=room.storedVersion??null;
 const receipt=command?`insert into game.command_receipts(room_id,actor_id,request_id,state_version,action,payload_sha256) values(${id}::uuid,${literal(uid)}::uuid,${literal(command.requestId)},${room.version},${literal(command.type)},${literal(crypto.createHash('sha256').update(canonicalJson(command)).digest('hex'))});`:'';
 const result=room.result?`insert into game.match_records(id,kind,participants,result,verified_by,ended_at,ranked,season_id,result_version,settlement_status,rules_version) values(${id}::uuid,${literal(room.kind)},${literal('{'+room.seats.join(',')+'}')}::uuid[],${literal(JSON.stringify(room.result))}::jsonb,'nobi-authority-v1',to_timestamp(${room.updatedAt}/1000.0),${!!room.result.ranked},${room.competitive?literal(room.competitive.seasonId)+'::uuid':'null'},${room.version},${literal(room.competitive?'pending':'disabled')},${literal(room.kind==='go'?'Chinese-area-agreement-v1':room.rulesVersion==='guandan-standard-v1'?'guandan-standard-v1':'nobi-single-hand-v1')}) on conflict(id) do nothing;`:'';
 try {
  localSql(`begin; set local role nobi_authority; select id from game.rooms where id=${id}::uuid for update; do $$ begin if ${previous===null?`exists(select 1 from nobi_private.room_snapshots where room_id=${id}::uuid)`:`not exists(select 1 from nobi_private.room_snapshots where room_id=${id}::uuid and version=${previous})`} then raise exception 'snapshot compare-and-swap conflict'; end if; end $$; insert into nobi_private.room_snapshots(room_id,version,state) values(${id}::uuid,${room.version},${literal(JSON.stringify(state))}::jsonb) on conflict(room_id) do update set version=excluded.version,state=excluded.state,updated_at=now(); ${receipt} ${result} update game.rooms set status=${literal(room.status)},version=${room.version},turn=${room.turn} where id=${id}::uuid; ${room.result&&room.competitive?`select game.settle_match(${id}::uuid,${room.version});`:''} commit;`);
  room.storedVersion=room.version;if(room.result)clearRankingCache();
 } catch {throw new GameError('snapshot transaction failed',503);}
}

export function saveContinuation(authority:any,previous:any,next:any){
 const id=literal(next.id),prior=literal(previous.id),state=literal(JSON.stringify(authority.exportState(next)));
 localSql(`begin;set local role nobi_authority;select id from game.rooms where id=${prior}::uuid for update;do $$ begin if not exists(select 1 from nobi_private.room_snapshots where room_id=${prior}::uuid and version=${previous.version} and state->'current'->>'status'='ended' and state->'current'->'result'->>'reason'='rules-complete' and state->>'rulesVersion'='guandan-standard-v1') then raise exception 'trusted continuation required';end if;end $$;insert into game.rooms(id,kind,owner_id,status,version,turn) values(${id}::uuid,'guandan',${literal(next.owner)}::uuid,'waiting',3,0);insert into game.room_members(room_id,user_id,seat) select ${id}::uuid,user_id,seat from game.room_members where room_id=${prior}::uuid;insert into nobi_private.room_snapshots(room_id,version,state) values(${id}::uuid,3,${state}::jsonb);commit;`);next.storedVersion=3;
}
