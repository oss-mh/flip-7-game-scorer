"use client";

export interface RoundBoundary {
  readonly roundNumber: number;
  /** Index into the event log right after this round's `RoundStarted` has landed. */
  readonly index: number;
}

/**
 * One button per round-started boundary (#85's "jump to round boundaries").
 * The active round is read from folded state rather than recomputed here,
 * so it's always exactly what `ReplayBoard` is showing, including the
 * closed-but-not-yet-superseded round `RoundClosed` leaves in place.
 */
export function ReplayRoundJumps({
  boundaries,
  activeRoundNumber,
  onJump,
}: {
  readonly boundaries: readonly RoundBoundary[];
  readonly activeRoundNumber: number | null;
  readonly onJump: (index: number) => void;
}) {
  if (boundaries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground text-xs">Round:</span>
      {boundaries.map((boundary) => (
        <button
          key={boundary.roundNumber}
          type="button"
          aria-pressed={activeRoundNumber === boundary.roundNumber}
          className={[
            "min-h-0! min-w-0! rounded border px-2 py-1 text-xs",
            activeRoundNumber === boundary.roundNumber
              ? "border-status-active text-status-active"
              : "border-border text-muted-foreground",
          ].join(" ")}
          onClick={() => onJump(boundary.index)}
        >
          {boundary.roundNumber}
        </button>
      ))}
    </div>
  );
}
