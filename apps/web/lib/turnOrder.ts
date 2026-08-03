import type { Player, PlayerId, RoundState } from "@flip-7/engine";

/**
 * Seating order for guiding taps around the table, starting immediately
 * left of the dealer and ending with the dealer. The engine has no concept
 * of turn order at all — `legalActions` permits any active player to act at
 * any time — so this is purely a UI sequencing convenience, never consulted
 * to decide what's legal. See AGENTS.md invariant #5.
 */
export function seatOrderFromDealer(
  players: readonly Player[],
  dealerId: PlayerId,
): readonly PlayerId[] {
  const ids = players.map((player) => player.id);
  const dealerIndex = ids.indexOf(dealerId);
  if (dealerIndex === -1) return ids;
  return [...ids.slice(dealerIndex + 1), ...ids.slice(0, dealerIndex + 1)];
}

/**
 * The seat one place left of `dealerId`, for starting the next round —
 * mirrors the rotation `RoundStarted` itself enforces in
 * `packages/engine/src/reducers/roundStarted.ts`, so the "start next round"
 * control always proposes a dealer the reducer will accept.
 */
export function nextDealerId(players: readonly Player[], dealerId: PlayerId): PlayerId | null {
  const index = players.findIndex((player) => player.id === dealerId);
  if (index === -1) return null;
  const next = players[(index + 1) % players.length];
  return next?.id ?? null;
}

/**
 * The first active player at or after `from` in `seatOrder`, wrapping once.
 * `-1` if nobody in the round is active.
 */
export function nextActiveSeatIndex(
  round: RoundState,
  seatOrder: readonly PlayerId[],
  from: number,
): number {
  if (seatOrder.length === 0) return -1;
  for (let step = 0; step < seatOrder.length; step += 1) {
    const index = (from + step) % seatOrder.length;
    const playerId = seatOrder[index];
    if (playerId !== undefined && round.players[playerId]?.status === "active") {
      return index;
    }
  }
  return -1;
}
