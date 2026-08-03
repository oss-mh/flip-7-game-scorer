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
