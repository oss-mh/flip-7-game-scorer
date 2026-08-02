import { describe, expect, it } from "vitest";

import { createActionCard, createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type ActionTargetedEvent, type GameEvent } from "../events.js";
import { fold, reduce } from "../reduce.js";
import { scoreRound } from "../scoring.js";
import { isRoundOver } from "../selectors.js";

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

const FREEZE = createActionCard("freeze", 1);

const setup = [
  gameCreated(),
  roundStarted("alice"),
  cardDealt("alice", 5),
  cardDealt("bob", 3),
  cardDealt("carol", 7),
];

describe("ActionTargeted — Freeze", () => {
  it("resolves onto another active player, freezing them and clearing the queue", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "bob"));

    expect(next.currentRound?.pendingResolutions).toEqual([]);
    expect(next.currentRound?.players["bob"]?.status).toBe("frozen");
    expect(next.currentRound?.players["alice"]?.status).toBe("active");
  });

  it("allows the holder to freeze themselves", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "alice"));

    expect(next.currentRound?.players["alice"]?.status).toBe("frozen");
  });

  it("scores a frozen player exactly as a stayed player would", () => {
    const base = [
      gameCreated(),
      roundStarted("alice"),
      cardDealt("alice", 9),
      cardDealt("alice", 11),
    ];

    const stayed = fold([...base, playerStayed("alice")]);
    const frozen = fold([...base, freezeDealt("bob"), actionTargeted(FREEZE, "bob", "alice")]);

    const stayedAlice = stayed.currentRound?.players["alice"];
    const frozenAlice = frozen.currentRound?.players["alice"];
    if (!stayedAlice || !frozenAlice) {
      throw new Error("expected alice in both rounds");
    }

    expect(frozenAlice.status).toBe("frozen");
    expect(scoreRound(frozenAlice)).toEqual(scoreRound(stayedAlice));
  });

  it("ends the round once it freezes the last active player, but not before", () => {
    const dealt = fold([
      ...setup,
      playerStayed("bob"),
      playerStayed("carol"),
      freezeDealt("alice"),
    ]);
    expect(isRoundOver(dealt)).toBe(false);

    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "alice"));
    expect(isRoundOver(next)).toBe(true);
  });

  it("does not end the round when other players are still active", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "bob"));
    expect(isRoundOver(next)).toBe(false);
  });

  it("forces self-targeting when the holder is the only active player left", () => {
    const dealt = fold([
      ...setup,
      playerStayed("bob"),
      playerStayed("carol"),
      freezeDealt("alice"),
    ]);

    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "alice"));
    expect(next.currentRound?.players["alice"]?.status).toBe("frozen");

    expect(() => reduce(dealt, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it.each(["busted", "stayed", "frozen"] as const)("rejects targeting a %s player", (status) => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    const round = dealt.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const bob = round.players["bob"];
    if (!bob) {
      throw new Error("expected bob in the round");
    }
    const state: GameState = {
      ...dealt,
      currentRound: { ...round, players: { ...round.players, bob: { ...bob, status } } },
    };

    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("rejects targeting a player who isn't in the game", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    expect(() => reduce(dealt, actionTargeted(FREEZE, "alice", "nobody"))).toThrow(DomainError);
  });

  it("rejects an ActionTargeted event that doesn't match the pending resolution's card", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    const otherFreeze = createActionCard("freeze", 2);
    expect(() => reduce(dealt, actionTargeted(otherFreeze, "alice", "bob"))).toThrow(DomainError);
  });

  it("rejects an ActionTargeted event from a different source player", () => {
    const dealt = fold([...setup, freezeDealt("alice")]);
    expect(() => reduce(dealt, actionTargeted(FREEZE, "bob", "carol"))).toThrow(DomainError);
  });

  it("rejects resolving a target when nothing is pending", () => {
    const state = fold(setup);
    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("rejects resolving a target before any round has started", () => {
    const state = fold([gameCreated()]);
    expect(() => reduce(state, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("leaves items behind the resolved one untouched", () => {
    // Two Freezes drawn as part of the same Flip Three (#60) both nest
    // behind the forced draw; once the third card lands and the forced
    // draw clears, the first becomes the front of the queue and the
    // second stays queued behind it.
    const dealt = fold([
      ...setup,
      flipThreeDealt("alice"),
      freezeDealt("alice", 1),
      freezeDealt("alice", 2),
      cardDealt("alice", 9),
    ]);
    expect(dealt.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: createActionCard("freeze", 1), sourcePlayerId: "alice" },
      { kind: "awaiting-target", card: createActionCard("freeze", 2), sourcePlayerId: "alice" },
    ]);

    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "bob"));
    expect(next.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: createActionCard("freeze", 2), sourcePlayerId: "alice" },
    ]);
  });

  it("discards a nested Freeze on bust, so it can no longer be resolved (#62)", () => {
    const dealt = fold([
      ...setup,
      flipThreeDealt("alice"),
      freezeDealt("alice"),
      cardDealt("alice", 9),
      cardDealt("alice", 9, 2), // duplicate — busts, discarding the whole queue (#61)
    ]);
    expect(dealt.currentRound?.pendingResolutions).toEqual([]);
    expect(() => reduce(dealt, actionTargeted(FREEZE, "alice", "bob"))).toThrow(DomainError);
  });

  it("chains Flip Three revealing a Flip Three revealing a Freeze, resolved once both sequences complete (#62)", () => {
    const dealt = fold([
      ...setup,
      flipThreeDealt("alice", 1), // outer: forces 3
      flipThreeDealt("alice", 2), // outer draw 1/3 — nests an inner forced-draw-remaining
      cardDealt("alice", 1), // outer draw 2/3
      cardDealt("alice", 2), // outer draw 3/3 — outer clears, inner becomes the front
      freezeDealt("alice", 1), // inner draw 1/3 — nests an awaiting-target behind the inner draw
      cardDealt("alice", 4), // inner draw 2/3
      cardDealt("alice", 6), // inner draw 3/3 — inner clears, the Freeze is finally the front
    ]);

    expect(dealt.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: FREEZE, sourcePlayerId: "alice" },
    ]);

    const next = reduce(dealt, actionTargeted(FREEZE, "alice", "bob"));
    expect(next.currentRound?.pendingResolutions).toEqual([]);
    expect(next.currentRound?.players["bob"]?.status).toBe("frozen");
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

  // Nothing deals Flip Three or Second Chance yet, so an awaiting-target
  // item for either has to be hand-built to exercise these branches ahead
  // of their own M2 issues.
  it.each(["flipThree", "secondChance"] as const)(
    "throws for %s, which doesn't have a target-resolution handler yet",
    (action) => {
      const base = fold(setup);
      const round = base.currentRound;
      if (!round) {
        throw new Error("expected a round");
      }
      const card = createActionCard(action, 1);
      const state: GameState = {
        ...base,
        currentRound: {
          ...round,
          pendingResolutions: [{ kind: "awaiting-target", card, sourcePlayerId: "alice" }],
        },
      };

      expect(() => reduce(state, actionTargeted(card, "alice", "bob"))).toThrow(DomainError);
    },
  );

  it("throws for a genuinely unknown action type", () => {
    const base = fold(setup);
    const round = base.currentRound;
    if (!round) {
      throw new Error("expected a round");
    }
    const card = { id: "action-bogus-1", kind: "action", action: "bogus" } as unknown as ReturnType<
      typeof createActionCard
    >;
    const state: GameState = {
      ...base,
      currentRound: {
        ...round,
        pendingResolutions: [{ kind: "awaiting-target", card, sourcePlayerId: "alice" }],
      },
    };

    expect(() => reduce(state, actionTargeted(card, "alice", "bob"))).toThrow(DomainError);
  });
});
