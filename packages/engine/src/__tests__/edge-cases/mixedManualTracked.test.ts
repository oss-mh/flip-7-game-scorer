import { describe, expect, it } from "vitest";

import { createModifierCard, createNumberCard, faceKey, faceOfCard } from "../../cards.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../../events.js";
import { fold } from "../../reduce.js";
import { remainingDeck } from "../../remainingDeck.js";
import { scoreRound } from "../../scoring.js";

import type { Card } from "../../cards.js";

/**
 * Coverage for #79: some players play tracked (cards dealt and recorded)
 * while others in the same round are scored manually. `manualScoreEntered.ts`
 * already notes this is its concern, not #78's — see AGENTS.md, "Before
 * changing any rule behaviour".
 */

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

function envelope() {
  return { schemaVersion: EVENT_SCHEMA_VERSION, at: "2026-08-09T10:00:00.000Z", seq: nextSeq() };
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

function cardDealt(playerId: string, card: Card): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card };
}

function manualScoreEntered(playerId: string, points: number): GameEvent {
  return { ...envelope(), t: "ManualScoreEntered", playerId, points };
}

function roundClosed(): GameEvent {
  return { ...envelope(), t: "RoundClosed" };
}

const setup = [gameCreated("alice", "bob", "cara"), roundStarted("alice")];

describe("mixed manual and tracked players in one round (#79)", () => {
  it("switching a mid-round player to manual preserves the cards already recorded", () => {
    const five = createNumberCard(5, 1);
    const nine = createNumberCard(9, 1);
    const x2 = createModifierCard("x2", 1);
    const state = fold([
      ...setup,
      cardDealt("alice", five),
      cardDealt("alice", nine),
      cardDealt("alice", x2),
      manualScoreEntered("alice", 40),
    ]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("manual");
    expect(alice?.manualScore).toBe(40);
    expect(alice?.numberCards).toEqual([five, nine]);
    expect(alice?.modifierCards).toEqual([x2]);
  });

  it("scores a switched player from the manual entry, not the preserved cards", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      cardDealt("alice", createNumberCard(9, 1)),
      manualScoreEntered("alice", 40),
    ]);
    const alice = state.currentRound?.players["alice"];
    expect(alice).toBeDefined();
    expect(scoreRound(alice!).total).toBe(40);
  });

  it("lets tracked players keep dealing normally while another player is manual", () => {
    const state = fold([
      ...setup,
      manualScoreEntered("bob", 12),
      cardDealt("alice", createNumberCard(5, 1)),
      cardDealt("cara", createNumberCard(6, 1)),
    ]);
    expect(state.currentRound?.players["bob"]?.status).toBe("manual");
    expect(state.currentRound?.players["alice"]?.status).toBe("active");
    expect(state.currentRound?.players["alice"]?.numberCards).toHaveLength(1);
    expect(state.currentRound?.players["cara"]?.numberCards).toHaveLength(1);
  });

  it("excludes manual players from the remaining-deck count — only CardDealt moves it", () => {
    const five = createNumberCard(5, 1);
    const beforeCount = remainingDeck(setup).counts.find(
      (count) => faceKey(count.face) === faceKey(faceOfCard(five)),
    )?.remaining;

    const events = [
      ...setup,
      manualScoreEntered("bob", 20),
      manualScoreEntered("cara", 15),
      cardDealt("alice", five),
    ];
    const afterCount = remainingDeck(events).counts.find(
      (count) => faceKey(count.face) === faceKey(faceOfCard(five)),
    )?.remaining;

    expect(afterCount).toBe((beforeCount ?? 0) - 1);
    const state = fold(events);
    expect(state.currentRound?.players["bob"]?.numberCards).toHaveLength(0);
    expect(state.currentRound?.players["cara"]?.numberCards).toHaveLength(0);
  });

  it("banks a mixed round correctly on RoundClosed — manual score for one, card total for the others", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      { ...envelope(), t: "PlayerStayed" as const, playerId: "alice" },
      cardDealt("bob", createNumberCard(9, 1)),
      { ...envelope(), t: "PlayerStayed" as const, playerId: "bob" },
      manualScoreEntered("cara", 33),
      roundClosed(),
    ]);
    expect(state.cumulativeScores).toEqual({ alice: 5, bob: 9, cara: 33 });
  });
});
