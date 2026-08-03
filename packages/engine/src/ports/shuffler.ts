/**
 * Deck randomisation, supplied by the caller rather than the engine calling
 * `Math.random()` itself. `createDeck` returns cards in a fixed,
 * deterministic order for exactly this reason — see AGENTS.md invariant #2,
 * "No non-determinism in the domain".
 */
export interface Shuffler {
  shuffle<T>(cards: readonly T[]): readonly T[];
}
