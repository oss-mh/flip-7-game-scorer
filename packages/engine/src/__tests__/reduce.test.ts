import { describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold, initialState, reduce } from "../reduce.js";

const baseEnvelope = {
  schemaVersion: EVENT_SCHEMA_VERSION,
  at: "2026-08-02T10:00:00.000Z",
  seq: 1,
};

// Events whose reducer logic hasn't landed yet — each still throws a typed
// DomainError naming the issue that implements it. GameCreated, RoundStarted
// and CardDealt are excluded: their handlers landed in #14, #15 and #16, so
// they're tested separately below.
const notYetImplementedEvents: readonly GameEvent[] = [
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
    const [event] = notYetImplementedEvents;
    if (!event) {
      throw new Error("expected at least one not-yet-implemented event");
    }
    const clonedEvent = JSON.parse(JSON.stringify(event));
    Object.freeze(state);
    Object.freeze(clonedEvent);

    expect(() => reduce(state, clonedEvent as GameEvent)).toThrow(DomainError);
    expect(state).toEqual(initialState);
  });

  it("throws a typed DomainError for every event type not yet implemented", () => {
    for (const event of notYetImplementedEvents) {
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
    const event = notYetImplementedEvents[0];
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
