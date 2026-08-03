import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type ActionTargetedEvent, type GameEvent } from "../events.js";
import { fold, reduce } from "../reduce.js";
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

function secondChanceDealt(playerId: string, copyIndex = 1): GameEvent {
  return {
    ...envelope(),
    t: "CardDealt",
    playerId,
    card: createActionCard("secondChance", copyIndex),
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

function playerStayed(playerId: string): GameEvent {
  return { ...envelope(), t: "PlayerStayed", playerId };
}

function actionTargeted(
  card: ReturnType<typeof createActionCard>,
  sourceId: string,
  targetId: string,
): ActionTargetedEvent {
  return { ...envelope(), t: "ActionTargeted", card, sourceId, targetId };
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

  it("discards an unused held Second Chance at RoundClosed (#19)", () => {
    const events = [
      ...setup,
      secondChanceDealt("alice"),
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      cardDealt("bob", 3, 2),
      roundClosed(),
    ];
    const state = fold(events);
    expect(state.currentRound?.players["alice"]?.heldSecondChance).toBeNull();
  });

  it("does not disturb scoring — an unused Second Chance carries no bonus", () => {
    const events = [
      ...setup,
      secondChanceDealt("alice"),
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      cardDealt("bob", 3, 2),
      roundClosed(),
    ];
    const state = fold(events);
    expect(state.cumulativeScores).toEqual({ alice: 5, bob: 0 });
  });

  it("never lets a held Second Chance carry into the next round (#19)", () => {
    const events = [
      ...setup,
      secondChanceDealt("alice"),
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      playerStayed("bob"),
      roundClosed(),
      roundStarted("bob"),
    ];
    const state = fold(events);
    expect(state.currentRound?.players["alice"]?.heldSecondChance).toBeNull();
  });

  it("discards a dangling resolution that outlived every active player (#95)", () => {
    // Alice is the sole active player (bob and carol already stayed) and
    // draws a Flip Three whose forced three reveal two nested Freezes.
    // Resolving the first Freeze forces alice to target herself (she's
    // the only active player left), which freezes her — ending the round
    // with the *second* Freeze still queued behind it and now permanently
    // unresolvable: nobody, including alice, is active anymore, so no
    // ActionTargeted event could ever validate a target for it.
    const three = [
      gameCreated3(),
      roundStarted("alice"),
      cardDealt("bob", 3),
      playerStayed("bob"),
      cardDealt("carol", 7),
      playerStayed("carol"),
      flipThreeDealt("alice"),
      freezeDealt("alice", 1),
      freezeDealt("alice", 2),
      cardDealt("alice", 9),
    ];
    const dealt = fold(three);
    expect(dealt.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: createActionCard("freeze", 1), sourcePlayerId: "alice" },
      { kind: "awaiting-target", card: createActionCard("freeze", 2), sourcePlayerId: "alice" },
    ]);

    const frozen = reduce(dealt, actionTargeted(createActionCard("freeze", 1), "alice", "alice"));
    expect(frozen.currentRound?.players["alice"]?.status).toBe("frozen");
    // The bug: the second Freeze is still sitting there, unresolvable.
    expect(frozen.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: createActionCard("freeze", 2), sourcePlayerId: "alice" },
    ]);

    const closed = reduce(frozen, roundClosed());
    expect(closed.currentRound?.pendingResolutions).toEqual([]);

    // And it's gone for good — nothing can resolve it after the round closed.
    expect(() =>
      reduce(closed, actionTargeted(createActionCard("freeze", 2), "alice", "alice")),
    ).toThrow(DomainError);
  });

  it("leaves an empty queue empty, as the common case", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      playerStayed("alice"),
      cardDealt("bob", 3),
      playerStayed("bob"),
      roundClosed(),
    ];
    const state = fold(events);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });
});

function gameCreated3(): GameEvent {
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
