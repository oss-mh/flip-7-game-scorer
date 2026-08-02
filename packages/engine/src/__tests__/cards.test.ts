import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  type Card,
  MODIFIER_VALUES,
  NUMBER_VALUES,
  createActionCard,
  createModifierCard,
  createNumberCard,
  isActionCard,
  isModifierCard,
  isNumberCard,
} from "../cards.js";

function describeCard(card: Card): string {
  switch (card.kind) {
    case "number":
      return `number:${card.value}`;
    case "modifier":
      return `modifier:${card.modifier}`;
    case "action":
      return `action:${card.action}`;
    default: {
      const exhaustive: never = card;
      throw new Error(`unhandled card kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

describe("Card union", () => {
  it("is exhaustively narrowable on kind", () => {
    expect(describeCard(createNumberCard(7, 1))).toBe("number:7");
    expect(describeCard(createModifierCard("x2", 1))).toBe("modifier:x2");
    expect(describeCard(createActionCard("freeze", 1))).toBe("action:freeze");
  });

  it("exposes type guards that agree with the kind field", () => {
    const number = createNumberCard(0, 1);
    const modifier = createModifierCard(10, 1);
    const action = createActionCard("secondChance", 1);

    expect(isNumberCard(number)).toBe(true);
    expect(isModifierCard(number)).toBe(false);
    expect(isActionCard(number)).toBe(false);

    expect(isModifierCard(modifier)).toBe(true);
    expect(isNumberCard(modifier)).toBe(false);
    expect(isActionCard(modifier)).toBe(false);

    expect(isActionCard(action)).toBe(true);
    expect(isNumberCard(action)).toBe(false);
    expect(isModifierCard(action)).toBe(false);
  });

  it("narrows NumberCard.value to a number-only property via the guard", () => {
    const card: Card = createNumberCard(12, 1);
    if (isNumberCard(card)) {
      expect(card.value).toBe(12);
    } else {
      throw new Error("expected a number card");
    }
  });
});

describe("card identity", () => {
  it("gives duplicate number cards distinct, stable ids", () => {
    const third = createNumberCard(7, 3);
    expect(third.id).toBe("num-7-3");

    const first = createNumberCard(7, 1);
    const second = createNumberCard(7, 2);
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  });

  it("gives modifier cards ids that don't collide with number cards", () => {
    const plusTwo = createModifierCard(2, 1);
    const x2 = createModifierCard("x2", 1);
    expect(plusTwo.id).toBe("mod-plus2-1");
    expect(x2.id).toBe("mod-x2-1");
    expect(x2.id).not.toBe(createNumberCard(2, 1).id);
  });

  it("gives action cards distinct ids per copy", () => {
    const first = createActionCard("flipThree", 1);
    const second = createActionCard("flipThree", 2);
    expect(first.id).toBe("action-flipThree-1");
    expect(second.id).toBe("action-flipThree-2");
    expect(first.id).not.toBe(second.id);
  });

  it("produces no id collisions across every declared face value", () => {
    const ids = new Set<string>();
    let count = 0;

    for (const value of NUMBER_VALUES) {
      for (let copy = 1; copy <= 3; copy += 1) {
        ids.add(createNumberCard(value, copy).id);
        count += 1;
      }
    }
    for (const modifier of MODIFIER_VALUES) {
      ids.add(createModifierCard(modifier, 1).id);
      count += 1;
    }
    for (const action of ACTION_TYPES) {
      for (let copy = 1; copy <= 3; copy += 1) {
        ids.add(createActionCard(action, copy).id);
        count += 1;
      }
    }

    expect(ids.size).toBe(count);
  });
});
