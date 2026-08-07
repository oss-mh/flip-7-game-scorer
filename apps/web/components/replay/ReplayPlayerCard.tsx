"use client";

import { scoreRound } from "@flip-7/engine";

import { cardLabel } from "@/lib/cardCatalog";

import { CardTile } from "../round/CardTile";
import { ScoreBreakdownLine } from "../round/ScoreBreakdownLine";
import { StatusBadge } from "../round/StatusBadge";

import type { Player, PlayerRoundState } from "@flip-7/engine";

/**
 * One player's lane at a scrubbed-to point in the log — the read-only
 * counterpart to `PlayerLane`. Deliberately doesn't reuse `PlayerLane`
 * itself: that component's Second-Chance "just saved!" animation compares
 * against the *previous* render on the assumption time only moves forward,
 * which scrubbing backward violates. This has no such state, just a plain
 * read of `playerRound` each render — exactly what a replay needs.
 */
export function ReplayPlayerCard({
  player,
  playerRound,
  isDealer,
}: {
  readonly player: Player;
  readonly playerRound: PlayerRoundState;
  readonly isDealer: boolean;
}) {
  const score = scoreRound(playerRound);
  const isBusted = playerRound.status === "busted";
  const isManual = playerRound.status === "manual";
  const hasCards = playerRound.numberCards.length > 0 || playerRound.modifierCards.length > 0;

  return (
    <li className="border-border flex flex-col gap-2 rounded-lg border-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={isBusted ? "text-status-busted font-medium line-through" : "font-medium"}>
          {player.name}
          {isDealer && <span className="text-muted-foreground ml-2 text-xs font-normal">Dealer</span>}
        </span>
        <StatusBadge status={playerRound.status} />
      </div>

      {playerRound.heldSecondChance && (
        <span className="text-card-action w-fit rounded-full border border-card-action/60 px-2 py-0.5 text-xs font-medium">
          Holding 2nd Chance
        </span>
      )}

      {playerRound.modifierCards.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {playerRound.modifierCards.map((card) => (
            <CardTile key={card.id} kind="modifier" label={cardLabel(card)} />
          ))}
        </div>
      )}

      {!isManual && (
        <div className="flex flex-wrap gap-1">
          {hasCards ? (
            playerRound.numberCards.map((card) => (
              <CardTile key={card.id} kind="number" label={cardLabel(card)} muted={isBusted} />
            ))
          ) : (
            <span className="text-muted-foreground text-sm">No cards yet</span>
          )}
        </div>
      )}

      <div className="flex items-end justify-between">
        <ScoreBreakdownLine score={score} />
        <span
          className={`text-lg font-semibold ${isBusted ? "text-status-busted line-through" : ""}`}
        >
          {score.total}
        </span>
      </div>
    </li>
  );
}
