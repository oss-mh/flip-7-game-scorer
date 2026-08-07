"use client";

import { fold } from "@flip-7/engine";
import { useMemo, useState } from "react";

import { describeEvent } from "@/lib/describeEvent";

import { ReplayBoard } from "./ReplayBoard";
import { ReplayControls } from "./ReplayControls";
import { ReplayRoundJumps } from "./ReplayRoundJumps";

import type { RoundBoundary } from "./ReplayRoundJumps";
import type { GameEvent } from "@flip-7/engine";

function computeRoundBoundaries(events: readonly GameEvent[]): readonly RoundBoundary[] {
  const boundaries: RoundBoundary[] = [];
  events.forEach((event, i) => {
    if (event.t === "RoundStarted") {
      boundaries.push({ roundNumber: boundaries.length + 1, index: i + 1 });
    }
  });
  return boundaries;
}

/**
 * Scrubs a read-only view of a game's event log — never dispatches, never
 * touches storage (#85's "read-only" acceptance criterion). `index` is a
 * position *between* events (0 = nothing applied yet, `events.length` =
 * fully caught up), so `fold(events.slice(0, index))` is always exactly
 * "the state right after the `index`-th event landed." Defaults to the end
 * (the game's current state) since that's the most useful starting point
 * for "rewind to the point in question," which is what this exists for —
 * see the issue body, "settles table arguments."
 */
export function ReplayViewer({ events }: { readonly events: readonly GameEvent[] }) {
  const [index, setIndex] = useState(events.length);
  const [playing, setPlaying] = useState(false);

  const boundaries = useMemo(() => computeRoundBoundaries(events), [events]);
  const visibleEvents = useMemo(() => events.slice(0, index), [events, index]);
  const state = useMemo(() => fold(visibleEvents), [visibleEvents]);
  const lastEvent = visibleEvents[visibleEvents.length - 1] ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-3">
      <ReplayControls
        index={index}
        total={events.length}
        playing={playing}
        onSetIndex={setIndex}
        onSetPlaying={setPlaying}
      />

      <ReplayRoundJumps
        boundaries={boundaries}
        activeRoundNumber={state.currentRound?.roundNumber ?? null}
        onJump={setIndex}
      />

      <p className="text-muted-foreground min-h-4 text-center text-xs">
        {lastEvent ? describeEvent(lastEvent, state.players) : "Nothing has happened yet."}
      </p>

      <ReplayBoard state={state} />
    </div>
  );
}
