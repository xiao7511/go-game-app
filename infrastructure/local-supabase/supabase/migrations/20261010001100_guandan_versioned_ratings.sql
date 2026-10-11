-- Dedicated isolated Supabase only. Preserve all legacy rows; reset no scores.
alter table game.ratings add column rules_version text not null default 'nobi-single-hand-v1';
alter table game.rating_events add column rules_version text not null default 'nobi-single-hand-v1';
alter table game.match_records add column rules_version text not null default 'nobi-single-hand-v1';
update game.ratings set rules_version='Chinese-area-agreement-v1' where kind='go';
update game.rating_events set rules_version='Chinese-area-agreement-v1' where kind='go';
update game.match_records set rules_version=case when kind='go' then 'Chinese-area-agreement-v1' when result->>'rulesVersion'='guandan-standard-v1' then 'guandan-standard-v1' else 'nobi-single-hand-v1' end;
alter table game.ratings drop constraint ratings_pkey;
alter table game.ratings add primary key(user_id,kind,season_id,rules_version);
create index versioned_rating_page on game.ratings(rules_version,season_id,kind,rating desc,user_id);
create or replace view game.rankings with(security_invoker=true) as select user_id,kind,season_id,rating,games,dense_rank() over(partition by kind,season_id,rules_version order by rating desc) as rank,rules_version from game.ratings;
-- LOCAL ONLY: disambiguate PL/pgSQL seat variable from member columns.
create or replace function game.settle_match(target uuid,expected_result_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare m game.match_records;s game.seasons;st jsonb;uid uuid;scope_id uuid;ratings int[];before_value int;after_value int;permanent_before_value int;permanent_after_value int;win int;delta_value int;aver0 float8;aver1 float8;expected0 float8;seat int;counter int;signaled int;signals jsonb;excluded text;team_size int;rules_key text;
begin
 perform pg_advisory_xact_lock(3003001);
 select * into m from game.match_records where id=target for update;
 if not found or m.result_version<>expected_result_version then raise exception 'untrusted or obsolete result'; end if;
 if m.settlement_status in ('settled','rejected') then return jsonb_build_object('status',m.settlement_status,'matchId',target,'resultVersion',m.result_version);end if;
 select state into st from nobi_private.room_snapshots where room_id=target and version=expected_result_version;
 if st is null or st->'current'->>'status'<>'ended' or st->'current'->'result'<>m.result or st->>'kind'<>m.kind or not exists(select 1 from game.rooms where id=target and status='ended' and version=expected_result_version) then raise exception 'authoritative snapshot required';end if;
 team_size:=case when m.kind='go' then 1 else 2 end;
 if cardinality(m.participants)<>2*team_size or (select count(distinct p) from unnest(m.participants) p)<>2*team_size or (select array_agg(member.user_id order by member.seat) from game.room_members member where member.room_id=target)<>m.participants then raise exception 'invalid participants';end if;
 if m.verified_by<>'nobi-authority-v1' or m.season_id is null or st->'competitive' is null or (m.result->>'rulesVersion' is distinct from 'nobi-competitive-v1' and not(m.kind='guandan' and m.result->>'rulesVersion'='guandan-standard-v1')) or st->'competitive'->>'seasonId' is distinct from m.season_id::text then raise exception 'competitive origin required';end if;
 rules_key:=m.rules_version;
 if m.kind='guandan' and rules_key='guandan-standard-v1' and (st->>'rulesVersion' is distinct from rules_key or st->'rulesConfig' is distinct from m.result->'rulesConfig' or st->>'formatVersion'<>'2') then raise exception 'versioned rules origin required';end if;
 if rules_key not in ('guandan-standard-v1','nobi-single-hand-v1','Chinese-area-agreement-v1') then raise exception 'unsupported rating rules';end if;
 select * into s from game.seasons where id=m.season_id;
 if not m.ranked then excluded:='ineligible-result';
 elsif s.scope<>'season' or s.state not in ('active','paused') or not s.competitive_enabled or m.ended_at<s.starts_at or m.ended_at>=s.ends_at then excluded:='season-closed-or-disabled';end if;
 if excluded is not null then update game.match_records set ranked=false,settlement_status='rejected' where id=target;insert into game.settlement_audit values(target,'rejected',excluded,m.result_version,'{}',now());return jsonb_build_object('status','rejected','reason',excluded);end if;
 if coalesce(m.result->>'winner','') not in ('0','1') then raise exception 'winner not adjudicated';end if;win:=(m.result->>'winner')::int;
 if m.kind='guandan' and (m.result->>'reason'<>'rules-complete' or jsonb_array_length(m.result->'finishOrder')<>4 or (m.result->'finishOrder'->>0)::int%2<>win) then raise exception 'Guandan complete order required';end if;
 if m.kind='go' and (m.result->>'reason' not in ('area-score','resignation','turn-timeout') or (select count(*) from jsonb_array_elements(st->'journal') e where e->'command'->>'type'='move')<2) then raise exception 'Go verified result required';end if;
 for scope_id in select id from game.seasons where id in(m.season_id,'00000000-0000-4000-8000-000000000001'::uuid) order by (id='00000000-0000-4000-8000-000000000001'::uuid) desc,id loop
  foreach uid in array m.participants loop insert into game.ratings(user_id,kind,season_id,rules_version) values(uid,m.kind,scope_id,rules_key) on conflict do nothing;end loop;
  select array_agg(r.rating order by p.seat) into ratings from unnest(m.participants) with ordinality p(uid,seat) join game.ratings r on r.user_id=p.uid and r.kind=m.kind and r.season_id=scope_id and r.rules_version=rules_key;
  aver0:=0;aver1:=0;for counter in 1..cardinality(ratings) loop if counter%2=1 then aver0:=aver0+ratings[counter];else aver1:=aver1+ratings[counter];end if;end loop;
  aver0:=aver0/team_size;aver1:=aver1/team_size;expected0:=1/(1+power(10::float8,(aver1-aver0)/400));
  delta_value:=round(32*((case when win=0 then 1 else 0 end)-expected0));
  for counter in 1..cardinality(ratings) loop if (delta_value>0 and counter%2=0) or (delta_value<0 and counter%2=1) then delta_value:=sign(delta_value)*least(abs(delta_value),ratings[counter]);end if;end loop;
  for counter in 1..cardinality(ratings) loop
   uid:=m.participants[counter];seat:=counter-1;before_value:=ratings[counter];after_value:=before_value+(case when seat%2=0 then delta_value else -delta_value end);
   update game.ratings set rating=after_value,games=games+1,wins=wins+(case when seat%2=win then 1 else 0 end),losses=losses+(case when seat%2<>win then 1 else 0 end),last_match_at=m.ended_at where user_id=uid and kind=m.kind and season_id=scope_id and rules_version=rules_key;
   if scope_id='00000000-0000-4000-8000-000000000001'::uuid then
    insert into game.rating_events(match_id,user_id,season_id,kind,before_rating,delta,after_rating,permanent_before,permanent_delta,permanent_after,rules_version) values(target,uid,m.season_id,m.kind,1500,0,1500,before_value,after_value-before_value,after_value,rules_key);
   else
    update game.rating_events set before_rating=before_value,delta=after_value-before_value,after_rating=after_value where match_id=target and user_id=uid;
   end if;
  end loop;
 end loop;
 -- Observable signals only; no automatic bans or accusations.
 select count(*) into signaled from game.match_records r where r.id<>target and r.rules_version=rules_key and r.ranked and r.settlement_status='settled' and r.ended_at>m.ended_at-interval '1 hour' and r.participants @> m.participants and r.participants <@ m.participants;
 signals:=jsonb_build_object('sameParticipantsLastHour',signaled,'reviewSuggested',signaled>=3,'shortGame',jsonb_array_length(st->'journal')<20);
 update game.match_records set settlement_status='settled' where id=target;
 insert into game.settlement_audit values(target,'settled','verified-elo-v1',m.result_version,signals,now());
 return jsonb_build_object('status','settled','matchId',target,'resultVersion',m.result_version);
end $$;

revoke all on function game.settle_match(uuid,bigint) from public,anon,authenticated;
grant execute on function game.settle_match(uuid,bigint) to nobi_authority;
notify pgrst,'reload schema';
