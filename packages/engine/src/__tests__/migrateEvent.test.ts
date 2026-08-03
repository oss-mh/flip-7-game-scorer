import { describe, expect, it } from "vitest";

import { SchemaMigrationError } from "../errors.js";
import { migrateEvent } from "../migrations/migrateEvent.js";

import migrationV1ToV2 from "./fixtures/migration-v1-to-v2.json" with { type: "json" };

import type { EventMigration, RawEvent } from "../migrations/types.js";

/**
 * `EVENT_SCHEMA_VERSION` is still 1 — there's no real v2 schema yet. This
 * fictional "rename playerId to holderId" migration exists purely to
 * exercise the chain mechanism against a fixture, per the acceptance
 * criteria on issue #26: "Test fixtures for a v1 → v2 migration, even if
 * v2 is synthetic for now." It is never registered in the real
 * `EVENT_MIGRATIONS` array.
 */
const renamePlayerIdToHolderId: EventMigration = {
  fromVersion: 1,
  migrate(event) {
    const { playerId, ...rest } = event;
    return { ...rest, schemaVersion: 2, holderId: playerId };
  },
};

function v1Event(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    schemaVersion: 1,
    at: "2026-01-01T00:00:00.000Z",
    seq: 0,
    t: "GameCreated",
    ...overrides,
  };
}

describe("migrateEvent", () => {
  it("returns an event already at the target version unchanged", () => {
    const event = v1Event();

    expect(migrateEvent(event, [], 1)).toEqual(event);
  });

  it("migrates a fixture from v1 to a synthetic v2 using a single-step chain", () => {
    const result = migrateEvent(migrationV1ToV2.before as RawEvent, [renamePlayerIdToHolderId], 2);

    expect(result).toEqual(migrationV1ToV2.after);
  });

  it("chains multiple migrations in order to reach the target version", () => {
    const v2ToV3: EventMigration = {
      fromVersion: 2,
      migrate: (event) => ({ ...event, schemaVersion: 3, migratedTwice: true }),
    };

    const result = migrateEvent(
      v1Event({ playerId: "alice" }),
      [renamePlayerIdToHolderId, v2ToV3],
      3,
    );

    expect(result).toEqual({
      schemaVersion: 3,
      at: "2026-01-01T00:00:00.000Z",
      seq: 0,
      t: "GameCreated",
      holderId: "alice",
      migratedTwice: true,
    });
  });

  it("fails loudly when no migration covers the stored version", () => {
    expect(() => migrateEvent(v1Event(), [], 2)).toThrow(SchemaMigrationError);
  });

  it("fails loudly when the stored event is newer than this build supports", () => {
    const fromTheFuture = v1Event({ schemaVersion: 5 });

    expect(() => migrateEvent(fromTheFuture, [], 1)).toThrow(SchemaMigrationError);
  });

  it("fails loudly if a migration is buggy and doesn't advance the version", () => {
    const noOpMigration: EventMigration = {
      fromVersion: 1,
      migrate: (event) => event,
    };

    expect(() => migrateEvent(v1Event(), [noOpMigration], 2)).toThrow(SchemaMigrationError);
  });
});
