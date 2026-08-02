import { describe, expect, it } from "vitest";

import { createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";
import { isRoundOver } from "../selectors.js";

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

function envelope() {
  return { schemaVersion: EVENT_SCHEMA_VERSION, at: "2026-08-02T10:00:00.000Z", seq: nextSeq() };
}

function gameCreated(): GameEvent {
  return {
    ...envelope(),
    t: "GameCreated",
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
  };
}

function roundStarted(dealerId: string): GameEvent {
  return { ...envelope(), t: "RoundStarted", dealerId };
}

function cardDealt(
  playerId: string,
  value: Parameters<typeof createNumberCard>[0],
  copyIndex = 1,
): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card: createNumberCard(value, copyIndex) };
}

function playerStayed(playerId: string): GameEvent {
  return { ...envelope(), t: "PlayerStayed", playerId };
}

function roundClosed(): GameEvent {
  return { ...envelope(), t: "RoundClosed" };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("isRoundOver", () => {
  it("is false before any round has started", () => {
    expect(isRoundOver(fold([gameCreated()]))).toBe(false);
  });

  it("is false while at least one player is still active", () => {
    const state = fold([...setup, cardDealt("alice", 5), playerStayed("alice")]);
    expect(isRoundOver(state)).toBe(false);
  });

  it("is true once every player has busted, stayed or frozen", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      cardDealt("bob", 3, 2), // bob busts
    ]);
    expect(isRoundOver(state)).toBe(true);
  });
});

describe("RoundClosed", () => {
  it("succeeds once every player is done", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      cardDealt("bob", 3, 2),
      roundClosed(),
    ];
    expect(() => fold(events)).not.toThrow();
  });

  it("banks each player's round score into cumulativeScores", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      cardDealt("bob", 3, 2), // bob busts, scores 0
      roundClosed(),
    ];
    const state = fold(events);
    expect(state.cumulativeScores).toEqual({ alice: 5, bob: 0 });
  });

  it("accumulates scores across multiple rounds", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      playerStayed("bob"),
      roundClosed(),
      roundStarted("bob"),
      cardDealt("alice", 4),
      playerStayed("alice"),
      cardDealt("bob", 2),
      playerStayed("bob"),
      roundClosed(),
    ];
    const state = fold(events);
    expect(state.cumulativeScores).toEqual({ alice: 9, bob: 5 });
  });

  it("rejects closing while a player is still active", () => {
    const events = [...setup, cardDealt("alice", 5), roundClosed()];
    expect(() => fold(events)).toThrow(DomainError);
  });

  it("rejects closing before any round has started", () => {
    expect(() => fold([gameCreated(), roundClosed()])).toThrow(DomainError);
  });
});
