import { describe, expect, it } from "vitest";

import { fold } from "../reduce.js";

import flip7BustAndX2 from "./fixtures/flip7-bust-and-x2.json" with { type: "json" };
import threePlayerMultiRound from "./fixtures/three-player-multi-round.json" with { type: "json" };
import twoPlayerSimple from "./fixtures/two-player-simple.json" with { type: "json" };

import type { GameEvent } from "../events.js";

/**
 * Fixtures are recorded exactly the way a real bug report would arrive —
 * see README, "Fastest way to reproduce a reported bug": drop the exported
 * event log into fixtures/ and fold it.
 */
describe("golden replay — two-player-simple", () => {
  it("folds to the expected final state and scoreboard", () => {
    const state = fold(twoPlayerSimple as GameEvent[]);

    expect(state.cumulativeScores).toEqual({ alice: 8, bob: 10 });
    expect(state).toMatchSnapshot();
  });
});

describe("golden replay — three-player-multi-round", () => {
  it("folds to the expected final state and scoreboard, with the dealer rotated once", () => {
    const state = fold(threePlayerMultiRound as GameEvent[]);

    expect(state.roundNumber).toBe(2);
    expect(state.currentRound?.dealerId).toBe("bob");
    expect(state.cumulativeScores).toEqual({ alice: 13, bob: 2, cara: 19 });
    expect(state).toMatchSnapshot();
  });
});

describe("golden replay — flip7-bust-and-x2", () => {
  it("folds a round containing a bust, a x2 multiplier and a Flip 7", () => {
    const state = fold(flip7BustAndX2 as GameEvent[]);

    const alice = state.currentRound?.players["alice"];
    const bob = state.currentRound?.players["bob"];
    expect(alice?.status).toBe("flipped7");
    expect(bob?.status).toBe("busted");

    // alice: sum(0..6) = 21, doubled by x2 = 42, + 15 Flip 7 bonus = 57.
    // bob: busted, scores 0 regardless of cards held.
    expect(state.cumulativeScores).toEqual({ alice: 57, bob: 0 });
    expect(state).toMatchSnapshot();
  });
});
