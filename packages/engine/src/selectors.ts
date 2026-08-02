import type { PlayerId } from "./player.js";
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

export type LegalMove = "hit" | "stay";

export interface LegalActionsResult {
  /** The moves currently permitted — empty for an inactive or unknown player. */
  readonly moves: readonly LegalMove[];
  /** Why an otherwise-plausible move isn't in `moves`. */
  readonly reasons: Readonly<Partial<Record<LegalMove, string>>>;
  readonly mustResolvePendingAction: boolean;
  readonly awaitingTargetSelection: boolean;
}

const NO_LEGAL_ACTIONS: LegalActionsResult = {
  moves: [],
  reasons: {},
  mustResolvePendingAction: false,
  awaitingTargetSelection: false,
};

/**
 * What a player may currently do. The UI renders this rather than
 * re-deriving legality itself — see AGENTS.md, "Rules live in the engine,
 * never in components". `mustResolvePendingAction`/`awaitingTargetSelection`
 * are wired up for M2's action-card resolution queue; both are always false
 * in M1 since nothing populates `pendingResolutions` yet.
 */
export function legalActions(state: GameState, playerId: PlayerId): LegalActionsResult {
  const round = state.currentRound;
  if (!round) {
    return NO_LEGAL_ACTIONS;
  }

  const playerRound = round.players[playerId];
  if (!playerRound) {
    return NO_LEGAL_ACTIONS;
  }

  const mustResolvePendingAction = round.pendingResolutions.length > 0;
  const awaitingTargetSelection = round.pendingResolutions.some(
    (resolution) => resolution.sourcePlayerId === playerId,
  );

  if (playerRound.status !== "active") {
    return { moves: [], reasons: {}, mustResolvePendingAction, awaitingTargetSelection };
  }

  if (mustResolvePendingAction) {
    const reason = "A pending action must be resolved first";
    return {
      moves: [],
      reasons: { hit: reason, stay: reason },
      mustResolvePendingAction,
      awaitingTargetSelection,
    };
  }

  const moves: LegalMove[] = ["hit"];
  const reasons: Partial<Record<LegalMove, string>> = {};

  const hasAnyCards = playerRound.numberCards.length > 0 || playerRound.modifierCards.length > 0;
  if (hasAnyCards) {
    moves.push("stay");
  } else {
    reasons.stay = "Staying requires at least one card";
  }

  return { moves, reasons, mustResolvePendingAction, awaitingTargetSelection };
}
