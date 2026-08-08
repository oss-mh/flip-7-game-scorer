-- M10 (#89): initial remote schema for the event log.
--
-- Mirrors packages/engine/src/ports/gameRepository.ts one-for-one: `games`
-- is `GameMeta`, `game_events` is the append-only log of `StoredEvent`,
-- `game_snapshots` is `Snapshot`. See docs/adr/0004 for why this lives on
-- Supabase, and docs/adr/0002 for why `appendEvents` carries an
-- `expectedVersion` at all.
--
-- `owner_id` is the row-level-security boundary. It's not null and defaults
-- to `auth.uid()` so a game is always owned by whichever session created
-- it. Supabase Auth (magic-link or anonymous, #92) is assumed to exist
-- before any row is written here, even though the sign-in UI itself ships
-- later — anonymous sign-in gives every session a stable `auth.uid()` from
-- the start.

create table public.games (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  players jsonb not null,
  target_score integer not null,
  created_at timestamptz not null,
  archived_at timestamptz,
  inserted_at timestamptz not null default now()
);

create index games_owner_id_idx on public.games (owner_id);

-- The event log. `(game_id, seq)` as the primary key is both the unique
-- constraint #89 asks for and the natural index for the ordered range scan
-- `loadEvents(gameId, sinceVersion)` needs. There is deliberately no update
-- or delete policy, and no update/delete grant, on this table — see the RLS
-- section below. AGENTS.md invariant #4, "the event log is append-only", is
-- enforced here at the database, not only by adapter convention.
-- `seq` here is a storage position assigned by this adapter (0-indexed,
-- derived from `expectedVersion` — see `append_game_events` below), not the
-- same thing as the `seq` field inside the event JSON itself. `GameEvent`'s
-- own envelope `seq` (events.ts) is caller-assigned, opaque application
-- data as far as this port is concerned — `InMemoryGameRepository` and
-- `LocalStorageGameRepository` never look at it either, they just track
-- array position. Deliberately not constrained to match: the shared
-- contract test suite (packages/adapters/src/testing/repositoryContract.ts)
-- exercises `appendEvents` with payload `seq` values that don't correspond
-- to storage position, and every adapter — this one included — must accept
-- them unchanged for that suite to stay adapter-agnostic.
create table public.game_events (
  game_id uuid not null references public.games (id) on delete cascade,
  seq integer not null,
  event jsonb not null,
  inserted_at timestamptz not null default now(),
  primary key (game_id, seq)
);

-- One row per game: `saveSnapshot` overwrites rather than accumulates (see
-- the contract test "overwrites a previous snapshot rather than keeping
-- both"), so `game_id` as the primary key makes that an upsert for free.
create table public.game_snapshots (
  game_id uuid primary key references public.games (id) on delete cascade,
  version integer not null,
  schema_version integer not null,
  state jsonb not null,
  inserted_at timestamptz not null default now()
);

-- Row Level Security -----------------------------------------------------
-- Every table is owner-scoped through `games.owner_id`; nobody reaches a
-- game they didn't create. #91/#92 will extend this with a participants
-- table for join-code sharing and multi-device sync — deliberately not
-- built here, since nothing #89 needs requires more than single-owner
-- access yet, and building it now would be guessing at a shape #91/#92
-- haven't settled.

alter table public.games enable row level security;
alter table public.game_events enable row level security;
alter table public.game_snapshots enable row level security;

grant select, insert, update, delete on public.games to authenticated;
grant select, insert on public.game_events to authenticated;
grant select, insert, update on public.game_snapshots to authenticated;

create policy "select own games" on public.games
  for select using (owner_id = auth.uid());
create policy "insert own games" on public.games
  for insert with check (owner_id = auth.uid());
create policy "update own games" on public.games
  for update using (owner_id = auth.uid());
create policy "delete own games" on public.games
  for delete using (owner_id = auth.uid());

create policy "select own game events" on public.game_events
  for select using (
    exists (
      select 1 from public.games g where g.id = game_events.game_id and g.owner_id = auth.uid()
    )
  );
create policy "insert own game events" on public.game_events
  for insert with check (
    exists (
      select 1 from public.games g where g.id = game_events.game_id and g.owner_id = auth.uid()
    )
  );
-- No update/delete policy: see the table comment above. Truncation goes
-- through `truncate_game_events` below, a security-definer function that
-- checks ownership itself and is the only thing with delete rights on this
-- table.

create policy "select own game snapshots" on public.game_snapshots
  for select using (
    exists (
      select 1 from public.games g where g.id = game_snapshots.game_id and g.owner_id = auth.uid()
    )
  );
create policy "insert own game snapshots" on public.game_snapshots
  for insert with check (
    exists (
      select 1 from public.games g where g.id = game_snapshots.game_id and g.owner_id = auth.uid()
    )
  );
create policy "update own game snapshots" on public.game_snapshots
  for update using (
    exists (
      select 1 from public.games g where g.id = game_snapshots.game_id and g.owner_id = auth.uid()
    )
  );
-- Snapshots aren't append-only (`saveSnapshot` overwrites in place), so a
-- direct update policy is fine — there's no invariant here to protect with
-- a function the way there is for events.

-- Atomic conditional append ------------------------------------------------
-- `GameRepository.appendEvents` needs a check-then-insert that two
-- concurrent callers both expecting the same version can't both win. The
-- primary key on `(game_id, seq)` is what actually makes this atomic: the
-- multi-row insert below either lands entirely or violates the key
-- entirely — Postgres gives no partial-insert straddle to race against.
-- `security invoker` deliberately, so the ownership check comes from the
-- RLS insert policy above, not from this function trusting its caller.
create or replace function public.append_game_events(
  p_game_id uuid,
  p_events jsonb,
  p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_version integer;
begin
  insert into public.game_events (game_id, seq, event)
  select p_game_id, (p_expected_version + (idx - 1))::integer, elem
  from jsonb_array_elements(p_events) with ordinality as t (elem, idx);

  return jsonb_build_object(
    'outcome', 'appended',
    'version', p_expected_version + jsonb_array_length(p_events)
  );
exception
  when unique_violation then
    select count(*) into v_current_version
    from public.game_events
    where game_id = p_game_id;

    return jsonb_build_object('outcome', 'conflict', 'currentVersion', v_current_version);
end;
$$;

grant execute on function public.append_game_events(uuid, jsonb, integer) to authenticated;

-- Sanctioned truncation -----------------------------------------------------
-- The one non-append write this log ever takes — AGENTS.md invariant #4:
-- "corrections are new events, or an explicit log truncation via the undo
-- path". `security definer` because there is intentionally no delete grant
-- or policy on `game_events`/`game_snapshots` for anything else to use —
-- this function is the only door, and it checks ownership itself before it
-- deletes anything.
create or replace function public.truncate_game_events(p_game_id uuid, p_to_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.games where id = p_game_id and owner_id = auth.uid()
  ) then
    raise exception 'game % not found or not owned by the caller', p_game_id;
  end if;

  delete from public.game_events where game_id = p_game_id and seq >= p_to_version;
  delete from public.game_snapshots where game_id = p_game_id and version >= p_to_version;
end;
$$;

grant execute on function public.truncate_game_events(uuid, integer) to authenticated;
