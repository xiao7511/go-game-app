-- Supabase schema for Go Game Pro
-- Run this in the Supabase SQL editor.

create table if not exists public.waiting_room (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  black_id uuid not null references auth.users(id) on delete cascade,
  white_id uuid not null references auth.users(id) on delete cascade,
  board_state jsonb not null default '[]'::jsonb,
  next_turn text not null default 'black',
  black_captures integer not null default 0,
  white_captures integer not null default 0,
  moves jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_game_sessions on public.game_sessions;
create trigger trg_touch_game_sessions
before update on public.game_sessions
for each row execute function public.touch_updated_at();

alter table public.waiting_room enable row level security;
alter table public.game_sessions enable row level security;

-- Minimal policies; adjust for your security model as needed.
drop policy if exists "waiting room read own" on public.waiting_room;
drop policy if exists "waiting room write own" on public.waiting_room;
drop policy if exists "game sessions read participants" on public.game_sessions;
drop policy if exists "game sessions write participants" on public.game_sessions;

create policy "waiting room read own"
on public.waiting_room
for select
using (auth.uid() = user_id);

create policy "waiting room write own"
on public.waiting_room
for insert
with check (auth.uid() = user_id);

create policy "game sessions read participants"
on public.game_sessions
for select
using (auth.uid() = black_id or auth.uid() = white_id);

create policy "game sessions write participants"
on public.game_sessions
for update
using (auth.uid() = black_id or auth.uid() = white_id)
with check (auth.uid() = black_id or auth.uid() = white_id);

create policy "game sessions insert authenticated"
on public.game_sessions
for insert
with check (auth.role() = 'authenticated');
