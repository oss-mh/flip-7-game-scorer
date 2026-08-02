import type { PlayerRoundState, RoundState } from "../state.js";

/**
 * Freezing banks whatever the target is holding: flipping their status to
 * "frozen" is the whole effect — scoreRound() (#55) already treats
 * "frozen" exactly like "stayed", since it only special-cases "busted" and
 * "flipped7". No separate banked-score field is needed.
 */
export function applyFreeze(round: RoundState, targetRound: PlayerRoundState): RoundState {
  const updatedTargetRound: PlayerRoundState = { ...targetRound, status: "frozen" };
  return {
    ...round,
    players: { ...round.players, [updatedTargetRound.playerId]: updatedTargetRound },
  };
}
