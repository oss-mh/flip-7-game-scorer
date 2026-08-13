"use client";

import { useState } from "react";

import {
  CARD_FACES,
  faceKey,
  faceLabel,
  nextCardForFace,
  remainingCountForFace,
} from "@/lib/cardCatalog";

import { CARD_KIND_CLASSES } from "./CardTile";

import type { CardFace } from "@/lib/cardCatalog";
import type { Card, RemainingDeckReport } from "@flip-7/engine";

const SECTION_TITLES: Record<CardFace["kind"], string> = {
  number: "Numbers",
  modifier: "Modifiers",
  action: "Actions",
};

function groupByKind(): Record<CardFace["kind"], CardFace[]> {
  const sections: Record<CardFace["kind"], CardFace[]> = { number: [], modifier: [], action: [] };
  for (const face of CARD_FACES) sections[face.kind].push(face);
  return sections;
}

const SECTIONS = groupByKind();

/**
 * The tap-to-deal grid (#67): every face at a fixed position so the layout
 * is muscle-memory stable across the whole game, with a remaining-copies
 * badge and exhaustion dimming (#68) — unless the game is in purist mode
 * (#40), which some tables consider these a form of cheating: no badge, no
 * dimming, every face always tappable, and no override toggle since
 * nothing is ever blocked to override. `onDeal` mints the next unused copy
 * of whichever face was tapped and leaves dispatching it to the caller,
 * which decides *who* it's dealt to (the current player for a Hit, a
 * forced-draw player during Flip Three, the next seat during the initial
 * deal, ...).
 */
export function CardPicker({
  cardsDealt,
  remaining,
  purist = false,
  onDeal,
  disabled = false,
}: {
  readonly cardsDealt: readonly Card[];
  readonly remaining: RemainingDeckReport;
  readonly purist?: boolean;
  readonly onDeal: (card: Card) => void;
  readonly disabled?: boolean;
}) {
  // Off by default so a stray tap can never deal a card the physical deck
  // doesn't have — see #68's "non-tappable" requirement. The physical deck
  // is still the ultimate source of truth, so this stays available as an
  // explicit, visible escape hatch for a miscounted table rather than a
  // blanket block.
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Tap a card to deal it</span>
        {!purist && (
          <button
            type="button"
            aria-pressed={overrideEnabled}
            onClick={() => setOverrideEnabled((value) => !value)}
            className={[
              "rounded px-2 py-1 text-xs",
              overrideEnabled ? "bg-status-busted/20 text-status-busted" : "text-muted-foreground",
            ].join(" ")}
          >
            {overrideEnabled ? "Miscount override: on" : "Miscount override"}
          </button>
        )}
      </div>

      {(Object.keys(SECTIONS) as CardFace["kind"][]).map((kind) => (
        <div key={kind} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
            {SECTION_TITLES[kind]}
          </span>
          <div className="flex flex-wrap gap-2">
            {SECTIONS[kind].map((face) => {
              const facesLeft = remainingCountForFace(remaining, face);
              const exhausted = !purist && facesLeft <= 0;
              const tappable = !disabled && (!exhausted || overrideEnabled);
              const label = faceLabel(face);
              return (
                <button
                  key={faceKey(face)}
                  type="button"
                  disabled={!tappable}
                  onClick={() => onDeal(nextCardForFace(cardsDealt, face))}
                  aria-label={`Deal ${label}${exhausted ? ", none left" : ""}`}
                  className={[
                    "relative flex h-12 shrink-0 items-center justify-center rounded-lg border-2 font-semibold",
                    kind === "action"
                      ? "w-auto min-w-12 whitespace-nowrap px-2 text-xs leading-tight"
                      : "w-12 text-base",
                    CARD_KIND_CLASSES[kind],
                    exhausted ? "opacity-35" : "",
                  ].join(" ")}
                >
                  {label}
                  {!purist && (
                    <span className="border-border bg-background text-muted-foreground absolute -top-2 -right-2 min-w-4 rounded-full border px-1 text-[10px] leading-4">
                      {facesLeft}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
