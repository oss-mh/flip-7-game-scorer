import {
  CARD_FACES,
  createActionCard,
  createModifierCard,
  createNumberCard,
  faceKey,
  faceOfCard,
} from "@flip-7/engine";

import type { ActionType, Card, CardFace, RemainingDeckReport } from "@flip-7/engine";

// CardFace, CARD_FACES, faceOfCard and faceKey now live in @flip-7/engine
// (#38/#39) — re-exported here so existing call sites in this app don't all
// need their import path changed, and so this module stays the one place
// components reach for anything face-related.
export type { CardFace } from "@flip-7/engine";
export { CARD_FACES, faceKey, faceOfCard };

const ACTION_LABELS: Record<ActionType, string> = {
  freeze: "Freeze",
  flipThree: "Flip Three",
  secondChance: "2nd Chance",
};

/** Short display label for a face — used on picker tiles, lane chips and prompts. */
export function faceLabel(face: CardFace): string {
  switch (face.kind) {
    case "number":
      return String(face.value);
    case "modifier":
      return face.modifier === "x2" ? "×2" : `+${face.modifier}`;
    case "action":
      return ACTION_LABELS[face.action];
  }
}

export function cardLabel(card: Card): string {
  return faceLabel(faceOfCard(card));
}

/** How many copies of `face` have already been dealt this round, across any number of decks. */
export function dealtCountForFace(cardsDealt: readonly Card[], face: CardFace): number {
  const key = faceKey(face);
  let count = 0;
  for (const card of cardsDealt) {
    if (faceKey(faceOfCard(card)) === key) count += 1;
  }
  return count;
}

/**
 * Copies of `face` left in the deck(s) this table is playing with, per the
 * whole-game `remainingDeck` report (#38) — correct across rounds and
 * reshuffles, unlike a count over just this round's `cardsDealt`. Already
 * clamped to never go negative by `remainingDeck` itself.
 */
export function remainingCountForFace(report: RemainingDeckReport, face: CardFace): number {
  const key = faceKey(face);
  return report.counts.find((count) => faceKey(count.face) === key)?.remaining ?? 0;
}

/** Total cards left across every face — 0 once the table needs a reshuffle. */
export function totalRemainingCards(report: RemainingDeckReport): number {
  return report.counts.reduce((sum, count) => sum + count.remaining, 0);
}

/**
 * The next specific `Card` a tap on `face` should deal — the next unused
 * copy index, purely a count of how many of this face are already in
 * `cardsDealt`. Deliberately doesn't consult `remainingCountForFace`: the
 * engine places no ceiling on copy index (see AGENTS.md — the physical deck is the
 * source of truth, not this app), so an operator override past the natural
 * deck size just mints copy N+1 and works exactly the same as any other card.
 */
export function nextCardForFace(cardsDealt: readonly Card[], face: CardFace): Card {
  const copyIndex = dealtCountForFace(cardsDealt, face) + 1;
  switch (face.kind) {
    case "number":
      return createNumberCard(face.value, copyIndex);
    case "modifier":
      return createModifierCard(face.modifier, copyIndex);
    case "action":
      return createActionCard(face.action, copyIndex);
  }
}
