import { DomainError } from "../errors.js";
import { scoreRound } from "../scoring.js";
import { isRoundOver } from "../selectors.js";

import { requireCurrentRound } from "./roundHelpers.js";

import type { PlayerId } from "../player.js";
import type { GameState, PlayerRoundState } from "../state.js";

/**
 * Validates the round has genuinely ended, then banks each player's round
 * score into cumulativeScores. Whether the game itself has ended (someone
 * reached the target score) is a separate concern owned by M6 — this
 * doesn't touch GameState.status.
 */
export function applyRoundClosed(state: GameState): GameState {
  const round = requireCurrentRound(state);
  if (!isRoundOver(state)) {
    throw new DomainError("RoundClosed is not valid yet — some players are still active");
  }

  const cumulativeScores: Record<PlayerId, number> = { ...state.cumulativeScores };
  for (const [playerId, playerRoundState] of Object.entries(round.players)) {
    const { total } = scoreRound(playerRoundState);
    cumulativeScores[playerId] = (cumulativeScores[playerId] ?? 0) + total;
  }

  // Every held Second Chance discards at round end, used or not — see #19.
  // RoundStarted already hands out a fresh heldSecondChance: null next
  // round regardless, so this is about the closed round's own state being
  // correct in the gap before that, not about preventing carry-over.
  const players: Record<PlayerId, PlayerRoundState> = {};
  for (const [playerId, playerRoundState] of Object.entries(round.players)) {
    players[playerId] = playerRoundState.heldSecondChance
      ? { ...playerRoundState, heldSecondChance: null }
      : playerRoundState;
  }

  // Any resolution still queued here is permanently unresolvable, not just
  // stale: every kind — awaiting-target, forced-draw-remaining — needs at
  // least one active player to proceed (a target to validate, a player to
  // deal to), and isRoundOver just confirmed there are none. This can
  // happen when a Freeze nested behind another one ends up with nobody
  // left to target once the first Freeze takes the last active player out
  // — see #95. Discarding it here isn't a rules call, it's clearing out
  // something that could never legitimately resolve.

  // The game ends at the end of the round in which someone reaches the
  // target — never mid-round — and whoever has the highest cumulative
  // score wins, not necessarily whoever crossed the target (#81). Checking
  // every player's *banked* total here, after the loop above, is what
  // makes that correct: a player who didn't cross the target this round
  // can never have a higher total than one who did (their total is by
  // definition still under target, which the crosser's is not), so this
  // can't misfire on someone who merely didn't trigger the check.
  const gameOver = state.players.some(
    (player) => (cumulativeScores[player.id] ?? 0) >= state.targetScore,
  );

  return {
    ...state,
    cumulativeScores,
    status: gameOver ? "completed" : state.status,
    currentRound: { ...round, players, pendingResolutions: [] },
  };
}
