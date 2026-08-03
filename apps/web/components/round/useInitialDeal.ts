"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { seatOrderFromDealer } from "@/lib/turnOrder";

import type { Player, PlayerId, RoundState } from "@flip-7/engine";

/**
 * Drives the guided one-card-per-player initial deal (#75). Which seats
 * still need their first card is tracked locally as the wizard deals them,
 * not inferred from hand contents — an action card resolves without ever
 * landing in `numberCards`/`modifierCards`, so "hand is empty" alone can't
 * tell a not-yet-dealt seat from one whose first card was a Freeze. The
 * cost is that a page reload mid-guided-deal loses the wizard's own
 * position (not any game state — every dealt card is still safely in the
 * log) and falls back to "Skip guided deal" territory; a narrow, low-stakes
 * edge case against AGENTS.md's "never lose scores" priority, since no
 * score or card is ever at risk, only this wizard's cursor.
 */
export function useInitialDeal(
  round: RoundState | null,
  players: readonly Player[],
): {
  readonly active: boolean;
  readonly nextSeatId: PlayerId | null;
  readonly markDealt: (playerId: PlayerId) => void;
  readonly skip: () => void;
} {
  const seatOrder = useMemo(
    () => (round ? seatOrderFromDealer(players, round.dealerId) : []),
    [players, round],
  );

  const [dealtSeats, setDealtSeats] = useState<ReadonlySet<PlayerId>>(new Set());
  const [skipped, setSkipped] = useState(false);
  const roundNumberRef = useRef<number | null>(null);

  useEffect(() => {
    if (!round) return;
    if (roundNumberRef.current !== round.roundNumber) {
      roundNumberRef.current = round.roundNumber;
      setDealtSeats(new Set());
      setSkipped(false);
    }
  }, [round]);

  const nextSeatId = round
    ? (seatOrder.find(
        (playerId) => round.players[playerId]?.status === "active" && !dealtSeats.has(playerId),
      ) ?? null)
    : null;

  function markDealt(playerId: PlayerId): void {
    setDealtSeats((previous) => new Set(previous).add(playerId));
  }

  function skip(): void {
    setSkipped(true);
  }

  return { active: !skipped && nextSeatId !== null, nextSeatId, markDealt, skip };
}
