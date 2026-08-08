"use server";

import { createSupabaseGameServerActions } from "@flip-7/adapters";

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

import type { ActionResult } from "@flip-7/adapters";
import type {
  AppendResult,
  GameEvent,
  GameId,
  GameMeta,
  GameState,
  Snapshot,
  StoredEvent,
} from "@flip-7/engine";

/**
 * One `"use server"` export per `GameRepository` method — the actual
 * network hop `HttpGameRepository` (packages/adapters) calls through, per
 * #88's "Server Actions as the transport". Each function is otherwise a
 * one-liner: build a request-scoped Supabase client, hand off to
 * `createSupabaseGameServerActions`, which is where the real logic (RLS-
 * aware queries, the append/conflict RPC, server-side engine validation)
 * lives — kept in `packages/adapters` rather than here specifically so
 * it's reachable by Vitest, since apps/web has no unit test runner of its
 * own. This file has to stay this thin for that split to hold.
 */

export async function createGameAction(game: GameMeta): Promise<ActionResult<void>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).createGame(game);
}

export async function listGamesAction(): Promise<ActionResult<readonly GameMeta[]>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).listGames();
}

export async function loadEventsAction(
  gameId: GameId,
  sinceVersion?: number,
): Promise<ActionResult<readonly StoredEvent[]>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).loadEvents(gameId, sinceVersion);
}

export async function appendEventsAction(
  gameId: GameId,
  events: readonly GameEvent[],
  expectedVersion: number,
): Promise<ActionResult<AppendResult>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).appendEvents(gameId, events, expectedVersion);
}

export async function truncateEventsAction(
  gameId: GameId,
  toVersion: number,
): Promise<ActionResult<void>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).truncateEvents(gameId, toVersion);
}

export async function saveSnapshotAction(
  gameId: GameId,
  version: number,
  state: GameState,
): Promise<ActionResult<void>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).saveSnapshot(gameId, version, state);
}

export async function loadSnapshotAction(gameId: GameId): Promise<ActionResult<Snapshot | null>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).loadSnapshot(gameId);
}

export async function archiveGameAction(
  gameId: GameId,
  archivedAt: string,
): Promise<ActionResult<void>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).archiveGame(gameId, archivedAt);
}

export async function unarchiveGameAction(gameId: GameId): Promise<ActionResult<void>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).unarchiveGame(gameId);
}

export async function deleteGameAction(gameId: GameId): Promise<ActionResult<void>> {
  const client = await createSupabaseServerClient();
  return createSupabaseGameServerActions(client).deleteGame(gameId);
}
