import { describe, expect, it } from "vitest";

import { type NumberValue, createModifierCard, createNumberCard } from "../cards.js";
import { scoreRound } from "../scoring.js";

import type { PlayerRoundState } from "../state.js";

/**
 * These four scenarios are constructed by hand to exercise each stage of
 * the formula (plain sum, ×2 held, flat modifiers, Flip 7 bonus) — they are
 * NOT transcribed from the printed rulebook (Ruleset Edition 3.1), which
 * wasn't available while writing this test. If the physical rulebook's own
 * worked examples (including its 64-point Flip 7 example) become available,
 * replace these with the real ones and cite the page number.
 */
function playerRound(overrides: Partial<PlayerRoundState>): PlayerRoundState {
  return {
    playerId: "alice",
    numberCards: [],
    modifierCards: [],
    heldSecondChance: null,
    status: "stayed",
    ...overrides,
  };
}

describe("scoreRound", () => {
  it("sums number cards with no modifiers", () => {
    const round = playerRound({
      numberCards: [createNumberCard(3, 1), createNumberCard(5, 1), createNumberCard(7, 1)],
    });
    expect(scoreRound(round)).toEqual({
      base: 15,
      multiplier: 1,
      flatBonus: 0,
      flip7Bonus: 0,
      total: 15,
    });
  });

  it("doubles the number-card sum when x2 is held, before adding flat modifiers", () => {
    const round = playerRound({
      numberCards: [createNumberCard(4, 1), createNumberCard(6, 1)],
      modifierCards: [createModifierCard("x2", 1), createModifierCard(4, 1)],
    });
    // (4 + 6) * 2 + 4 = 24, not (4 + 6 + 4) * 2 = 28.
    expect(scoreRound(round)).toEqual({
      base: 10,
      multiplier: 2,
      flatBonus: 4,
      flip7Bonus: 0,
      total: 24,
    });
  });

  it("adds flat modifiers without a multiplier when no x2 is held", () => {
    const round = playerRound({
      numberCards: [createNumberCard(2, 1), createNumberCard(8, 1)],
      modifierCards: [createModifierCard(4, 1)],
    });
    expect(scoreRound(round)).toEqual({
      base: 10,
      multiplier: 1,
      flatBonus: 4,
      flip7Bonus: 0,
      total: 14,
    });
  });

  it("adds the Flip 7 bonus last, on top of a doubled and modified base", () => {
    const round = playerRound({
      status: "flipped7",
      numberCards: ([0, 1, 2, 3, 4, 5, 6] as const satisfies readonly NumberValue[]).map((value) =>
        createNumberCard(value, 1),
      ),
      modifierCards: [createModifierCard("x2", 1), createModifierCard(6, 1)],
    });
    // sum(0..6) = 21; (21 * 2) + 6 + 15 = 63.
    expect(scoreRound(round)).toEqual({
      base: 21,
      multiplier: 2,
      flatBonus: 6,
      flip7Bonus: 15,
      total: 63,
    });
  });

  it("scores a lone x2 with no number cards as 0", () => {
    const round = playerRound({ modifierCards: [createModifierCard("x2", 1)] });
    expect(scoreRound(round).total).toBe(0);
  });

  it("scores a lone flat modifier at its face value", () => {
    const round = playerRound({ modifierCards: [createModifierCard(6, 1)] });
    expect(scoreRound(round).total).toBe(6);
  });

  it("scores a busted player 0 regardless of cards held", () => {
    const round = playerRound({
      status: "busted",
      numberCards: [createNumberCard(9, 1), createNumberCard(9, 2)],
      modifierCards: [createModifierCard("x2", 1), createModifierCard(10, 1)],
    });
    expect(scoreRound(round)).toEqual({
      base: 0,
      multiplier: 1,
      flatBonus: 0,
      flip7Bonus: 0,
      total: 0,
    });
  });
});
