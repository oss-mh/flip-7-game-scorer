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

function cardDealt(playerId: string, card: ReturnType<typeof createNumberCard>): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card };
}

function manualScoreEntered(playerId: string, points: number): GameEvent {
  return { ...envelope(), t: "ManualScoreEntered", playerId, points };
}

function roundClosed(): GameEvent {
  return { ...envelope(), t: "RoundClosed" };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("ManualScoreEntered", () => {
  it("records a round score directly, moving the player to manual", () => {
    const state = fold([...setup, manualScoreEntered("alice", 18)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("manual");
    expect(alice?.manualScore).toBe(18);
  });

  it("leaves other players untouched", () => {
    const state = fold([...setup, manualScoreEntered("alice", 18)]);
    expect(state.currentRound?.players["bob"]?.status).toBe("active");
  });

  it("is editable after the fact — a later entry overwrites the earlier one", () => {
    const state = fold([
      ...setup,
      manualScoreEntered("alice", 18),
      manualScoreEntered("alice", 25),
    ]);
    expect(state.currentRound?.players["alice"]?.manualScore).toBe(25);
  });

  it("counts a manually scored player as done for isRoundOver", () => {
    const state = fold([
      ...setup,
      manualScoreEntered("alice", 18),
      manualScoreEntered("bob", 0),
    ]);
    expect(isRoundOver(state)).toBe(true);
  });

  it("banks the manual score into cumulativeScores on RoundClosed, same as a tracked round", () => {
    const state = fold([
      ...setup,
      manualScoreEntered("alice", 18),
      manualScoreEntered("bob", 7),
      roundClosed(),
    ]);
    expect(state.cumulativeScores).toEqual({ alice: 18, bob: 7 });
  });

  it("rejects a negative score", () => {
    expect(() => fold([...setup, manualScoreEntered("alice", -5)])).toThrow(DomainError);
  });

  it("rejects a non-integer score", () => {
    expect(() => fold([...setup, manualScoreEntered("alice", 4.5)])).toThrow(DomainError);
  });

  it("rejects entering a score for a player who isn't in the game", () => {
    expect(() => fold([...setup, manualScoreEntered("nobody", 10)])).toThrow(DomainError);
  });

  it("rejects entering a score before any round has started", () => {
    expect(() => fold([gameCreated(), manualScoreEntered("alice", 10)])).toThrow(DomainError);
  });

  it("rejects entering a manual score for a player already scored by cards", () => {
    const events = [
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      { ...envelope(), t: "PlayerStayed" as const, playerId: "alice" },
    ];
    expect(() => fold([...events, manualScoreEntered("alice", 10)])).toThrow(DomainError);
  });
});
