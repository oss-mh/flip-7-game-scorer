import { EVENT_SCHEMA_VERSION } from "@flip-7/engine";

import {
  GameAlreadyExistsError,
  GameNotFoundError,
  StorageFullError,
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

const STORAGE_PREFIX = "flip7:v1";

function gamesIndexKey(): string {
  return `${STORAGE_PREFIX}:games`;
}

function eventsKey(gameId: GameId): string {
  return `${STORAGE_PREFIX}:game:${gameId}:events`;
}

function snapshotKey(gameId: GameId): string {
  return `${STORAGE_PREFIX}:game:${gameId}:snapshot`;
}

/**
 * Deferred until a method actually runs, never at construction — so simply
 * instantiating this repository during a Next.js server render (no
 * `window`) doesn't blow up. See AGENTS.md acceptance criteria, "no access
 * to `window` during render".
 */
function getStorage(): Storage {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    throw new StorageUnavailableError();
  }
  return window.localStorage;
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new StorageFullError();
    }
    throw error;
  }
}

/**
 * A corrupt entry is moved aside under `${key}:corrupt` rather than left in
 * place, so it doesn't keep failing to parse on every future read, and
 * removed from its real key so callers see the same "missing" state a
 * fresh install would have. Best-effort: if quarantining itself throws
 * (e.g. the store is full), dropping the entry is still better than
 * crashing the app on every subsequent read.
 */
function quarantine(storage: Storage, key: string, raw: string): void {
  try {
    storage.setItem(`${key}:corrupt`, raw);
  } catch {
    // best-effort, see doc comment above
  }
  storage.removeItem(key);
}

function readJsonArray<T>(storage: Storage, key: string): T[] {
  const raw = storage.getItem(key);
  if (raw === null) {
    return [];
  }

  const parsed: unknown = safeParse(raw);
  if (!Array.isArray(parsed)) {
    quarantine(storage, key, raw);
    return [];
  }
  return parsed as T[];
}

function readJsonObject<T>(storage: Storage, key: string): T | null {
  const raw = storage.getItem(key);
  if (raw === null) {
    return null;
  }

  const parsed = safeParse(raw);
  if (parsed === undefined) {
    quarantine(storage, key, raw);
    return null;
  }
  return parsed as T;
}

/** `undefined` signals "unparseable" — `JSON.parse` output is never itself `undefined`. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The day-one adapter: `GameRepository` backed by the browser's
 * `localStorage`. Namespaced keys (`flip7:v1:...`) keep this app's data
 * apart from anything else sharing the origin, and a version prefix leaves
 * room for a future incompatible storage layout without touching existing
 * data. See README, "The storage port".
 */
export class LocalStorageGameRepository implements GameRepository {
  async createGame(game: GameMeta): Promise<void> {
    const storage = getStorage();
    const games = readJsonArray<GameMeta>(storage, gamesIndexKey());

    if (games.some((existing) => existing.id === game.id)) {
      throw new GameAlreadyExistsError(game.id);
    }

    writeJson(storage, gamesIndexKey(), [...games, game]);
  }

  async listGames(): Promise<readonly GameMeta[]> {
    return readJsonArray<GameMeta>(getStorage(), gamesIndexKey());
  }

  async loadEvents(gameId: GameId, sinceVersion = 0): Promise<readonly StoredEvent[]> {
    const storage = getStorage();
    this.#requireGame(storage, gameId);
    return readJsonArray<StoredEvent>(storage, eventsKey(gameId)).slice(sinceVersion);
  }

  async appendEvents(
    gameId: GameId,
    events: readonly GameEvent[],
    expectedVersion: number,
  ): Promise<AppendResult> {
    const storage = getStorage();
    this.#requireGame(storage, gameId);

    const existing = readJsonArray<StoredEvent>(storage, eventsKey(gameId));
    const currentVersion = existing.length;
    if (expectedVersion !== currentVersion) {
      return { outcome: "conflict", currentVersion };
    }

    // One write for the whole batch, not one per event — see AGENTS.md
    // acceptance criteria, "Appends are batched into a single write per
    // dispatch".
    const updated = [...existing, ...events];
    writeJson(storage, eventsKey(gameId), updated);
    return { outcome: "appended", version: updated.length };
  }

  async truncateEvents(gameId: GameId, toVersion: number): Promise<void> {
    const storage = getStorage();
    this.#requireGame(storage, gameId);

    const existing = readJsonArray<StoredEvent>(storage, eventsKey(gameId));
    writeJson(storage, eventsKey(gameId), existing.slice(0, toVersion));

    const snapshot = readJsonObject<Snapshot>(storage, snapshotKey(gameId));
    if (snapshot !== null && snapshot.version >= toVersion) {
      storage.removeItem(snapshotKey(gameId));
    }
  }

  async saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<void> {
    const storage = getStorage();
    this.#requireGame(storage, gameId);
    writeJson(storage, snapshotKey(gameId), {
      version,
      schemaVersion: EVENT_SCHEMA_VERSION,
      state,
    });
  }

  async loadSnapshot(gameId: GameId): Promise<Snapshot | null> {
    const storage = getStorage();
    this.#requireGame(storage, gameId);
    return readJsonObject<Snapshot>(storage, snapshotKey(gameId));
  }

  async archiveGame(gameId: GameId, archivedAt: string): Promise<void> {
    this.#updateMeta(getStorage(), gameId, (meta) => ({ ...meta, archivedAt }));
  }

  async unarchiveGame(gameId: GameId): Promise<void> {
    this.#updateMeta(getStorage(), gameId, (meta) => ({ ...meta, archivedAt: null }));
  }

  async deleteGame(gameId: GameId): Promise<void> {
    const storage = getStorage();
    const games = readJsonArray<GameMeta>(storage, gamesIndexKey());
    writeJson(
      storage,
      gamesIndexKey(),
      games.filter((game) => game.id !== gameId),
    );
    storage.removeItem(eventsKey(gameId));
    storage.removeItem(snapshotKey(gameId));
  }

  #requireGame(storage: Storage, gameId: GameId): void {
    const games = readJsonArray<GameMeta>(storage, gamesIndexKey());
    if (!games.some((game) => game.id === gameId)) {
      throw new GameNotFoundError(gameId);
    }
  }

  #updateMeta(storage: Storage, gameId: GameId, update: (meta: GameMeta) => GameMeta): void {
    const games = readJsonArray<GameMeta>(storage, gamesIndexKey());
    const existing = games.find((game) => game.id === gameId);
    if (!existing) {
      throw new GameNotFoundError(gameId);
    }

    const updated = games.map((game) => (game.id === gameId ? update(existing) : game));
    writeJson(storage, gamesIndexKey(), updated);
  }
}
