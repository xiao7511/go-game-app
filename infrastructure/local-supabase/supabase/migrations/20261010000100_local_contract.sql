-- Disposable local contract only. Never run against production.
create schema if not exists game;
grant usage on schema game to authenticated;
create role nobi_authority nologin;
grant usage on schema game to nobi_authority;

-- Preserve the checked-in SQL's object names; deny client state/move writes.
create table game.waiting_room (user_id uuid primary key references auth.users, nickname text, created_at timestamptz not null default now());
create table game.game_sessions (id uuid primary key default gen_random_uuid(), black_id uuid not null references auth.users, white_id uuid not null references auth.users, board_state jsonb not null default '[]', next_turn text not null default 'black', black_captures int not null default 0, white_captures int not null default 0, moves jsonb not null default '[]', status text not null default 'active', created_at timestamptz default now(), updated_at timestamptz default now());
create table game.moves (id bigint generated always as identity primary key, session_id uuid not null references game.game_sessions, user_id uuid not null references auth.users, x int check(x between 0 and 18), y int check(y between 0 and 18), player text check(player in ('black','white')), turn_number int not null, created_at timestamptz default now(), unique(session_id,turn_number));
create table game.game_rooms (code text primary key check(code ~ '^[A-Z0-9]{6,16}$'), black_id uuid not null references auth.users, white_id uuid references auth.users, board_state jsonb not null default '[]', next_turn text not null default 'black', black_captures int not null default 0, white_captures int not null default 0, moves jsonb not null default '[]', status text not null default 'waiting', created_at timestamptz default now(), check(black_id <> white_id));

create table game.rooms (id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('go','guandan')), owner_id uuid not null references auth.users, status text not null default 'waiting' check(status in ('waiting','playing','ended')), version bigint not null default 0, created_at timestamptz not null default now());
create table game.room_members (room_id uuid references game.rooms on delete cascade, user_id uuid references auth.users, seat int not null check(seat between 0 and 3), primary key(room_id,user_id), unique(room_id,seat));
-- Avoid recursive membership RLS; expose only caller membership and use a narrow predicate.
create function game.is_member(target uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from game.room_members where room_id=target and user_id=auth.uid()) $$;
revoke all on function game.is_member(uuid) from public;
grant execute on function game.is_member(uuid) to authenticated;
create function game.create_room(game_kind text) returns uuid language plpgsql security definer set search_path = '' as $$
declare room uuid;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 insert into game.rooms(kind,owner_id) values(game_kind,auth.uid()) returning id into room;
 insert into game.room_members values(room,auth.uid(),0);
 return room;
end $$;
create function game.join_room(target uuid) returns int language plpgsql security definer set search_path = '' as $$
declare r game.rooms; assigned int; capacity int;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into r from game.rooms where id=target for update;
 if not found then raise exception 'room missing'; end if;
 select seat into assigned from game.room_members where room_id=target and user_id=auth.uid();
 if found then return assigned; end if;
 if r.status <> 'waiting' then raise exception 'room closed'; end if;
 capacity := case when r.kind='go' then 2 else 4 end;
 select s into assigned from generate_series(0,capacity-1) s where not exists(select 1 from game.room_members where room_id=target and seat=s) order by s limit 1;
 if assigned is null then raise exception 'room full'; end if;
 insert into game.room_members values(target,auth.uid(),assigned);
 return assigned;
end $$;
create function game.join_go_room(room_code text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 update game.game_rooms set white_id=auth.uid(),status='playing' where code=room_code and white_id is null and black_id<>auth.uid() and status='waiting';
 if not found then raise exception 'room unavailable'; end if;
end $$;
revoke all on function game.create_room(text), game.join_room(uuid), game.join_go_room(text) from public;
grant execute on function game.create_room(text), game.join_room(uuid), game.join_go_room(text) to authenticated;

create function public.get_player_profile(player_id uuid) returns table(user_id uuid,nickname text,rank text) language sql security definer set search_path = '' as $$ select id,coalesce(raw_user_meta_data->>'nickname','Nobi player'),coalesce(raw_user_meta_data->>'rank','unrated') from auth.users where id=player_id $$;
revoke all on function public.get_player_profile(uuid) from public;
grant execute on function public.get_player_profile(uuid) to authenticated;
create function public.nobi_isolated_fixture() returns text language sql immutable as $$ select 'nobi-phase3a-local-v1'::text $$;
revoke all on function public.nobi_isolated_fixture() from public;
grant execute on function public.nobi_isolated_fixture() to anon,authenticated;

-- Prepared ranking contract; no live season/score settlement is enabled.
create table game.seasons (id uuid primary key default gen_random_uuid(), name text not null, competitive_enabled boolean not null default false, starts_at timestamptz not null, ends_at timestamptz not null, check(ends_at>starts_at));
create table game.ratings (user_id uuid references auth.users, kind text check(kind in ('go','guandan')), season_id uuid references game.seasons, rating int not null default 1500 check(rating>=0), games int not null default 0 check(games>=0), primary key(user_id,kind,season_id));
create table game.match_records (id uuid primary key, kind text not null check(kind in ('go','guandan')), participants uuid[] not null, result jsonb not null, verified_by text not null check(verified_by='nobi-authority-v1'), ranked boolean not null default false check(ranked=false), ended_at timestamptz not null default now());
create table game.rating_events (id bigint generated always as identity primary key, match_id uuid references game.match_records, user_id uuid references auth.users, season_id uuid references game.seasons, kind text check(kind in ('go','guandan')), before_rating int not null, delta int not null, after_rating int not null, check(after_rating=before_rating+delta), unique(match_id,user_id));
create view game.rankings with(security_invoker=true) as select user_id,kind,season_id,rating,games,dense_rank() over(partition by kind,season_id order by rating desc) as rank from game.ratings;

alter table game.waiting_room enable row level security;
alter table game.game_sessions enable row level security;
alter table game.moves enable row level security;
alter table game.game_rooms enable row level security;
alter table game.rooms enable row level security;
alter table game.room_members enable row level security;
alter table game.seasons enable row level security;
alter table game.ratings enable row level security;
alter table game.match_records enable row level security;
alter table game.rating_events enable row level security;
create policy own_waiting on game.waiting_room for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy participant_sessions on game.game_sessions for select to authenticated using(auth.uid() in (black_id,white_id));
create policy participant_moves on game.moves for select to authenticated using(exists(select 1 from game.game_sessions s where s.id=session_id and auth.uid() in (s.black_id,s.white_id)));
create policy participant_go_rooms on game.game_rooms for select to authenticated using(auth.uid() in (black_id,white_id));
create policy create_go_rooms on game.game_rooms for insert to authenticated with check(black_id=auth.uid() and white_id is null and status='waiting' and board_state='[]'::jsonb and moves='[]'::jsonb and next_turn='black' and black_captures=0 and white_captures=0);
create policy participant_rooms on game.rooms for select to authenticated using(game.is_member(id));
create policy participant_members on game.room_members for select to authenticated using(game.is_member(room_id));
create policy seasons_read on game.seasons for select to authenticated using(true);
create policy ratings_read on game.ratings for select to authenticated using(true);
create policy own_records on game.match_records for select to authenticated using(auth.uid()=any(participants));
create policy own_rating_events on game.rating_events for select to authenticated using(user_id=auth.uid());
revoke all on all tables in schema game from anon,authenticated;
grant select on all tables in schema game to authenticated;
grant insert,delete on game.waiting_room to authenticated;
grant insert(code,black_id) on game.game_rooms to authenticated;
grant select,insert,update on game.rooms,game.match_records to nobi_authority;
create policy authority_rooms on game.rooms for all to nobi_authority using(true) with check(true);
create policy authority_records on game.match_records for all to nobi_authority using(true) with check(true);
alter publication supabase_realtime add table game.rooms,game.room_members,game.game_rooms,game.match_records;
