import { describe, expect, it } from "vitest";

import {
  type NumberValue,
  createActionCard,
  createModifierCard,
  createNumberCard,
} from "../cards.js";
import { DomainError } from "../errors.js";
import { EVENT_SCHEMA_VERSION, type GameEvent } from "../events.js";
import { fold } from "../reduce.js";
import { nextResolution } from "../selectors.js";

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
    const events = [
      ...setup,
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
      cardDealt("alice", 9),
    ];
    expect(() => fold(events)).toThrow(DomainError);
  });

  it("does not bust other players when one player busts", () => {
    const state = fold([
      ...setup,
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
      cardDealt("bob", 5),
    ]);
    expect(state.currentRound?.players["bob"]?.status).toBe("active");
  });

  it("rejects dealing to a player who isn't in the game", () => {
    expect(() => fold([...setup, cardDealt("nobody", 5)])).toThrow(DomainError);
  });

  it("rejects dealing before any round has started", () => {
    expect(() => fold([gameCreated(), cardDealt("alice", 5)])).toThrow(DomainError);
  });
});

describe("CardDealt — Flip 7", () => {
  function dealSevenUniqueTo(playerId: string): GameEvent[] {
    return [1, 2, 3, 4, 5, 6, 7].map((value) => cardDealt(playerId, value as NumberValue));
  }

  it("sets flipped7 on the seventh unique number card", () => {
    const state = fold([...setup, ...dealSevenUniqueTo("alice")]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("flipped7");
    expect(alice?.numberCards).toHaveLength(7);
  });

  it("does not flip on six unique cards", () => {
    const events = [1, 2, 3, 4, 5, 6].map((value) => cardDealt("alice", value as NumberValue));
    const state = fold([...setup, ...events]);
    expect(state.currentRound?.players["alice"]?.status).toBe("active");
  });

  it("ignores modifier cards when counting toward seven", () => {
    const events = [
      modifierDealt("alice", 2),
      modifierDealt("alice", 4),
      ...[1, 2, 3, 4, 5, 6].map((value) => cardDealt("alice", value as NumberValue)),
    ];
    const state = fold([...setup, ...events]);
    // Six unique numbers plus two modifiers is not Flip 7.
    expect(state.currentRound?.players["alice"]?.status).toBe("active");
  });

  it("ends the round immediately: other active players bank what they have", () => {
    const events = [cardDealt("bob", 9), ...dealSevenUniqueTo("alice")];
    const state = fold([...setup, ...events]);
    expect(state.currentRound?.players["bob"]?.status).toBe("stayed");
    expect(state.currentRound?.players["bob"]?.numberCards).toEqual([createNumberCard(9, 1)]);
  });

  it("does not touch players who already busted or stayed before the flip", () => {
    const events = [
      cardDealt("bob", 3),
      cardDealt("bob", 3, 2), // bob busts
      ...dealSevenUniqueTo("alice"),
    ];
    const state = fold([...setup, ...events]);
    expect(state.currentRound?.players["bob"]?.status).toBe("busted");
  });

  it("rejects dealing further cards to a player who has flipped 7", () => {
    const events = [...dealSevenUniqueTo("alice"), cardDealt("alice", 8)];
    expect(() => fold([...setup, ...events])).toThrow(DomainError);
  });
});

describe("CardDealt — modifier cards", () => {
  it("appends to a separate row from number cards", () => {
    const state = fold([...setup, modifierDealt("alice", 4)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.modifierCards).toEqual([createModifierCard(4, 1)]);
    expect(alice?.numberCards).toEqual([]);
  });

  it("records the card in the round's cardsDealt log", () => {
    const state = fold([...setup, modifierDealt("alice", 4)]);
    expect(state.currentRound?.cardsDealt).toEqual([createModifierCard(4, 1)]);
  });

  it("never busts the player, even on a second copy of the same modifier", () => {
    const state = fold([...setup, modifierDealt("alice", "x2"), modifierDealt("alice", "x2", 2)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("active");
    expect(alice?.modifierCards).toEqual([
      createModifierCard("x2", 1),
      createModifierCard("x2", 2),
    ]);
  });

  it("doesn't touch the number row or count toward Flip 7", () => {
    const state = fold([...setup, cardDealt("alice", 5), modifierDealt("alice", 2)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1)]);
    expect(alice?.modifierCards).toEqual([createModifierCard(2, 1)]);
  });

  it("rejects dealing to a non-active player", () => {
    const events = [
      ...setup,
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
      modifierDealt("alice", 2),
    ];
    expect(() => fold(events)).toThrow(DomainError);
  });
});

describe("CardDealt — Freeze", () => {
  it("queues an awaiting-target resolution instead of joining either card row", () => {
    const state = fold([...setup, freezeDealt("alice")]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.numberCards).toEqual([]);
    expect(alice?.modifierCards).toEqual([]);
    expect(state.currentRound?.pendingResolutions).toEqual([
      { kind: "awaiting-target", card: createActionCard("freeze", 1), sourcePlayerId: "alice" },
    ]);
  });

  it("records the card in the round's cardsDealt log", () => {
    const state = fold([...setup, freezeDealt("alice")]);
    expect(state.currentRound?.cardsDealt).toEqual([createActionCard("freeze", 1)]);
  });

  it("leaves the drawing player active — they aren't the target yet", () => {
    const state = fold([...setup, freezeDealt("alice")]);
    expect(state.currentRound?.players["alice"]?.status).toBe("active");
  });

  it("rejects dealing to a non-active player", () => {
    const events = [...setup, cardDealt("bob", 5), cardDealt("bob", 5, 2), freezeDealt("bob")];
    expect(() => fold(events)).toThrow(DomainError);
  });
});

describe("CardDealt — Flip Three", () => {
  it("queues a forced-draw-remaining resolution for three cards, without joining either card row", () => {
    const state = fold([...setup, flipThreeDealt("alice")]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.numberCards).toEqual([]);
    expect(alice?.modifierCards).toEqual([]);
    expect(state.currentRound?.pendingResolutions).toEqual([
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 3 },
    ]);
  });

  it("records the card in the round's cardsDealt log", () => {
    const state = fold([...setup, flipThreeDealt("alice")]);
    expect(state.currentRound?.cardsDealt).toEqual([createActionCard("flipThree", 1)]);
  });

  it("counts a number card toward the three and keeps it queued", () => {
    const state = fold([...setup, flipThreeDealt("alice"), cardDealt("alice", 5)]);
    expect(nextResolution(state)).toEqual({
      kind: "forced-draw-remaining",
      playerId: "alice",
      cardsRemaining: 2,
    });
    expect(state.currentRound?.players["alice"]?.numberCards).toEqual([createNumberCard(5, 1)]);
  });

  it("counts a modifier card toward the three", () => {
    const state = fold([...setup, flipThreeDealt("alice"), modifierDealt("alice", 4)]);
    expect(nextResolution(state)).toEqual({
      kind: "forced-draw-remaining",
      playerId: "alice",
      cardsRemaining: 2,
    });
  });

  it("counts an action card toward the three and queues its own resolution behind the forced draw", () => {
    const state = fold([...setup, flipThreeDealt("alice"), freezeDealt("alice")]);
    expect(state.currentRound?.pendingResolutions).toEqual([
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 2 },
      { kind: "awaiting-target", card: createActionCard("freeze", 1), sourcePlayerId: "alice" },
    ]);
  });

  it("counts a nested Flip Three toward the three and queues its own forced draw behind it, unresolved (#62)", () => {
    const state = fold([...setup, flipThreeDealt("alice", 1), flipThreeDealt("alice", 2)]);
    expect(state.currentRound?.pendingResolutions).toEqual([
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 2 },
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 3 },
    ]);
  });

  it("chains a nested Flip Three into a fresh three-card sequence once the outer three land (#62)", () => {
    const chained = [
      ...setup,
      flipThreeDealt("alice", 1),
      flipThreeDealt("alice", 2),
      cardDealt("alice", 1),
      cardDealt("alice", 2),
    ];
    const state = fold(chained);
    expect(state.currentRound?.pendingResolutions).toEqual([
      { kind: "forced-draw-remaining", playerId: "alice", cardsRemaining: 3 },
    ]);

    // The nested sequence is still in progress, so the outer gate (#60)
    // still refuses to deal to anyone else.
    expect(() => fold([...chained, cardDealt("bob", 5)])).toThrow(DomainError);
  });

  it("clears the resolution once all three cards have landed", () => {
    const state = fold([
      ...setup,
      flipThreeDealt("alice"),
      cardDealt("alice", 5),
      modifierDealt("alice", 4),
      cardDealt("alice", 9),
    ]);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
    expect(state.currentRound?.players["alice"]?.numberCards).toEqual([
      createNumberCard(5, 1),
      createNumberCard(9, 1),
    ]);
  });

  it("allows normal dealing to that player again once the three land", () => {
    const state = fold([
      ...setup,
      flipThreeDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 9),
      cardDealt("alice", 11),
      cardDealt("alice", 2),
    ]);
    expect(state.currentRound?.players["alice"]?.numberCards).toHaveLength(4);
  });

  it("rejects dealing to a different player while the forced draw is unresolved", () => {
    const events = [...setup, flipThreeDealt("alice"), cardDealt("bob", 5)];
    expect(() => fold(events)).toThrow(DomainError);
  });

  it("busts the player on a duplicate drawn mid-sequence and cancels the remaining draws", () => {
    const state = fold([
      ...setup,
      flipThreeDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
    ]);
    expect(state.currentRound?.players["alice"]?.status).toBe("busted");
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });

  it("discards any nested action queued before a mid-sequence bust", () => {
    const state = fold([
      ...setup,
      flipThreeDealt("alice"),
      freezeDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
    ]);
    expect(state.currentRound?.players["alice"]?.status).toBe("busted");
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });

  it("allows dealing to other players again once a mid-sequence bust cancels the sequence", () => {
    const state = fold([
      ...setup,
      flipThreeDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
      cardDealt("bob", 9),
    ]);
    expect(state.currentRound?.players["bob"]?.numberCards).toEqual([createNumberCard(9, 1)]);
  });

  it("ends the round immediately on Flip 7 mid-sequence and cancels the remaining draws", () => {
    const events = [
      ...setup,
      cardDealt("bob", 9),
      cardDealt("alice", 1),
      cardDealt("alice", 2),
      cardDealt("alice", 3),
      cardDealt("alice", 4),
      cardDealt("alice", 6),
      cardDealt("alice", 8),
      flipThreeDealt("alice"),
      modifierDealt("alice", 4),
      cardDealt("alice", 12),
    ];
    const state = fold(events);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("flipped7");
    expect(alice?.numberCards).toHaveLength(7);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
    expect(state.currentRound?.players["bob"]?.status).toBe("stayed");
  });
});

describe("CardDealt — Second Chance", () => {
  it("holds a Second Chance instead of joining either card row", () => {
    const state = fold([...setup, secondChanceDealt("alice")]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.heldSecondChance).toEqual(createActionCard("secondChance", 1));
    expect(alice?.numberCards).toEqual([]);
    expect(alice?.modifierCards).toEqual([]);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });

  it("records the card in the round's cardsDealt log", () => {
    const state = fold([...setup, secondChanceDealt("alice")]);
    expect(state.currentRound?.cardsDealt).toEqual([createActionCard("secondChance", 1)]);
  });

  it("leaves the drawing player active", () => {
    const state = fold([...setup, secondChanceDealt("alice")]);
    expect(state.currentRound?.players["alice"]?.status).toBe("active");
  });

  it("intercepts a duplicate: consumes the held Second Chance, discards the duplicate, and keeps the player active", () => {
    const state = fold([
      ...setup,
      secondChanceDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
    ]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("active");
    expect(alice?.heldSecondChance).toBeNull();
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1)]);
  });

  it("still records the discarded duplicate in the round's cardsDealt log", () => {
    const state = fold([
      ...setup,
      secondChanceDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
    ]);
    expect(state.currentRound?.cardsDealt).toEqual([
      createActionCard("secondChance", 1),
      createNumberCard(5, 1),
      createNumberCard(5, 2),
    ]);
  });

  it("leaves the saved player's other cards untouched", () => {
    const state = fold([
      ...setup,
      secondChanceDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 7),
      cardDealt("alice", 5, 2),
    ]);
    expect(state.currentRound?.players["alice"]?.numberCards).toEqual([
      createNumberCard(5, 1),
      createNumberCard(7, 1),
    ]);
  });

  it("does not abort a Flip Three sequence when Second Chance intercepts a mid-sequence duplicate", () => {
    const state = fold([
      ...setup,
      secondChanceDealt("alice"),
      flipThreeDealt("alice"),
      cardDealt("alice", 5),
      cardDealt("alice", 5, 2),
      cardDealt("alice", 9),
    ]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.status).toBe("active");
    expect(alice?.heldSecondChance).toBeNull();
    expect(alice?.numberCards).toEqual([createNumberCard(5, 1), createNumberCard(9, 1)]);
    expect(state.currentRound?.pendingResolutions).toEqual([]);
  });

  it("queues an awaiting-target resolution when a player who already holds one draws another (#17)", () => {
    const state = fold([...setup, secondChanceDealt("alice", 1), secondChanceDealt("alice", 2)]);
    const alice = state.currentRound?.players["alice"];
    expect(alice?.heldSecondChance).toEqual(createActionCard("secondChance", 1));
    expect(state.currentRound?.pendingResolutions).toEqual([
      {
        kind: "awaiting-target",
        card: createActionCard("secondChance", 2),
        sourcePlayerId: "alice",
      },
    ]);
  });

  it("records the duplicate in the round's cardsDealt log", () => {
    const state = fold([...setup, secondChanceDealt("alice", 1), secondChanceDealt("alice", 2)]);
    expect(state.currentRound?.cardsDealt).toEqual([
      createActionCard("secondChance", 1),
      createActionCard("secondChance", 2),
    ]);
  });
});

describe("CardDealt — cards not yet handled", () => {
  it("throws for a genuinely unknown card kind", () => {
    const event = {
      ...envelope(),
      t: "CardDealt",
      playerId: "alice",
      card: { id: "bogus-1", kind: "bogus" },
    } as unknown as GameEvent;
    expect(() => fold([...setup, event])).toThrow(DomainError);
  });

  it("throws for a genuinely unknown action type", () => {
    const event = {
      ...envelope(),
      t: "CardDealt",
      playerId: "alice",
      card: { id: "action-bogus-1", kind: "action", action: "bogus" },
    } as unknown as GameEvent;
    expect(() => fold([...setup, event])).toThrow(DomainError);
  });
});
