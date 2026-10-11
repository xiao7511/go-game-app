-- Incremental LOCAL ONLY competitive settlement; existing table names are retained.
alter table game.seasons add column scope text not null default 'season' check(scope in ('season','permanent'));
alter table game.seasons add column state text not null default 'draft' check(state in ('draft','active','paused','archived'));
create unique index one_active_test_season on game.seasons((state)) where state='active' and scope='season';
insert into game.seasons(id,name,starts_at,ends_at,scope,state) values('00000000-0000-4000-8000-000000000001','永久评级', '2000-01-01','9999-01-01','permanent','archived');
insert into game.seasons(id,name,starts_at,ends_at,competitive_enabled,state) values('00000000-0000-4000-8000-000000000003','Phase 3C 本地测试赛季',now()-interval '1 day',now()+interval '90 days',true,'active');
alter table game.ratings add column wins int not null default 0 check(wins>=0), add column losses int not null default 0 check(losses>=0), add column draws int not null default 0 check(draws>=0), add column last_match_at timestamptz;
alter table game.ratings add constraint rating_stats_balance check(games=wins+losses+draws);
alter table game.match_records drop constraint match_records_ranked_check;
alter table game.match_records add column season_id uuid references game.seasons, add column result_version bigint not null default 0, add column settlement_status text not null default 'disabled' check(settlement_status in ('disabled','pending','settled','rejected'));
alter table game.rating_events add column permanent_before int, add column permanent_delta int, add column permanent_after int;
alter table game.rating_events add constraint permanent_event_balance check(permanent_after=permanent_before+permanent_delta);
create index rating_page_idx on game.ratings(season_id,kind,rating desc,user_id);
create index rating_history_idx on game.rating_events(user_id,kind,id desc);
create index personal_records_idx on game.match_records using gin(participants);
create table game.settlement_audit(match_id uuid primary key references game.match_records(id) on delete cascade, status text not null check(status in ('settled','rejected')), reason text not null, result_version bigint not null, signals jsonb not null default '{}', created_at timestamptz not null default now());
create table game.leaderboard_snapshots(season_id uuid references game.seasons,kind text check(kind in ('go','guandan')),rows jsonb not null,archived_at timestamptz not null default now(),primary key(season_id,kind));
create table nobi_private.admin_users(user_id uuid primary key references auth.users on delete cascade);
alter table game.settlement_audit enable row level security;
alter table game.leaderboard_snapshots enable row level security;
alter table nobi_private.admin_users enable row level security;
revoke all on game.settlement_audit,game.leaderboard_snapshots,nobi_private.admin_users from public,anon,authenticated;
grant select on game.leaderboard_snapshots to authenticated;
create policy archive_read on game.leaderboard_snapshots for select to authenticated using(true);
grant select on nobi_private.admin_users to nobi_authority;
create policy authority_admin_read on nobi_private.admin_users for select to nobi_authority using(true);
grant select on game.seasons,game.ratings,game.rating_events,game.settlement_audit,game.leaderboard_snapshots to nobi_authority;
create policy authority_seasons_read on game.seasons for select to nobi_authority using(true);
create policy authority_ratings_read on game.ratings for select to nobi_authority using(true);
create policy authority_history_read on game.rating_events for select to nobi_authority using(true);
create policy authority_audit_read on game.settlement_audit for select to nobi_authority using(true);
create policy authority_archives_read on game.leaderboard_snapshots for select to nobi_authority using(true);

create function game.guard_archived_ratings() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user<>'postgres' and exists(select 1 from game.seasons where id=coalesce(new.season_id,old.season_id) and scope='season' and state='archived') then raise exception 'archived ratings read only'; end if;
 if TG_OP='DELETE' then return old; end if;return new;
end $$;
create trigger archived_ratings_guard before insert or update or delete on game.ratings for each row execute function game.guard_archived_ratings();

create function game.settle_match(target uuid,expected_result_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare m game.match_records;s game.seasons;st jsonb;uid uuid;scope_id uuid;ratings int[];before_value int;after_value int;permanent_before_value int;permanent_after_value int;win int;delta_value int;aver0 float8;aver1 float8;expected0 float8;seat int;counter int;signaled int;signals jsonb;excluded text;team_size int;
begin
 perform pg_advisory_xact_lock(3003001);
 select * into m from game.match_records where id=target for update;
 if not found or m.result_version<>expected_result_version then raise exception 'untrusted or obsolete result'; end if;
 if m.settlement_status in ('settled','rejected') then return jsonb_build_object('status',m.settlement_status,'matchId',target,'resultVersion',m.result_version);end if;
 select state into st from nobi_private.room_snapshots where room_id=target and version=expected_result_version;
 if st is null or st->'current'->>'status'<>'ended' or st->'current'->'result'<>m.result or st->>'kind'<>m.kind or not exists(select 1 from game.rooms where id=target and status='ended' and version=expected_result_version) then raise exception 'authoritative snapshot required';end if;
 team_size:=case when m.kind='go' then 1 else 2 end;
 if cardinality(m.participants)<>2*team_size or (select count(distinct p) from unnest(m.participants) p)<>2*team_size or (select array_agg(user_id order by seat) from game.room_members where room_id=target)<>m.participants then raise exception 'invalid participants';end if;
 if m.verified_by<>'nobi-authority-v1' or m.result->>'rulesVersion'<>'nobi-competitive-v1' or st->'competitive'->>'seasonId' is distinct from m.season_id::text then raise exception 'competitive origin required';end if;
 select * into s from game.seasons where id=m.season_id;
 if not m.ranked then excluded:='ineligible-result';
 elsif s.scope<>'season' or s.state not in ('active','paused') or not s.competitive_enabled or m.ended_at<s.starts_at or m.ended_at>=s.ends_at then excluded:='season-closed-or-disabled';end if;
 if excluded is not null then update game.match_records set ranked=false,settlement_status='rejected' where id=target;insert into game.settlement_audit values(target,'rejected',excluded,m.result_version,'{}',now());return jsonb_build_object('status','rejected','reason',excluded);end if;
 if m.result->>'winner' not in ('0','1') then raise exception 'winner not adjudicated';end if;win:=(m.result->>'winner')::int;
 if m.kind='guandan' and (m.result->>'reason'<>'rules-complete' or jsonb_array_length(m.result->'finishOrder')<>4 or (m.result->'finishOrder'->>0)::int%2<>win) then raise exception 'Guandan complete order required';end if;
 if m.kind='go' and (m.result->>'reason' not in ('area-score','resignation','turn-timeout') or (select count(*) from jsonb_array_elements(st->'journal') e where e->'command'->>'type'='move')<2) then raise exception 'Go verified result required';end if;
 for scope_id in select id from game.seasons where id in(m.season_id,'00000000-0000-4000-8000-000000000001'::uuid) order by id loop
  foreach uid in array m.participants loop insert into game.ratings(user_id,kind,season_id) values(uid,m.kind,scope_id) on conflict do nothing;end loop;
  select array_agg(r.rating order by p.seat) into ratings from unnest(m.participants) with ordinality p(uid,seat) join game.ratings r on r.user_id=p.uid and r.kind=m.kind and r.season_id=scope_id;
  aver0:=0;aver1:=0;for counter in 1..cardinality(ratings) loop if counter%2=1 then aver0:=aver0+ratings[counter];else aver1:=aver1+ratings[counter];end if;end loop;
  aver0:=aver0/team_size;aver1:=aver1/team_size;expected0:=1/(1+power(10::float8,(aver1-aver0)/400));
  delta_value:=round(32*((case when win=0 then 1 else 0 end)-expected0));
  for counter in 1..cardinality(ratings) loop if (delta_value>0 and counter%2=0) or (delta_value<0 and counter%2=1) then delta_value:=sign(delta_value)*least(abs(delta_value),ratings[counter]);end if;end loop;
  for counter in 1..cardinality(ratings) loop
   uid:=m.participants[counter];seat:=counter-1;before_value:=ratings[counter];after_value:=before_value+(case when seat%2=0 then delta_value else -delta_value end);
   update game.ratings set rating=after_value,games=games+1,wins=wins+(case when seat%2=win then 1 else 0 end),losses=losses+(case when seat%2<>win then 1 else 0 end),last_match_at=m.ended_at where user_id=uid and kind=m.kind and season_id=scope_id;
   if scope_id='00000000-0000-4000-8000-000000000001'::uuid then
    insert into game.rating_events(match_id,user_id,season_id,kind,before_rating,delta,after_rating,permanent_before,permanent_delta,permanent_after) values(target,uid,m.season_id,m.kind,1500,0,1500,before_value,after_value-before_value,after_value);
   else
    update game.rating_events set before_rating=before_value,delta=after_value-before_value,after_rating=after_value where match_id=target and user_id=uid;
   end if;
  end loop;
 end loop;
 -- Observable signals only; no automatic bans or accusations.
 select count(*) into signaled from game.match_records r where r.id<>target and r.ranked and r.settlement_status='settled' and r.ended_at>m.ended_at-interval '1 hour' and r.participants @> m.participants and r.participants <@ m.participants;
 signals:=jsonb_build_object('sameParticipantsLastHour',signaled,'reviewSuggested',signaled>=3,'shortGame',jsonb_array_length(st->'journal')<20);
 update game.match_records set settlement_status='settled' where id=target;
 insert into game.settlement_audit values(target,'settled','verified-elo-v1',m.result_version,signals,now());
 return jsonb_build_object('status','settled','matchId',target,'resultVersion',m.result_version);
end $$;

create function game.manage_test_season(operation text,target uuid,season_name text default null,start_date timestamptz default null,end_date timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare selected game.seasons;old_id uuid;
begin
 perform pg_advisory_xact_lock(3003001);
 if operation='create' then
  if length(season_name) not between 1 and 80 or start_date is null or end_date is null or end_date<=start_date then raise exception 'invalid season';end if;
  insert into game.seasons(id,name,starts_at,ends_at,state) values(target,season_name,start_date,end_date,'draft');return target;
 end if;
 select * into selected from game.seasons where id=target for update;
 if not found or selected.scope<>'season' or selected.state='archived' then raise exception 'season immutable or missing';end if;
 if operation='activate' then
  if now()<selected.starts_at or now()>=selected.ends_at then raise exception 'season outside dates';end if;
  for old_id in select id from game.seasons where scope='season' and state='active' and id<>target loop
   insert into game.leaderboard_snapshots(season_id,kind,rows) select old_id,g,coalesce((select jsonb_agg(x order by x.rating desc,x.user_id) from (select r.user_id,r.rating,r.games,r.wins,r.losses,rank() over(order by rating desc) as rank from game.ratings r where season_id=old_id and kind=g and games>0) x),'[]'::jsonb) from unnest(array['go','guandan']) g on conflict do nothing;
   update game.seasons set state='archived',competitive_enabled=false where id=old_id;
  end loop;
  update game.seasons set state='active',competitive_enabled=true where id=target;
 elsif operation='pause' then update game.seasons set state='paused',competitive_enabled=false where id=target;
 elsif operation='archive' then
  insert into game.leaderboard_snapshots(season_id,kind,rows) select target,g,coalesce((select jsonb_agg(x order by x.rating desc,x.user_id) from (select r.user_id,r.rating,r.games,r.wins,r.losses,rank() over(order by rating desc) as rank from game.ratings r where season_id=target and kind=g and games>0) x),'[]'::jsonb) from unnest(array['go','guandan']) g on conflict do nothing;
  update game.seasons set state='archived',competitive_enabled=false where id=target;
 else raise exception 'invalid season operation';end if;
 return target;
end $$;
revoke all on function game.settle_match(uuid,bigint),game.manage_test_season(text,uuid,text,timestamptz,timestamptz),game.guard_archived_ratings() from public,anon,authenticated;
grant execute on function game.settle_match(uuid,bigint),game.manage_test_season(text,uuid,text,timestamptz,timestamptz) to nobi_authority;
notify pgrst,'reload schema';
