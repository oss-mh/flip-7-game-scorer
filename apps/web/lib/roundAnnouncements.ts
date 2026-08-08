import { scoreRound } from "@flip-7/engine";

import { describeEvent } from "./describeEvent";

import type {
  GameEvent,
  Player,
  PlayerId,
  PlayerRoundState,
  PlayerRoundStatus,
  RoundState,
} from "@flip-7/engine";

function statusAnnouncement(name: string, playerRound: PlayerRoundState): string | null {
  const points = scoreRound(playerRound).total;
  switch (playerRound.status) {
    case "busted":
      return `${name} busted.`;
    case "frozen":
      return `${name} froze with ${points} points.`;
    case "flipped7":
      return `${name} flipped 7! ${points} points.`;
    case "stayed":
      return `${name} stayed with ${points} points.`;
    // "active" is the default resting state (including at the start of a
    // fresh round, when every player transitions into it at once), and
    // "manual" is set directly by the ManualScoreEntered event, which
    // `describeEvent` already announces — neither is an announcement-worthy
    // *transition* on its own.
    default:
      return null;
  }
}

/**
 * Screen-reader announcements for a round-board update: the raw events
 * since the last render (dealt cards, targeting, a round closing, ...) via
 * the same `describeEvent` the undo banner already uses, plus any player
 * whose status just became busted/frozen/flipped7/stayed — a `CardDealt`
 * event alone doesn't say a bust just happened, and that's the one moment
 * a screen reader user most needs called out.
 */
export function buildRoundAnnouncements({
  newEvents,
  players,
  round,
  previousStatuses,
  cumulativeScores,
}: {
  readonly newEvents: readonly GameEvent[];
  readonly players: readonly Player[];
  readonly round: RoundState | null;
  readonly previousStatuses: ReadonlyMap<PlayerId, PlayerRoundStatus>;
  readonly cumulativeScores: Readonly<Record<PlayerId, number>>;
}): readonly string[] {
  const messages: string[] = [];

  for (const event of newEvents) {
    messages.push(describeEvent(event, players));
    if (event.t === "RoundClosed") {
      const totals = players
        .map((player) => `${player.name} ${cumulativeScores[player.id] ?? 0}`)
        .join(", ");
      messages.push(`Totals: ${totals}.`);
    }
  }

  if (round) {
    for (const player of players) {
      const playerRound = round.players[player.id];
      if (!playerRound) continue;
      if (playerRound.status !== previousStatuses.get(player.id)) {
        const message = statusAnnouncement(player.name, playerRound);
        if (message) messages.push(message);
      }
    }
  }

  return messages;
}
