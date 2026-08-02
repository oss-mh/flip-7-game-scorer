import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type ActionTargetedEvent, type GameEvent } from "../events.js";
import { fold, reduce } from "../reduce.js";

import type { GameState } from "../state.js";

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

function cardDealt(playerId: string, value: Parameters<typeof createNumberCard>[0]): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card: createNumberCard(value, 1) };
}

function actionTargeted(
  card: ReturnType<typeof createActionCard>,
  sourceId: string,
  targetId: string,
): ActionTargetedEvent {
  return { ...envelope(), t: "ActionTargeted", card, sourceId, targetId };
}

const setup = [
  gameCreated(),
  roundStarted("alice"),
  cardDealt("alice", 5),
  cardDealt("bob", 3),
  cardDealt("carol", 7),
];

const FREEZE = createActionCard("freeze", 1);

// Nothing in the reducer pipeline populates an "awaiting-target" resolution
// yet — CardDealt for action cards (Freeze itself) lands in a later M2
// issue. This state is hand-built to exercise ActionTargeted's validation
// ahead of that, matching the pattern already used in legalActions.test.ts.
function withAwaitingTarget(sourcePlayerId: string): GameState {
  const dealt = fold(setup);
  const round = dealt.currentRound;
  if (!round) {
    throw new Error("expected a round");
  }
  return {
    ...dealt,
    currentRound: {
      ...round,
      pendingResolutions: [{ kind: "awaiting-target", card: FREEZE, sourcePlayerId }],
    },
  };
}

describe("ActionTargeted", () => {
  it("resolves onto another active player and clears the pending resolution", () => {
    const state = withAwaitingTarget("alice");
    const next = reduce(state, actionTargeted(FREEZE, "alice", "bob"));
    expect(next.currentRound?.pendingResolutions).toEqual([]);
  });

  it("allows the holder to target themselves", () => {
    const state = withAwaitingTarget("alice");
    const next = reduce(state, actionTargeted(FREEZE, "alice", "alice"));
    expect(next.currentRound?.pendingResolutions).toEqual([]);
  });

  it("forces self-targeting when the holder is the only active player left", () => {
    const base = withAwaitingTarget("alice");
    const round = base.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const state: GameState = {
      ...base,
      currentRound: {
        ...round,
        players: {
          ...round.players,
          bob: { ...round.players["bob"]!, status: "stayed" },
          carol: { ...round.players["carol"]!, status: "busted" },
        },
      },
    };

    const next = reduce(state, actionTargeted(FREEZE, "alice", "alice"));
    expect(next.currentRound?.pendingResolutions).toEqual([]);

    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it.each(["busted", "stayed", "frozen"] as const)("rejects targeting a %s player", (status) => {
    const base = withAwaitingTarget("alice");
    const round = base.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const state: GameState = {
      ...base,
      currentRound: {
        ...round,
        players: { ...round.players, bob: { ...round.players["bob"]!, status } },
      },
    };

    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("rejects targeting a player who isn't in the game", () => {
    const state = withAwaitingTarget("alice");
    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "nobody"))).toThrow(DomainError);
  });

  it("rejects an ActionTargeted event that doesn't match the pending resolution's card", () => {
    const state = withAwaitingTarget("alice");
    const otherFreeze = createActionCard("freeze", 2);
    expect(() => reduce(state, actionTargeted(otherFreeze, "alice", "bob"))).toThrow(DomainError);
  });

  it("rejects an ActionTargeted event from a different source player", () => {
    const state = withAwaitingTarget("alice");
    expect(() => reduce(state, actionTargeted(FREEZE, "bob", "carol"))).toThrow(DomainError);
  });

  it("rejects resolving a target when nothing is pending", () => {
    const state = fold(setup);
    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("rejects resolving a target when the front of the queue isn't awaiting one", () => {
    const base = fold(setup);
    const round = base.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const state: GameState = {
      ...base,
      currentRound: {
        ...round,
        pendingResolutions: [
          { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 2 },
        ],
      },
    };

    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("leaves items behind the resolved one untouched", () => {
    const base = fold(setup);
    const round = base.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const behind = createActionCard("freeze", 2);
    const state: GameState = {
      ...base,
      currentRound: {
        ...round,
        pendingResolutions: [
          { kind: "awaiting-target", card: FREEZE, sourcePlayerId: "alice" },
          { kind: "awaiting-target", card: behind, sourcePlayerId: "bob" },
        ],
      },
    };

    const next = reduce(state, actionTargeted(FREEZE, "alice", "bob"));
    expect(next.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: behind, sourcePlayerId: "bob" },
    ]);
  });

  it("rejects resolving a target before any round has started", () => {
    const state = fold([gameCreated()]);
    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });
});
