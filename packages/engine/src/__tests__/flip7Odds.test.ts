import { describe, expect, it } from "vitest";

import {
  CARD_FACES,
  type Card,
  type NumberValue,
  createModifierCard,
  createNumberCard,
} from "../cards.js";
import { DECK_SIZE } from "../deck.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { expectedValueOfNextMove, flip7Probability } from "../flip7Odds.js";
import { fold } from "../reduce.js";
import { remainingDeck } from "../remainingDeck.js";

import type { PendingResolution } from "../state.js";

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

function cardDealt(playerId: string, card: Card): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card };
}

function numberDealt(playerId: string, value: NumberValue, copyIndex = 1): GameEvent {
  return cardDealt(playerId, createNumberCard(value, copyIndex));
}

const setup = [gameCreated(), roundStarted("alice")];

/** A RemainingDeckReport with only the given number values populated — every other face at 0. */
function reportWithNumbers(counts: Partial<Record<NumberValue, number>>) {
  return {
    counts: CARD_FACES.map((face) => ({
      face,
      remaining: face.kind === "number" ? (counts[face.value] ?? 0) : 0,
    })),
    reconciliationWarnings: [],
  };
}

describe("flip7Probability", () => {
  it("is exactly 1 once seven unique numbers are already held, regardless of what remains", () => {
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
      numberDealt("alice", 4),
      numberDealt("alice", 5),
      numberDealt("alice", 6),
    ];
    const state = fold(events);
    expect(state.currentRound?.players["alice"]?.status).toBe("flipped7");
    expect(flip7Probability(state, reportWithNumbers({}), "alice")).toBe(1);
  });

  it("is 0 for a busted player", () => {
    const events = [...setup, numberDealt("alice", 5), numberDealt("alice", 5, 2)];
    const state = fold(events);
    expect(flip7Probability(state, reportWithNumbers({ 5: 3 }), "alice")).toBe(0);
  });

  it("is 0 once the deck has no more number cards left to draw", () => {
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
      numberDealt("alice", 4),
      numberDealt("alice", 5),
    ];
    const state = fold(events);
    expect(flip7Probability(state, reportWithNumbers({}), "alice")).toBe(0);
  });

  it("is 1 when every remaining number card would complete the seventh unique value", () => {
    // Six held (0-5); two contenders left (6 and 7), each just one draw
    // away from completing the hand no matter which is drawn first.
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
      numberDealt("alice", 4),
      numberDealt("alice", 5),
    ];
    const state = fold(events);
    const remaining = reportWithNumbers({ 6: 2, 7: 1 });
    expect(flip7Probability(state, remaining, "alice")).toBe(1);
  });

  it("computes the exact hand-calculated probability across a two-step race", () => {
    // Five held (0-4); two contenders left: value 5 with 2 copies, value 7
    // with 1 copy. Hand-calculation (see the DP this mirrors):
    //   P = (2/3)*P(after 5) + (1/3)*P(after 7)
    //   P(after 5) = 1/2 [one hazard copy of 5 left, one safe copy of 7]
    //   P(after 7) = 1   [7 has no copies left as a hazard, 5 still fully safe]
    //   P = (2/3)*(1/2) + (1/3)*1 = 2/3
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
      numberDealt("alice", 4),
    ];
    const state = fold(events);
    const remaining = reportWithNumbers({ 5: 2, 7: 1 });
    expect(flip7Probability(state, remaining, "alice")).toBeCloseTo(2 / 3);
  });

  it("is exactly 1 when there's no possible bust — three single-copy contenders for three needed slots", () => {
    // Four held (0-3); need exactly three more, and exactly three
    // contenders (4, 5, 6) with one copy each and nothing else left. Every
    // draw is guaranteed safe (no leftover copy of a just-collected value
    // can ever be drawn again), so all three orderings collect all three
    // — probability 1 — and several of the six possible draw orders reach
    // the same two-collected mask from different first draws, exercising
    // the memoized recursion's cache-hit path.
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
    ];
    const state = fold(events);
    const remaining = reportWithNumbers({ 4: 1, 5: 1, 6: 1 });
    expect(flip7Probability(state, remaining, "alice")).toBe(1);
  });

  it("is 0 before any round has started", () => {
    const state = fold([gameCreated()]);
    expect(flip7Probability(state, reportWithNumbers({ 6: 5 }), "alice")).toBe(0);
  });

  it("is 0 for a player not in the game", () => {
    const state = fold(setup);
    expect(flip7Probability(state, reportWithNumbers({ 6: 5 }), "nobody")).toBe(0);
  });

  it("stays within [0, 1] against the real full deck for a plausible hand", () => {
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
      numberDealt("alice", 4),
      numberDealt("alice", 5),
    ];
    const state = fold(events);
    const remaining = remainingDeck(events);
    const probability = flip7Probability(state, remaining, "alice");
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeLessThanOrEqual(1);
  });
});

describe("expectedValueOfNextMove", () => {
  it("stay always equals the current round score", () => {
    const events = [...setup, numberDealt("alice", 3), cardDealt("alice", createModifierCard("x2", 1))];
    const state = fold(events);
    const remaining = reportWithNumbers({});
    expect(expectedValueOfNextMove(state, remaining, "alice").stay).toBe(6);
  });

  it("computes the exact hand-calculated hit EV across a bust-or-safe draw", () => {
    // Alice holds only "3" (stay = 3). Two possible next cards, equally
    // likely: another "3" (busts, scores 0) or a "9" (safe, new total
    // (3+9)*1 = 12). EV(hit) = 0.5*0 + 0.5*12 = 6.
    const events = [...setup, numberDealt("alice", 3)];
    const state = fold(events);
    const remaining = reportWithNumbers({ 3: 1, 9: 1 });
    const ev = expectedValueOfNextMove(state, remaining, "alice");
    expect(ev.stay).toBe(3);
    expect(ev.hit).toBeCloseTo(6);
  });

  it("applies the ×2 multiplier to the hypothetical post-hit hand, not just the current one", () => {
    const events = [...setup, numberDealt("alice", 4), cardDealt("alice", createModifierCard("x2", 1))];
    const state = fold(events);
    // Only one possible next card: a "6". New hand totals (4+6)*2 = 20.
    const remaining = reportWithNumbers({ 6: 1 });
    const ev = expectedValueOfNextMove(state, remaining, "alice");
    expect(ev.stay).toBe(8);
    expect(ev.hit).toBeCloseTo(20);
  });

  it("includes the +15 Flip 7 bonus when the only remaining card completes the seventh unique", () => {
    const events = [
      ...setup,
      numberDealt("alice", 0),
      numberDealt("alice", 1),
      numberDealt("alice", 2),
      numberDealt("alice", 3),
      numberDealt("alice", 4),
      numberDealt("alice", 5),
    ];
    const state = fold(events);
    // Sum so far: 0+1+2+3+4+5 = 15 = stay. Only "6" remains: base becomes
    // 15+6=21, plus the +15 Flip 7 bonus = 36.
    const remaining = reportWithNumbers({ 6: 1 });
    const ev = expectedValueOfNextMove(state, remaining, "alice");
    expect(ev.stay).toBe(15);
    expect(ev.hit).toBeCloseTo(36);
  });

  it("falls back to stay for both when hitting isn't currently legal — a busted player", () => {
    const events = [...setup, numberDealt("alice", 5), numberDealt("alice", 5, 2)];
    const state = fold(events);
    const ev = expectedValueOfNextMove(state, reportWithNumbers({ 5: 3 }), "alice");
    expect(ev.stay).toBe(0);
    expect(ev.hit).toBe(0);
  });

  it("falls back to stay for both while a pending resolution blocks every player from hitting", () => {
    const dealt = fold([...setup, numberDealt("alice", 5)]);
    const round = dealt.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const pending: readonly PendingResolution[] = [
      { kind: "forced-draw-remaining", playerId: "bob", cardsRemaining: 2 },
    ];
    const state = { ...dealt, currentRound: { ...round, pendingResolutions: pending } };
    const ev = expectedValueOfNextMove(state, reportWithNumbers({ 9: 5 }), "alice");
    expect(ev.hit).toBe(ev.stay);
  });

  it("falls back to stay for both once the deck has nothing left to deal", () => {
    const events = [...setup, numberDealt("alice", 3)];
    const state = fold(events);
    const ev = expectedValueOfNextMove(state, reportWithNumbers({}), "alice");
    expect(ev.hit).toBe(ev.stay);
  });

  it("matches a hand-calculated EV against the real full deck for an empty hand", () => {
    // Fresh hand, nothing dealt yet: stay = 0. For a single hypothetical
    // hit against the full 94-card deck: number card v alone scores v
    // (sum_{v=1..12} v * copies(v) = sum of squares 1..12 = 650, value 0
    // contributes 0); a lone flat modifier scores its face value
    // (2+4+6+8+10 = 30) and a lone ×2 scores 0 with no numbers held (see
    // AGENTS.md's "lone ×2 scores 0" rule); every action card leaves
    // Alice's own row untouched, scoring 0. EV(hit) = (650+30) / 94.
    const state = fold(setup);
    const remaining = remainingDeck(setup);
    const ev = expectedValueOfNextMove(state, remaining, "alice");
    expect(ev.stay).toBe(0);
    expect(ev.hit).toBeCloseTo(680 / DECK_SIZE);
  });
});
