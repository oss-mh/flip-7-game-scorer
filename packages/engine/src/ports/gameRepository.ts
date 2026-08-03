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
  /**
   * When this game was archived, or `null` if it isn't. Archiving is app
   * bookkeeping, not something that happened at the table, so it lives here
   * rather than as a domain event — see AGENTS.md, "Events record what
   * happened, not what it means". An archived game stays in storage (still
   * available for stats) but is hidden from the default games list.
   */
  readonly archivedAt: string | null;
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
  /**
   * Drops every event from `toVersion` onward, keeping `[0, toVersion)`. The
   * one sanctioned way to shrink the log — see AGENTS.md invariant #4, "The
   * event log is append-only": corrections are new events, or this explicit
   * truncation, never an in-place edit or delete of a stored event. Used by
   * undo, which is otherwise a plain client-side operation. A stored
   * snapshot taken at or after `toVersion` is no longer a valid prefix of
   * the truncated log and must be dropped along with the events; one taken
   * before `toVersion` is still valid and is left alone.
   */
  truncateEvents(gameId: GameId, toVersion: number): Promise<void>;
  saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<void>;
  loadSnapshot(gameId: GameId): Promise<Snapshot | null>;
  /** Hides a game from the default games list without deleting its data. */
  archiveGame(gameId: GameId, archivedAt: string): Promise<void>;
  /** Reverses `archiveGame` — archiving is never a one-way trap. */
  unarchiveGame(gameId: GameId): Promise<void>;
  deleteGame(gameId: GameId): Promise<void>;
}
