export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Game "${gameId}" does not exist`);
    this.name = "GameNotFoundError";
  }
}

export class GameAlreadyExistsError extends Error {
  constructor(gameId: string) {
    super(`Game "${gameId}" already exists`);
    this.name = "GameAlreadyExistsError";
  }
}

export class StorageFullError extends Error {
  constructor() {
    super("Storage quota exceeded — free up space or export and delete old games");
    this.name = "StorageFullError";
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = "localStorage is not available in this environment") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export class MalformedExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedExportError";
  }
}
