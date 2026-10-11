-- Run only with scripts/private-contract.mjs against the labelled disposable local DB.
do $$ begin
 if has_schema_privilege('anon','nobi_private','usage') or has_schema_privilege('authenticated','nobi_private','usage') then raise exception 'private schema exposed'; end if;
 if has_table_privilege('authenticated','nobi_private.room_snapshots','select') or has_table_privilege('anon','nobi_private.room_snapshots','select') then raise exception 'private snapshot exposed'; end if;
 if not (select relrowsecurity from pg_class where oid='nobi_private.room_snapshots'::regclass) then raise exception 'private snapshot RLS missing'; end if;
 if exists(select 1 from pg_publication_tables where schemaname='nobi_private') then raise exception 'private state published'; end if;
 if has_table_privilege('authenticated','game.command_receipts','insert') or has_table_privilege('authenticated','game.match_records','insert') then raise exception 'client authority bypass'; end if;
 if not has_table_privilege('nobi_authority','nobi_private.room_snapshots','update') then raise exception 'authority persistence grant missing'; end if;
end $$;
