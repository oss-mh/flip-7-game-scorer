import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";
import { legalActions } from "../selectors.js";

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

const setup = [gameCreated(), roundStarted("alice")];

describe("legalActions", () => {
  it("returns an empty set before any round has started", () => {
    const state = fold([gameCreated()]);
    expect(legalActions(state, "alice").moves).toEqual([]);
  });

  it("returns an empty set for a player not in the game", () => {
    const state = fold(setup);
    expect(legalActions(state, "nobody").moves).toEqual([]);
  });

  it("permits only hit for an active player with no cards yet", () => {
    const state = fold(setup);
    const result = legalActions(state, "alice");
    expect(result.moves).toEqual(["hit"]);
    expect(result.reasons.stay).toMatch(/at least one card/);
  });

  it("permits hit and stay once the player is holding a card", () => {
    const state = fold([...setup, cardDealt("alice", 5)]);
    const result = legalActions(state, "alice");
    expect(result.moves).toEqual(["hit", "stay"]);
    expect(result.reasons).toEqual({});
  });

  it("returns an empty set for a busted player", () => {
    const state = fold([...setup, cardDealt("alice", 5), cardDealt("alice", 5, 2)]);
    expect(legalActions(state, "alice").moves).toEqual([]);
  });

  it("returns an empty set for a stayed player", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", 5),
      { ...envelope(), t: "PlayerStayed", playerId: "alice" },
    ]);
    expect(legalActions(state, "alice").moves).toEqual([]);
  });

  it("reports mustResolvePendingAction/awaitingTargetSelection as false in M1", () => {
    const state = fold([...setup, cardDealt("alice", 5)]);
    const result = legalActions(state, "alice");
    expect(result.mustResolvePendingAction).toBe(false);
    expect(result.awaitingTargetSelection).toBe(false);
  });

  // Nothing in M1 ever populates pendingResolutions (ActionTargeted lands in
  // M2), so this state can't be reached via fold() yet — it's hand-built to
  // exercise the forward-compatible branch of the selector ahead of time.
  it("blocks both players once a pending action exists, but only flags the source player as awaiting a target", () => {
    const dealt = fold([...setup, cardDealt("alice", 5), cardDealt("bob", 3)]);
    const round = dealt.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const stateWithPending = {
      ...dealt,
      currentRound: {
        ...round,
        pendingResolutions: [{ card: createActionCard("freeze", 1), sourcePlayerId: "alice" }],
      },
    };

    const aliceResult = legalActions(stateWithPending, "alice");
    expect(aliceResult.moves).toEqual([]);
    expect(aliceResult.mustResolvePendingAction).toBe(true);
    expect(aliceResult.awaitingTargetSelection).toBe(true);

    const bobResult = legalActions(stateWithPending, "bob");
    expect(bobResult.moves).toEqual([]);
    expect(bobResult.mustResolvePendingAction).toBe(true);
    expect(bobResult.awaitingTargetSelection).toBe(false);
  });
});
