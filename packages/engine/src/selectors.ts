import type { PlayerId } from "./player.js";
import type { GameState, PendingResolution } from "./state.js";

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

/**
 * The one resolution item the table needs to act on right now, or `null` if
 * nothing is pending. The queue can hold several items (a Freeze revealed
 * mid-Flip-Three nests behind the draw it interrupted), but only the front
 * is actionable — everything else is waiting its turn. The UI drives its
 * "what does the table need to do next" prompt from this selector rather
 * than reading `pendingResolutions` directly.
 */
export function nextResolution(state: GameState): PendingResolution | null {
  const round = state.currentRound;
  if (!round || round.pendingResolutions.length === 0) {
    return null;
  }
  return round.pendingResolutions[0] ?? null;
}

/**
 * Every player tied for the highest cumulative score once the game has
 * ended (#81) — empty while `status` is still "active", since a winner
 * only exists once `RoundClosed` has actually declared the game over, not
 * mid-round.
 */
export function gameWinners(state: GameState): readonly PlayerId[] {
  if (state.status !== "completed") {
    return [];
  }
  const topScore = Math.max(
    ...state.players.map((player) => state.cumulativeScores[player.id] ?? 0),
  );
  return state.players
    .filter((player) => (state.cumulativeScores[player.id] ?? 0) === topScore)
    .map((player) => player.id);
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
 * never in components". No move is legal for anyone while a resolution is
 * pending; `awaitingTargetSelection` flags only the player the *front* of
 * the queue is waiting on, per `nextResolution`.
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

  const pending = nextResolution(state);
  const mustResolvePendingAction = pending !== null;
  const awaitingTargetSelection =
    pending?.kind === "awaiting-target" && pending.sourcePlayerId === playerId;

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
