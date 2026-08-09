import { EVENT_SCHEMA_VERSION, fold, reduce } from "@flip-7/engine";

import type { ActionErrorCode, ActionResult, GameServerActions } from "./httpGameRepository.js";
import type {
  AppendResult,
  GameEvent,
  GameId,
  GameMeta,
  GameState,
  Player,
  Snapshot,
  StoredEvent,
} from "@flip-7/engine";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/**
 * The Postgres error code for a unique-constraint violation — Postgres's
 * own SQLSTATE, not a Supabase- or PostgREST-specific code. Used to tell
 * "this game id is already taken" (`games_pkey`) apart from any other
 * write failure.
 */
const UNIQUE_VIOLATION = "23505";

/**
 * Excludes 0/O and 1/I/L — a code that's read aloud or typed at the table
 * shouldn't hinge on telling those apart. 6 characters over this 32-symbol
 * alphabet is ~1 billion combinations, comfortably collision-free for this
 * app's scale; `createGame` still retries on the rare unique-constraint hit
 * rather than assuming it can never happen.
 */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 6;
const MAX_JOIN_CODE_ATTEMPTS = 5;

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Not typed as `SupabaseClient<Database>` against a hand-written schema —
 * tried that first (mirroring `supabase/migrations/20260808120000_event_log_schema.sql`
 * one-for-one, standing in for `supabase gen types` since there's no live
 * project to generate against yet, see docs/adr/0004) and hit a genuine
 * `@supabase/supabase-js@2.112.2` / `@supabase/postgrest-js` type-inference
 * bug: once a table's `Row`/`Insert` has more than one property *and* the
 * schema's `Functions` map is non-empty, every `.insert()` on every table
 * silently resolves to `never`, with no error at the type's definition
 * site — only at each call site, as "Object literal may only specify known
 * properties, and 'x' does not exist in type 'never[]'". Confirmed with a
 * battery of minimal repros varying field count and function count in
 * isolation; each factor alone was fine, only the combination broke.
 *
 * Rather than fight that with `Database` shapes that happen to dodge it
 * (fragile — a future column added to `games` could silently retrigger
 * it), row shapes are cast explicitly at each read/write boundary below,
 * same as any `jsonb` column already needs. The real safety net is the
 * Docker + PostgREST integration test in
 * `packages/adapters/src/__tests__/supabaseGameServerActions.integration.test.ts`,
 * which runs every one of these queries against the real schema and would
 * fail on a genuine table/column mismatch regardless of what TypeScript
 * does or doesn't catch.
 */
export type SupabaseGameClient = SupabaseClient;

interface GameRow {
  readonly id: string;
  readonly players: readonly Player[];
  readonly target_score: number;
  readonly created_at: string;
  readonly archived_at: string | null;
}

interface GameEventRow {
  readonly event: StoredEvent;
}

interface GameSnapshotRow {
  readonly version: number;
  readonly schema_version: number;
  readonly state: GameState;
}

function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

function fail<T>(code: ActionErrorCode, message: string): ActionResult<T> {
  return { ok: false, code, message };
}

function unavailable<T>(error: PostgrestError): ActionResult<T> {
  return fail("unavailable", error.message);
}

function toMeta(row: GameRow): GameMeta {
  return {
    id: row.id,
    players: row.players,
    targetScore: row.target_score,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function gameExists(supabase: SupabaseGameClient, gameId: GameId): Promise<boolean> {
  const { data } = await supabase.from("games").select("id").eq("id", gameId).maybeSingle();
  return data !== null;
}

/**
 * Wraps a method body that needs the game to already exist — RLS makes a
 * game owned by someone else look identical to a missing one (no row,
 * still `not_found`), which is the correct behaviour: existence of another
 * player's game is never leaked. See docs/adr/0004 and the migration's RLS
 * section.
 */
async function withExistingGame<T>(
  supabase: SupabaseGameClient,
  gameId: GameId,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (!(await gameExists(supabase, gameId))) {
    return fail("not_found", `Game "${gameId}" does not exist`);
  }
  return run();
}

/**
 * The real `GameServerActions` implementation, talking to the schema and
 * RPCs from supabase/migrations/20260808120000_event_log_schema.sql. Takes
 * an already-authenticated `SupabaseClient` rather than constructing one
 * itself — building that client needs `next/headers` cookies, which is
 * Next-specific and lives in `apps/web/lib/serverActions/gameActions.ts`,
 * the thin `"use server"` layer that calls this. Keeping the Supabase
 * request logic here instead, in a plain framework-free module, is what
 * makes it reachable by Vitest — apps/web has no unit test runner of its
 * own (see its `test` script), so anything worth unit testing belongs in a
 * `packages/*` module, not in a Server Action file.
 */
export function createSupabaseGameServerActions(supabase: SupabaseGameClient): GameServerActions {
  return {
    async createGame(game: GameMeta): Promise<ActionResult<void>> {
      for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
        const { error } = await supabase.from("games").insert({
          id: game.id,
          players: game.players,
          target_score: game.targetScore,
          created_at: game.createdAt,
          archived_at: game.archivedAt,
          join_code: generateJoinCode(),
        });
        if (!error) return ok(undefined);
        if (error.code === UNIQUE_VIOLATION) {
          // Two different unique constraints share this SQLSTATE — a
          // colliding join code is retried with a fresh one, a colliding
          // game id is the real "already exists" the port promises.
          if (error.message.includes("join_code")) continue;
          return fail("already_exists", `Game "${game.id}" already exists`);
        }
        return unavailable(error);
      }
      return fail("unavailable", "Could not generate a unique join code — try again");
    },

    async listGames(): Promise<ActionResult<readonly GameMeta[]>> {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) return unavailable(error);
      return ok((data as GameRow[]).map(toMeta));
    },

    async loadEvents(
      gameId: GameId,
      sinceVersion = 0,
    ): Promise<ActionResult<readonly StoredEvent[]>> {
      return withExistingGame(supabase, gameId, async () => {
        const { data, error } = await supabase
          .from("game_events")
          .select("event")
          .eq("game_id", gameId)
          .gte("seq", sinceVersion)
          .order("seq", { ascending: true });
        if (error) return unavailable(error);
        return ok((data as GameEventRow[]).map((row) => row.event));
      });
    },

    async appendEvents(
      gameId: GameId,
      events: readonly GameEvent[],
      expectedVersion: number,
    ): Promise<ActionResult<AppendResult>> {
      return withExistingGame(supabase, gameId, async () => {
        // The engine validates server-side too, not just in the browser —
        // see AGENTS.md, "a component must never decide whether a move is
        // legal" and the Next.js Server Actions security guidance ("treat
        // every action as an untrusted entry point"). Replays against the
        // log as it actually stands in storage right now, which is the
        // authoritative state regardless of what the caller's
        // `expectedVersion` assumed.
        const { data: existingRows, error: readError } = await supabase
          .from("game_events")
          .select("event")
          .eq("game_id", gameId)
          .order("seq", { ascending: true });
        if (readError) return unavailable<AppendResult>(readError);

        try {
          const priorState = fold((existingRows as GameEventRow[]).map((row) => row.event));
          events.reduce(reduce, priorState);
        } catch (validationError) {
          return fail("invalid", toMessage(validationError));
        }

        const { data, error } = await supabase.rpc("append_game_events", {
          p_game_id: gameId,
          p_events: events,
          p_expected_version: expectedVersion,
        });
        if (error) return unavailable(error);
        return ok(data as AppendResult);
      });
    },

    async truncateEvents(gameId: GameId, toVersion: number): Promise<ActionResult<void>> {
      return withExistingGame(supabase, gameId, async () => {
        const { error } = await supabase.rpc("truncate_game_events", {
          p_game_id: gameId,
          p_to_version: toVersion,
        });
        if (error) return unavailable(error);
        return ok(undefined);
      });
    },

    async saveSnapshot(
      gameId: GameId,
      version: number,
      state: GameState,
    ): Promise<ActionResult<void>> {
      return withExistingGame(supabase, gameId, async () => {
        const { error } = await supabase.from("game_snapshots").upsert({
          game_id: gameId,
          version,
          schema_version: EVENT_SCHEMA_VERSION,
          state,
        });
        if (error) return unavailable(error);
        return ok(undefined);
      });
    },

    async loadSnapshot(gameId: GameId): Promise<ActionResult<Snapshot | null>> {
      return withExistingGame(supabase, gameId, async () => {
        const { data, error } = await supabase
          .from("game_snapshots")
          .select("version, schema_version, state")
          .eq("game_id", gameId)
          .maybeSingle();
        if (error) return unavailable(error);
        if (!data) return ok(null);
        const row = data as GameSnapshotRow;
        return ok({ version: row.version, schemaVersion: row.schema_version, state: row.state });
      });
    },

    async archiveGame(gameId: GameId, archivedAt: string): Promise<ActionResult<void>> {
      return withExistingGame(supabase, gameId, async () => {
        const { error } = await supabase
          .from("games")
          .update({ archived_at: archivedAt })
          .eq("id", gameId);
        if (error) return unavailable(error);
        return ok(undefined);
      });
    },

    async unarchiveGame(gameId: GameId): Promise<ActionResult<void>> {
      return withExistingGame(supabase, gameId, async () => {
        const { error } = await supabase
          .from("games")
          .update({ archived_at: null })
          .eq("id", gameId);
        if (error) return unavailable(error);
        return ok(undefined);
      });
    },

    async deleteGame(gameId: GameId): Promise<ActionResult<void>> {
      // No existence check, matching InMemoryGameRepository and
      // LocalStorageGameRepository: deleting a game that was never created
      // is a no-op, not an error — see the contract test "does not throw
      // when deleting a game that was never created".
      const { error } = await supabase.from("games").delete().eq("id", gameId);
      if (error) return unavailable(error);
      return ok(undefined);
    },
  };
}
