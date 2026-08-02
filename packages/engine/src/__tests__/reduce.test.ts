import { describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold, initialState, reduce } from "../reduce.js";

const baseEnvelope = {
  schemaVersion: EVENT_SCHEMA_VERSION,
  at: "2026-08-02T10:00:00.000Z",
  seq: 1,
};

const knownEvents: readonly GameEvent[] = [
  {
    ...baseEnvelope,
    t: "GameCreated",
    players: [{ id: "alice", name: "Alice" }],
    targetScore: 200,
  },
  { ...baseEnvelope, t: "RoundStarted", dealerId: "alice" },
  {
    ...baseEnvelope,
    t: "CardDealt",
    playerId: "alice",
    card: { id: "num-3-1", kind: "number", value: 3 },
  },
  { ...baseEnvelope, t: "PlayerStayed", playerId: "alice" },
  {
    ...baseEnvelope,
    t: "ActionTargeted",
    card: { id: "action-freeze-1", kind: "action", action: "freeze" },
    sourceId: "alice",
    targetId: "alice",
  },
  { ...baseEnvelope, t: "DeckReshuffled" },
  { ...baseEnvelope, t: "ManualScoreEntered", playerId: "alice", points: 10 },
  { ...baseEnvelope, t: "RoundClosed" },
];

describe("reduce", () => {
  it("is pure: never mutates the state or event it's given", () => {
    const state = JSON.parse(JSON.stringify(initialState)) as typeof initialState;
    const event = JSON.parse(JSON.stringify(knownEvents[0]));
    Object.freeze(state);
    Object.freeze(event);

    expect(() => reduce(state, event as GameEvent)).toThrow(DomainError);
    expect(state).toEqual(initialState);
  });

  it("throws a typed DomainError for every event type not yet implemented", () => {
    for (const event of knownEvents) {
      expect(() => reduce(initialState, event)).toThrow(DomainError);
    }
  });

  it("throws a typed DomainError for a genuinely unknown event type", () => {
    const bogus = { ...baseEnvelope, t: "SomethingElse" } as unknown as GameEvent;
    expect(() => reduce(initialState, bogus)).toThrow(DomainError);
  });
});

describe("fold", () => {
  it("returns the initial state for an empty log", () => {
    expect(fold([])).toEqual(initialState);
  });

  it("is built on top of reduce — folding one event has the same effect as calling reduce directly", () => {
    const event = knownEvents[0];
    if (!event) {
      throw new Error("expected at least one known event");
    }

    let reduceError: unknown;
    try {
      reduce(initialState, event);
    } catch (error) {
      reduceError = error;
    }

    expect(() => fold([event])).toThrow(DomainError);
    expect(reduceError).toBeInstanceOf(DomainError);
  });
});
