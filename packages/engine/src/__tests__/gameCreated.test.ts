import { describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";
import { DEFAULT_TARGET_SCORE } from "../state.js";

function gameCreated(overrides: Partial<Extract<GameEvent, { t: "GameCreated" }>> = {}) {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:00.000Z",
    seq: 1,
    t: "GameCreated",
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    ...overrides,
  } satisfies GameEvent;
}

describe("GameCreated", () => {
  it("initialises players and zeroed cumulative scores", () => {
    const state = fold([gameCreated()]);

    expect(state.players).toEqual([
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ]);
    expect(state.cumulativeScores).toEqual({ alice: 0, bob: 0 });
    expect(state.roundNumber).toBe(0);
    expect(state.currentRound).toBeNull();
    expect(state.status).toBe("active");
  });

  it("defaults the target score to 200 when omitted", () => {
    const state = fold([gameCreated()]);
    expect(state.targetScore).toBe(DEFAULT_TARGET_SCORE);
    expect(state.targetScore).toBe(200);
  });

  it("uses the given target score when provided", () => {
    const state = fold([gameCreated({ targetScore: 350 })]);
    expect(state.targetScore).toBe(350);
  });

  it("defaults purist mode to false when omitted", () => {
    const state = fold([gameCreated()]);
    expect(state.purist).toBe(false);
  });

  it("locks in purist mode when set at creation", () => {
    const state = fold([gameCreated({ purist: true })]);
    expect(state.purist).toBe(true);
  });

  it("permits duplicate player names", () => {
    const state = fold([
      gameCreated({
        players: [
          { id: "alice-1", name: "Alex" },
          { id: "alice-2", name: "Alex" },
        ],
      }),
    ]);
    expect(state.players.map((p) => p.name)).toEqual(["Alex", "Alex"]);
  });

  it("rejects duplicate player ids", () => {
    const event = gameCreated({
      players: [
        { id: "alice", name: "Alice" },
        { id: "alice", name: "Alice Again" },
      ],
    });
    expect(() => fold([event])).toThrow(DomainError);
  });

  it("rejects a game with fewer than 2 players", () => {
    const event = gameCreated({ players: [{ id: "alice", name: "Alice" }] });
    expect(() => fold([event])).toThrow(DomainError);
  });
});
