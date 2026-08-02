import { describe, expect, it } from "vitest";

import { isActionCard, isModifierCard, isNumberCard } from "../cards.js";
import { DECK_SIZE, createDeck } from "../deck.js";

describe("createDeck", () => {
  it("totals exactly 94 cards", () => {
    const deck = createDeck();
    expect(deck.length).toBe(94);
    expect(deck.length).toBe(DECK_SIZE);
  });

  it("has every card id unique", () => {
    const deck = createDeck();
    const ids = new Set(deck.map((card) => card.id));
    expect(ids.size).toBe(deck.length);
  });

  it("has 79 number cards, with the count of each value equal to the value itself (0 is a single card)", () => {
    const deck = createDeck();
    const numberCards = deck.filter(isNumberCard);
    expect(numberCards.length).toBe(79);

    const countsByValue = new Map<number, number>();
    for (const card of numberCards) {
      countsByValue.set(card.value, (countsByValue.get(card.value) ?? 0) + 1);
    }

    expect(countsByValue.get(0)).toBe(1);
    for (let value = 1; value <= 12; value += 1) {
      expect(countsByValue.get(value)).toBe(value);
    }
  });

  it("has one of each modifier card — 6 total", () => {
    const deck = createDeck();
    const modifierCards = deck.filter(isModifierCard);
    expect(modifierCards.length).toBe(6);

    const modifiers = modifierCards.map((card) => card.modifier).sort();
    expect(modifiers).toEqual([10, 2, 4, 6, 8, "x2"].sort());
  });

  it("has three of each action card — 9 total", () => {
    const deck = createDeck();
    const actionCards = deck.filter(isActionCard);
    expect(actionCards.length).toBe(9);

    const countsByAction = new Map<string, number>();
    for (const card of actionCards) {
      countsByAction.set(card.action, (countsByAction.get(card.action) ?? 0) + 1);
    }

    expect(countsByAction.get("freeze")).toBe(3);
    expect(countsByAction.get("flipThree")).toBe(3);
    expect(countsByAction.get("secondChance")).toBe(3);
  });
});
