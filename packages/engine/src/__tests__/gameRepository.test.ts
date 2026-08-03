import { describe, expect, it } from "vitest";

import { EVENT_SCHEMA_VERSION, type GameCreatedEvent } from "../events.js";
import { initialState } from "../reduce.js";

import type { AppendResult, GameMeta, Snapshot, StoredEvent } from "../ports/gameRepository.js";

function buildSampleMeta(): GameMeta {
  return {
    id: "game-1",
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    createdAt: "2026-08-03T00:00:00.000Z",
  };
}

describe("GameRepository port shapes", () => {
  it("builds a well-formed GameMeta", () => {
    const meta = buildSampleMeta();

    expect(meta.id).toBe("game-1");
    expect(meta.players).toHaveLength(2);
    expect(meta.targetScore).toBe(200);
  });

  it("accepts a GameEvent as a StoredEvent", () => {
    const event: StoredEvent = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      at: "2026-08-03T00:00:00.000Z",
      seq: 0,
      t: "GameCreated",
      players: buildSampleMeta().players,
    } satisfies GameCreatedEvent;

    expect(event.t).toBe("GameCreated");
  });

  it("narrows AppendResult on its outcome discriminant", () => {
    const results: AppendResult[] = [
      { outcome: "appended", version: 1 },
      { outcome: "conflict", currentVersion: 3 },
    ];

    const [appended, conflict] = results;
    if (appended?.outcome !== "appended") {
      throw new Error("expected an appended result");
    }
    if (conflict?.outcome !== "conflict") {
      throw new Error("expected a conflict result");
    }

    expect(appended.version).toBe(1);
    expect(conflict.currentVersion).toBe(3);
  });

  it("builds a well-formed Snapshot around a GameState", () => {
    const snapshot: Snapshot = {
      version: 5,
      schemaVersion: EVENT_SCHEMA_VERSION,
      state: initialState,
    };

    expect(snapshot.state.status).toBe("active");
  });

  it("is readonly at the type level (verified by tsc, not at runtime)", () => {
    const meta = buildSampleMeta();

    // @ts-expect-error GameMeta.id is readonly
    meta.id = "game-2";
    // @ts-expect-error GameMeta.players is readonly
    meta.players = [];

    expect(meta).toBeDefined();
  });
});
