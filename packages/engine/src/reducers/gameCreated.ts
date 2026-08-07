import { DomainError } from "../errors.js";
import { DEFAULT_TARGET_SCORE, type GameState } from "../state.js";

import type { GameCreatedEvent } from "../events.js";
import type { PlayerId } from "../player.js";

/**
 * Duplicate player *names* are permitted by the rulebook (two people can
 * both be "Alex") — surfacing that as a UI warning during setup is an
 * app-layer concern, not something the pure reducer tracks. Duplicate
 * *ids* would silently collide as Record keys, so those are rejected.
 */
export function applyGameCreated(event: GameCreatedEvent): GameState {
  if (event.players.length < 2) {
    throw new DomainError("GameCreated requires at least 2 players");
  }

  const seenIds = new Set<PlayerId>();
  for (const player of event.players) {
    if (seenIds.has(player.id)) {
      throw new DomainError(`GameCreated requires unique player ids — duplicate "${player.id}"`);
    }
    seenIds.add(player.id);
  }

  const cumulativeScores: Record<PlayerId, number> = {};
  for (const player of event.players) {
    cumulativeScores[player.id] = 0;
  }

  return {
    players: event.players,
    targetScore: event.targetScore ?? DEFAULT_TARGET_SCORE,
    cumulativeScores,
    roundNumber: 0,
    currentRound: null,
    status: "active",
    purist: event.purist ?? false,
  };
}
