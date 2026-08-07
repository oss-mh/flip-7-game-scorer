"use client";

import { scoreRound } from "@flip-7/engine";
import { useEffect, useRef, useState } from "react";

import { faceLabel, faceOfCard } from "@/lib/cardCatalog";

import { DealtCardTile } from "./DealtCardTile";
import { ScoreBreakdownLine } from "./ScoreBreakdownLine";
import { StatusBadge } from "./StatusBadge";

import type { Card, Player, PlayerRoundState } from "@flip-7/engine";

/** How long the "used it!" treatment stays up after a Second Chance saves a bust — #72. */
const SECOND_CHANCE_SAVE_DISPLAY_MS = 1600;

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
  bustRisk,
  onSelect,
  onLongPressCard,
}: {
  readonly player: Player;
  readonly playerRound: PlayerRoundState;
  readonly isDealer: boolean;
  readonly isCurrentPlayer: boolean;
  /** Chance the next card dealt busts this hand (#83) — 0 for anyone not currently active. */
  readonly bustRisk: number;
  readonly onSelect: () => void;
  /** Mistap correction (#74) — long-press a dealt card to remove or replace it. */
  readonly onLongPressCard?: (card: Card) => void;
}) {
  const score = scoreRound(playerRound);
  const isBusted = playerRound.status === "busted";
  const isFlipped7 = playerRound.status === "flipped7";
  const isActive = playerRound.status === "active";
  // A manually scored player never has cards to show — surfacing "no cards
  // yet" and a unique-number count for them would read as a broken
  // card-tracked lane rather than the first-class mode AGENTS.md calls for.
  const isManual = playerRound.status === "manual";
  const hasCards = playerRound.numberCards.length > 0 || playerRound.modifierCards.length > 0;

  // A held Second Chance goes non-null → null two ways: it just saved a bust
  // (playerRound.status is still "active" — the near-miss worth celebrating,
  // see AGENTS.md design priorities), or the round ended and it discarded
  // unused (every player is inactive by then — see RoundBoard's round-over
  // notice for that case instead). Only the first should animate here.
  const previousHeldRef = useRef(playerRound.heldSecondChance);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    const previouslyHeld = previousHeldRef.current;
    previousHeldRef.current = playerRound.heldSecondChance;
    if (previouslyHeld && !playerRound.heldSecondChance && playerRound.status === "active") {
      setJustSaved(true);
      const timeout = setTimeout(() => setJustSaved(false), SECOND_CHANCE_SAVE_DISPLAY_MS);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [playerRound.heldSecondChance, playerRound.status]);

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
          className={[
            "min-h-0! min-w-0! rounded px-1 py-0.5 text-left font-medium",
            isBusted ? "text-status-busted line-through" : "",
          ].join(" ")}
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

      {justSaved && (
        <span
          role="status"
          className="text-status-active w-fit animate-bounce rounded-full border border-status-active bg-status-active/10 px-2 py-0.5 text-xs font-semibold"
        >
          Second Chance used — saved!
        </span>
      )}

      {playerRound.modifierCards.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {playerRound.modifierCards.map((card) => (
            <DealtCardTile
              key={card.id}
              kind="modifier"
              label={faceLabel(faceOfCard(card))}
              onLongPress={() => onLongPressCard?.(card)}
              disabled={!onLongPressCard}
            />
          ))}
        </div>
      )}

      {!isManual && (
        <div className="flex flex-wrap gap-1">
          {hasCards ? (
            playerRound.numberCards.map((card) => (
              <DealtCardTile
                key={card.id}
                kind="number"
                label={faceLabel(faceOfCard(card))}
                muted={isBusted}
                onLongPress={() => onLongPressCard?.(card)}
                disabled={!onLongPressCard}
              />
            ))
          ) : (
            <span className="text-muted-foreground text-sm">No cards yet</span>
          )}
        </div>
      )}

      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">
            {!isManual &&
              `${playerRound.numberCards.length} unique number${playerRound.numberCards.length === 1 ? "" : "s"}`}
          </span>
          {isActive && (
            <span
              className="text-muted-foreground text-xs"
              title="Chance the next card dealt busts this hand, from what's left in the deck"
            >
              {Math.round(bustRisk * 100)}% bust risk
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <ScoreBreakdownLine score={score} />
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
      </div>
    </li>
  );
}
