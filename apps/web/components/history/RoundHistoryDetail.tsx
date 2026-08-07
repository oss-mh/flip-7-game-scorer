"use client";

import { scoreRound } from "@flip-7/engine";

import { faceLabel, faceOfCard } from "@/lib/cardCatalog";

import { CardTile } from "../round/CardTile";
import { ScoreBreakdownLine } from "../round/ScoreBreakdownLine";
import { StatusBadge } from "../round/StatusBadge";

import type { Player, PlayerRoundState } from "@flip-7/engine";

/**
 * What tapping a table cell opens: the same cards-and-breakdown view
 * `PlayerLane` shows live, just for a closed round instead of the current
 * one — reuses `scoreRound`/`ScoreBreakdownLine`/`StatusBadge` rather than
 * re-deriving any of it (AGENTS.md invariant #5). `CardTile`, not
 * `DealtCardTile`: a closed round's cards aren't correctable from here.
 */
export function RoundHistoryDetail({
  roundNumber,
  player,
  playerRound,
  onClose,
}: {
  readonly roundNumber: number;
  readonly player: Player;
  readonly playerRound: PlayerRoundState;
  readonly onClose: () => void;
}) {
  const score = scoreRound(playerRound);
  const isBusted = playerRound.status === "busted";
  const isManual = playerRound.status === "manual";
  const hasCards = playerRound.numberCards.length > 0 || playerRound.modifierCards.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} — round ${roundNumber}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {player.name} — Round {roundNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground min-h-0! min-w-0! text-xs underline"
          >
            Close
          </button>
        </div>

        <StatusBadge status={playerRound.status} />

        {playerRound.modifierCards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {playerRound.modifierCards.map((card) => (
              <CardTile
                key={card.id}
                kind="modifier"
                label={faceLabel(faceOfCard(card))}
                size="md"
              />
            ))}
          </div>
        )}

        {!isManual &&
          (hasCards ? (
            <div className="flex flex-wrap gap-1">
              {playerRound.numberCards.map((card) => (
                <CardTile
                  key={card.id}
                  kind="number"
                  label={faceLabel(faceOfCard(card))}
                  size="md"
                  muted={isBusted}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No cards this round.</p>
          ))}

        <div className="flex items-center justify-between">
          <ScoreBreakdownLine score={score} />
          <span className="text-lg font-semibold tabular-nums">{score.total}</span>
        </div>
      </div>
    </div>
  );
}
