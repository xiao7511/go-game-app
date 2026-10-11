-- Supabase image default privileges grant anon directly (not only through PUBLIC).
-- Explicitly revoke both to keep the intended RPC boundary.
revoke all on all functions in schema game from public,anon;
grant execute on function game.is_member(uuid),game.create_room(text),game.join_room(uuid),game.join_go_room(text) to authenticated;
revoke all on function public.get_player_profile(uuid) from public,anon;
grant execute on function public.get_player_profile(uuid) to authenticated;
