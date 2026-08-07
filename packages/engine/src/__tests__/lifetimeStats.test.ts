import { describe, expect, it } from "vitest";

import { lifetimePlayerStats } from "../lifetimeStats.js";

import flip7BustAndX2 from "./fixtures/flip7-bust-and-x2.json" with { type: "json" };
import threePlayerMultiRound from "./fixtures/three-player-multi-round.json" with { type: "json" };
import twoPlayerSimple from "./fixtures/two-player-simple.json" with { type: "json" };

import type { GameEvent } from "../events.js";

function findStats(name: string, games: readonly (readonly GameEvent[])[]) {
  return lifetimePlayerStats(games).find((entry) => entry.name === name);
}

/**
 * There's no cross-game player identity in this domain (`PlayerId` is
 * scoped to a single game) — see docs/adr/0003. These fixtures deliberately
 * reuse the same names ("Alice", "Bob") across separate golden-replay games
 * to exercise that aggregation, the same way the app will feed it every
 * stored game's event log.
 */
describe("lifetimePlayerStats", () => {
  it("returns nothing for no games", () => {
    expect(lifetimePlayerStats([])).toEqual([]);
  });

  it("skips a game with no recorded events rather than folding an empty log", () => {
    const games = [[], twoPlayerSimple] as GameEvent[][];
    expect(findStats("Alice", games)?.gamesPlayed).toBe(1);
  });

  it("counts a game toward every player listed in it, even with no rounds", () => {
    const gameCreatedOnly = (twoPlayerSimple as GameEvent[]).slice(0, 1);
    const stats = lifetimePlayerStats([gameCreatedOnly]);

    expect(stats).toHaveLength(2);
    expect(findStats("Alice", [gameCreatedOnly])).toMatchObject({
      gamesPlayed: 1,
      roundsPlayed: 0,
      bustRate: 0,
      averageRoundScore: 0,
      averageHitsBeforeStaying: null,
    });
  });

  it("sums games played and rounds played across separate games for the same name", () => {
    const games = [twoPlayerSimple, flip7BustAndX2] as GameEvent[][];

    const alice = findStats("Alice", games);
    expect(alice?.gamesPlayed).toBe(2);
    // two-player-simple: 1 round; flip7-bust-and-x2: 1 round.
    expect(alice?.roundsPlayed).toBe(2);
  });

  it("computes bust rate as busted rounds over all rounds played", () => {
    // Bob busts in flip7-bust-and-x2 (round 1) and in three-player-multi-round
    // (round 2 of 2), so 2 busts over 3 rounds total.
    const games = [flip7BustAndX2, threePlayerMultiRound] as GameEvent[][];

    const bob = findStats("Bob", games);
    expect(bob?.roundsPlayed).toBe(3);
    expect(bob?.bustCount).toBe(2);
    expect(bob?.bustRate).toBeCloseTo(2 / 3);
  });

  it("averages round score over every round played, counting a bust as 0", () => {
    // Bob: two-player-simple round scores 10 (stayed); flip7-bust-and-x2
    // scores 0 (busted). Average = (10 + 0) / 2 = 5.
    const games = [twoPlayerSimple, flip7BustAndX2] as GameEvent[][];

    const bob = findStats("Bob", games);
    expect(bob?.averageRoundScore).toBe(5);
  });

  it("counts Flip 7s from each round's status, not a separate detector", () => {
    const games = [flip7BustAndX2] as GameEvent[][];

    expect(findStats("Alice", games)?.flip7Count).toBe(1);
    expect(findStats("Bob", games)?.flip7Count).toBe(0);
  });

  it("averages hits before staying only over rounds that ended in a voluntary stay", () => {
    // Alice's flip7-bust-and-x2 round doesn't count (she flipped 7, never
    // stayed): only two-player-simple's round does, with 2 cards held.
    const games = [twoPlayerSimple, flip7BustAndX2] as GameEvent[][];

    expect(findStats("Alice", games)?.averageHitsBeforeStaying).toBe(2);
  });

  it("reports null average hits before staying for a player who never voluntarily stayed", () => {
    // Bob only busts in flip7-bust-and-x2 — never once stays.
    const games = [flip7BustAndX2] as GameEvent[][];

    expect(findStats("Bob", games)?.averageHitsBeforeStaying).toBeNull();
  });

  it("counts a win only in the game a player's cumulative score actually topped", () => {
    const lowTargetGame: GameEvent[] = [
      {
        schemaVersion: 1,
        at: "2026-08-07T09:00:00.000Z",
        seq: 1,
        t: "GameCreated",
        players: [
          { id: "alice", name: "Alice" },
          { id: "bob", name: "Bob" },
        ],
        targetScore: 5,
      },
      { schemaVersion: 1, at: "2026-08-07T09:00:01.000Z", seq: 2, t: "RoundStarted", dealerId: "alice" },
      {
        schemaVersion: 1,
        at: "2026-08-07T09:00:02.000Z",
        seq: 3,
        t: "CardDealt",
        playerId: "alice",
        card: { id: "num-5-1", kind: "number", value: 5 },
      },
      {
        schemaVersion: 1,
        at: "2026-08-07T09:00:03.000Z",
        seq: 4,
        t: "CardDealt",
        playerId: "bob",
        card: { id: "num-1-1", kind: "number", value: 1 },
      },
      { schemaVersion: 1, at: "2026-08-07T09:00:04.000Z", seq: 5, t: "PlayerStayed", playerId: "alice" },
      { schemaVersion: 1, at: "2026-08-07T09:00:05.000Z", seq: 6, t: "PlayerStayed", playerId: "bob" },
      { schemaVersion: 1, at: "2026-08-07T09:00:06.000Z", seq: 7, t: "RoundClosed" },
    ];

    const stats = lifetimePlayerStats([lowTargetGame, twoPlayerSimple as GameEvent[]]);
    expect(stats.find((s) => s.name === "Alice")?.wins).toBe(1);
    expect(stats.find((s) => s.name === "Bob")?.wins).toBe(0);
  });

  it("merges two players sharing the same name into one entry, by design (see ADR-0003)", () => {
    const gameA: GameEvent[] = [
      {
        schemaVersion: 1,
        at: "2026-08-07T09:00:00.000Z",
        seq: 1,
        t: "GameCreated",
        players: [
          { id: "p1", name: "Alex" },
          { id: "p1-opponent", name: "Sam" },
        ],
      },
    ];
    const gameB: GameEvent[] = [
      {
        schemaVersion: 1,
        at: "2026-08-07T09:00:00.000Z",
        seq: 1,
        t: "GameCreated",
        players: [
          { id: "p2", name: "Alex" },
          { id: "p2-opponent", name: "Robin" },
        ],
      },
    ];

    const stats = lifetimePlayerStats([gameA, gameB]);
    expect(stats.map((s) => s.name)).toEqual(["Alex", "Robin", "Sam"]);
    expect(stats.find((s) => s.name === "Alex")).toMatchObject({ gamesPlayed: 2 });
  });

  it("sorts entries alphabetically by name", () => {
    const stats = lifetimePlayerStats([threePlayerMultiRound as GameEvent[]]);
    expect(stats.map((s) => s.name)).toEqual(["Alice", "Bob", "Cara"]);
  });
});
