-- LOCAL ONLY: preserve UUID array compatibility while normalizing participant foreign keys.
alter table game.match_records add constraint match_room_fk foreign key(id) references game.rooms(id);
create table game.match_participants(match_id uuid references game.match_records(id) on delete cascade,user_id uuid references auth.users(id),seat int not null check(seat between 0 and 3),primary key(match_id,user_id),unique(match_id,seat));
insert into game.match_participants select m.id,p.uid,p.position-1 from game.match_records m cross join lateral unnest(m.participants) with ordinality p(uid,position);
alter table game.match_participants enable row level security;
revoke all on game.match_participants from public,anon,authenticated;
grant select on game.match_participants to authenticated,nobi_authority;
create policy participant_result_members on game.match_participants for select to authenticated using(exists(select 1 from game.match_records m where m.id=match_id and auth.uid()=any(m.participants)));
create policy authority_result_members on game.match_participants for select to nobi_authority using(true);
create function game.record_participants() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select array_agg(member.user_id order by member.seat) from game.room_members member where member.room_id=new.id) is distinct from new.participants then raise exception 'result participant identity mismatch';end if;
 insert into game.match_participants select new.id,p.uid,p.position-1 from unnest(new.participants) with ordinality p(uid,position);return new;
end $$;
revoke all on function game.record_participants() from public,anon,authenticated;
create trigger result_participant_fks after insert on game.match_records for each row execute function game.record_participants();
notify pgrst,'reload schema';
