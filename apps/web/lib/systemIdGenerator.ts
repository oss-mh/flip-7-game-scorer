import type { IdGenerator } from "@flip-7/engine";

/** The real UUID source — the one non-deterministic ID scheme app code is allowed to touch. */
export const systemIdGenerator: IdGenerator = {
  next: () => crypto.randomUUID(),
};
