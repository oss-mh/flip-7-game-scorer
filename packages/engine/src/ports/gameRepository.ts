import type { GameEvent } from "../events.js";
import type { Player } from "../player.js";
import type { GameState } from "../state.js";

export type GameId = string;

/**
 * What's known about a game before its event log is loaded — enough to
 * render a "resume game" list without folding every stored game's full
 * history up front.
 */
export interface GameMeta {
  readonly id: GameId;
  readonly players: readonly Player[];
  readonly targetScore: number;
  readonly createdAt: string;
}

export type StoredEvent = GameEvent;

export interface Snapshot {
  readonly version: number;
  readonly schemaVersion: number;
  readonly state: GameState;
}

/**
 * The outcome of an `appendEvents` call. A stale `expectedVersion` is an
 * outcome the caller must handle, not an exception they might not catch —
 * see docs/adr/0002 for why this exists even though only a future networked
 * adapter can ever actually reach the `conflict` branch.
 */
export type AppendResult =
  | { readonly outcome: "appended"; readonly version: number }
  | { readonly outcome: "conflict"; readonly currentVersion: number };

/**
 * Storage boundary for a game's event log. Implemented by adapters in
 * `packages/adapters`; `apps/web` depends on this type only, resolved at a
 * single composition root — see README "The storage port" and
 * docs/adr/0002-repository-port-optimistic-concurrency.md.
 */
export interface GameRepository {
  createGame(game: GameMeta): Promise<void>;
  listGames(): Promise<readonly GameMeta[]>;
  loadEvents(gameId: GameId, sinceVersion?: number): Promise<readonly StoredEvent[]>;
  appendEvents(
    gameId: GameId,
    events: readonly GameEvent[],
    expectedVersion: number,
  ): Promise<AppendResult>;
  saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<void>;
  loadSnapshot(gameId: GameId): Promise<Snapshot | null>;
  deleteGame(gameId: GameId): Promise<void>;
}
