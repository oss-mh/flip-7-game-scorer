import type { Clock } from "@flip-7/engine";

/**
 * The one place in apps/web allowed to read the wall clock for event
 * envelopes — packages/engine takes a `Clock` port instead of calling
 * `Date` directly so replaying a log stays deterministic. See AGENTS.md
 * invariant #2, "No non-determinism in the domain".
 */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};
