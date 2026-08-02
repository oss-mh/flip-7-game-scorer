import type { ActionCard } from "../cards.js";
import type { PlayerRoundState, RoundState } from "../state.js";

/**
 * Passing a duplicate Second Chance to an eligible recipient just gives
 * them the card to hold. The source's own held Second Chance — the reason
 * they weren't eligible to keep this one — is untouched.
 */
export function applySecondChanceReassignment(
  round: RoundState,
  card: ActionCard,
  targetRound: PlayerRoundState,
): RoundState {
  const updatedTargetRound: PlayerRoundState = { ...targetRound, heldSecondChance: card };
  return {
    ...round,
    players: { ...round.players, [updatedTargetRound.playerId]: updatedTargetRound },
  };
}
