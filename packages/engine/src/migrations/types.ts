/**
 * A stored event as loaded from a `GameRepository`, before migration. Only
 * `schemaVersion` is guaranteed — everything else is whatever shape that
 * version's event union had, which may not match the current `GameEvent`
 * union at all. See `migrateEvent`.
 */
export interface RawEvent {
  readonly schemaVersion: number;
  readonly [key: string]: unknown;
}

/** One step in the migration chain: transforms an event one version forward. */
export interface EventMigration {
  /** The schema version this migration accepts as input. */
  readonly fromVersion: number;
  migrate(event: RawEvent): RawEvent;
}
