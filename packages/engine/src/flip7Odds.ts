import { NUMBER_VALUES, cardOfFace } from "./cards.js";
import { EVENT_SCHEMA_VERSION } from "./events.js";
import { reduce } from "./reduce.js";
import { scoreRound } from "./scoring.js";
import { legalActions } from "./selectors.js";

import type { Card, NumberValue } from "./cards.js";
import type { GameEvent } from "./events.js";
import type { PlayerId } from "./player.js";
import type { RemainingDeckReport } from "./remainingDeck.js";
import type { GameState } from "./state.js";

const FLIP_7_UNIQUE_COUNT = 7;

function popcount(mask: number): number {
  let count = 0;
  for (let m = mask; m !== 0; m >>= 1) {
    count += m & 1;
  }
  return count;
}

/**
 * Probability of reaching seven unique number cards from the player's
 * current hand, computed exactly (not simulated) from `remaining` (#38):
 * every ordering of the remaining number cards is equally likely, and this
 * is the fraction of orderings in which seven distinct values get drawn
 * before any value already held gets duplicated.
 *
 * Modifier and action cards are left out of the model entirely. They can
 * never bust anyone and never count toward Flip 7 (see AGENTS.md), so
 * drawing one changes nothing about the eventual outcome — only the
 * relative order of the *number* cards among themselves matters, and a
 * uniformly random shuffle of the whole pool, restricted to just its
 * number cards, is itself a uniformly random ordering of those number
 * cards alone.
 *
 * The state is a bitmask over the 13 number values (0–12): which are
 * currently held (bust hazards) versus still open (safe first draws).
 * Collecting a new value moves it from "safe" to "hazard" for the rest of
 * the hypothetical run — a duplicate of it would end the run from that
 * point on — so the recursion is memoized per reachable mask rather than
 * computed as a fixed per-draw probability.
 *
 * Two things this deliberately does not model, both worth knowing before
 * trusting the number:
 *  - A held Second Chance intercepting one duplicate along the way, which
 *    would raise the true probability above what's returned here. #83's
 *    bustProbability makes the same simplification for a single next card;
 *    this compounds it across the whole hypothetical run.
 *  - Nothing about *other* players is hidden here the way it would be for
 *    someone counting cards by eye at a real table — `remaining` already
 *    reflects perfect knowledge of every card dealt across the whole game
 *    log, not an estimate.
 */
export function flip7Probability(
  state: GameState,
  remaining: RemainingDeckReport,
  playerId: PlayerId,
): number {
  const round = state.currentRound;
  const playerRound = round?.players[playerId];
  if (!playerRound) {
    return 0;
  }

  const heldMask = playerRound.numberCards.reduce(
    (mask, card) => mask | (1 << card.value),
    0,
  );
  if (popcount(heldMask) >= FLIP_7_UNIQUE_COUNT) {
    return 1;
  }
  if (playerRound.status !== "active") {
    return 0;
  }

  const baseCount = new Map<NumberValue, number>();
  for (const count of remaining.counts) {
    if (count.face.kind === "number") {
      baseCount.set(count.face.value, count.remaining);
    }
  }

  const memo = new Map<number, number>();

  function probabilityFrom(mask: number): number {
    if (popcount(mask) >= FLIP_7_UNIQUE_COUNT) {
      return 1;
    }
    const cached = memo.get(mask);
    if (cached !== undefined) {
      return cached;
    }

    let hazard = 0;
    const branches: { weight: number; nextMask: number }[] = [];
    for (const value of NUMBER_VALUES) {
      const bit = 1 << value;
      const count = baseCount.get(value) ?? 0;
      if ((mask & bit) !== 0) {
        // Already held: the original hand's copies are all hazards as-is;
        // a value collected earlier in *this* hypothetical run already
        // spent one of its copies to be collected, leaving one fewer.
        hazard += (heldMask & bit) !== 0 ? count : Math.max(0, count - 1);
      } else if (count > 0) {
        branches.push({ weight: count, nextMask: mask | bit });
      }
    }

    const total = hazard + branches.reduce((sum, branch) => sum + branch.weight, 0);
    const probability =
      total === 0
        ? 0
        : branches.reduce(
            (sum, branch) => sum + (branch.weight / total) * probabilityFrom(branch.nextMask),
            0,
          );

    memo.set(mask, probability);
    return probability;
  }

  return probabilityFrom(heldMask);
}

export interface HitStayExpectedValue {
  /** Round score if the player stays right now — deterministic. */
  readonly stay: number;
  /** Expected round score from hitting exactly once more, then imagining play stops there. */
  readonly hit: number;
}

/**
 * A hypothetical `CardDealt`, never persisted — only its `t`/`playerId`/
 * `card` are read by `reduce`, so the envelope fields are dummy values.
 */
function hypotheticalDeal(playerId: PlayerId, card: Card): GameEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "1970-01-01T00:00:00.000Z",
    seq: 0,
    t: "CardDealt",
    playerId,
    card,
  };
}

/**
 * Expected round score from hitting once more versus staying now, given
 * `remaining` (#38). `stay` is just the current score; `hit` weights every
 * possible next card by how much of `remaining` it represents, and for
 * each replays a single hypothetical `CardDealt` through the real reducer
 * — reusing `reduce`/`scoreRound` rather than re-deriving bust and Flip 7
 * (with its +15 bonus) rules here a second time.
 *
 * `hit` is a single-ply lookahead: it scores the hand immediately after
 * one more card, not the value of continuing to play optimally from
 * there. A full multi-turn "what's my best strategy" solver is out of
 * scope here — this answers "is my very next hit worth it", the same
 * one-card horizon #83's bustProbability uses.
 */
export function expectedValueOfNextMove(
  state: GameState,
  remaining: RemainingDeckReport,
  playerId: PlayerId,
): HitStayExpectedValue {
  const playerRound = state.currentRound?.players[playerId];
  const stay = playerRound ? scoreRound(playerRound).total : 0;

  if (!playerRound || !legalActions(state, playerId).moves.includes("hit")) {
    return { stay, hit: stay };
  }

  const total = remaining.counts.reduce((sum, count) => sum + count.remaining, 0);
  if (total === 0) {
    return { stay, hit: stay };
  }

  let hit = 0;
  for (const count of remaining.counts) {
    if (count.remaining === 0) {
      continue;
    }
    const weight = count.remaining / total;
    const card = cardOfFace(count.face, 1);
    const nextState = reduce(state, hypotheticalDeal(playerId, card));
    const nextPlayerRound = nextState.currentRound?.players[playerId];
    hit += weight * (nextPlayerRound ? scoreRound(nextPlayerRound).total : 0);
  }

  return { stay, hit };
}
