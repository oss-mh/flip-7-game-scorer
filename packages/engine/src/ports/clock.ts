/**
 * Deterministic timestamps for event envelopes. The engine takes one of
 * these rather than reading the system clock itself — see AGENTS.md
 * invariant #2, "No non-determinism in the domain": replaying the same log
 * must always produce byte-identical state.
 */
export interface Clock {
  /** An ISO-8601 timestamp, suitable for `EventEnvelope.at`. */
  now(): string;
}
