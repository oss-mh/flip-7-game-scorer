import type { PlayerRoundState } from "./state.js";

const FLIP_7_BONUS = 15;

export interface ScoreBreakdown {
  readonly base: number;
  readonly multiplier: 1 | 2;
  readonly flatBonus: number;
  readonly flip7Bonus: number;
  readonly total: number;
}

/**
 * Order matters: multiply the number-card sum by the ×2 modifier (if held)
 * before adding flat modifiers, then add the Flip 7 bonus last. Never
 * `(numbers + modifiers) × 2` — see AGENTS.md, "Scoring order".
 */
export function scoreRound(playerRound: PlayerRoundState): ScoreBreakdown {
  if (playerRound.status === "busted") {
    return { base: 0, multiplier: 1, flatBonus: 0, flip7Bonus: 0, total: 0 };
  }

  const base = playerRound.numberCards.reduce((sum, card) => sum + card.value, 0);
  const hasX2 = playerRound.modifierCards.some((card) => card.modifier === "x2");
  const multiplier = hasX2 ? 2 : 1;
  const flatBonus = playerRound.modifierCards.reduce(
    (sum, card) => (card.modifier === "x2" ? sum : sum + card.modifier),
    0,
  );
  const flip7Bonus = playerRound.status === "flipped7" ? FLIP_7_BONUS : 0;

  return {
    base,
    multiplier,
    flatBonus,
    flip7Bonus,
    total: base * multiplier + flatBonus + flip7Bonus,
  };
}
