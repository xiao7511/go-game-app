-- Active state remains server-owned; DB exposes only validated metadata and receipts.
alter table game.rooms add column turn int not null default 0 check(turn between 0 and 3);
create table game.command_receipts (room_id uuid not null references game.rooms, actor_id uuid not null references auth.users, request_id text not null, state_version bigint not null, action text not null, payload_sha256 text not null, created_at timestamptz not null default now(), primary key(room_id,actor_id,request_id), unique(room_id,state_version));
alter table game.command_receipts enable row level security;
revoke all on game.command_receipts from public,anon,authenticated;
grant select on game.command_receipts to authenticated;
grant insert,select on game.command_receipts to nobi_authority;
create policy participant_receipts on game.command_receipts for select to authenticated using(game.is_member(room_id));
create policy authority_receipts on game.command_receipts for all to nobi_authority using(true) with check(true);
