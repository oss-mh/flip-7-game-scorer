import { EVENT_SCHEMA_VERSION } from "@flip-7/engine";

import { systemClock } from "./systemClock";
import { systemIdGenerator } from "./systemIdGenerator";

import type {
  GameCreatedEvent,
  GameId,
  GameRepository,
  Player,
  PlayerId,
  RoundStartedEvent,
} from "@flip-7/engine";

/**
 * Creates a new game's repository record and its opening two events
 * (`GameCreated`, `RoundStarted`) in one place — shared by the new-game
 * form and a rematch (#81), which both need the exact same event
 * sequencing and must never drift out of sync with each other.
 */
export async function createGame(
  repository: GameRepository,
  players: readonly Player[],
  targetScore: number,
  firstDealerId: PlayerId,
  purist = false,
): Promise<GameId> {
  const gameId = systemIdGenerator.next();
  const at = systemClock.now();

  await repository.createGame({
    id: gameId,
    players,
    targetScore,
    createdAt: at,
    archivedAt: null,
  });

  const gameCreated: GameCreatedEvent = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at,
    seq: 1,
    t: "GameCreated",
    players,
    targetScore,
    purist,
  };
  const roundStarted: RoundStartedEvent = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at,
    seq: 2,
    t: "RoundStarted",
    dealerId: firstDealerId,
  };
  await repository.appendEvents(gameId, [gameCreated, roundStarted], 0);

  return gameId;
}
