import type { ActionCard, Card, ModifierCard, NumberCard } from "./cards.js";
import type { Player, PlayerId } from "./player.js";

/**
 * `flipped7` and `busted` are derived by the reducer from `CardDealt`, never
 * stored as their own events — see AGENTS.md §"Events record what happened".
 */
export type PlayerRoundStatus = "active" | "stayed" | "busted" | "frozen" | "flipped7";

export interface PlayerRoundState {
  readonly playerId: PlayerId;
  readonly numberCards: readonly NumberCard[];
  readonly modifierCards: readonly ModifierCard[];
  readonly heldSecondChance: ActionCard | null;
  readonly status: PlayerRoundStatus;
}

/**
 * An action card that has been revealed but not yet resolved — e.g. a
 * Freeze awaiting a target, or a Second Chance duplicate awaiting
 * reassignment. The concrete resolution flow for each action kind lands in
 * M2; this type exists now so `RoundState`'s shape is stable.
 */
export interface PendingResolution {
  readonly card: ActionCard;
  readonly sourcePlayerId: PlayerId;
}

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
}
