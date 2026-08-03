import {
  EVENT_SCHEMA_VERSION,
  type GameCreatedEvent,
  type GameMeta,
  initialState,
} from "@flip-7/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GameAlreadyExistsError,
  GameNotFoundError,
  StorageFullError,
  StorageUnavailableError,
} from "../errors.js";
import { LocalStorageGameRepository } from "../localStorageGameRepository.js";
import { runRepositoryContractTests } from "../testing/repositoryContract.js";

class FakeStorage implements Storage {
  #store = new Map<string, string>();

  get length(): number {
    return this.#store.size;
  }

  clear(): void {
    this.#store.clear();
  }

  getItem(key: string): string | null {
    const value = this.#store.get(key);
    return value === undefined ? null : value;
  }

  key(index: number): string | null {
    return [...this.#store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

class FailingStorage extends FakeStorage {
  override setItem(): never {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  }
}

function buildMeta(id = "game-1"): GameMeta {
  return {
    id,
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    createdAt: "2026-08-03T00:00:00.000Z",
  };
}

function buildGameCreatedEvent(seq = 0): GameCreatedEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at: "2026-08-03T00:00:00.000Z",
    seq,
    t: "GameCreated",
    players: buildMeta().players,
  };
}

runRepositoryContractTests(() => {
  vi.stubGlobal("window", { localStorage: new FakeStorage() });
  return new LocalStorageGameRepository();
});

describe("LocalStorageGameRepository", () => {
  let repo: LocalStorageGameRepository;

  beforeEach(() => {
    repo = new LocalStorageGameRepository();
    vi.stubGlobal("window", { localStorage: new FakeStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not touch window merely by being constructed", () => {
    vi.unstubAllGlobals();
    expect(() => new LocalStorageGameRepository()).not.toThrow();
  });

  it("throws StorageUnavailableError instead of crashing when window is unavailable", async () => {
    vi.unstubAllGlobals();
    await expect(repo.listGames()).rejects.toThrow(StorageUnavailableError);
  });

  it("lists no games before any are created", async () => {
    await expect(repo.listGames()).resolves.toEqual([]);
  });

  it("creates a game under a namespaced key and lists it", async () => {
    const meta = buildMeta();
    await repo.createGame(meta);

    await expect(repo.listGames()).resolves.toEqual([meta]);
    expect(window.localStorage.getItem("flip7:v1:games")).toBe(JSON.stringify([meta]));
  });

  it("rejects creating a game with a duplicate id", async () => {
    await repo.createGame(buildMeta("game-1"));

    await expect(repo.createGame(buildMeta("game-1"))).rejects.toThrow(GameAlreadyExistsError);
  });

  it("rejects loading events, appending, truncating, snapshotting or deleting from an unknown game", async () => {
    await expect(repo.loadEvents("missing")).rejects.toThrow(GameNotFoundError);
    await expect(repo.appendEvents("missing", [], 0)).rejects.toThrow(GameNotFoundError);
    await expect(repo.truncateEvents("missing", 0)).rejects.toThrow(GameNotFoundError);
    await expect(repo.saveSnapshot("missing", 0, initialState)).rejects.toThrow(GameNotFoundError);
    await expect(repo.loadSnapshot("missing")).rejects.toThrow(GameNotFoundError);
  });

  it("appends a batch of events in a single write", async () => {
    await repo.createGame(buildMeta());
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    const events = [
      buildGameCreatedEvent(0),
      { ...buildGameCreatedEvent(1), t: "RoundStarted" as const, dealerId: "alice" },
    ];

    const result = await repo.appendEvents("game-1", events, 0);

    expect(result).toEqual({ outcome: "appended", version: 2 });
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    await expect(repo.loadEvents("game-1")).resolves.toEqual(events);
  });

  it("rejects an append whose expectedVersion is stale", async () => {
    await repo.createGame(buildMeta());
    await repo.appendEvents("game-1", [buildGameCreatedEvent(0)], 0);

    await expect(repo.appendEvents("game-1", [buildGameCreatedEvent(1)], 0)).resolves.toEqual({
      outcome: "conflict",
      currentVersion: 1,
    });
  });

  it("loads only events since a given version", async () => {
    await repo.createGame(buildMeta());
    const first = buildGameCreatedEvent(0);
    const second = { ...buildGameCreatedEvent(1), t: "RoundStarted" as const, dealerId: "alice" };
    await repo.appendEvents("game-1", [first], 0);
    await repo.appendEvents("game-1", [second], 1);

    await expect(repo.loadEvents("game-1", 1)).resolves.toEqual([second]);
  });

  it("truncates the stored event log in a single write", async () => {
    await repo.createGame(buildMeta());
    const first = buildGameCreatedEvent(0);
    const second = { ...buildGameCreatedEvent(1), t: "RoundStarted" as const, dealerId: "alice" };
    await repo.appendEvents("game-1", [first, second], 0);
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");

    await repo.truncateEvents("game-1", 1);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    await expect(repo.loadEvents("game-1")).resolves.toEqual([first]);
    expect(window.localStorage.getItem("flip7:v1:game:game-1:events")).toBe(
      JSON.stringify([first]),
    );
  });

  it("returns null from loadSnapshot when none has been saved", async () => {
    await repo.createGame(buildMeta());

    await expect(repo.loadSnapshot("game-1")).resolves.toBeNull();
  });

  it("saves and loads a snapshot", async () => {
    await repo.createGame(buildMeta());

    await repo.saveSnapshot("game-1", 3, initialState);

    await expect(repo.loadSnapshot("game-1")).resolves.toEqual({
      version: 3,
      schemaVersion: EVENT_SCHEMA_VERSION,
      state: initialState,
    });
  });

  it("deletes a game so it no longer appears or can be loaded", async () => {
    await repo.createGame(buildMeta());
    await repo.appendEvents("game-1", [buildGameCreatedEvent(0)], 0);
    await repo.saveSnapshot("game-1", 1, initialState);

    await repo.deleteGame("game-1");

    await expect(repo.listGames()).resolves.toEqual([]);
    await expect(repo.loadEvents("game-1")).rejects.toThrow(GameNotFoundError);
    expect(window.localStorage.getItem("flip7:v1:game:game-1:events")).toBeNull();
    expect(window.localStorage.getItem("flip7:v1:game:game-1:snapshot")).toBeNull();
  });

  it("treats deleting an unknown game as a no-op rather than an error", async () => {
    await expect(repo.deleteGame("never-existed")).resolves.toBeUndefined();
  });

  it("quarantines a corrupt games index instead of crashing", async () => {
    window.localStorage.setItem("flip7:v1:games", "{not valid json");

    await expect(repo.listGames()).resolves.toEqual([]);
    expect(window.localStorage.getItem("flip7:v1:games")).toBeNull();
    expect(window.localStorage.getItem("flip7:v1:games:corrupt")).toBe("{not valid json");
  });

  it("quarantines an unparseable event log instead of crashing", async () => {
    await repo.createGame(buildMeta());
    window.localStorage.setItem("flip7:v1:game:game-1:events", "{not valid json");

    await expect(repo.loadEvents("game-1")).resolves.toEqual([]);
    expect(window.localStorage.getItem("flip7:v1:game:game-1:events")).toBeNull();
  });

  it("quarantines a non-array value stored under an events key", async () => {
    await repo.createGame(buildMeta());
    window.localStorage.setItem("flip7:v1:game:game-1:events", JSON.stringify({ not: "an array" }));

    await expect(repo.loadEvents("game-1")).resolves.toEqual([]);
  });

  it("quarantines a corrupt snapshot instead of crashing", async () => {
    await repo.createGame(buildMeta());
    window.localStorage.setItem("flip7:v1:game:game-1:snapshot", "{not valid json");

    await expect(repo.loadSnapshot("game-1")).resolves.toBeNull();
    expect(window.localStorage.getItem("flip7:v1:game:game-1:snapshot")).toBeNull();
  });

  it("surfaces a quota-exceeded write as a typed StorageFullError", async () => {
    vi.stubGlobal("window", { localStorage: new FailingStorage() });

    await expect(repo.createGame(buildMeta())).rejects.toThrow(StorageFullError);
  });

  it("recognises Firefox's legacy quota-exceeded error name too", async () => {
    class FirefoxQuotaStorage extends FakeStorage {
      override setItem(): never {
        throw new DOMException("quota exceeded", "NS_ERROR_DOM_QUOTA_REACHED");
      }
    }
    vi.stubGlobal("window", { localStorage: new FirefoxQuotaStorage() });

    await expect(repo.createGame(buildMeta())).rejects.toThrow(StorageFullError);
  });

  it("re-throws an unrelated storage error rather than masking it as StorageFullError", async () => {
    class ExplodingStorage extends FakeStorage {
      override setItem(): never {
        throw new Error("disk on fire");
      }
    }
    vi.stubGlobal("window", { localStorage: new ExplodingStorage() });

    await expect(repo.createGame(buildMeta())).rejects.toThrow("disk on fire");
  });
});
