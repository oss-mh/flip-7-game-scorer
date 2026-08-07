"use client";

import { useEffect, useRef } from "react";

const PLAYBACK_INTERVAL_MS = 700;

/**
 * Play/pause/step/scrub over an index into `events` — purely local UI state
 * (see `ReplayViewer`), never a dispatch. Play auto-stops at the end rather
 * than looping, since "what happens next" stops being a meaningful question
 * once every event has been applied.
 */
export function ReplayControls({
  index,
  total,
  playing,
  onSetIndex,
  onSetPlaying,
}: {
  readonly index: number;
  readonly total: number;
  readonly playing: boolean;
  readonly onSetIndex: (index: number) => void;
  readonly onSetPlaying: (playing: boolean) => void;
}) {
  const onSetIndexRef = useRef(onSetIndex);
  const onSetPlayingRef = useRef(onSetPlaying);
  useEffect(() => {
    onSetIndexRef.current = onSetIndex;
    onSetPlayingRef.current = onSetPlaying;
  }, [onSetIndex, onSetPlaying]);

  useEffect(() => {
    if (!playing) return undefined;
    const interval = setInterval(() => {
      onSetIndexRef.current(Math.min(index + 1, total));
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(interval);
    // Re-armed every tick `index` changes, so playback always steps from the
    // position just rendered rather than a stale closure over the start.
  }, [playing, index, total]);

  useEffect(() => {
    if (playing && index >= total) onSetPlayingRef.current(false);
  }, [playing, index, total]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="range"
        min={0}
        max={total}
        value={index}
        onChange={(event) => onSetIndex(Number(event.target.value))}
        aria-label="Scrub through the event log"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-h-0! min-w-0! px-3 py-1.5 text-sm"
            disabled={index <= 0}
            onClick={() => onSetIndex(0)}
            aria-label="Jump to start"
          >
            ⏮
          </button>
          <button
            type="button"
            className="min-h-0! min-w-0! px-3 py-1.5 text-sm"
            disabled={index <= 0}
            onClick={() => onSetIndex(index - 1)}
            aria-label="Step back one event"
          >
            ◀
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm"
            disabled={index >= total && !playing}
            onClick={() => onSetPlaying(!playing)}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="min-h-0! min-w-0! px-3 py-1.5 text-sm"
            disabled={index >= total}
            onClick={() => onSetIndex(index + 1)}
            aria-label="Step forward one event"
          >
            ▶
          </button>
          <button
            type="button"
            className="min-h-0! min-w-0! px-3 py-1.5 text-sm"
            disabled={index >= total}
            onClick={() => onSetIndex(total)}
            aria-label="Jump to end"
          >
            ⏭
          </button>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          Event {index} / {total}
        </span>
      </div>
    </div>
  );
}
