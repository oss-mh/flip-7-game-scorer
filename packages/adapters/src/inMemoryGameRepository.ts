import { EVENT_SCHEMA_VERSION } from "@flip-7/engine";

import { GameAlreadyExistsError, GameNotFoundError } from "./errors.js";

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

interface StoredGame {
  meta: GameMeta;
  events: StoredEvent[];
  snapshot: Snapshot | null;
}

/**
 * The default adapter: a `GameRepository` backed by an in-memory `Map`,
 * nothing persisted beyond the process. Used as the test-suite default and
 * for Storybook-style previews — see README, "InMemory · LocalStorage ·
 * (later) Http".
 */
export class InMemoryGameRepository implements GameRepository {
  readonly #games = new Map<GameId, StoredGame>();

  async createGame(game: GameMeta): Promise<void> {
    if (this.#games.has(game.id)) {
      throw new GameAlreadyExistsError(game.id);
    }
    this.#games.set(game.id, { meta: game, events: [], snapshot: null });
  }

  async listGames(): Promise<readonly GameMeta[]> {
    return [...this.#games.values()].map((game) => game.meta);
  }

  async loadEvents(gameId: GameId, sinceVersion = 0): Promise<readonly StoredEvent[]> {
    return this.#require(gameId).events.slice(sinceVersion);
  }

  async appendEvents(
    gameId: GameId,
    events: readonly GameEvent[],
    expectedVersion: number,
  ): Promise<AppendResult> {
    const game = this.#require(gameId);
    const currentVersion = game.events.length;

    if (expectedVersion !== currentVersion) {
      return { outcome: "conflict", currentVersion };
    }

    game.events.push(...events);
    return { outcome: "appended", version: game.events.length };
  }

  async saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<void> {
    this.#require(gameId).snapshot = { version, schemaVersion: EVENT_SCHEMA_VERSION, state };
  }

  async loadSnapshot(gameId: GameId): Promise<Snapshot | null> {
    return this.#require(gameId).snapshot;
  }

  async deleteGame(gameId: GameId): Promise<void> {
    this.#games.delete(gameId);
  }

  #require(gameId: GameId): StoredGame {
    const game = this.#games.get(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }
    return game;
  }
}
