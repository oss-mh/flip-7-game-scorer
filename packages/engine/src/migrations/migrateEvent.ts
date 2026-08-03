import { SchemaMigrationError } from "../errors.js";
import { EVENT_SCHEMA_VERSION } from "../events.js";

import { EVENT_MIGRATIONS } from "./registry.js";

import type { EventMigration, RawEvent } from "./types.js";

/**
 * Applies the ordered chain of migrations needed to bring a stored event
 * from whatever version it was written at up to the current schema
 * version. Retrofitting this after real users have saved games is
 * genuinely painful, so the chain exists from the first version even
 * though the registry starts out empty.
 *
 * `migrations` and `targetVersion` default to the real, current registry
 * and `EVENT_SCHEMA_VERSION` — tests pass their own to exercise the chain
 * mechanism against a synthetic version bump without touching either.
 */
export function migrateEvent(
  event: RawEvent,
  migrations: readonly EventMigration[] = EVENT_MIGRATIONS,
  targetVersion: number = EVENT_SCHEMA_VERSION,
): RawEvent {
  let current = event;

  while (current.schemaVersion < targetVersion) {
    const migration = migrations.find(
      (candidate) => candidate.fromVersion === current.schemaVersion,
    );
    if (!migration) {
      throw new SchemaMigrationError(
        `No migration registered from schema version ${current.schemaVersion} to ${targetVersion}. ` +
          "This event was written by a version of the app this build doesn't know how to read " +
          "— update the app to continue.",
      );
    }

    const next = migration.migrate(current);
    if (next.schemaVersion <= current.schemaVersion) {
      throw new SchemaMigrationError(
        `Migration from schema version ${current.schemaVersion} did not advance the version ` +
          `(still ${next.schemaVersion}) — this is a bug in the migration itself.`,
      );
    }
    current = next;
  }

  if (current.schemaVersion > targetVersion) {
    throw new SchemaMigrationError(
      `Event has schema version ${current.schemaVersion}, newer than this build supports ` +
        `(${targetVersion}). Update the app to continue.`,
    );
  }

  return current;
}
