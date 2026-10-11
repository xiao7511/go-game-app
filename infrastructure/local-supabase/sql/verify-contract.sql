-- Read-only catalog assertions, run only using scripts/local-db.mjs verify.
do $$
declare name text;
begin
 foreach name in array array['waiting_room','game_sessions','moves','game_rooms','rooms','room_members','seasons','ratings','match_records','rating_events','command_receipts'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='game' and c.relname=name and c.relrowsecurity) then raise exception 'missing RLS %',name; end if;
 end loop;
 foreach name in array array['game_sessions','moves','rooms','room_members','ratings','match_records','rating_events'] loop
  if has_table_privilege('authenticated','game.'||name,'INSERT') or has_table_privilege('authenticated','game.'||name,'UPDATE') or has_table_privilege('authenticated','game.'||name,'DELETE') then raise exception 'client write grant %',name; end if;
 end loop;
 if has_function_privilege('anon','public.get_player_profile(uuid)','EXECUTE') then raise exception 'anonymous profile access'; end if;
 if has_table_privilege('nobi_authority','game.ratings','UPDATE') or exists(select 1 from pg_roles where rolname='nobi_authority' and rolcanlogin) then raise exception 'authority role exceeds local contract'; end if;
 if not has_function_privilege('authenticated','game.join_room(uuid)','EXECUTE') then raise exception 'join RPC grant missing'; end if;
 if (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='game' and tablename in ('rooms','room_members','game_rooms','match_records')) <> 4 then raise exception 'realtime publication incomplete'; end if;
 if not exists(select 1 from pg_views where schemaname='game' and viewname='rankings') then raise exception 'ranking query missing'; end if;
end $$;
select 'PASS: RLS, client write denial, RPC grants, publication, rankings';
