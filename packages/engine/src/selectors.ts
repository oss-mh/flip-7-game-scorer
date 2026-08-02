import type { GameState } from "./state.js";

/**
 * True once every player in the current round has stopped acting — busted,
 * stayed, frozen, or flipped7 — and there's nothing left to deal or decide.
 * False before any round has started.
 */
export function isRoundOver(state: GameState): boolean {
  const round = state.currentRound;
  if (!round) {
    return false;
  }
  return Object.values(round.players).every((playerRound) => playerRound.status !== "active");
}
