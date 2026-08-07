import type { PlayerLifetimeStats } from "@flip-7/engine";

export type RiskAppetiteLevel = "insufficient-data" | "cautious" | "balanced" | "aggressive";

export interface RiskAppetiteResult {
  readonly level: RiskAppetiteLevel;
  readonly label: string;
  readonly description: string;
}

const MIN_ROUNDS_FOR_SIGNAL = 5;
const AGGRESSIVE_BUST_RATE = 0.4;
const CAUTIOUS_BUST_RATE = 0.15;

/**
 * A rough "how hard do they push their luck" read on a player, from the
 * bust rate `lifetimePlayerStats` already computed. This is a presentational
 * label over an existing engine stat, not a new domain concept — the
 * thresholds are a judgment call, not a rule from the rulebook.
 */
export function riskAppetite(stats: PlayerLifetimeStats): RiskAppetiteResult {
  if (stats.roundsPlayed < MIN_ROUNDS_FOR_SIGNAL) {
    return {
      level: "insufficient-data",
      label: "Not enough data",
      description: `Play a few more rounds (${stats.roundsPlayed} so far) to see a risk read.`,
    };
  }

  const bustPercent = Math.round(stats.bustRate * 100);

  if (stats.bustRate >= AGGRESSIVE_BUST_RATE) {
    return {
      level: "aggressive",
      label: "Aggressive",
      description: `Busts ${bustPercent}% of rounds — pushes for big hands.`,
    };
  }

  if (stats.bustRate <= CAUTIOUS_BUST_RATE) {
    return {
      level: "cautious",
      label: "Cautious",
      description: `Busts only ${bustPercent}% of rounds — plays it safe.`,
    };
  }

  return {
    level: "balanced",
    label: "Balanced",
    description: `Busts ${bustPercent}% of rounds — a measured risk taker.`,
  };
}
