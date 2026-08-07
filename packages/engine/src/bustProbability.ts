import type { PlayerId } from "./player.js";
import type { RemainingDeckReport } from "./remainingDeck.js";
import type { GameState } from "./state.js";

/**
 * Probability that the next card dealt to `playerId` busts them, derived
 * from `remaining` (see `remainingDeck`, #38) and the player's current hand.
 * A bust only ever comes from drawing a *number* card whose value duplicates
 * one already in front of the player — modifiers and actions can never bust
 * anyone, so they only dilute the denominator, never contribute to the
 * numerator (#83). A held Second Chance intercepts exactly one such
 * duplicate (see `applyCardDealt`), so it zeroes the risk for this next
 * card outright, regardless of what's left in the deck.
 *
 * Returns 0 (rather than throwing) for anything that can't meaningfully
 * draw next — no round in progress, an unknown player, or a player who
 * isn't currently active — matching the non-throwing style of the other
 * selectors in this module.
 */
export function bustProbability(
  state: GameState,
  remaining: RemainingDeckReport,
  playerId: PlayerId,
): number {
  const round = state.currentRound;
  if (!round) {
    return 0;
  }

  const playerRound = round.players[playerId];
  if (!playerRound || playerRound.status !== "active") {
    return 0;
  }

  if (playerRound.heldSecondChance) {
    return 0;
  }

  const heldValues = new Set(playerRound.numberCards.map((card) => card.value));

  let total = 0;
  let busting = 0;
  for (const count of remaining.counts) {
    total += count.remaining;
    if (count.face.kind === "number" && heldValues.has(count.face.value)) {
      busting += count.remaining;
    }
  }

  return total === 0 ? 0 : busting / total;
}
