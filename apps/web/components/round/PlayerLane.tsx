"use client";

import { scoreRound } from "@flip-7/engine";

import { faceLabel, faceOfCard } from "@/lib/cardCatalog";

import { CardTile } from "./CardTile";
import { StatusBadge } from "./StatusBadge";

import type { Player, PlayerRoundState } from "@flip-7/engine";

/**
 * One player's lane: mirrors the physical table layout (#37) — a modifier
 * row above the number row — plus status (#73), held Second Chance (#72)
 * and a running round score computed live via `scoreRound`, which already
 * handles the busted-scores-zero and Flip-7-bonus cases, so the lane never
 * duplicates that logic (AGENTS.md invariant #5).
 */
export function PlayerLane({
  player,
  playerRound,
  isDealer,
  isCurrentPlayer,
  onSelect,
}: {
  readonly player: Player;
  readonly playerRound: PlayerRoundState;
  readonly isDealer: boolean;
  readonly isCurrentPlayer: boolean;
  readonly onSelect: () => void;
}) {
  const score = scoreRound(playerRound);
  const isBusted = playerRound.status === "busted";
  const isFlipped7 = playerRound.status === "flipped7";
  const isActive = playerRound.status === "active";
  const hasCards = playerRound.numberCards.length > 0 || playerRound.modifierCards.length > 0;

  return (
    <li
      className={[
        "flex flex-col gap-2 rounded-lg border-2 p-3 transition-[opacity,background-color]",
        isCurrentPlayer ? "border-status-active" : "border-border",
        isFlipped7 ? "bg-status-flipped7/10" : "",
        // Inactive lanes recede so attention stays on active players — #73.
        !isActive && !isFlipped7 ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isCurrentPlayer}
          className="min-h-0! min-w-0! rounded px-1 py-0.5 text-left font-medium"
        >
          {player.name}
          {isDealer && (
            <span
              className="text-muted-foreground ml-2 text-xs font-normal"
              title="Dealer this round"
            >
              Dealer
            </span>
          )}
        </button>
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
            <CardTile key={card.id} kind="modifier" label={faceLabel(faceOfCard(card))} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {hasCards ? (
          playerRound.numberCards.map((card) => (
            <CardTile
              key={card.id}
              kind="number"
              label={faceLabel(faceOfCard(card))}
              muted={isBusted}
            />
          ))
        ) : (
          <span className="text-muted-foreground text-sm">No cards yet</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {playerRound.numberCards.length} unique number
          {playerRound.numberCards.length === 1 ? "" : "s"}
        </span>
        <span
          className={[
            "text-lg font-semibold",
            isBusted ? "text-status-busted line-through" : "",
            isFlipped7 ? "text-status-flipped7" : "",
          ].join(" ")}
        >
          {score.total}
        </span>
      </div>
    </li>
  );
}
