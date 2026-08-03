import { DomainError } from "../errors.js";

import type { Shuffler } from "../ports/shuffler.js";

/**
 * mulberry32: a small, fast, deterministic PRNG. Good enough to drive a
 * seeded test fixture; not cryptographic and never meant to be.
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function requireAt<T>(cards: readonly T[], index: number): T {
  const card = cards[index];
  if (card === undefined) {
    throw new DomainError(`Shuffle index ${index} is out of bounds for ${cards.length} cards`);
  }
  return card;
}

/**
 * A `Shuffler` double for tests: a Fisher–Yates shuffle driven by a seeded
 * PRNG, so the same seed always reproduces the same order — replaying a
 * test fixture reproduces byte-identical state. See AGENTS.md invariant #2.
 */
export class SeededShuffler implements Shuffler {
  readonly #seed: number;

  constructor(seed: number) {
    this.#seed = seed;
  }

  shuffle<T>(cards: readonly T[]): readonly T[] {
    const random = mulberry32(this.#seed);
    const result = [...cards];

    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const a = requireAt(result, i);
      const b = requireAt(result, j);
      result[i] = b;
      result[j] = a;
    }

    return result;
  }
}
