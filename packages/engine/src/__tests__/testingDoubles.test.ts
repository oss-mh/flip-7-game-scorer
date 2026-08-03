import { describe, expect, it } from "vitest";

import { FixedClock, SeededShuffler, SequentialIdGenerator } from "../testing/index.js";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/idGenerator.js";
import type { Shuffler } from "../ports/shuffler.js";

describe("FixedClock", () => {
  it("returns the same instant on every call when stepMs is 0", () => {
    const clock: Clock = new FixedClock("2026-08-03T00:00:00.000Z");

    expect(clock.now()).toBe("2026-08-03T00:00:00.000Z");
    expect(clock.now()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("advances by stepMs on every call", () => {
    const clock: Clock = new FixedClock("2026-08-03T00:00:00.000Z", 1000);

    expect(clock.now()).toBe("2026-08-03T00:00:00.000Z");
    expect(clock.now()).toBe("2026-08-03T00:00:01.000Z");
    expect(clock.now()).toBe("2026-08-03T00:00:02.000Z");
  });

  it("defaults to a fixed instant when no start is given", () => {
    const clock: Clock = new FixedClock();

    expect(clock.now()).toBe(clock.now());
  });
});

describe("SequentialIdGenerator", () => {
  it("produces sequential ids with the default prefix", () => {
    const ids: IdGenerator = new SequentialIdGenerator();

    expect(ids.next()).toBe("id-1");
    expect(ids.next()).toBe("id-2");
    expect(ids.next()).toBe("id-3");
  });

  it("uses a custom prefix", () => {
    const ids: IdGenerator = new SequentialIdGenerator("player");

    expect(ids.next()).toBe("player-1");
    expect(ids.next()).toBe("player-2");
  });
});

describe("SeededShuffler", () => {
  it("is deterministic: the same seed always produces the same order", () => {
    const cards = [1, 2, 3, 4, 5, 6, 7, 8];
    const a: Shuffler = new SeededShuffler(42);
    const b: Shuffler = new SeededShuffler(42);

    expect(a.shuffle(cards)).toEqual(b.shuffle(cards));
  });

  it("produces a different order for a different seed", () => {
    const cards = [1, 2, 3, 4, 5, 6, 7, 8];
    const a: Shuffler = new SeededShuffler(1);
    const b: Shuffler = new SeededShuffler(2);

    expect(a.shuffle(cards)).not.toEqual(b.shuffle(cards));
  });

  it("preserves every element without adding, dropping or duplicating any", () => {
    const cards = ["a", "b", "c", "d", "e"];
    const shuffler: Shuffler = new SeededShuffler(7);

    expect([...shuffler.shuffle(cards)].sort()).toEqual([...cards].sort());
  });

  it("does not mutate the input array", () => {
    const cards = [1, 2, 3, 4, 5];
    const original = [...cards];
    const shuffler: Shuffler = new SeededShuffler(7);

    shuffler.shuffle(cards);

    expect(cards).toEqual(original);
  });

  it("handles empty and single-element inputs", () => {
    const shuffler: Shuffler = new SeededShuffler(7);

    expect(shuffler.shuffle([])).toEqual([]);
    expect(shuffler.shuffle([1])).toEqual([1]);
  });
});
