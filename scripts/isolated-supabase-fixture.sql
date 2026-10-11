-- LOCAL DISPOSABLE TEST INSTANCE ONLY. NOT A PRODUCTION MIGRATION.
-- Do not apply to the Shanghai instance or any instance with real users/data.
begin;
create schema if not exists game;
create function public.nobi_test_environment() returns text language sql stable
as $$ select 'nobi-phase2-disposable-v1'::text $$;
grant execute on function public.nobi_test_environment() to anon, authenticated;
create table game.game_rooms (
  code text primary key, black_id uuid not null references auth.users(id),
  white_id uuid references auth.users(id), board_state jsonb not null default '[]',
  next_turn text not null default 'black' check (next_turn in ('black','white')),
  black_captures integer not null default 0, white_captures integer not null default 0,
  status text not null default 'waiting' check (status in ('waiting','playing','ended'))
);
grant usage on schema game to authenticated;
grant select, insert, update on game.game_rooms to authenticated;
alter table game.game_rooms enable row level security;
-- Intentionally permissive local fixture to exercise legacy joins; NOT competitive security.
create policy local_read_rooms on game.game_rooms for select to authenticated using (true);
create policy local_create_own on game.game_rooms for insert to authenticated with check (black_id=auth.uid());
create policy local_join_or_update on game.game_rooms for update to authenticated
  using (black_id=auth.uid() or white_id=auth.uid() or white_id is null)
  with check (black_id=auth.uid() or white_id=auth.uid());
create function public.get_player_profile(player_id uuid)
returns table(user_id uuid,nickname text,rank text) language sql security definer set search_path=''
as $$ select id,coalesce(raw_user_meta_data->>'nickname','Test player'),''::text from auth.users where id=player_id $$;
revoke all on function public.get_player_profile(uuid) from public;
grant execute on function public.get_player_profile(uuid) to authenticated;
alter publication supabase_realtime add table game.game_rooms;
select pg_notify('pgrst','reload schema');
commit;
