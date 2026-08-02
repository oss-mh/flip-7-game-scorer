import { describe, expect, it } from "vitest";

import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";

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
      { id: "cara", name: "Cara" },
    ],
  };
}

function roundStarted(dealerId: string): GameEvent {
  return { ...envelope(), t: "RoundStarted", dealerId };
}

describe("RoundStarted", () => {
  it("trusts the event's dealer choice for the first round", () => {
    const state = fold([gameCreated(), roundStarted("bob")]);
    expect(state.currentRound?.dealerId).toBe("bob");
  });

  it("rejects a first-round dealer who isn't a player in the game", () => {
    expect(() => fold([gameCreated(), roundStarted("nobody")])).toThrow(DomainError);
  });

  it("resets every player to active with no cards", () => {
    const state = fold([gameCreated(), roundStarted("alice")]);
    const round = state.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }

    for (const playerId of ["alice", "bob", "cara"]) {
      const playerRound = round.players[playerId];
      expect(playerRound?.status).toBe("active");
      expect(playerRound?.numberCards).toEqual([]);
      expect(playerRound?.modifierCards).toEqual([]);
      expect(playerRound?.heldSecondChance).toBeNull();
    }
    expect(round.cardsDealt).toEqual([]);
    expect(round.pendingResolutions).toEqual([]);
    expect(round.roundNumber).toBe(1);
    expect(state.roundNumber).toBe(1);
  });

  it("advances the dealer one seat left on the next round", () => {
    const state = fold([gameCreated(), roundStarted("alice"), roundStarted("bob")]);
    expect(state.currentRound?.dealerId).toBe("bob");
    expect(state.roundNumber).toBe(2);
  });

  it("wraps around the seating order", () => {
    const state = fold([
      gameCreated(),
      roundStarted("alice"),
      roundStarted("bob"),
      roundStarted("cara"),
      roundStarted("alice"),
    ]);
    expect(state.currentRound?.dealerId).toBe("alice");
    expect(state.roundNumber).toBe(4);
  });

  it("rejects a dealer that skips the rotation order", () => {
    expect(() => fold([gameCreated(), roundStarted("alice"), roundStarted("cara")])).toThrow(
      DomainError,
    );
  });
});
