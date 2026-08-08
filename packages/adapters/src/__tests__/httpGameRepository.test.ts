import { EVENT_SCHEMA_VERSION } from "@flip-7/engine";
import { describe, expect, it, vi } from "vitest";

import { GameAlreadyExistsError, GameNotFoundError, StorageUnavailableError } from "../errors.js";
import { HttpGameRepository } from "../httpGameRepository.js";
import { runRepositoryContractTests } from "../testing/repositoryContract.js";

import type { ActionResult, GameServerActions } from "../httpGameRepository.js";
import type {
  AppendResult,
  GameEvent,
  GameId,
  GameMeta,
  Snapshot,
  StoredEvent,
} from "@flip-7/engine";

/**
 * An in-process stand-in for the real Server Actions
 * (`apps/web/lib/serverActions/gameActions.ts`) that would call
 * `createSupabaseGameServerActions` in production. Reproduces the same
 * `ActionResult` contract — not_found on an unknown game, a version
 * conflict returned as a normal value rather than a failure — so running
 * the shared contract suite through it exercises exactly what
 * `HttpGameRepository` does with each shape, without needing a network or
 * a database. `createSupabaseGameServerActions` itself is covered
 * separately by the Docker + PostgREST integration test, which is what
 * actually proves the real Supabase wiring.
 */
function createFakeServerActions(): GameServerActions {
  const games = new Map<GameId, GameMeta>();
  const events = new Map<GameId, StoredEvent[]>();
  const snapshots = new Map<GameId, Snapshot>();

  function ok<T>(value: T): ActionResult<T> {
    return { ok: true, value };
  }
  function notFound<T>(gameId: GameId): ActionResult<T> {
    return { ok: false, code: "not_found", message: `Game "${gameId}" does not exist` };
  }

  return {
    async createGame(game) {
      if (games.has(game.id)) {
        return { ok: false, code: "already_exists", message: `Game "${game.id}" already exists` };
      }
      games.set(game.id, game);
      events.set(game.id, []);
      return ok(undefined);
    },

    async listGames() {
      return ok([...games.values()]);
    },

    async loadEvents(gameId, sinceVersion = 0) {
      if (!games.has(gameId)) return notFound(gameId);
      return ok(events.get(gameId)!.slice(sinceVersion));
    },

    async appendEvents(gameId, newEvents, expectedVersion) {
      if (!games.has(gameId)) return notFound(gameId);
      const existing = events.get(gameId)!;
      if (expectedVersion !== existing.length) {
        const result: AppendResult = { outcome: "conflict", currentVersion: existing.length };
        return ok(result);
      }
      existing.push(...newEvents);
      const result: AppendResult = { outcome: "appended", version: existing.length };
      return ok(result);
    },

    async truncateEvents(gameId, toVersion) {
      if (!games.has(gameId)) return notFound(gameId);
      events.set(gameId, events.get(gameId)!.slice(0, toVersion));
      const snapshot = snapshots.get(gameId);
      if (snapshot && snapshot.version >= toVersion) {
        snapshots.delete(gameId);
      }
      return ok(undefined);
    },

    async saveSnapshot(gameId, version, state) {
      if (!games.has(gameId)) return notFound(gameId);
      snapshots.set(gameId, { version, schemaVersion: EVENT_SCHEMA_VERSION, state });
      return ok(undefined);
    },

    async loadSnapshot(gameId) {
      if (!games.has(gameId)) return notFound(gameId);
      return ok(snapshots.get(gameId) ?? null);
    },

    async archiveGame(gameId, archivedAt) {
      const game = games.get(gameId);
      if (!game) return notFound(gameId);
      games.set(gameId, { ...game, archivedAt });
      return ok(undefined);
    },

    async unarchiveGame(gameId) {
      const game = games.get(gameId);
      if (!game) return notFound(gameId);
      games.set(gameId, { ...game, archivedAt: null });
      return ok(undefined);
    },

    async deleteGame(gameId) {
      games.delete(gameId);
      events.delete(gameId);
      snapshots.delete(gameId);
      return ok(undefined);
    },
  };
}

runRepositoryContractTests(() => new HttpGameRepository(createFakeServerActions()));

function buildMeta(id = "game-1"): GameMeta {
  return {
    id,
    players: [{ id: "alice", name: "Alice" }],
    targetScore: 200,
    createdAt: "2026-08-08T00:00:00.000Z",
    archivedAt: null,
  };
}

describe("HttpGameRepository error translation", () => {
  it("throws StorageUnavailableError when the transport itself rejects (offline, unreachable)", async () => {
    const actions: GameServerActions = {
      createGame: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      listGames: vi.fn(),
      loadEvents: vi.fn(),
      appendEvents: vi.fn(),
      truncateEvents: vi.fn(),
      saveSnapshot: vi.fn(),
      loadSnapshot: vi.fn(),
      archiveGame: vi.fn(),
      unarchiveGame: vi.fn(),
      deleteGame: vi.fn(),
    };
    const repo = new HttpGameRepository(actions);

    await expect(repo.createGame(buildMeta())).rejects.toThrow(StorageUnavailableError);
  });

  it("reconstructs GameNotFoundError from an ActionResult not_found code", async () => {
    const actions = createFakeServerActions();
    const repo = new HttpGameRepository(actions);

    await expect(repo.loadEvents("missing")).rejects.toThrow(GameNotFoundError);
  });

  it("reconstructs GameAlreadyExistsError from an ActionResult already_exists code", async () => {
    const actions = createFakeServerActions();
    const repo = new HttpGameRepository(actions);
    await repo.createGame(buildMeta());

    await expect(repo.createGame(buildMeta())).rejects.toThrow(GameAlreadyExistsError);
  });

  it("reconstructs StorageUnavailableError from an ActionResult unavailable code, with the server's message", async () => {
    const actions: GameServerActions = {
      ...createFakeServerActions(),
      listGames: async () => ({ ok: false, code: "unavailable", message: "RLS denied the read" }),
    };
    const repo = new HttpGameRepository(actions);

    await expect(repo.listGames()).rejects.toThrow("RLS denied the read");
  });

  it("surfaces a server-side engine validation failure as a plain Error carrying the server's message", async () => {
    const actions: GameServerActions = {
      ...createFakeServerActions(),
      appendEvents: async () => ({
        ok: false,
        code: "invalid",
        message: "That card is not a legal play right now",
      }),
    };
    const repo = new HttpGameRepository(actions);

    await expect(repo.appendEvents("game-1", [] as readonly GameEvent[], 0)).rejects.toThrow(
      "That card is not a legal play right now",
    );
  });

  it("does not wrap a conflict AppendResult as an error — it's a normal return value", async () => {
    const actions = createFakeServerActions();
    const repo = new HttpGameRepository(actions);
    await repo.createGame(buildMeta());
    const event: GameEvent = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      at: "2026-08-08T00:00:00.000Z",
      seq: 0,
      t: "GameCreated",
      players: buildMeta().players,
    };
    await repo.appendEvents("game-1", [event], 0);

    await expect(repo.appendEvents("game-1", [event], 0)).resolves.toEqual({
      outcome: "conflict",
      currentVersion: 1,
    });
  });
});
