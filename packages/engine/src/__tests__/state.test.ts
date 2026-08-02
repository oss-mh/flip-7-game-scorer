import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";

import type { GameState, PendingResolution, PlayerRoundState, RoundState } from "../state.js";

function buildSamplePlayerRoundState(playerId: string): PlayerRoundState {
  return {
    playerId,
    numberCards: [createNumberCard(3, 1)],
    modifierCards: [],
    heldSecondChance: null,
    status: "active",
  };
}

function buildSampleRoundState(): RoundState {
  const alice = buildSamplePlayerRoundState("alice");
  const bob = buildSamplePlayerRoundState("bob");
  const pending: PendingResolution = {
    card: createActionCard("freeze", 1),
    sourcePlayerId: "alice",
  };

  return {
    roundNumber: 1,
    dealerId: "alice",
    players: { alice, bob },
    cardsDealt: [...alice.numberCards, ...bob.numberCards],
    pendingResolutions: [pending],
  };
}

function buildSampleGameState(): GameState {
  return {
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    cumulativeScores: { alice: 0, bob: 0 },
    roundNumber: 1,
    currentRound: buildSampleRoundState(),
    status: "active",
  };
}

describe("domain state shapes", () => {
  it("builds a well-formed GameState with nested RoundState and PlayerRoundState", () => {
    const game = buildSampleGameState();

    expect(game.status).toBe("active");
    expect(game.currentRound?.dealerId).toBe("alice");
    expect(game.currentRound?.players["alice"]?.status).toBe("active");
    expect(game.currentRound?.pendingResolutions[0]?.card.kind).toBe("action");
  });

  it("allows currentRound to be null between rounds", () => {
    const game: GameState = { ...buildSampleGameState(), currentRound: null };
    expect(game.currentRound).toBeNull();
  });

  it("is readonly at the type level (verified by tsc, not at runtime)", () => {
    const game = buildSampleGameState();
    const round = game.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const alice = round.players["alice"];
    if (!alice) {
      throw new Error("expected alice in the round");
    }

    // @ts-expect-error GameState.players is readonly
    game.players = [];
    // @ts-expect-error RoundState.dealerId is readonly
    round.dealerId = "bob";
    // @ts-expect-error PlayerRoundState.status is readonly
    alice.status = "busted";

    expect(game).toBeDefined();
  });
});
