import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type ActionTargetedEvent, type GameEvent } from "../events.js";
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

function flipThreeDealt(playerId: string, copyIndex = 1): GameEvent {
  return {
    ...envelope(),
    t: "CardDealt",
    playerId,
    card: createActionCard("flipThree", copyIndex),
  };
}

function playerStayed(playerId: string): GameEvent {
  return { ...envelope(), t: "PlayerStayed", playerId };
}

function deckReshuffled(): GameEvent {
  return { ...envelope(), t: "DeckReshuffled" };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("DeckReshuffled", () => {
  it("succeeds mid-round without disturbing anything", () => {
    const events = [...setup, cardDealt("alice", 5), deckReshuffled()];
    expect(() => fold(events)).not.toThrow();
  });

  it("leaves cards in front of players exactly where they are", () => {
    const events = [...setup, cardDealt("alice", 5), cardDealt("bob", 3), deckReshuffled()];
    const state = fold(events);
    expect(state.currentRound?.players["alice"]?.numberCards).toEqual([createNumberCard(5, 1)]);
    expect(state.currentRound?.players["bob"]?.numberCards).toEqual([createNumberCard(3, 1)]);
  });

  it("leaves a busted player's cards exactly where they are", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2), // alice busts
      deckReshuffled(),
    ];
    const state = fold(events);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("busted");
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1), createNumberCard(5, 2)]);
  });

  it("does not change player statuses", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      deckReshuffled(),
    ];
    const state = fold(events);
    expect(state.currentRound?.players["alice"]?.status).toBe("stayed");
    expect(state.currentRound?.players["bob"]?.status).toBe("active");
  });

  it("is legal even while a resolution is pending — it interrupts nothing", () => {
    const events = [...setup, flipThreeDealt("alice"), deckReshuffled()];
    const state = fold(events);
    expect(state.currentRound?.pendingResolutions).toEqual([
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 3 },
    ]);

    // The Flip Three sequence is unaffected: it can still be completed
    // exactly as if the reshuffle never happened.
    const finished = fold([
      ...events,
      cardDealt("alice", 1),
      cardDealt("alice", 2),
      cardDealt("alice", 3),
    ]);
    expect(finished.currentRound?.pendingResolutions).toEqual([]);
  });

  it("is legal immediately after RoundStarted, before any card has been dealt", () => {
    expect(() => fold([...setup, deckReshuffled()])).not.toThrow();
  });

  it("can happen more than once in the same round", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      deckReshuffled(),
      cardDealt("bob", 3),
      deckReshuffled(),
    ];
    expect(() => fold(events)).not.toThrow();
  });

  it("rejects reshuffling before any round has started", () => {
    expect(() => fold([gameCreated(), deckReshuffled()])).toThrow(DomainError);
  });
});

// Sanity check that ActionTargeted (a real, already-implemented reducer)
// still behaves normally once DeckReshuffled has happened in between —
// i.e. this isn't just "nothing throws," the round genuinely continues.
describe("DeckReshuffled interleaved with other play", () => {
  it("does not block a Freeze from later resolving normally", () => {
    const freeze = createActionCard("freeze", 1);
    const freezeDealt: GameEvent = {
      ...envelope(),
      t: "CardDealt",
      playerId: "alice",
      card: freeze,
    };
    const resolve: ActionTargetedEvent = {
      ...envelope(),
      t: "ActionTargeted",
      card: freeze,
      sourceId: "alice",
      targetId: "bob",
    };
    const state = fold([...setup, deckReshuffled(), freezeDealt, resolve]);
    expect(state.currentRound?.players["bob"]?.status).toBe("frozen");
  });
});
