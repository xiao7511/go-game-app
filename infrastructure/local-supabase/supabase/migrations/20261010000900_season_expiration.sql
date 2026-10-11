-- LOCAL ONLY: expiration archives seasons on trusted reads/creation, never resets permanent ratings.
create function game.expire_test_seasons() returns void language plpgsql security definer set search_path='' as $$
declare expired uuid;
begin
 perform pg_advisory_xact_lock(3003001);
 for expired in select id from game.seasons where scope='season' and state in ('active','paused') and ends_at<=now() loop perform game.manage_test_season('archive',expired);end loop;
end $$;
revoke all on function game.expire_test_seasons() from public,anon,authenticated;
grant execute on function game.expire_test_seasons() to nobi_authority;
