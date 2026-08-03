import { EVENT_SCHEMA_VERSION, initialState } from "@flip-7/engine";
import { beforeEach, describe, expect, it } from "vitest";

import type { GameCreatedEvent, GameMeta, GameRepository } from "@flip-7/engine";

function buildMeta(id: string): GameMeta {
  return {
    id,
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildEvent(seq: number): GameCreatedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-01-01T00:00:00.000Z",
    seq,
    t: "GameCreated",
    players: buildMeta("game-1").players,
  };
}

/**
 * The one behavioural checklist every `GameRepository` adapter must pass —
 * see README, "Every adapter must pass the same contract test suite; that
 * suite is what makes swapping storage safe rather than hopeful."
 *
 * Call this from each adapter's own test file with a factory that returns
 * a fresh, empty repository — clearing any storage the adapter shares
 * across instances (e.g. `localStorage`) first, since a `new` instance
 * alone doesn't guarantee isolation the way it does for an in-memory Map.
 */
export function runRepositoryContractTests(makeRepo: () => GameRepository): void {
  describe("GameRepository contract", () => {
    let repo: GameRepository;

    beforeEach(() => {
      repo = makeRepo();
    });

    describe("empty state", () => {
      it("lists no games", async () => {
        await expect(repo.listGames()).resolves.toEqual([]);
      });
    });

    describe("createGame / listGames", () => {
      it("makes a created game listable", async () => {
        const meta = buildMeta("game-1");
        await repo.createGame(meta);

        await expect(repo.listGames()).resolves.toEqual([meta]);
      });

      it("rejects creating a game with a duplicate id", async () => {
        await repo.createGame(buildMeta("game-1"));

        await expect(repo.createGame(buildMeta("game-1"))).rejects.toThrow();
      });
    });

    describe("append / read ordering", () => {
      it("starts with an empty log", async () => {
        await repo.createGame(buildMeta("game-1"));

        await expect(repo.loadEvents("game-1")).resolves.toEqual([]);
      });

      it("preserves append order across multiple calls", async () => {
        await repo.createGame(buildMeta("game-1"));
        const first = buildEvent(0);
        const second = { ...buildEvent(1), t: "RoundStarted" as const, dealerId: "alice" };

        await repo.appendEvents("game-1", [first], 0);
        await repo.appendEvents("game-1", [second], 1);

        await expect(repo.loadEvents("game-1")).resolves.toEqual([first, second]);
      });

      it("loads only events since a given version", async () => {
        await repo.createGame(buildMeta("game-1"));
        const first = buildEvent(0);
        const second = { ...buildEvent(1), t: "RoundStarted" as const, dealerId: "alice" };
        await repo.appendEvents("game-1", [first, second], 0);

        await expect(repo.loadEvents("game-1", 1)).resolves.toEqual([second]);
      });
    });

    describe("version conflicts", () => {
      it("reports the new version on a successful append", async () => {
        await repo.createGame(buildMeta("game-1"));

        await expect(repo.appendEvents("game-1", [buildEvent(0)], 0)).resolves.toEqual({
          outcome: "appended",
          version: 1,
        });
      });

      it("rejects an append with a stale expectedVersion instead of throwing", async () => {
        await repo.createGame(buildMeta("game-1"));
        await repo.appendEvents("game-1", [buildEvent(0)], 0);

        await expect(repo.appendEvents("game-1", [buildEvent(1)], 0)).resolves.toEqual({
          outcome: "conflict",
          currentVersion: 1,
        });
      });

      it("does not apply events from a rejected append", async () => {
        await repo.createGame(buildMeta("game-1"));
        await repo.appendEvents("game-1", [buildEvent(0)], 0);

        await repo.appendEvents("game-1", [buildEvent(99)], 0);

        await expect(repo.loadEvents("game-1")).resolves.toEqual([buildEvent(0)]);
      });
    });

    describe("snapshots", () => {
      it("returns null when no snapshot has been saved", async () => {
        await repo.createGame(buildMeta("game-1"));

        await expect(repo.loadSnapshot("game-1")).resolves.toBeNull();
      });

      it("round-trips a saved snapshot", async () => {
        await repo.createGame(buildMeta("game-1"));

        await repo.saveSnapshot("game-1", 2, initialState);

        await expect(repo.loadSnapshot("game-1")).resolves.toEqual({
          version: 2,
          schemaVersion: EVENT_SCHEMA_VERSION,
          state: initialState,
        });
      });

      it("overwrites a previous snapshot rather than keeping both", async () => {
        await repo.createGame(buildMeta("game-1"));
        await repo.saveSnapshot("game-1", 1, initialState);

        await repo.saveSnapshot("game-1", 2, initialState);

        await expect(repo.loadSnapshot("game-1")).resolves.toMatchObject({ version: 2 });
      });
    });

    describe("deletion", () => {
      it("removes a game from listGames", async () => {
        await repo.createGame(buildMeta("game-1"));

        await repo.deleteGame("game-1");

        await expect(repo.listGames()).resolves.toEqual([]);
      });

      it("does not throw when deleting a game that was never created", async () => {
        await expect(repo.deleteGame("never-existed")).resolves.toBeUndefined();
      });
    });

    describe("unknown games", () => {
      it("rejects loadEvents, appendEvents, saveSnapshot and loadSnapshot for a game that was never created", async () => {
        await expect(repo.loadEvents("missing")).rejects.toThrow();
        await expect(repo.appendEvents("missing", [], 0)).rejects.toThrow();
        await expect(repo.saveSnapshot("missing", 0, initialState)).rejects.toThrow();
        await expect(repo.loadSnapshot("missing")).rejects.toThrow();
      });
    });
  });
}
