import { describe, expect, it } from "vitest";

import { bustProbability } from "../bustProbability.js";
import { CARD_FACES, createActionCard, createNumberCard } from "../cards.js";
import { DECK_SIZE } from "../deck.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";
import { remainingDeck } from "../remainingDeck.js";

/**
 * bustProbability (#83) is (remaining busting number cards) / (total
 * remaining cards), computed against a real `remainingDeck` report so these
 * doubles as an integration check that the two selectors compose the way
 * the counter panel (#39) will actually use them. Every fraction below is
 * hand-calculated against the known 94-card single deck (see
 * deck.test.ts's breakdown: one 0, N copies of N for 1-12, one of each of
 * the 6 modifiers, three of each of the 3 actions).
 */

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

function envelope() {
  return { schemaVersion: EVENT_SCHEMA_VERSION, at: "2026-08-07T10:00:00.000Z", seq: nextSeq() };
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

function secondChanceDealt(playerId: string, copyIndex = 1): GameEvent {
  return {
    ...envelope(),
    t: "CardDealt",
    playerId,
    card: createActionCard("secondChance", copyIndex),
  };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("bustProbability", () => {
  it("is 0 for a player holding no number cards yet — no value can duplicate", () => {
    const events = [...setup];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "alice")).toBe(0);
  });

  it("is (remaining copies of the held value) / (total remaining cards) for a single held card", () => {
    const events = [...setup, cardDealt("alice", 5)];
    const state = fold(events);
    const remaining = remainingDeck(events);
    // Value 5 has 5 copies per deck; one is already in Alice's hand.
    expect(bustProbability(state, remaining, "alice")).toBeCloseTo(4 / (DECK_SIZE - 1));
  });

  it("sums busting counts across every distinct value the player holds", () => {
    const events = [...setup, cardDealt("alice", 2), cardDealt("alice", 9)];
    const state = fold(events);
    const remaining = remainingDeck(events);
    // Value 2 has 2 copies (1 left), value 9 has 9 copies (8 left).
    expect(bustProbability(state, remaining, "alice")).toBeCloseTo((1 + 8) / (DECK_SIZE - 2));
  });

  it("is 0 while the player holds a Second Chance, even with a duplicate-prone hand", () => {
    const events = [...setup, secondChanceDealt("alice"), cardDealt("alice", 5)];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "alice")).toBe(0);
  });

  it("treats modifier and action cards as non-busting — they dilute the denominator but never the numerator", () => {
    // Alice's only held value (0) has a single copy in the whole deck and
    // it's already in her hand, so no number card left in the deck can
    // bust her — but plenty of modifiers and actions remain and must not
    // leak into the busting count.
    const events = [...setup, cardDealt("alice", 0)];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "alice")).toBe(0);
  });

  it("is 0 for a busted player — they're no longer the one drawing next", () => {
    const events = [...setup, cardDealt("alice", 5), cardDealt("alice", 5, 2)];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(state.currentRound?.players["alice"]?.status).toBe("busted");
    expect(bustProbability(state, remaining, "alice")).toBe(0);
  });

  it("is 0 for a stayed player", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      { ...envelope(), t: "PlayerStayed", playerId: "alice" } as GameEvent,
    ];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "alice")).toBe(0);
  });

  it("is 0 before any round has started", () => {
    const events = [gameCreated()];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "alice")).toBe(0);
  });

  it("is 0 for a player not in the game", () => {
    const events = [...setup];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "nobody")).toBe(0);
  });

  it("is 0, not NaN, once every card in the deck has been accounted for", () => {
    const events = [...setup, cardDealt("alice", 5)];
    const state = fold(events);
    const exhausted = { counts: CARD_FACES.map((face) => ({ face, remaining: 0 })), reconciliationWarnings: [] };
    expect(bustProbability(state, exhausted, "alice")).toBe(0);
  });

  it("is unaffected by another player's hand or held Second Chance", () => {
    const events = [...setup, cardDealt("alice", 5), secondChanceDealt("bob")];
    const state = fold(events);
    const remaining = remainingDeck(events);
    expect(bustProbability(state, remaining, "alice")).toBeCloseTo(4 / (DECK_SIZE - 2));
  });
});
