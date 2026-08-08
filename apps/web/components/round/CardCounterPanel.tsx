"use client";

import { useState } from "react";

import { CARD_FACES, faceKey, faceLabel, remainingCountForFace, totalRemainingCards } from "@/lib/cardCatalog";

import { CARD_KIND_CLASSES } from "./CardTile";

import type { CardFace } from "@/lib/cardCatalog";
import type { RemainingDeckReport } from "@flip-7/engine";

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
 * The collapsible card counter (#39): remaining count per face, from the
 * same whole-game `remainingDeck` report (#38) the picker and each lane's
 * bust risk use — no separate app-side tally to drift out of sync with it.
 * Collapsed by default and rendered in normal document flow above the
 * lanes, never as an overlay, so it can never cover the card picker at the
 * bottom of the board (its own acceptance criterion) and never dominates
 * the screen on a fresh load either.
 */
export function CardCounterPanel({ remaining }: { readonly remaining: RemainingDeckReport }) {
  const [expanded, setExpanded] = useState(false);
  const total = totalRemainingCards(remaining);
  const maxRemaining = Math.max(1, ...remaining.counts.map((count) => count.remaining));

  return (
    <div className="border-border bg-surface rounded-lg border">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-medium">Card counter</span>
        <span className="text-muted-foreground text-xs">
          {total} left {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-border flex flex-col gap-3 border-t p-3">
          {(Object.keys(SECTIONS) as CardFace["kind"][]).map((kind) => (
            <div key={kind} className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                {SECTION_TITLES[kind]}
              </span>
              <div className="flex flex-col gap-1">
                {SECTIONS[kind].map((face) => {
                  const facesLeft = remainingCountForFace(remaining, face);
                  const weightPercent = Math.round((facesLeft / maxRemaining) * 100);
                  return (
                    <div key={faceKey(face)} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-14 shrink-0 truncate font-semibold ${CARD_KIND_CLASSES[kind]}`}
                      >
                        {faceLabel(face)}
                      </span>
                      <div className="bg-border/40 h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full ${
                            facesLeft <= 0 ? "bg-status-busted/50" : "bg-status-active"
                          }`}
                          style={{ width: `${facesLeft <= 0 ? 100 : weightPercent}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-5 shrink-0 text-right tabular-nums">
                        {facesLeft}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
