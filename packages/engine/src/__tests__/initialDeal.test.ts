import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type ActionTargetedEvent, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";

/**
 * The initial deal (one card face up to each player, in turn order,
 * starting with and including the dealer — #64) isn't a distinct phase the
 * engine tracks: CardDealt handles a player's first card exactly like any
 * later one. What makes the phase behave correctly is entirely the
 * existing machinery — the pending-resolution queue (#58), CardDealt's
 * gate refusing to deal past an unresolved interrupt (#60), and Flip
 * Three's forced draws (#60/#61) — so these tests prove the *sequence*
 * works end-to-end rather than adding anything new.
 */

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
      { id: "carol", name: "Carol" },
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

function actionTargeted(
  card: ReturnType<typeof createActionCard>,
  sourceId: string,
  targetId: string,
): ActionTargetedEvent {
  return { ...envelope(), t: "ActionTargeted", card, sourceId, targetId };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("initial deal", () => {
  it("deals one card to each player in turn order, including the dealer, when nothing interrupts", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", 5),
      cardDealt("bob", 3),
      cardDealt("carol", 7),
    ]);
    expect(state.currentRound?.players["alice"]?.numberCards).toEqual([createNumberCard(5, 1)]);
    expect(state.currentRound?.players["bob"]?.numberCards).toEqual([createNumberCard(3, 1)]);
    expect(state.currentRound?.players["carol"]?.numberCards).toEqual([createNumberCard(7, 1)]);
  });

  it("pauses the deal when a player's first card is a Freeze, refusing the next player until it resolves", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    expect(dealt.currentRound?.players["bob"]?.numberCards).toEqual([]);

    // The deal cannot move on to bob while alice's Freeze is unresolved.
    expect(() => fold([...setup, freezeDealt("alice"), cardDealt("bob", 3)])).toThrow(DomainError);

    // Once alice's Freeze resolves (freezing carol), dealing resumes where
    // it left off.
    const events = [
      ...setup,
      freezeDealt("alice"),
      actionTargeted(createActionCard("freeze", 1), "alice", "carol"),
      cardDealt("bob", 3),
    ];
    const state = fold(events);
    expect(state.currentRound?.players["bob"]?.numberCards).toEqual([createNumberCard(3, 1)]);
    expect(state.currentRound?.players["carol"]?.status).toBe("frozen");
  });

  it("a Flip Three dealt to the first player forces three more draws before the deal can continue (#64)", () => {
    const events = [...setup, flipThreeDealt("alice")];
    const dealt = fold(events);

    // Alice's first (and so far only) card was the Flip Three itself; the
    // three forced draws haven't landed yet, and nobody else has a card.
    expect(dealt.currentRound?.players["alice"]?.numberCards).toEqual([]);
    expect(dealt.currentRound?.players["bob"]?.numberCards).toEqual([]);
    expect(dealt.currentRound?.players["carol"]?.numberCards).toEqual([]);
    expect(dealt.currentRound?.pendingResolutions).toEqual([
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 3 },
    ]);

    // The deal cannot reach bob or carol until alice's forced three land.
    expect(() => fold([...events, cardDealt("bob", 9)])).toThrow(DomainError);

    const finished = fold([
      ...events,
      cardDealt("alice", 1),
      cardDealt("alice", 2),
      cardDealt("alice", 3),
      cardDealt("bob", 9),
      cardDealt("carol", 11),
    ]);

    expect(finished.currentRound?.pendingResolutions).toEqual([]);
    // Alice ends the initial deal with four cards dealt (the Flip Three
    // plus its three forced draws) while bob and carol have one each —
    // exactly the asymmetry the rules require.
    expect(finished.currentRound?.players["alice"]?.numberCards).toHaveLength(3);
    expect(finished.currentRound?.cardsDealt.filter((c) => c.kind !== "action")).toHaveLength(5);
    expect(finished.currentRound?.players["bob"]?.numberCards).toHaveLength(1);
    expect(finished.currentRound?.players["carol"]?.numberCards).toHaveLength(1);
  });
});
