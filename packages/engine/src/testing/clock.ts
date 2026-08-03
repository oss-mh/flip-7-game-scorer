import type { Clock } from "../ports/clock.js";

/**
 * A `Clock` double for tests: starts at a fixed instant and advances by
 * `stepMs` on every call, so a sequence of events gets distinct but fully
 * predictable timestamps instead of colliding on one instant or depending
 * on when the test happened to run.
 */
export class FixedClock implements Clock {
  #currentMs: number;
  readonly #stepMs: number;

  constructor(start = "2026-01-01T00:00:00.000Z", stepMs = 0) {
    this.#currentMs = Date.parse(start);
    this.#stepMs = stepMs;
  }

  now(): string {
    const instant = new Date(this.#currentMs).toISOString();
    this.#currentMs += this.#stepMs;
    return instant;
  }
}
