import type { IdGenerator } from "../ports/idGenerator.js";

/** An `IdGenerator` double for tests: `${prefix}-1`, `${prefix}-2`, ... */
export class SequentialIdGenerator implements IdGenerator {
  #count = 0;
  readonly #prefix: string;

  constructor(prefix = "id") {
    this.#prefix = prefix;
  }

  next(): string {
    this.#count += 1;
    return `${this.#prefix}-${this.#count}`;
  }
}
