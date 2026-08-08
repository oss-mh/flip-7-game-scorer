import {
  GameAlreadyExistsError,
  GameNotFoundError,
  StorageUnavailableError,
} from "./errors.js";

import type {
  AppendResult,
  GameEvent,
  GameId,
  GameMeta,
  GameRepository,
  GameState,
  Snapshot,
  StoredEvent,
} from "@flip-7/engine";

/**
 * What a `GameServerActions` call can fail with, in a shape that survives
 * the client/server boundary intact. Thrown errors don't reliably keep
 * their class across a Server Action response — only `ActionResult` is
 * guaranteed to round-trip, so this is the one channel `HttpGameRepository`
 * trusts to reconstruct a real typed error client-side.
 */
export type ActionErrorCode = "not_found" | "already_exists" | "invalid" | "unavailable";

export type ActionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ActionErrorCode; readonly message: string };

/**
 * The transport `HttpGameRepository` is built on: one function per
 * `GameRepository` method, each returning an `ActionResult` instead of
 * throwing or rejecting directly. In `apps/web` these are backed by Next.js
 * Server Actions (`"use server"` functions) — see
 * `apps/web/lib/serverActions/gameActions.ts` and
 * `createSupabaseGameServerActions` in `./supabaseGameServerActions.js` for
 * what actually implements them. Structurally identical to
 * `GameRepository` deliberately, just with every return wrapped — kept as
 * its own type rather than reusing `GameRepository` directly so the
 * "this crosses a network boundary and can fail in transport-specific
 * ways" distinction stays visible at the type level.
 */
export interface GameServerActions {
  createGame(game: GameMeta): Promise<ActionResult<void>>;
  listGames(): Promise<ActionResult<readonly GameMeta[]>>;
  loadEvents(gameId: GameId, sinceVersion?: number): Promise<ActionResult<readonly StoredEvent[]>>;
  appendEvents(
    gameId: GameId,
    events: readonly GameEvent[],
    expectedVersion: number,
  ): Promise<ActionResult<AppendResult>>;
  truncateEvents(gameId: GameId, toVersion: number): Promise<ActionResult<void>>;
  saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<ActionResult<void>>;
  loadSnapshot(gameId: GameId): Promise<ActionResult<Snapshot | null>>;
  archiveGame(gameId: GameId, archivedAt: string): Promise<ActionResult<void>>;
  unarchiveGame(gameId: GameId): Promise<ActionResult<void>>;
  deleteGame(gameId: GameId): Promise<ActionResult<void>>;
}

function toTypedError(code: ActionErrorCode, message: string, gameId?: string): Error {
  switch (code) {
    case "not_found":
      return new GameNotFoundError(gameId ?? message);
    case "already_exists":
      return new GameAlreadyExistsError(gameId ?? message);
    case "unavailable":
      return new StorageUnavailableError(message);
    case "invalid":
      return new Error(message);
  }
}

/**
 * Runs one `GameServerActions` call and unwraps it into a plain value or a
 * thrown typed error — the one place that translation happens, so every
 * method below stays a one-liner. A call that never reaches the
 * `ActionResult` return at all (offline, DNS failure, a stale deployment's
 * "failed to find Server Action") is exactly the network-failure case
 * `StorageUnavailableError` already exists for — see docs/adr/0002 and the
 * `localStorage` adapter's own use of it for "storage isn't reachable right
 * now", which is just as true of an unreachable server as an unreachable
 * browser API.
 */
async function call<T>(operation: () => Promise<ActionResult<T>>, gameId?: string): Promise<T> {
  let result: ActionResult<T>;
  try {
    result = await operation();
  } catch {
    throw new StorageUnavailableError(
      "Can't reach the server right now — your local copy is safe, and this will retry.",
    );
  }

  if (!result.ok) {
    throw toTypedError(result.code, result.message, gameId);
  }
  return result.value;
}

/**
 * `GameRepository` backed by a remote server over `GameServerActions`. See
 * README, "InMemory · LocalStorage · Http" and docs/adr/0004 for why the
 * remote side is Supabase specifically — this class itself has no
 * knowledge of that, it only knows how to call the transport it's given
 * and translate what comes back.
 */
export class HttpGameRepository implements GameRepository {
  readonly #actions: GameServerActions;

  constructor(actions: GameServerActions) {
    this.#actions = actions;
  }

  async createGame(game: GameMeta): Promise<void> {
    await call(() => this.#actions.createGame(game), game.id);
  }

  async listGames(): Promise<readonly GameMeta[]> {
    return call(() => this.#actions.listGames());
  }

  async loadEvents(gameId: GameId, sinceVersion = 0): Promise<readonly StoredEvent[]> {
    return call(() => this.#actions.loadEvents(gameId, sinceVersion), gameId);
  }

  async appendEvents(
    gameId: GameId,
    events: readonly GameEvent[],
    expectedVersion: number,
  ): Promise<AppendResult> {
    return call(() => this.#actions.appendEvents(gameId, events, expectedVersion), gameId);
  }

  async truncateEvents(gameId: GameId, toVersion: number): Promise<void> {
    await call(() => this.#actions.truncateEvents(gameId, toVersion), gameId);
  }

  async saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<void> {
    await call(() => this.#actions.saveSnapshot(gameId, version, state), gameId);
  }

  async loadSnapshot(gameId: GameId): Promise<Snapshot | null> {
    return call(() => this.#actions.loadSnapshot(gameId), gameId);
  }

  async archiveGame(gameId: GameId, archivedAt: string): Promise<void> {
    await call(() => this.#actions.archiveGame(gameId, archivedAt), gameId);
  }

  async unarchiveGame(gameId: GameId): Promise<void> {
    await call(() => this.#actions.unarchiveGame(gameId), gameId);
  }

  async deleteGame(gameId: GameId): Promise<void> {
    await call(() => this.#actions.deleteGame(gameId), gameId);
  }
}
