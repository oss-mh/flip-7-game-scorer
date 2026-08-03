import {
  EVENT_SCHEMA_VERSION,
  createNumberCard,
  fold,
  initialState,
  type GameEvent,
  type GameMeta,
  type GameRepository,
} from "@flip-7/engine";
import { describe, expect, it, vi } from "vitest";

import { InMemoryGameRepository } from "../inMemoryGameRepository.js";
import { crossedSnapshotInterval, loadGameState, maybeSaveSnapshot } from "../snapshotting.js";

const AT = "2026-01-01T00:00:00.000Z";
const PLAYERS = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
];

function meta(id = "game-1"): GameMeta {
  return { id, players: PLAYERS, targetScore: 200, createdAt: AT, archivedAt: null };
}

/** A long but entirely legal 2-player game: each round, both players take one card and stay. */
function buildLongGameLog(roundCount: number): GameEvent[] {
  const events: GameEvent[] = [];
  let seq = 0;
  let dealer = "alice";

  events.push({
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: AT,
    seq: seq++,
    t: "GameCreated",
    players: PLAYERS,
  });

  for (let round = 0; round < roundCount; round += 1) {
    events.push({
      schemaVersion: EVENT_SCHEMA_VERSION,
      at: AT,
      seq: seq++,
      t: "RoundStarted",
      dealerId: dealer,
    });

    for (const player of PLAYERS) {
      events.push({
        schemaVersion: EVENT_SCHEMA_VERSION,
        at: AT,
        seq: seq++,
        t: "CardDealt",
        playerId: player.id,
        card: createNumberCard(5, 1),
      });
      events.push({
        schemaVersion: EVENT_SCHEMA_VERSION,
        at: AT,
        seq: seq++,
        t: "PlayerStayed",
        playerId: player.id,
      });
    }

    events.push({ schemaVersion: EVENT_SCHEMA_VERSION, at: AT, seq: seq++, t: "RoundClosed" });
    dealer = dealer === "alice" ? "bob" : "alice";
  }

  return events;
}

describe("loadGameState", () => {
  it("returns the initial state for a game with no events and no snapshot", async () => {
    const repo = new InMemoryGameRepository();
    await repo.createGame(meta());

    await expect(loadGameState(repo, "game-1")).resolves.toEqual(initialState);
  });

  it("folds directly from events when there is no snapshot", async () => {
    const repo = new InMemoryGameRepository();
    await repo.createGame(meta());
    const events = buildLongGameLog(3);
    await repo.appendEvents("game-1", events, 0);

    await expect(loadGameState(repo, "game-1")).resolves.toEqual(fold(events));
  });

  it("combines a compatible snapshot with the events after it", async () => {
    const repo = new InMemoryGameRepository();
    await repo.createGame(meta());
    const events = buildLongGameLog(10);
    await repo.appendEvents("game-1", events, 0);

    const snapshotAt = 20;
    await repo.saveSnapshot("game-1", snapshotAt, fold(events.slice(0, snapshotAt)));

    await expect(loadGameState(repo, "game-1")).resolves.toEqual(fold(events));
  });

  it("ignores a snapshot from an unrecognised schema version and falls back to a full fold", async () => {
    // InMemoryGameRepository.saveSnapshot always stamps the current schema
    // version, so an incompatible one can't come from a real adapter here —
    // it can only arrive from an older build. A hand-built fake repository
    // is the only way to put one in front of loadGameState.
    const events = buildLongGameLog(5);
    const loadEvents = vi.fn(async () => events);
    const fakeRepo: GameRepository = {
      createGame: async () => {},
      listGames: async () => [],
      loadEvents,
      appendEvents: async () => ({ outcome: "appended", version: events.length }),
      truncateEvents: async () => {},
      saveSnapshot: async () => {},
      loadSnapshot: async () => ({
        version: 10,
        schemaVersion: 999,
        state: fold(events.slice(0, 10)),
      }),
      archiveGame: async () => {},
      unarchiveGame: async () => {},
      deleteGame: async () => {},
    };

    const result = await loadGameState(fakeRepo, "game-1");

    expect(loadEvents).toHaveBeenCalledWith("game-1", 0);
    expect(result).toEqual(fold(events));
  });

  it("folds a long game from a snapshot faster than a cold fold", async () => {
    const roundCount = 4000;
    const events = buildLongGameLog(roundCount);
    const snapshotAt = events.length - 50;

    const repo = new InMemoryGameRepository();
    await repo.createGame(meta());
    await repo.appendEvents("game-1", events, 0);
    await repo.saveSnapshot("game-1", snapshotAt, fold(events.slice(0, snapshotAt)));

    const coldStart = performance.now();
    fold(events);
    const coldDuration = performance.now() - coldStart;

    const snapshotStart = performance.now();
    await loadGameState(repo, "game-1");
    const snapshotDuration = performance.now() - snapshotStart;

    expect(snapshotDuration).toBeLessThan(coldDuration);
  });
});

describe("crossedSnapshotInterval", () => {
  it("is true once the version crosses a multiple of the interval", () => {
    expect(crossedSnapshotInterval(0, 100, 100)).toBe(true);
    expect(crossedSnapshotInterval(95, 105, 100)).toBe(true);
    expect(crossedSnapshotInterval(150, 199, 100)).toBe(false);
    expect(crossedSnapshotInterval(199, 200, 100)).toBe(true);
  });

  it("defaults to an interval of 100", () => {
    expect(crossedSnapshotInterval(0, 99)).toBe(false);
    expect(crossedSnapshotInterval(0, 100)).toBe(true);
  });

  it("supports a custom interval", () => {
    expect(crossedSnapshotInterval(5, 10, 10)).toBe(true);
    expect(crossedSnapshotInterval(10, 15, 10)).toBe(false);
  });
});

describe("maybeSaveSnapshot", () => {
  it("saves a snapshot once the interval is crossed", async () => {
    const repo = new InMemoryGameRepository();
    await repo.createGame(meta());

    await maybeSaveSnapshot(repo, "game-1", 0, 100, initialState, 100);

    await expect(repo.loadSnapshot("game-1")).resolves.toEqual({
      version: 100,
      schemaVersion: EVENT_SCHEMA_VERSION,
      state: initialState,
    });
  });

  it("does not save a snapshot when the interval is not crossed", async () => {
    const repo = new InMemoryGameRepository();
    await repo.createGame(meta());

    await maybeSaveSnapshot(repo, "game-1", 0, 50, initialState, 100);

    await expect(repo.loadSnapshot("game-1")).resolves.toBeNull();
  });
});
