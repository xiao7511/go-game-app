-- Local fixture only. Private deal/replay state is NEVER exposed by PostgREST or Realtime.
create schema nobi_private;
revoke all on schema nobi_private from public,anon,authenticated;
grant usage on schema nobi_private to nobi_authority;
create table nobi_private.room_snapshots(
 room_id uuid primary key references game.rooms(id) on delete cascade,
 version int not null check(version>=0),
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table nobi_private.room_snapshots enable row level security;
revoke all on nobi_private.room_snapshots from public,anon,authenticated;
grant select,insert,update on nobi_private.room_snapshots to nobi_authority;
create policy authority_snapshots on nobi_private.room_snapshots to nobi_authority using(true) with check(true);
grant select on game.room_members to nobi_authority;
create policy authority_members_read on game.room_members for select to nobi_authority using(true);
