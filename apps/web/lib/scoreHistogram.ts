export interface ScoreBucket {
  readonly label: string;
  readonly count: number;
}

const DEFAULT_BUCKET_SIZE = 10;

/**
 * Buckets round scores into fixed-width bins for the score-distribution
 * chart. Bins run `[start, start + bucketSize)`; every bin from 0 up to the
 * highest score is included, even ones with a count of 0, so a gap in the
 * distribution reads as an empty bar rather than a skipped one.
 */
export function bucketScores(
  scores: readonly number[],
  bucketSize: number = DEFAULT_BUCKET_SIZE,
): readonly ScoreBucket[] {
  if (scores.length === 0) return [];

  const highest = Math.max(...scores);
  const bucketCount = Math.floor(highest / bucketSize) + 1;
  const counts = new Array<number>(bucketCount).fill(0);

  for (const score of scores) {
    const index = Math.min(Math.floor(score / bucketSize), bucketCount - 1);
    counts[index] += 1;
  }

  return counts.map((count, index) => ({
    label: `${index * bucketSize}-${index * bucketSize + bucketSize - 1}`,
    count,
  }));
}
