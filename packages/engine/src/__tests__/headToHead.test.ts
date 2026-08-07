import { describe, expect, it } from "vitest";

import { headToHead } from "../headToHead.js";

import flip7BustAndX2 from "./fixtures/flip7-bust-and-x2.json" with { type: "json" };
import threePlayerMultiRound from "./fixtures/three-player-multi-round.json" with { type: "json" };
import twoPlayerSimple from "./fixtures/two-player-simple.json" with { type: "json" };

import type { GameEvent } from "../events.js";

describe("headToHead", () => {
  it("reports nothing played together when the two names never share a game", () => {
    const stats = headToHead("Alice", "Nobody", [twoPlayerSimple as GameEvent[]]);
    expect(stats).toEqual({
      playerA: "Alice",
      playerB: "Nobody",
      gamesTogether: 0,
      gameWinsA: 0,
      gameWinsB: 0,
      gameTies: 0,
      roundsCompared: 0,
      roundWinsA: 0,
      roundWinsB: 0,
      roundTies: 0,
      averageRoundScoreA: 0,
      averageRoundScoreB: 0,
    });
  });

  it("compares cumulative score and round-by-round score within one shared game", () => {
    // two-player-simple: Alice 8, Bob 10 — Bob ahead both cumulatively and
    // in their only shared round.
    const stats = headToHead("Alice", "Bob", [twoPlayerSimple as GameEvent[]]);

    expect(stats.gamesTogether).toBe(1);
    expect(stats.gameWinsB).toBe(1);
    expect(stats.gameWinsA).toBe(0);
    expect(stats.roundsCompared).toBe(1);
    expect(stats.roundWinsB).toBe(1);
    expect(stats.averageRoundScoreA).toBe(8);
    expect(stats.averageRoundScoreB).toBe(10);
  });

  it("counts a round tie without crediting either player a round win", () => {
    // three-player-multi-round round 1: Alice 10, Cara 10 — a tie; round 2:
    // Alice 3, Cara 9 — Cara ahead. Cumulative: Alice 13, Cara 19.
    const stats = headToHead("Alice", "Cara", [threePlayerMultiRound as GameEvent[]]);

    expect(stats.roundsCompared).toBe(2);
    expect(stats.roundTies).toBe(1);
    expect(stats.roundWinsA).toBe(0);
    expect(stats.roundWinsB).toBe(1);
    expect(stats.gameWinsB).toBe(1);
    expect(stats.gameTies).toBe(0);
  });

  it("accumulates across every game the two have shared", () => {
    const games = [twoPlayerSimple, flip7BustAndX2, threePlayerMultiRound] as GameEvent[][];
    const stats = headToHead("Alice", "Bob", games);

    expect(stats.gamesTogether).toBe(3);
    // Game 1: Bob ahead. Game 2 (flip7-bust-and-x2): Alice ahead (57 vs 0).
    // Game 3: Alice ahead (13 vs 2).
    expect(stats.gameWinsA).toBe(2);
    expect(stats.gameWinsB).toBe(1);
    expect(stats.roundsCompared).toBe(4);
    // Alice's round scores: 8, 57, 10, 3. Bob's: 10, 0, 2, 0.
    expect(stats.averageRoundScoreA).toBe((8 + 57 + 10 + 3) / 4);
    expect(stats.averageRoundScoreB).toBe((10 + 0 + 2 + 0) / 4);
  });

  it("ties a game when both players end it with equal cumulative scores", () => {
    const tiedGame: GameEvent[] = [
      {
        schemaVersion: 1,
        at: "2026-08-07T10:00:00.000Z",
        seq: 1,
        t: "GameCreated",
        players: [
          { id: "alice", name: "Alice" },
          { id: "bob", name: "Bob" },
        ],
      },
      { schemaVersion: 1, at: "2026-08-07T10:00:01.000Z", seq: 2, t: "RoundStarted", dealerId: "alice" },
      {
        schemaVersion: 1,
        at: "2026-08-07T10:00:02.000Z",
        seq: 3,
        t: "CardDealt",
        playerId: "alice",
        card: { id: "num-5-1", kind: "number", value: 5 },
      },
      {
        schemaVersion: 1,
        at: "2026-08-07T10:00:03.000Z",
        seq: 4,
        t: "CardDealt",
        playerId: "bob",
        card: { id: "num-5-2", kind: "number", value: 5 },
      },
      { schemaVersion: 1, at: "2026-08-07T10:00:04.000Z", seq: 5, t: "PlayerStayed", playerId: "alice" },
      { schemaVersion: 1, at: "2026-08-07T10:00:05.000Z", seq: 6, t: "PlayerStayed", playerId: "bob" },
      { schemaVersion: 1, at: "2026-08-07T10:00:06.000Z", seq: 7, t: "RoundClosed" },
    ];

    const stats = headToHead("Alice", "Bob", [tiedGame]);
    expect(stats.gameTies).toBe(1);
    expect(stats.roundTies).toBe(1);
  });

  it("skips a game with no recorded events", () => {
    const stats = headToHead("Alice", "Bob", [[], twoPlayerSimple as GameEvent[]]);
    expect(stats.gamesTogether).toBe(1);
  });
});
