import { describe, expect, it } from "vitest";

import { roundHistory } from "../roundHistory.js";

import flip7BustAndX2 from "./fixtures/flip7-bust-and-x2.json" with { type: "json" };
import threePlayerMultiRound from "./fixtures/three-player-multi-round.json" with { type: "json" };

import type { GameEvent } from "../events.js";

/**
 * `GameState.currentRound` only ever holds the most recently started round
 * (RoundStarted replaces it wholesale — see `roundStarted.ts`), so a table
 * of every round played has to be rebuilt by replaying the log and
 * snapshotting state at each `RoundClosed`, not read off final state.
 */
describe("roundHistory", () => {
  it("returns nothing before any round has closed", () => {
    const events = (threePlayerMultiRound as GameEvent[]).slice(0, 3);
    expect(roundHistory(events)).toEqual([]);
  });

  it("captures one entry per closed round, oldest first", () => {
    const entries = roundHistory(threePlayerMultiRound as GameEvent[]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.round.roundNumber).toBe(1);
    expect(entries[1]?.round.roundNumber).toBe(2);
  });

  it("does not include a round still in progress", () => {
    // Cut the log off mid-way through round 2, before its RoundClosed.
    const closeIndex = (threePlayerMultiRound as GameEvent[]).findIndex(
      (event, index) => event.t === "RoundClosed" && index > 10,
    );
    const events = (threePlayerMultiRound as GameEvent[]).slice(0, closeIndex);

    const entries = roundHistory(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.round.roundNumber).toBe(1);
  });

  it("preserves each round's own dealer and per-player cards, not the final round's", () => {
    const entries = roundHistory(threePlayerMultiRound as GameEvent[]);

    expect(entries[0]?.round.dealerId).toBe("alice");
    expect(entries[0]?.round.players["alice"]?.numberCards.map((c) => c.value)).toEqual([4, 6]);

    expect(entries[1]?.round.dealerId).toBe("bob");
    expect(entries[1]?.round.players["alice"]?.numberCards.map((c) => c.value)).toEqual([3]);
  });

  it("reports the running cumulative total as of each round, not just the final one", () => {
    const entries = roundHistory(threePlayerMultiRound as GameEvent[]);

    // Round 1: alice sum(4,6)=10, bob sum(2)=2, cara sum(9,1)=10.
    expect(entries[0]?.runningTotals).toEqual({ alice: 10, bob: 2, cara: 10 });
    // Round 2: bob busts on a duplicate 5 (scores 0), alice +3, cara +9.
    expect(entries[1]?.runningTotals).toEqual({ alice: 13, bob: 2, cara: 19 });
  });

  it("flags Flip 7s and busts via each player's round status, no separate detection needed", () => {
    const entries = roundHistory(flip7BustAndX2 as GameEvent[]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.round.players["alice"]?.status).toBe("flipped7");
    expect(entries[0]?.round.players["bob"]?.status).toBe("busted");
  });
});
