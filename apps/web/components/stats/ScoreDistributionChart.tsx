import { bucketScores } from "@/lib/scoreHistogram";

/**
 * A minimal histogram of round scores — plain divs sized by percentage
 * height, matching the existing plain-CSS progress-bar idiom (`Scoreboard`)
 * rather than pulling in a charting dependency. One series, so no legend
 * (the dataviz convention: "a single series needs no legend box" — the
 * section heading above this already says what's plotted); bars capped at
 * 24px wide with a 2px gap and a rounded top, each labeled with its count
 * at the tip.
 */
export function ScoreDistributionChart({ scores }: { readonly scores: readonly number[] }) {
  const buckets = bucketScores(scores);
  if (buckets.length === 0) {
    return <p className="text-muted-foreground text-sm">No rounds played yet.</p>;
  }

  const maxCount = Math.max(...buckets.map((bucket) => bucket.count));

  return (
    <div
      className="flex items-end gap-0.5 overflow-x-auto pb-1"
      role="img"
      aria-label={`Distribution of ${scores.length} round score${scores.length === 1 ? "" : "s"}`}
    >
      {buckets.map((bucket) => {
        const heightPercent = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
        return (
          <div key={bucket.label} className="flex w-6 shrink-0 flex-col items-center gap-1">
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {bucket.count > 0 ? bucket.count : ""}
            </span>
            <div className="flex h-24 w-full items-end">
              <div
                className="bg-status-active w-full rounded-t"
                style={{ height: `${heightPercent}%` }}
              />
            </div>
            <span className="text-muted-foreground text-[9px] whitespace-nowrap">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}
