import { migrateEvent } from "@flip-7/engine";

import { GameNotFoundError, MalformedExportError } from "./errors.js";

import type {
  GameEvent,
  GameId,
  GameMeta,
  GameRepository,
  IdGenerator,
  RawEvent,
} from "@flip-7/engine";

/**
 * The export file format's own version, distinct from `EVENT_SCHEMA_VERSION`
 * (which versions individual events). Bump this if the shape of the export
 * envelope itself changes — e.g. a new top-level field — independently of
 * whether any event schema changed.
 */
export const EXPORT_SCHEMA_VERSION = 1;

/**
 * What `exportGame` produces and `importGame` consumes: a self-describing
 * snapshot of one game's full event log, cheap to back up and a useful bug
 * report format — an exported log reproduces a bug exactly. See README,
 * "Fastest way to reproduce a reported bug".
 *
 * `events` is typed as `RawEvent`, not the current `GameEvent` union: a
 * file exported by an older build legitimately holds events at an older
 * schema version, which is exactly what `importGame` migrates forward.
 */
export interface ExportedGame {
  readonly exportSchemaVersion: number;
  readonly meta: GameMeta;
  readonly events: readonly RawEvent[];
}

/** Downloads the full event log for one game, with its schema version and metadata. */
export async function exportGame(repo: GameRepository, gameId: GameId): Promise<ExportedGame> {
  const games = await repo.listGames();
  const meta = games.find((game) => game.id === gameId);
  if (!meta) {
    throw new GameNotFoundError(gameId);
  }

  const events = await repo.loadEvents(gameId);
  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    meta,
    events: events as unknown as readonly RawEvent[],
  };
}

function isRawEvent(value: unknown): value is RawEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RawEvent).schemaVersion === "number"
  );
}

interface UnvalidatedExport {
  readonly exportSchemaVersion?: unknown;
  readonly meta?: unknown;
  readonly events?: unknown;
}

/**
 * Rejects anything that isn't at least a plausible export file, with a
 * message a person can act on — see AGENTS.md issue #28 acceptance
 * criteria, "Malformed files rejected with a readable message". Deeper
 * per-event validation is `migrateEvent`/`fold`'s job, not this function's:
 * this only checks the envelope is well-formed enough to attempt that.
 */
function parseExportedGame(raw: unknown): ExportedGame {
  if (typeof raw !== "object" || raw === null) {
    throw new MalformedExportError("Not a valid export file: expected a JSON object");
  }

  const { exportSchemaVersion, meta, events } = raw as UnvalidatedExport;

  if (typeof exportSchemaVersion !== "number") {
    throw new MalformedExportError("Not a valid export file: missing exportSchemaVersion");
  }
  if (exportSchemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new MalformedExportError(
      `This file was exported by a newer version of the app (export format ${exportSchemaVersion}) ` +
        `than this build supports (${EXPORT_SCHEMA_VERSION}). Update the app to import it.`,
    );
  }
  if (typeof meta !== "object" || meta === null || typeof (meta as GameMeta).id !== "string") {
    throw new MalformedExportError("Not a valid export file: missing game metadata");
  }
  if (!Array.isArray(events)) {
    throw new MalformedExportError("Not a valid export file: missing event log");
  }
  if (!events.every(isRawEvent)) {
    throw new MalformedExportError("Not a valid export file: one or more events are malformed");
  }

  return { exportSchemaVersion, meta: meta as GameMeta, events };
}

/**
 * Imports a previously exported game as a brand-new game — never
 * overwriting an existing one, even if the file's original id happens to
 * still exist locally. Every event is migrated to the current schema
 * version before being appended, so a file exported by an older build
 * still loads correctly.
 */
export async function importGame(
  repo: GameRepository,
  idGenerator: IdGenerator,
  raw: unknown,
): Promise<GameId> {
  const exported = parseExportedGame(raw);
  const migratedEvents = exported.events.map((event) =>
    migrateEvent(event),
  ) as unknown as GameEvent[];

  const newGameId = idGenerator.next();
  await repo.createGame({ ...exported.meta, id: newGameId });
  await repo.appendEvents(newGameId, migratedEvents, 0);

  return newGameId;
}
