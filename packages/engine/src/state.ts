import type { ActionCard, Card, ModifierCard, NumberCard } from "./cards.js";
import type { Player, PlayerId } from "./player.js";

/**
 * `flipped7` and `busted` are derived by the reducer from `CardDealt`, never
 * stored as their own events — see AGENTS.md §"Events record what happened".
 * `manual` mirrors `ManualScoreEntered` directly, the same way `stayed`
 * mirrors `PlayerStayed`.
 */
export type PlayerRoundStatus = "active" | "stayed" | "busted" | "frozen" | "flipped7" | "manual";

export interface PlayerRoundState {
  readonly playerId: PlayerId;
  readonly numberCards: readonly NumberCard[];
  readonly modifierCards: readonly ModifierCard[];
  readonly heldSecondChance: ActionCard | null;
  readonly status: PlayerRoundStatus;
  /** Set by `ManualScoreEntered`; null for every card-tracked player. */
  readonly manualScore: number | null;
}

/**
 * A revealed action card (Freeze or a Second Chance duplicate) waiting on
 * the source player to choose who it applies to.
 */
export interface AwaitingTargetResolution {
  readonly kind: "awaiting-target";
  readonly card: ActionCard;
  readonly sourcePlayerId: PlayerId;
}

/**
 * A Flip Three in progress: `cardsRemaining` counts the forced draws still
 * owed to `playerId` before the sequence completes. No player decision is
 * needed to resolve this item — the table just keeps dealing.
 */
export interface ForcedDrawRemainingResolution {
  readonly kind: "forced-draw-remaining";
  readonly playerId: PlayerId;
  readonly cardsRemaining: number;
}

/**
 * A duplicate Second Chance drawn by a player who already holds one, waiting
 * to be passed to another active player without one (or discarded if no one
 * qualifies — see AGENTS.md's Second Chance rule).
 */
export interface SecondChanceReassignmentResolution {
  readonly kind: "second-chance-reassignment";
  readonly card: ActionCard;
  readonly fromPlayerId: PlayerId;
}

/**
 * An item on the round's resolution queue — action cards interrupt normal
 * dealing and sometimes nest (a Freeze revealed mid-Flip-Three, say), so
 * they're queued here instead of resolved inline. Only the front of the
 * queue (see `nextResolution`) is actionable; anything behind it is waiting
 * its turn.
 */
export type PendingResolution =
  AwaitingTargetResolution | ForcedDrawRemainingResolution | SecondChanceReassignmentResolution;

export interface RoundState {
  readonly roundNumber: number;
  readonly dealerId: PlayerId;
  readonly players: Readonly<Record<PlayerId, PlayerRoundState>>;
  readonly cardsDealt: readonly Card[];
  readonly pendingResolutions: readonly PendingResolution[];
}

export type GameStatus = "active" | "completed";

export const DEFAULT_TARGET_SCORE = 200;

export interface GameState {
  readonly players: readonly Player[];
  readonly targetScore: number;
  readonly cumulativeScores: Readonly<Record<PlayerId, number>>;
  /** 0 before the first round has started. */
  readonly roundNumber: number;
  readonly currentRound: RoundState | null;
  readonly status: GameStatus;
  /** Set once by `GameCreated` and never changed afterward — see #40. */
  readonly purist: boolean;
}
