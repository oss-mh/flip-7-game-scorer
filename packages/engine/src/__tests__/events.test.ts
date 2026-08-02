import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";

function describeEvent(event: GameEvent): string {
  switch (event.t) {
    case "GameCreated":
      return `GameCreated:${event.players.length}`;
    case "RoundStarted":
      return `RoundStarted:${event.dealerId}`;
    case "CardDealt":
      return `CardDealt:${event.playerId}:${event.card.id}`;
    case "PlayerStayed":
      return `PlayerStayed:${event.playerId}`;
    case "ActionTargeted":
      return `ActionTargeted:${event.sourceId}->${event.targetId}`;
    case "DeckReshuffled":
      return "DeckReshuffled";
    case "ManualScoreEntered":
      return `ManualScoreEntered:${event.playerId}:${event.points}`;
    case "RoundClosed":
      return "RoundClosed";
    default: {
      const exhaustive: never = event;
      throw new Error(`unhandled event type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

const sampleEvents: readonly GameEvent[] = [
  {
    t: "GameCreated",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:00.000Z",
    seq: 1,
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
  },
  {
    t: "RoundStarted",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:01.000Z",
    seq: 2,
    dealerId: "alice",
  },
  {
    t: "CardDealt",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:02.000Z",
    seq: 3,
    playerId: "alice",
    card: createNumberCard(7, 1),
  },
  {
    t: "PlayerStayed",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:03.000Z",
    seq: 4,
    playerId: "alice",
  },
  {
    t: "ActionTargeted",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:04.000Z",
    seq: 5,
    card: createActionCard("freeze", 1),
    sourceId: "alice",
    targetId: "bob",
  },
  {
    t: "DeckReshuffled",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:05.000Z",
    seq: 6,
  },
  {
    t: "ManualScoreEntered",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:06.000Z",
    seq: 7,
    playerId: "bob",
    points: 42,
  },
  {
    t: "RoundClosed",
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-02T10:00:07.000Z",
    seq: 8,
  },
];

describe("GameEvent union", () => {
  it("is exhaustively narrowable on t", () => {
    expect(sampleEvents.map(describeEvent)).toMatchInlineSnapshot(`
      [
        "GameCreated:2",
        "RoundStarted:alice",
        "CardDealt:alice:num-7-1",
        "PlayerStayed:alice",
        "ActionTargeted:alice->bob",
        "DeckReshuffled",
        "ManualScoreEntered:bob:42",
        "RoundClosed",
      ]
    `);
  });

  it("carries schemaVersion, at and seq on every event", () => {
    for (const event of sampleEvents) {
      expect(event.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
      expect(typeof event.at).toBe("string");
      expect(typeof event.seq).toBe("number");
    }
  });

  it("round-trips every event shape through JSON without loss", () => {
    for (const event of sampleEvents) {
      const roundTripped = JSON.parse(JSON.stringify(event)) as GameEvent;
      expect(roundTripped).toEqual(event);
    }
  });
});
