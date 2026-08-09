-- M10 (#92): join-code sharing, on top of the single-owner schema from
-- 20260808120000_event_log_schema.sql. That migration's RLS comment
-- called this out as deliberately deferred rather than guessed at — this
-- is #91/#92 settling the shape.
--
-- Access to a game is now owner OR listed participant. A participant
-- never gets there by inserting themselves — the only door is
-- `redeem_join_code`, which checks the code and adds the row itself
-- (security definer, same pattern `truncate_game_events` already uses for
-- "the only sanctioned way to do X" — see that function's comment).

alter table public.games add column join_code text not null unique;

create table public.game_participants (
  game_id text not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.game_participants enable row level security;
grant select on public.game_participants to authenticated;

-- A participant can see their own membership rows (needed for the exists()
-- checks below to resolve under RLS — see the note on those). No insert/
-- update/delete grant: `redeem_join_code` is the only way in, same as
-- `game_events` has no direct delete grant and goes through
-- `truncate_game_events` instead.
create policy "select own participation" on public.game_participants
  for select using (user_id = auth.uid());

-- Replacing the M10/#89 owner-only policies with owner-or-participant.
-- games itself stays owner-only for insert/update/delete: only the
-- creator can archive or delete a shared game for everyone, or the join
-- code becomes useless the moment anyone could rewrite it out from under
-- the others at the table.
drop policy "select own games" on public.games;
create policy "select own or shared games" on public.games
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.game_participants p
      where p.game_id = games.id and p.user_id = auth.uid()
    )
  );

drop policy "select own game events" on public.game_events;
create policy "select own or shared game events" on public.game_events
  for select using (
    exists (
      select 1 from public.games g
      where g.id = game_events.game_id
        and (
          g.owner_id = auth.uid()
          or exists (
            select 1 from public.game_participants p
            where p.game_id = g.id and p.user_id = auth.uid()
          )
        )
    )
  );

drop policy "insert own game events" on public.game_events;
create policy "insert own or shared game events" on public.game_events
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_events.game_id
        and (
          g.owner_id = auth.uid()
          or exists (
            select 1 from public.game_participants p
            where p.game_id = g.id and p.user_id = auth.uid()
          )
        )
    )
  );

drop policy "select own game snapshots" on public.game_snapshots;
create policy "select own or shared game snapshots" on public.game_snapshots
  for select using (
    exists (
      select 1 from public.games g
      where g.id = game_snapshots.game_id
        and (
          g.owner_id = auth.uid()
          or exists (
            select 1 from public.game_participants p
            where p.game_id = g.id and p.user_id = auth.uid()
          )
        )
    )
  );

drop policy "insert own game snapshots" on public.game_snapshots;
create policy "insert own or shared game snapshots" on public.game_snapshots
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_snapshots.game_id
        and (
          g.owner_id = auth.uid()
          or exists (
            select 1 from public.game_participants p
            where p.game_id = g.id and p.user_id = auth.uid()
          )
        )
    )
  );

drop policy "update own game snapshots" on public.game_snapshots;
create policy "update own or shared game snapshots" on public.game_snapshots
  for update using (
    exists (
      select 1 from public.games g
      where g.id = game_snapshots.game_id
        and (
          g.owner_id = auth.uid()
          or exists (
            select 1 from public.game_participants p
            where p.game_id = g.id and p.user_id = auth.uid()
          )
        )
    )
  );

-- truncate_game_events' ownership check needs the same owner-or-participant
-- widening — a participant undoing their own mistap shouldn't need to be
-- the game's creator.
create or replace function public.truncate_game_events(p_game_id text, p_to_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.games g
    where g.id = p_game_id
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from public.game_participants p
          where p.game_id = g.id and p.user_id = auth.uid()
        )
      )
  ) then
    raise exception 'game % not found or not accessible to the caller', p_game_id;
  end if;

  delete from public.game_events where game_id = p_game_id and seq >= p_to_version;
  delete from public.game_snapshots where game_id = p_game_id and version >= p_to_version;
end;
$$;

-- Redeeming a code is the only door into game_participants — the caller
-- can't see the target game yet (that's the whole point of joining), so
-- this has to run as security definer to look it up by code and insert
-- the membership row itself, the same bootstrap problem
-- truncate_game_events' comment already describes for a different table.
create or replace function public.redeem_join_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id text;
  v_owner_id uuid;
begin
  select id, owner_id into v_game_id, v_owner_id
  from public.games
  where join_code = p_code;

  if v_game_id is null then
    raise exception 'No game found for that code';
  end if;

  if v_owner_id = auth.uid() then
    return v_game_id;
  end if;

  insert into public.game_participants (game_id, user_id)
  values (v_game_id, auth.uid())
  on conflict (game_id, user_id) do nothing;

  return v_game_id;
end;
$$;

grant execute on function public.redeem_join_code(text) to authenticated;
