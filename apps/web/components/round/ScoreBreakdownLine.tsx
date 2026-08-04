import type { ScoreBreakdown } from "@flip-7/engine";

/**
 * Renders the scoring formula the way it's worked out by hand — base sum,
 * the ×2 multiplier if held, flat modifiers, then the Flip 7 bonus — so the
 * order of operations (AGENTS.md, "Scoring order") is visible next to the
 * total, not just the result. Terms that don't apply are omitted rather
 * than shown as "+ 0": a lone ×2 card scoring 0 is exactly the case worth
 * making legible (AGENTS.md, "Rules most often implemented wrongly").
 */
export function ScoreBreakdownLine({ score }: { readonly score: ScoreBreakdown }) {
  const hasBreakdown = score.multiplier === 2 || score.flatBonus !== 0 || score.flip7Bonus !== 0;
  if (!hasBreakdown) {
    return null;
  }

  const terms = [score.multiplier === 2 ? `${score.base} × 2` : `${score.base}`];
  if (score.flatBonus !== 0) {
    terms.push(`+ ${score.flatBonus}`);
  }
  if (score.flip7Bonus !== 0) {
    terms.push(`+ ${score.flip7Bonus}`);
  }

  return (
    <span className="text-muted-foreground text-xs tabular-nums">
      {terms.join(" ")} = {score.total}
    </span>
  );
}
