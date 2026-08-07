"use client";

import { faceLabel, faceOfCard } from "@/lib/cardCatalog";

import { CardPicker } from "./CardPicker";

import type {
  Card,
  ForcedDrawRemainingResolution,
  PendingResolution,
  Player,
  RemainingDeckReport,
  RoundState,
} from "@flip-7/engine";

const FLIP_THREE_DRAW_COUNT = 3;

function playerName(players: readonly Player[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

/** Short label for a queued item behind the active Flip Three, for the "up next" preview. */
function describeQueued(item: PendingResolution, players: readonly Player[]): string {
  switch (item.kind) {
    case "awaiting-target":
      return `${playerName(players, item.sourcePlayerId)}'s ${faceLabel(faceOfCard(item.card))} — pick a target`;
    case "forced-draw-remaining":
      return `${playerName(players, item.playerId)}'s Flip Three (${item.cardsRemaining} more)`;
    case "second-chance-reassignment":
      return `${playerName(players, item.fromPlayerId)}'s Second Chance — pass it on`;
  }
}

/**
 * Takes over the controls whenever `nextResolution()` is a forced draw
 * (#71) — a Flip Three in progress. Only the picker is offered, with no
 * Stay escape hatch, since the reducer forces all three draws regardless of
 * what any player would otherwise choose; a bust or Flip 7 mid-sequence
 * ends it early on the engine side, this just narrates that it can happen.
 */
export function FlipThreeSequence({
  resolution,
  upNext,
  round,
  players,
  remaining,
  onDeal,
  busy,
}: {
  readonly resolution: ForcedDrawRemainingResolution;
  readonly upNext: readonly PendingResolution[];
  readonly round: RoundState;
  readonly players: readonly Player[];
  readonly remaining: RemainingDeckReport;
  readonly onDeal: (card: Card) => void;
  readonly busy: boolean;
}) {
  const drawNumber = FLIP_THREE_DRAW_COUNT + 1 - resolution.cardsRemaining;
  const name = playerName(players, resolution.playerId);

  return (
    <div className="border-card-action bg-card-action/10 flex flex-col gap-2 rounded-lg border-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          Flip Three: <strong>{name}</strong>
        </p>
        <span className="text-muted-foreground text-xs">
          Card {drawNumber} of {FLIP_THREE_DRAW_COUNT}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        All three cards are forced — no Stay until the sequence finishes. A bust or Flip 7 ends it
        early.
      </p>
      {upNext.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Up next: {upNext.map((item) => describeQueued(item, players)).join("; ")}
        </p>
      )}
      <CardPicker
        cardsDealt={round.cardsDealt}
        remaining={remaining}
        onDeal={onDeal}
        disabled={busy}
      />
    </div>
  );
}
