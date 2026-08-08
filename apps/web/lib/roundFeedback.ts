import type { FeedbackKind } from "./feedback";
import type { GameEvent, Player, PlayerId, PlayerRoundStatus, RoundState } from "@flip-7/engine";

const STATUS_FEEDBACK: Partial<Record<PlayerRoundStatus, FeedbackKind>> = {
  busted: "bust",
  flipped7: "flip7",
  frozen: "freeze",
};

/**
 * Which haptic/sound cues a round-board update should fire: one "deal" per
 * `CardDealt` event, plus one for any player whose status just became
 * busted/frozen/flipped7. Mirrors `lib/roundAnnouncements.ts`'s diff
 * exactly (same events-since-last-render and previous-statuses inputs) —
 * kept as its own function rather than folded into that one, since
 * screen-reader text and haptics/sound are different concerns that happen
 * to watch the same underlying change.
 */
export function buildFeedbackTriggers({
  newEvents,
  players,
  round,
  previousStatuses,
}: {
  readonly newEvents: readonly GameEvent[];
  readonly players: readonly Player[];
  readonly round: RoundState | null;
  readonly previousStatuses: ReadonlyMap<PlayerId, PlayerRoundStatus>;
}): readonly FeedbackKind[] {
  const triggers: FeedbackKind[] = [];

  for (const event of newEvents) {
    if (event.t === "CardDealt") triggers.push("deal");
  }

  if (round) {
    for (const player of players) {
      const status = round.players[player.id]?.status;
      if (!status || status === previousStatuses.get(player.id)) continue;
      const feedback = STATUS_FEEDBACK[status];
      if (feedback) triggers.push(feedback);
    }
  }

  return triggers;
}
