import type { EventMigration } from "./types.js";

/**
 * One entry per schema version bump, keyed by the version it migrates
 * *from*. Adding version N+1 support is a single-file change: write the
 * migration as its own module, then add it to this array — `migrateEvent`
 * itself needs no changes.
 *
 * Empty today: `EVENT_SCHEMA_VERSION` (see events.ts) is still 1, so there
 * is nothing yet to migrate from. The first real entry lands here the day
 * that constant bumps to 2.
 */
export const EVENT_MIGRATIONS: readonly EventMigration[] = [];
