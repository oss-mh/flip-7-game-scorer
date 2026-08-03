import {
  EVENT_SCHEMA_VERSION,
  SchemaMigrationError,
  type GameCreatedEvent,
  type GameMeta,
} from "@flip-7/engine";
import { SequentialIdGenerator } from "@flip-7/engine/testing";
import { describe, expect, it } from "vitest";

import { GameNotFoundError, MalformedExportError } from "../errors.js";
import { EXPORT_SCHEMA_VERSION, exportGame, importGame } from "../exportImport.js";
import { InMemoryGameRepository } from "../inMemoryGameRepository.js";

function buildMeta(id = "game-1"): GameMeta {
  return {
    id,
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    createdAt: "2026-08-03T00:00:00.000Z",
    archivedAt: null,
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

describe("exportGame", () => {
  it("exports the full event log with schema version and metadata", async () => {
    const repo = new InMemoryGameRepository();
    const meta = buildMeta();
    await repo.createGame(meta);
    const events = [buildGameCreatedEvent(0)];
    await repo.appendEvents("game-1", events, 0);

    await expect(exportGame(repo, "game-1")).resolves.toEqual({
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      meta,
      events,
    });
  });

  it("rejects exporting a game that doesn't exist", async () => {
    const repo = new InMemoryGameRepository();

    await expect(exportGame(repo, "missing")).rejects.toThrow(GameNotFoundError);
  });
});

describe("importGame", () => {
  it("imports an exported game as a brand-new game with a fresh id", async () => {
    const repo = new InMemoryGameRepository();
    const meta = buildMeta("original-id");
    await repo.createGame(meta);
    const events = [buildGameCreatedEvent(0)];
    await repo.appendEvents("original-id", events, 0);
    const exported = await exportGame(repo, "original-id");

    const idGenerator = new SequentialIdGenerator("imported");
    const newGameId = await importGame(repo, idGenerator, exported);

    expect(newGameId).toBe("imported-1");
    expect(newGameId).not.toBe("original-id");
    await expect(repo.loadEvents(newGameId)).resolves.toEqual(events);
    await expect(repo.listGames()).resolves.toEqual([meta, { ...meta, id: newGameId }]);
  });

  it("never overwrites an existing game, even one with the exported file's original id", async () => {
    const repo = new InMemoryGameRepository();
    const meta = buildMeta("game-1");
    await repo.createGame(meta);
    await repo.appendEvents("game-1", [buildGameCreatedEvent(0)], 0);
    const exported = await exportGame(repo, "game-1");

    // Re-import the very same export into a repo where "game-1" already
    // exists — importGame must mint a new id rather than colliding.
    const idGenerator = new SequentialIdGenerator("imported");
    const newGameId = await importGame(repo, idGenerator, exported);

    expect(newGameId).not.toBe("game-1");
    await expect(repo.loadEvents("game-1")).resolves.toEqual([buildGameCreatedEvent(0)]);
    await expect(repo.loadEvents(newGameId)).resolves.toEqual([buildGameCreatedEvent(0)]);
  });

  it("propagates a SchemaMigrationError when an event's schema version isn't recognised", async () => {
    const repo = new InMemoryGameRepository();
    const exported = {
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      meta: buildMeta(),
      events: [{ ...buildGameCreatedEvent(0), schemaVersion: 999 }],
    };

    await expect(importGame(repo, new SequentialIdGenerator(), exported)).rejects.toThrow(
      SchemaMigrationError,
    );
  });

  describe("rejects malformed export files with a readable message", () => {
    const repo = new InMemoryGameRepository();
    const idGenerator = new SequentialIdGenerator();

    it.each([
      ["a string", "not an object"],
      ["null", null],
      ["an array", []],
      ["missing exportSchemaVersion", { meta: buildMeta(), events: [] }],
      [
        "exportSchemaVersion from a future build",
        { exportSchemaVersion: EXPORT_SCHEMA_VERSION + 1, meta: buildMeta(), events: [] },
      ],
      ["missing meta", { exportSchemaVersion: EXPORT_SCHEMA_VERSION, events: [] }],
      [
        "meta without an id",
        { exportSchemaVersion: EXPORT_SCHEMA_VERSION, meta: { players: [] }, events: [] },
      ],
      [
        "a non-array events field",
        { exportSchemaVersion: EXPORT_SCHEMA_VERSION, meta: buildMeta(), events: "nope" },
      ],
      [
        "an event missing schemaVersion",
        {
          exportSchemaVersion: EXPORT_SCHEMA_VERSION,
          meta: buildMeta(),
          events: [{ t: "GameCreated" }],
        },
      ],
    ])("rejects %s", async (_description, raw) => {
      await expect(importGame(repo, idGenerator, raw)).rejects.toThrow(MalformedExportError);
    });
  });
});
