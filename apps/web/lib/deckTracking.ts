import { DECK_SIZE, deckCountForPlayerCount } from "@flip-7/engine";

import type { GameEvent } from "@flip-7/engine";

/**
 * Whether the tracked deck(s) have been fully dealt out since the last
 * reshuffle (or the start of the game, if there hasn't been one) — a coarse
 * total-count signal for the round-transition reshuffle prompt (#82). This
 * is deliberately not the per-face remaining-card tracker M7 builds (#38);
 * that one already lives in CardPicker's exhaustion badges. Scans the whole
 * log rather than the current round's `cardsDealt`, since the physical deck
 * carries depletion across rounds even though `RoundStarted` resets each
 * round's own dealt-card tally to empty.
 */
export function isDeckExhausted(events: readonly GameEvent[], playerCount: number): boolean {
  let dealt = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.t === "DeckReshuffled") break;
    if (event?.t === "CardDealt") dealt += 1;
  }
  return dealt >= DECK_SIZE * deckCountForPlayerCount(playerCount);
}
