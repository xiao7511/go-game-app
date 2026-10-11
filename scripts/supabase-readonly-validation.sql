-- MANUAL ONLY. No credentials here. Run against an approved read-only connection.
-- This validates contracts; it never creates schemas, tables, policies, or RPCs.
begin transaction read only;
select current_database(), current_user, current_setting('transaction_read_only');
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('game','public') and c.relname in ('game_rooms','waiting_room','game_sessions','moves','profiles','users');
select table_schema,table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema in ('game','public') and table_name in ('game_rooms','waiting_room','game_sessions','moves','profiles','users')
order by table_schema,table_name,ordinal_position;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result,p.prosecdef,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('get_player_profile','handle_surrender') and n.nspname in ('public','game');
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='game' order by tablename,policyname;
select grantee,table_schema,table_name,privilege_type
from information_schema.role_table_grants where table_schema='game' and grantee in ('anon','authenticated');
select pubname,schemaname,tablename from pg_publication_tables where schemaname='game';
select rolname,has_schema_privilege(rolname,'game','USAGE') as game_usage
from pg_roles where rolname in ('anon','authenticated') and exists(select 1 from pg_namespace where nspname='game');
-- Compare game_rooms expected: code,black_id,white_id,board_state,next_turn,
-- black_captures,white_captures,status. public.get_player_profile(player_id uuid).
-- Catalog visibility depends on role; absent rows are NOT proof production objects are absent.
rollback;
