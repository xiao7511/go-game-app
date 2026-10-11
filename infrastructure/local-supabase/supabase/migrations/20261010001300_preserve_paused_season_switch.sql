-- Preserve Phase 3C paused-season archival when adding versioned rows.
create or replace function game.manage_test_season(operation text,target uuid,season_name text default null,start_date timestamptz default null,end_date timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
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
  for old_id in select id from game.seasons where scope='season' and state in ('active','paused') and id<>target loop
   insert into game.leaderboard_snapshots(season_id,kind,rows) select old_id,g,coalesce((select jsonb_agg(x order by x.rating desc,x.user_id) from (select r.user_id,r.rating,r.games,r.wins,r.losses,r.rules_version,rank() over(partition by rules_version order by rating desc) as rank from game.ratings r where season_id=old_id and kind=g and games>0) x),'[]'::jsonb) from unnest(array['go','guandan']) g on conflict do nothing;
   update game.seasons set state='archived',competitive_enabled=false where id=old_id;
  end loop;
  update game.seasons set state='active',competitive_enabled=true where id=target;
 elsif operation='pause' then update game.seasons set state='paused',competitive_enabled=false where id=target;
 elsif operation='archive' then
  insert into game.leaderboard_snapshots(season_id,kind,rows) select target,g,coalesce((select jsonb_agg(x order by x.rating desc,x.user_id) from (select r.user_id,r.rating,r.games,r.wins,r.losses,r.rules_version,rank() over(partition by rules_version order by rating desc) as rank from game.ratings r where season_id=target and kind=g and games>0) x),'[]'::jsonb) from unnest(array['go','guandan']) g on conflict do nothing;
  update game.seasons set state='archived',competitive_enabled=false where id=target;
 else raise exception 'invalid season operation';end if;
 return target;
end $$;

revoke all on function game.manage_test_season(text,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;grant execute on function game.manage_test_season(text,uuid,text,timestamptz,timestamptz) to nobi_authority;
