/**
 * Deterministic ID generation for anything the engine needs to identify —
 * new games, new players — without reaching for `crypto.randomUUID()`. See
 * AGENTS.md invariant #2, "No non-determinism in the domain".
 */
export interface IdGenerator {
  next(): string;
}
