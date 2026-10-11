-- Independent LOCAL ONLY contract assertions.
do $$ begin
 if has_function_privilege('anon','game.settle_match(uuid,bigint)','execute') or has_function_privilege('authenticated','game.settle_match(uuid,bigint)','execute') then raise exception 'client settlement executable';end if;
 if has_function_privilege('authenticated','game.manage_test_season(text,uuid,text,timestamptz,timestamptz)','execute') then raise exception 'client season admin executable';end if;
 if has_table_privilege('authenticated','game.ratings','update') or has_table_privilege('authenticated','game.seasons','insert') or has_table_privilege('authenticated','game.rating_events','insert') or has_table_privilege('authenticated','game.settlement_audit','select') or has_schema_privilege('authenticated','nobi_private','usage') then raise exception 'competitive privilege bypass';end if;
 if (select count(*) from pg_class where oid in('game.settlement_audit'::regclass,'game.leaderboard_snapshots'::regclass,'game.match_participants'::regclass,'nobi_private.admin_users'::regclass) and relrowsecurity)<>4 then raise exception 'competitive RLS absent';end if;
 if has_table_privilege('authenticated','game.match_participants','insert') or has_table_privilege('authenticated','game.match_participants','update') or has_table_privilege('authenticated','game.match_participants','delete') then raise exception 'participant identity writable';end if;
 if exists(select 1 from pg_publication_tables where schemaname='nobi_private' or tablename='settlement_audit') then raise exception 'private competition broadcast';end if;
 if not exists(select 1 from pg_indexes where schemaname='game' and indexname='one_active_test_season') then raise exception 'active season constraint absent';end if;
 if (select count(*) from pg_constraint where contype='f' and conrelid='game.match_participants'::regclass)<>2 or not exists(select 1 from pg_constraint where conname='match_room_fk' and conrelid='game.match_records'::regclass) then raise exception 'result foreign key protection absent';end if;
end $$;
