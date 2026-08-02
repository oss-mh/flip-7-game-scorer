import { describe, expect, it } from "vitest";

import { type NumberValue, createActionCard, createModifierCard, createNumberCard } from "../cards.js";
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

function cardDealt(playerId: string, value: NumberValue, copyIndex = 1): GameEvent {
  return { ...envelope(), t: "CardDealt", playerId, card: createNumberCard(value, copyIndex) };
}

const setup = [gameCreated(), roundStarted("alice")];

describe("CardDealt — number cards", () => {
  it("appends the card to the player's number row", () => {
    const state = fold([...setup, cardDealt("alice", 5)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1)]);
    expect(alice?.status).toBe("active");
  });

  it("records the card in the round's cardsDealt log", () => {
    const state = fold([...setup, cardDealt("alice", 5)]);
    expect(state.currentRound?.cardsDealt).toEqual([createNumberCard(5, 1)]);
  });

  it("busts the player on a duplicate value, keeping both cards", () => {
    const state = fold([...setup, cardDealt("alice", 5), cardDealt("alice", 5, 2)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("busted");
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1), createNumberCard(5, 2)]);
  });

  it("treats 0 as a normal number that can duplicate into a bust", () => {
    const single = fold([...setup, cardDealt("alice", 0)]);
    expect(single.currentRound?.players["alice"]?.status).toBe("active");

    const duplicated = fold([...setup, cardDealt("alice", 0), cardDealt("alice", 0, 2)]);
    expect(duplicated.currentRound?.players["alice"]?.status).toBe("busted");
  });

  it("rejects further cards once a player has busted", () => {
    const events = [...setup, cardDealt("alice", 5), cardDealt("alice", 5, 2), cardDealt("alice", 9)];
    expect(() => fold(events)).toThrow(DomainError);
  });

  it("does not bust other players when one player busts", () => {
    const state = fold([...setup, cardDealt("alice", 5), cardDealt("alice", 5, 2), cardDealt("bob", 5)]);
    expect(state.currentRound?.players["bob"]?.status).toBe("active");
  });

  it("rejects dealing to a player who isn't in the game", () => {
    expect(() => fold([...setup, cardDealt("nobody", 5)])).toThrow(DomainError);
  });

  it("rejects dealing before any round has started", () => {
    expect(() => fold([gameCreated(), cardDealt("alice", 5)])).toThrow(DomainError);
  });
});

describe("CardDealt — cards not yet handled", () => {
  it("throws for modifier cards, which land in #51", () => {
    const event: GameEvent = {
      ...envelope(),
      t: "CardDealt",
      playerId: "alice",
      card: createModifierCard(2, 1),
    };
    expect(() => fold([...setup, event])).toThrow(DomainError);
  });

  it("throws for action cards, which land in M2", () => {
    const event: GameEvent = {
      ...envelope(),
      t: "CardDealt",
      playerId: "alice",
      card: createActionCard("freeze", 1),
    };
    expect(() => fold([...setup, event])).toThrow(DomainError);
  });

  it("throws for a genuinely unknown card kind", () => {
    const event = {
      ...envelope(),
      t: "CardDealt",
      playerId: "alice",
      card: { id: "bogus-1", kind: "bogus" },
    } as unknown as GameEvent;
    expect(() => fold([...setup, event])).toThrow(DomainError);
  });
});
