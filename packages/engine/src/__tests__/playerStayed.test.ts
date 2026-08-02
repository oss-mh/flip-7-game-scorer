import { describe, expect, it } from "vitest";

import { createActionCard, createModifierCard, createNumberCard } from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";

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

function cardDealt(playerId: string, card: ReturnType<typeof createNumberCard>): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card };
}

function playerStayed(playerId: string): GameEvent {
  return { ...envelope(), t: "PlayerStayed", playerId };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("PlayerStayed", () => {
  it("moves an active player with at least one card to stayed", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      playerStayed("alice"),
    ]);
    expect(state.currentRound?.players["alice"]?.status).toBe("stayed");
  });

  it("allows staying with only modifier cards", () => {
    const state = fold([
      ...setup,
      { ...envelope(), t: "CardDealt", playerId: "alice", card: createModifierCard(4, 1) },
      playerStayed("alice"),
    ]);
    expect(state.currentRound?.players["alice"]?.status).toBe("stayed");
  });

  it("rejects staying with no cards in front of you", () => {
    expect(() => fold([...setup, playerStayed("alice")])).toThrow(DomainError);
  });

  it("leaves other players untouched", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      cardDealt("bob", createNumberCard(3, 1)),
      playerStayed("alice"),
    ]);
    expect(state.currentRound?.players["bob"]?.status).toBe("active");
  });

  it("rejects staying twice", () => {
    const events = [
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      playerStayed("alice"),
      playerStayed("alice"),
    ];
    expect(() => fold(events)).toThrow(DomainError);
  });

  it("rejects staying for a busted player", () => {
    const events = [
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      cardDealt("alice", createNumberCard(5, 2)),
      playerStayed("alice"),
    ];
    expect(() => fold(events)).toThrow(DomainError);
  });

  it("rejects staying for a player who isn't in the game", () => {
    expect(() => fold([...setup, playerStayed("nobody")])).toThrow(DomainError);
  });

  it("rejects staying before any round has started", () => {
    expect(() => fold([gameCreated(), playerStayed("alice")])).toThrow(DomainError);
  });

  it("rejects staying mid-Flip-Three, even for the player not subject to the forced draw", () => {
    const events: GameEvent[] = [
      ...setup,
      cardDealt("alice", createNumberCard(5, 1)),
      cardDealt("bob", createNumberCard(3, 1)),
      { ...envelope(), t: "CardDealt", playerId: "alice", card: createActionCard("flipThree", 1) },
    ];
    expect(() => fold([...events, playerStayed("alice")])).toThrow(DomainError);
    expect(() => fold([...events, playerStayed("bob")])).toThrow(DomainError);
  });
});
