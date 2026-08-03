import type { Card, CardDealtEvent, GameEvent, PlayerId } from "@flip-7/engine";

/**
 * Events from the start of the current (most recent) round onward. Mistap
 * correction (#74) only ever targets cards visible on the live board, and
 * `Card.id`s are only guaranteed unique *within* a round — `cardsDealt`
 * resets every `RoundStarted` — so a lookup must stay scoped to this slice
 * rather than searching the whole game log.
 */
function currentRoundEvents(events: readonly GameEvent[]): readonly GameEvent[] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.t === "RoundStarted") return events.slice(i);
  }
  return events;
}

/** The `CardDealt` event that put `card` in front of `playerId` this round, if any. */
export function findCardDealtEvent(
  events: readonly GameEvent[],
  playerId: PlayerId,
  card: Card,
): CardDealtEvent | null {
  const scoped = currentRoundEvents(events);
  for (let i = scoped.length - 1; i >= 0; i -= 1) {
    const event = scoped[i];
    if (event?.t === "CardDealt" && event.playerId === playerId && event.card.id === card.id) {
      return event;
    }
  }
  return null;
}
