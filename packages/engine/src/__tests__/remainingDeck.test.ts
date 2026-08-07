import { describe, expect, it } from "vitest";

import { createActionCard, createModifierCard, createNumberCard, faceKey, faceOfCard } from "../cards.js";
import { DECK_SIZE } from "../deck.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { remainingDeck, type RemainingDeckReport } from "../remainingDeck.js";

import type { Card } from "../cards.js";

/**
 * remainingDeck (#38) derives the draw pile's composition from the whole
 * event log, not `GameState` — see the comment on `applyDeckReshuffled`
 * (packages/engine/src/reducers/deckReshuffled.ts), which was written
 * specifically to foreshadow this: "recalculate counts from the reshuffle
 * point forward is exactly what a selector over the raw event log can do".
 * `GameState.currentRound.cardsDealt` resets every round, so it can't carry
 * depletion across rounds on its own.
 */

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

function envelope() {
  return { schemaVersion: EVENT_SCHEMA_VERSION, at: "2026-08-07T10:00:00.000Z", seq: nextSeq() };
}

function gameCreated(playerCount: number): GameEvent {
  const players = Array.from({ length: playerCount }, (_unused, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
  }));
  return { ...envelope(), t: "GameCreated", players };
}

function roundStarted(dealerId: string): GameEvent {
  return { ...envelope(), t: "RoundStarted", dealerId };
}

function cardDealt(playerId: string, card: Card): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card };
}

function deckReshuffled(): GameEvent {
  return { ...envelope(), t: "DeckReshuffled" };
}

function roundClosed(): GameEvent {
  return { ...envelope(), t: "RoundClosed" };
}

function remainingFor(report: RemainingDeckReport, card: Card): number {
  const key = faceKey(faceOfCard(card));
  const entry = report.counts.find((count) => faceKey(count.face) === key);
  if (!entry) {
    throw new Error(`no entry for face ${key}`);
  }
  return entry.remaining;
}

function totalRemaining(report: RemainingDeckReport): number {
  return report.counts.reduce((sum, count) => sum + count.remaining, 0);
}

describe("remainingDeck", () => {
  it("returns all zeros for an empty log — no GameCreated means no known deck size", () => {
    const report = remainingDeck([]);
    expect(totalRemaining(report)).toBe(0);
    expect(report.reconciliationWarnings).toEqual([]);
  });

  it("returns the full single deck once GameCreated has fired and nothing's been dealt", () => {
    const report = remainingDeck([gameCreated(2)]);
    expect(totalRemaining(report)).toBe(DECK_SIZE);
    expect(remainingFor(report, createNumberCard(7, 1))).toBe(7);
    expect(remainingFor(report, createNumberCard(0, 1))).toBe(1);
    expect(remainingFor(report, createModifierCard("x2", 1))).toBe(1);
    expect(remainingFor(report, createActionCard("freeze", 1))).toBe(3);
  });

  it("doubles every count for a two-deck (19+ player) game", () => {
    const report = remainingDeck([gameCreated(19)]);
    expect(totalRemaining(report)).toBe(DECK_SIZE * 2);
    expect(remainingFor(report, createNumberCard(7, 1))).toBe(14);
    expect(remainingFor(report, createModifierCard(10, 1))).toBe(2);
  });

  it("decrements a face for every card dealt this round", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(7, 1)),
      cardDealt("player-2", createNumberCard(7, 2)),
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createNumberCard(7, 1))).toBe(5);
    expect(totalRemaining(report)).toBe(DECK_SIZE - 2);
  });

  it("leaves cards in front of players excluded from the pool across a mid-round reshuffle", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(9, 1)),
      deckReshuffled(),
    ];
    const report = remainingDeck(events);
    // Still dealt from the same round in progress — a reshuffle can't have
    // returned it, since it isn't part of the discard pile yet (see
    // applyDeckReshuffled's comment on cards "in front of players").
    expect(remainingFor(report, createNumberCard(9, 1))).toBe(8);
    expect(totalRemaining(report)).toBe(DECK_SIZE - 1);
  });

  it("keeps a closed round's cards out of the pool until the next round actually starts", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(9, 1)),
      roundClosed(),
      deckReshuffled(),
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createNumberCard(9, 1))).toBe(8);
  });

  it("returns a previous round's dealt cards to the pool once reshuffled after the next round starts", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(9, 1)),
      roundClosed(),
      roundStarted("player-2"),
      cardDealt("player-2", createNumberCard(3, 1)),
      deckReshuffled(),
    ];
    const report = remainingDeck(events);
    // Round 1's "9" is now in the discard pile and was returned to the pool.
    expect(remainingFor(report, createNumberCard(9, 1))).toBe(9);
    // Round 2's "3" is still in front of a player in the round in progress.
    expect(remainingFor(report, createNumberCard(3, 1))).toBe(2);
    expect(totalRemaining(report)).toBe(DECK_SIZE - 1);
  });

  it("keeps a busted player's cards excluded from the pool exactly like anyone else's, until the round turns over", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(5, 1)),
      cardDealt("player-1", createNumberCard(5, 2)), // busts
      roundClosed(),
      deckReshuffled(),
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createNumberCard(5, 1))).toBe(3);
  });

  it("accumulates discard across several closed rounds before a single reshuffle returns all of it", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(8, 1)),
      roundClosed(),
      roundStarted("player-2"),
      cardDealt("player-2", createNumberCard(8, 2)),
      roundClosed(),
      roundStarted("player-1"),
      deckReshuffled(),
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createNumberCard(8, 1))).toBe(8);
  });

  it("can reshuffle more than once in a game, each time returning only what's newly discarded", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createNumberCard(4, 1)),
      roundClosed(),
      roundStarted("player-2"),
      deckReshuffled(),
      cardDealt("player-2", createNumberCard(4, 2)),
      roundClosed(),
      roundStarted("player-1"),
      deckReshuffled(),
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createNumberCard(4, 1))).toBe(4);
  });

  it("never goes negative and instead surfaces a reconciliation warning", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createModifierCard("x2", 1)),
      cardDealt("player-2", createModifierCard("x2", 2)), // only 1 exists per deck
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createModifierCard("x2", 1))).toBe(0);
    expect(report.reconciliationWarnings).toHaveLength(1);
    expect(report.reconciliationWarnings[0]).toMatch(/modifier:x2/);
  });

  it("counts every face independently, ignoring card id and copy index", () => {
    const events = [
      gameCreated(2),
      roundStarted("player-1"),
      cardDealt("player-1", createActionCard("freeze", 1)),
      cardDealt("player-2", createActionCard("freeze", 2)),
    ];
    const report = remainingDeck(events);
    expect(remainingFor(report, createActionCard("freeze", 1))).toBe(1);
  });

  it("returns one entry per declared card face, in a fixed order", () => {
    const report = remainingDeck([gameCreated(2)]);
    expect(report.counts).toHaveLength(22);
  });

  it("throws a typed DomainError for a genuinely unknown event type", () => {
    const bogus = { ...envelope(), t: "SomethingElse" } as unknown as GameEvent;
    expect(() => remainingDeck([gameCreated(2), bogus])).toThrow(DomainError);
  });
});
