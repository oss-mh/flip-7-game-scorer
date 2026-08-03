export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Thrown by `migrateEvent` when a stored event's schema version can't be
 * brought to the current one — either nothing this build knows about the
 * chain covers it, or the event is from a newer build than this one. Kept
 * distinct from `DomainError`: this is a versioning problem, not an
 * invalid move at the table.
 */
export class SchemaMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaMigrationError";
  }
}
