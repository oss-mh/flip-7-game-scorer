import { describe, expect, it } from "vitest";

import { createActionCard, createModifierCard, createNumberCard } from "../../cards.js";
import { DomainError } from "../../errors.js";
import { EVENT_SCHEMA_VERSION, type ActionTargetedEvent, type GameEvent } from "../../events.js";
import { fold, reduce } from "../../reduce.js";
import { isRoundOver } from "../../selectors.js";

/**
 * Deliberate coverage of the rule interactions that are easy to get wrong
 * when action cards, Flip Three and Second Chance combine — see AGENTS.md,
 * "Before changing any rule behaviour" and issue #66.
 *
 * Every case below is cited against AGENTS.md's own rule summary rather
 * than a page number: the physical rulebook (Ruleset Edition 3.1) wasn't
 * available while writing this, the same situation scoring.test.ts
 * documents for #55. If it becomes available, replace these citations
 * with real page numbers.
 */

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

function envelope() {
  return { schemaVersion: EVENT_SCHEMA_VERSION, at: "2026-08-02T10:00:00.000Z", seq: nextSeq() };
}

function gameCreated(...playerIds: readonly string[]): GameEvent {
  return {
    ...envelope(),
    t: "GameCreated",
    players: playerIds.map((id) => ({ id, name: id })),
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

function modifierDealt(
  playerId: string,
  modifier: Parameters<typeof createModifierCard>[0],
  copyIndex = 1,
): GameEvent {
  return {
    ...envelope(),
    t: "CardDealt",
    playerId,
    card: createModifierCard(modifier, copyIndex),
  };
}

function freezeDealt(playerId: string, copyIndex = 1): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card: createActionCard("freeze", copyIndex) };
}

function flipThreeDealt(playerId: string, copyIndex = 1): GameEvent {
  return {
    ...envelope(),
    t: "CardDealt",
    playerId,
    card: createActionCard("flipThree", copyIndex),
  };
}

function secondChanceDealt(playerId: string, copyIndex = 1): GameEvent {
  return {
    ...envelope(),
    t: "CardDealt",
    playerId,
    card: createActionCard("secondChance", copyIndex),
  };
}

function playerStayed(playerId: string): GameEvent {
  return { ...envelope(), t: "PlayerStayed", playerId };
}

function deckReshuffled(): GameEvent {
  return { ...envelope(), t: "DeckReshuffled" };
}

function actionTargeted(
  card: ReturnType<typeof createActionCard>,
  sourceId: string,
  targetId: string,
): ActionTargetedEvent {
  return { ...envelope(), t: "ActionTargeted", card, sourceId, targetId };
}

describe("edge case: Flip Three draws a Second Chance that saves the same player later in the sequence", () => {
  // AGENTS.md: "Flip Three counts all card types toward its three draws"
  // + "Second Chance ... a duplicate is [held/]passed" + "#63's intercept".
  // The Second Chance drawn as draw 1 of 3 is the player's first, so it's
  // held immediately (no target needed) — then a duplicate on draw 3 of
  // the same sequence is intercepted by the card just picked up, instead
  // of busting the player and aborting the sequence.
  it("holds the Second Chance mid-sequence, then uses it to survive a duplicate before the sequence ends", () => {
    const events = [
      gameCreated("alice", "bob"),
      roundStarted("alice"),
      flipThreeDealt("alice"),
      secondChanceDealt("alice"), // draw 1/3 — alice's first, so she just holds it
      cardDealt("alice", 5), // draw 2/3
      cardDealt("alice", 5, 2), // draw 3/3 — duplicate, intercepted
    ];
    const state = fold(events);
    const alice = state.currentRound?.players["alice"];

    expect(alice?.status).toBe("active");
    expect(alice?.heldSecondChance).toBeNull();
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1)]);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });
});

describe("edge case: Flip Three completes the seventh unique number on the second of three cards", () => {
  // AGENTS.md: "Flip 7 ... triggered [when the seventh unique number
  // lands] ... Actions revealed mid-Flip-Three ... resolve after all
  // three land, and only if the player didn't bust" — Flip 7 is the other
  // early-abort condition (#61), and it can land on any of the three, not
  // just the last.
  it("ends the round immediately, abandoning the third forced draw", () => {
    const events = [
      gameCreated("alice", "bob"),
      roundStarted("alice"),
      cardDealt("bob", 9),
      cardDealt("alice", 1),
      cardDealt("alice", 2),
      cardDealt("alice", 3),
      cardDealt("alice", 4),
      cardDealt("alice", 6),
      cardDealt("alice", 8), // alice: six uniques
      flipThreeDealt("alice"),
      modifierDealt("alice", 4), // draw 1/3
      cardDealt("alice", 12), // draw 2/3 — seventh unique, Flip 7
    ];
    const state = fold(events);
    const alice = state.currentRound?.players["alice"];

    expect(alice?.status).toBe("flipped7");
    expect(alice?.numberCards).toHaveLength(7);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
    expect(state.currentRound?.players["bob"]?.status).toBe("stayed");
    expect(isRoundOver(state)).toBe(true);
  });
});

describe("edge case: Freeze played on a player holding an unused Second Chance", () => {
  // AGENTS.md: Freeze "banks all points collected so far" — it never
  // touches heldSecondChance. The card keeps sitting there, unaffected by
  // the target's status change, until #19 discards it at RoundClosed.
  it("leaves the held Second Chance untouched by the freeze, discarding it only at RoundClosed", () => {
    const events = [
      gameCreated("alice", "bob"),
      roundStarted("alice"),
      secondChanceDealt("bob"),
      cardDealt("bob", 3),
      freezeDealt("alice"),
      actionTargeted(createActionCard("freeze", 1), "alice", "bob"),
    ];
    const frozen = fold(events);
    const bob = frozen.currentRound?.players["bob"];
    expect(bob?.status).toBe("frozen");
    expect(bob?.heldSecondChance).toEqual(createActionCard("secondChance", 1));

    const closed = fold([
      ...events,
      cardDealt("alice", 9),
      playerStayed("alice"),
      { ...envelope(), t: "RoundClosed" },
    ]);
    expect(closed.currentRound?.players["bob"]?.heldSecondChance).toBeNull();
  });
});

describe("edge case: Second Chance passed to a player whose round ends before it's ever used", () => {
  // Literally "busts before using it" can't happen: holding a Second
  // Chance unconditionally intercepts the next duplicate (#63), so a
  // holder never busts from one. Read charitably as "their round ends by
  // some other means before a duplicate ever arrives" — here, the
  // recipient is frozen right after receiving the pass. Per AGENTS.md,
  // Second Chance copies "discard at round end whether used or not," so
  // an unused passed one must survive untouched through that and only
  // clear at RoundClosed (#19).
  it("keeps the passed Second Chance held through a freeze, discarding it only at RoundClosed", () => {
    const events = [
      gameCreated("alice", "bob"),
      roundStarted("alice"),
      secondChanceDealt("alice", 1),
      secondChanceDealt("alice", 2), // duplicate — queues a pass
      actionTargeted(createActionCard("secondChance", 2), "alice", "bob"),
      freezeDealt("alice"),
      actionTargeted(createActionCard("freeze", 1), "alice", "bob"),
    ];
    const frozen = fold(events);
    const bob = frozen.currentRound?.players["bob"];
    expect(bob?.status).toBe("frozen");
    expect(bob?.heldSecondChance).toEqual(createActionCard("secondChance", 2));

    const closed = fold([
      ...events,
      cardDealt("alice", 9),
      playerStayed("alice"),
      { ...envelope(), t: "RoundClosed" },
    ]);
    expect(closed.currentRound?.players["bob"]?.heldSecondChance).toBeNull();
  });
});

describe("edge case: sole active player forced to Freeze themselves", () => {
  // AGENTS.md / #20: "If the holder is the only active player, self-
  // targeting is forced with no prompt" — enforced not by a special case
  // but because every other player fails the active-player check.
  it("only allows self-targeting once everyone else is out, and ends the round", () => {
    const events = [
      gameCreated("alice", "bob", "carol"),
      roundStarted("alice"),
      cardDealt("bob", 3),
      playerStayed("bob"),
      cardDealt("carol", 7),
      playerStayed("carol"),
      freezeDealt("alice"),
    ];
    const dealt = fold(events);
    expect(isRoundOver(dealt)).toBe(false);

    expect(() =>
      reduce(dealt, actionTargeted(createActionCard("freeze", 1), "alice", "bob")),
    ).toThrow(DomainError);

    const resolved = reduce(dealt, actionTargeted(createActionCard("freeze", 1), "alice", "alice"));
    expect(resolved.currentRound?.players["alice"]?.status).toBe("frozen");
    expect(isRoundOver(resolved)).toBe(true);
  });
});

describe("edge case: reshuffle triggered mid Flip Three sequence", () => {
  // #65: DeckReshuffled is legal at any point and interrupts nothing —
  // the forced draw's cardsRemaining counter and the players' hands are
  // untouched by a reshuffle landing between two of the three cards.
  it("does not disturb an in-progress forced draw", () => {
    const events = [
      gameCreated("alice", "bob"),
      roundStarted("alice"),
      flipThreeDealt("alice"),
      cardDealt("alice", 5), // draw 1/3
      deckReshuffled(),
      cardDealt("alice", 9), // draw 2/3
      cardDealt("alice", 11), // draw 3/3
    ];
    const state = fold(events);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.numberCards).toEqual([
      createNumberCard(5, 1),
      createNumberCard(9, 1),
      createNumberCard(11, 1),
    ]);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });
});
