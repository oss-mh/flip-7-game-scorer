import type { ActionCard, Card } from "./cards.js";
import type { Player, PlayerId } from "./player.js";

export const EVENT_SCHEMA_VERSION = 1;

/**
 * Fields common to every event. `at` is an ISO-8601 timestamp supplied by
 * the caller's Clock port — the engine itself never reads the clock (see
 * AGENTS.md invariant #2, no non-determinism in the domain). `seq` is a
 * per-game monotonically increasing sequence number assigned by whoever
 * appends to the log.
 */
interface EventEnvelope {
  readonly schemaVersion: number;
  readonly at: string;
  readonly seq: number;
}

/**
 * Every event below records something that happened at the physical table —
 * a card dealt, a card revealed, a stay declared. None of them encode a
 * conclusion the reducer works out afterwards (busted, frozen, flipped7,
 * round won, second chance consumed). Those are derived state, computed by
 * `reduce` from these facts, so replaying the same log always reproduces
 * the same derived outcome — see AGENTS.md invariant #3.
 */
export interface GameCreatedEvent extends EventEnvelope {
  readonly t: "GameCreated";
  readonly players: readonly Player[];
  readonly targetScore: number;
}

export interface RoundStartedEvent extends EventEnvelope {
  readonly t: "RoundStarted";
  readonly dealerId: PlayerId;
}

export interface CardDealtEvent extends EventEnvelope {
  readonly t: "CardDealt";
  readonly playerId: PlayerId;
  readonly card: Card;
}

export interface PlayerStayedEvent extends EventEnvelope {
  readonly t: "PlayerStayed";
  readonly playerId: PlayerId;
}

/** Records the resolution of a targeted action card (e.g. a Freeze). */
export interface ActionTargetedEvent extends EventEnvelope {
  readonly t: "ActionTargeted";
  readonly card: ActionCard;
  readonly sourceId: PlayerId;
  readonly targetId: PlayerId;
}

export interface DeckReshuffledEvent extends EventEnvelope {
  readonly t: "DeckReshuffled";
}

export interface ManualScoreEnteredEvent extends EventEnvelope {
  readonly t: "ManualScoreEntered";
  readonly playerId: PlayerId;
  readonly points: number;
}

export interface RoundClosedEvent extends EventEnvelope {
  readonly t: "RoundClosed";
}

export type GameEvent =
  | GameCreatedEvent
  | RoundStartedEvent
  | CardDealtEvent
  | PlayerStayedEvent
  | ActionTargetedEvent
  | DeckReshuffledEvent
  | ManualScoreEnteredEvent
  | RoundClosedEvent;
