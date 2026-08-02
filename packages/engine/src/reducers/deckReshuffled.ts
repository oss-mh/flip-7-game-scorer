import { requireCurrentRound } from "./roundHelpers.js";

import type { GameState } from "../state.js";

/**
 * DeckReshuffled is purely a marker in the event log for the future
 * remaining-deck tracker (#38, M7): "recalculate counts from the reshuffle
 * point forward" is exactly what a selector over the raw event log can do
 * using this event's position, without anything derived here needing to
 * change. Cards currently in front of players — including busted ones —
 * are never part of the discard pile being reshuffled, so `players` is
 * left untouched; nothing else about the round's shape is gated by this
 * event either, since reshuffling interrupts nothing (no pending
 * resolution, no active player) at the table.
 */
export function applyDeckReshuffled(state: GameState): GameState {
  requireCurrentRound(state);
  return { ...state };
}
