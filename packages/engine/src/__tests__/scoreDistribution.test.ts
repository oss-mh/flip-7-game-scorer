import { describe, expect, it } from "vitest";

import { playerRoundScores } from "../scoreDistribution.js";

import flip7BustAndX2 from "./fixtures/flip7-bust-and-x2.json" with { type: "json" };
import threePlayerMultiRound from "./fixtures/three-player-multi-round.json" with { type: "json" };
import twoPlayerSimple from "./fixtures/two-player-simple.json" with { type: "json" };

import type { GameEvent } from "../events.js";

/**
 * The raw list `lifetimePlayerStats` averages away — feeds a score
 * distribution chart, which needs every value, not just the mean.
 */
describe("playerRoundScores", () => {
  it("returns nothing for a name that never played", () => {
    expect(playerRoundScores("Nobody", [twoPlayerSimple as GameEvent[]])).toEqual([]);
  });

  it("returns one score per round played, in game-then-round order", () => {
    const games = [twoPlayerSimple, flip7BustAndX2, threePlayerMultiRound] as GameEvent[][];
    expect(playerRoundScores("Alice", games)).toEqual([8, 57, 10, 3]);
  });

  it("includes a bust round as 0, not omitting it", () => {
    const games = [twoPlayerSimple, flip7BustAndX2] as GameEvent[][];
    expect(playerRoundScores("Bob", games)).toEqual([10, 0]);
  });

  it("skips a game with no recorded events", () => {
    const games = [[], twoPlayerSimple] as GameEvent[][];
    expect(playerRoundScores("Alice", games)).toEqual([8]);
  });
});
