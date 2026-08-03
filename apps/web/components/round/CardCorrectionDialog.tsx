"use client";

import { useState } from "react";

import { faceLabel, faceOfCard } from "@/lib/cardCatalog";

import { CardPicker } from "./CardPicker";

import type { Card, CardDealtEvent, RoundState } from "@flip-7/engine";

/**
 * Long-press correction (#74): remove a mis-dealt card or swap it for the
 * right one, as a confirmed, cancelable action — unlike #70's target
 * prompt, this never blocks anything else, so a plain Cancel is always
 * available. "Remove" gets an extra native confirm since it's the
 * irreversible-feeling half of the two options; "Replace" already requires
 * two deliberate taps (open replace mode, then pick a card from the
 * picker), which serves as its own confirmation.
 */
export function CardCorrectionDialog({
  target,
  playerName,
  round,
  playerCount,
  onRemove,
  onReplace,
  onCancel,
  busy,
  error,
}: {
  readonly target: CardDealtEvent;
  readonly playerName: string;
  readonly round: RoundState;
  readonly playerCount: number;
  readonly onRemove: () => void;
  readonly onReplace: (card: Card) => void;
  readonly onCancel: () => void;
  readonly busy: boolean;
  readonly error: string | null;
}) {
  const [mode, setMode] = useState<"choose" | "replace">("choose");
  const label = faceLabel(faceOfCard(target.card));

  function handleRemove(): void {
    if (window.confirm(`Remove ${playerName}'s ${label}? This rewrites the round's history.`)) {
      onRemove();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Correct ${playerName}'s ${label}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
    >
      <div className="border-border bg-surface flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm">
          Correct {playerName}&rsquo;s <strong>{label}</strong>?
        </p>
        {error && <p className="text-status-busted text-xs">{error}</p>}

        {mode === "choose" ? (
          <div className="flex flex-col gap-2">
            <button type="button" disabled={busy} onClick={handleRemove}>
              Remove this card
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("replace")}>
              Replace with a different card
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">Tap the correct card.</p>
            <CardPicker
              cardsDealt={round.cardsDealt}
              playerCount={playerCount}
              onDeal={onReplace}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("choose")}
              className="text-muted-foreground text-xs"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
