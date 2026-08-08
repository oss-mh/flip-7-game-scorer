"use client";

import { CardPicker } from "./CardPicker";

import type { Card, Player, PlayerId, RemainingDeckReport, RoundState } from "@flip-7/engine";

function playerName(players: readonly Player[], playerId: PlayerId): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

/**
 * Guided one-card-per-player deal at the start of a round (#75). Renders
 * whenever `useInitialDeal` reports an active target seat; the phase switch
 * in RoundBoard already gives action-target and Flip Three resolutions
 * priority over this branch, so the deal visibly pauses on an action card
 * and resumes here once it resolves — no extra state needed for that.
 */
export function InitialDeal({
  round,
  players,
  targetPlayerId,
  remaining,
  purist,
  onDeal,
  onSkip,
  busy,
}: {
  readonly round: RoundState;
  readonly players: readonly Player[];
  readonly targetPlayerId: PlayerId;
  readonly remaining: RemainingDeckReport;
  readonly purist: boolean;
  readonly onDeal: (card: Card) => void;
  readonly onSkip: () => void;
  readonly busy: boolean;
}) {
  return (
    <div className="border-status-active bg-status-active/10 flex flex-col gap-2 rounded-lg border-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          Initial deal: <strong>{playerName(players, targetPlayerId)}</strong>
        </p>
        <button
          type="button"
          className="text-muted-foreground text-xs underline"
          onClick={onSkip}
        >
          Skip guided deal
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        One card each, in seat order. Uneven hands afterward are normal.
      </p>
      <CardPicker
        cardsDealt={round.cardsDealt}
        remaining={remaining}
        purist={purist}
        onDeal={onDeal}
        disabled={busy}
      />
    </div>
  );
}
