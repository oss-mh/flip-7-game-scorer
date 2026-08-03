import {
  EVENT_SCHEMA_VERSION,
  type GameCreatedEvent,
  type GameMeta,
  initialState,
} from "@flip-7/engine";
import { beforeEach, describe, expect, it } from "vitest";

import { GameAlreadyExistsError, GameNotFoundError } from "../errors.js";
import { InMemoryGameRepository } from "../inMemoryGameRepository.js";
import { runRepositoryContractTests } from "../testing/repositoryContract.js";

runRepositoryContractTests(() => new InMemoryGameRepository());

function buildMeta(id = "game-1"): GameMeta {
  return {
    id,
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    createdAt: "2026-08-03T00:00:00.000Z",
  };
}

function buildGameCreatedEvent(seq = 0): GameCreatedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-03T00:00:00.000Z",
    seq,
    t: "GameCreated",
    players: buildMeta().players,
  };
}

describe("InMemoryGameRepository", () => {
  let repo: InMemoryGameRepository;

  beforeEach(() => {
    repo = new InMemoryGameRepository();
  });

  it("lists no games before any are created", async () => {
    await expect(repo.listGames()).resolves.toEqual([]);
  });

  it("creates a game and lists it", async () => {
    const meta = buildMeta();
    await repo.createGame(meta);

    await expect(repo.listGames()).resolves.toEqual([meta]);
  });

  it("rejects creating a game with a duplicate id", async () => {
    await repo.createGame(buildMeta("game-1"));

    await expect(repo.createGame(buildMeta("game-1"))).rejects.toThrow(GameAlreadyExistsError);
  });

  it("rejects loading events, appending, snapshotting or deleting from an unknown game", async () => {
    await expect(repo.loadEvents("missing")).rejects.toThrow(GameNotFoundError);
    await expect(repo.appendEvents("missing", [], 0)).rejects.toThrow(GameNotFoundError);
    await expect(repo.saveSnapshot("missing", 0, initialState)).rejects.toThrow(GameNotFoundError);
    await expect(repo.loadSnapshot("missing")).rejects.toThrow(GameNotFoundError);
  });

  it("starts with an empty event log", async () => {
    await repo.createGame(buildMeta());

    await expect(repo.loadEvents("game-1")).resolves.toEqual([]);
  });

  it("appends events when expectedVersion matches the current version", async () => {
    await repo.createGame(buildMeta());
    const event = buildGameCreatedEvent(0);

    await expect(repo.appendEvents("game-1", [event], 0)).resolves.toEqual({
      outcome: "appended",
      version: 1,
    });
    await expect(repo.loadEvents("game-1")).resolves.toEqual([event]);
  });

  it("rejects an append whose expectedVersion is stale", async () => {
    await repo.createGame(buildMeta());
    await repo.appendEvents("game-1", [buildGameCreatedEvent(0)], 0);

    await expect(repo.appendEvents("game-1", [buildGameCreatedEvent(1)], 0)).resolves.toEqual({
      outcome: "conflict",
      currentVersion: 1,
    });
  });

  it("loads only events since a given version", async () => {
    await repo.createGame(buildMeta());
    const first = buildGameCreatedEvent(0);
    const second = { ...buildGameCreatedEvent(1), t: "RoundStarted" as const, dealerId: "alice" };
    await repo.appendEvents("game-1", [first], 0);
    await repo.appendEvents("game-1", [second], 1);

    await expect(repo.loadEvents("game-1", 1)).resolves.toEqual([second]);
  });

  it("returns null from loadSnapshot when none has been saved", async () => {
    await repo.createGame(buildMeta());

    await expect(repo.loadSnapshot("game-1")).resolves.toBeNull();
  });

  it("saves and loads a snapshot", async () => {
    await repo.createGame(buildMeta());

    await repo.saveSnapshot("game-1", 3, initialState);

    await expect(repo.loadSnapshot("game-1")).resolves.toEqual({
      version: 3,
      schemaVersion: EVENT_SCHEMA_VERSION,
      state: initialState,
    });
  });

  it("deletes a game so it no longer appears or can be loaded", async () => {
    await repo.createGame(buildMeta());

    await repo.deleteGame("game-1");

    await expect(repo.listGames()).resolves.toEqual([]);
    await expect(repo.loadEvents("game-1")).rejects.toThrow(GameNotFoundError);
  });

  it("treats deleting an unknown game as a no-op rather than an error", async () => {
    await expect(repo.deleteGame("never-existed")).resolves.toBeUndefined();
  });
});
