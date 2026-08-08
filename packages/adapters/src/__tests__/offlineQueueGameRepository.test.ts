import {
  EVENT_SCHEMA_VERSION,
  type GameEvent,
  type GameMeta,
  type GameRepository,
  initialState,
} from "@flip-7/engine";
import { describe, expect, it } from "vitest";

import { GameNotFoundError, StorageUnavailableError } from "../errors.js";
import { InMemoryGameRepository } from "../inMemoryGameRepository.js";
import {
  OfflineQueueGameRepository,
  adoptRemoteGame,
  getSyncStatus,
} from "../offlineQueueGameRepository.js";
import { runRepositoryContractTests } from "../testing/repositoryContract.js";

/**
 * A `GameRepository` test double standing in for "remote" — delegates to a
 * real `InMemoryGameRepository` but can be told to reject every call
 * (`setOffline`) or delay every call (`setLatency`), deterministically
 * exercising the offline-queue/reconnect/latency behaviour
 * `OfflineQueueGameRepository` exists for without a real network.
 */
class FlakyGameRepository implements GameRepository {
  readonly #inner: GameRepository;
  #offline = false;
  #latencyMs = 0;

  constructor(inner: GameRepository = new InMemoryGameRepository()) {
    this.#inner = inner;
  }

  setOffline(offline: boolean): void {
    this.#offline = offline;
  }

  setLatency(ms: number): void {
    this.#latencyMs = ms;
  }

  async #guard<T>(run: () => Promise<T>): Promise<T> {
    if (this.#offline) {
      throw new StorageUnavailableError("offline (test double)");
    }
    if (this.#latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.#latencyMs));
    }
    return run();
  }

  createGame(game: Parameters<GameRepository["createGame"]>[0]) {
    return this.#guard(() => this.#inner.createGame(game));
  }
  listGames() {
    return this.#guard(() => this.#inner.listGames());
  }
  loadEvents(gameId: string, sinceVersion?: number) {
    return this.#guard(() => this.#inner.loadEvents(gameId, sinceVersion));
  }
  appendEvents(gameId: string, events: readonly GameEvent[], expectedVersion: number) {
    return this.#guard(() => this.#inner.appendEvents(gameId, events, expectedVersion));
  }
  truncateEvents(gameId: string, toVersion: number) {
    return this.#guard(() => this.#inner.truncateEvents(gameId, toVersion));
  }
  saveSnapshot(...args: Parameters<GameRepository["saveSnapshot"]>) {
    return this.#guard(() => this.#inner.saveSnapshot(...args));
  }
  loadSnapshot(gameId: string) {
    return this.#guard(() => this.#inner.loadSnapshot(gameId));
  }
  archiveGame(gameId: string, archivedAt: string) {
    return this.#guard(() => this.#inner.archiveGame(gameId, archivedAt));
  }
  unarchiveGame(gameId: string) {
    return this.#guard(() => this.#inner.unarchiveGame(gameId));
  }
  deleteGame(gameId: string) {
    return this.#guard(() => this.#inner.deleteGame(gameId));
  }
}

runRepositoryContractTests(
  () =>
    new OfflineQueueGameRepository({
      local: new InMemoryGameRepository(),
      remote: new InMemoryGameRepository(),
    }),
);

function buildMeta(id = "game-1"): GameMeta {
  return {
    id,
    players: [{ id: "alice", name: "Alice" }],
    targetScore: 200,
    createdAt: "2026-08-08T00:00:00.000Z",
    archivedAt: null,
  };
}

function buildEvent(seq: number, at = "2026-08-08T00:00:00.000Z"): GameEvent {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    at,
    seq,
    t: seq === 0 ? "GameCreated" : "RoundStarted",
    ...(seq === 0 ? { players: buildMeta().players } : { dealerId: "alice" }),
  } as GameEvent;
}

/**
 * Polls a real side effect (what's actually in a repository) rather than
 * `SyncStatus.state` — `state` is a single current value, not a queue of
 * events, so a check like "wait until state is 'synced'" can resolve
 * immediately against a *stale* "synced" left over from an earlier,
 * unrelated sync (e.g. `createGame`'s own trivial one), racing ahead of
 * the write the test actually means to wait for. Polling the repository
 * content that the sync in question is expected to produce doesn't have
 * that ambiguity.
 */
async function waitUntil(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("OfflineQueueGameRepository", () => {
  it("returns from a write immediately even when remote is offline", async () => {
    const remote = new FlakyGameRepository();
    remote.setOffline(true);
    const repo = new OfflineQueueGameRepository({ local: new InMemoryGameRepository(), remote });

    await repo.createGame(buildMeta());
    await expect(repo.appendEvents("game-1", [buildEvent(0)], 0)).resolves.toEqual({
      outcome: "appended",
      version: 1,
    });

    await waitUntil(async () => getSyncStatus(repo, "game-1").state === "offline");
    const status = getSyncStatus(repo, "game-1");
    expect(status.pendingCount).toBeGreaterThan(0);
  });

  it("flushes queued events once remote is reachable again", async () => {
    const remoteInner = new InMemoryGameRepository();
    const remote = new FlakyGameRepository(remoteInner);
    remote.setOffline(true);
    const repo = new OfflineQueueGameRepository({ local: new InMemoryGameRepository(), remote });

    await repo.createGame(buildMeta());
    await repo.appendEvents("game-1", [buildEvent(0), buildEvent(1)], 0);
    await waitUntil(async () => getSyncStatus(repo, "game-1").state === "offline");

    remote.setOffline(false);
    // Re-touching the game is this test's stand-in for the browser "online"
    // event (there's no `window` in this test environment) — both paths
    // go through the same `#kick`.
    await repo.loadEvents("game-1");

    await waitUntil(async () => {
      // Remote never got as far as `createGame` while offline, so it
      // legitimately doesn't know this game yet until the flush's own
      // create-then-append round finishes.
      try {
        return (await remoteInner.loadEvents("game-1")).length === 2;
      } catch {
        return false;
      }
    });
    expect(getSyncStatus(repo, "game-1").pendingCount).toBe(0);
  });

  it("does not block a local write behind a slow remote", async () => {
    const remote = new FlakyGameRepository();
    remote.setLatency(300);
    const repo = new OfflineQueueGameRepository({ local: new InMemoryGameRepository(), remote });
    await repo.createGame(buildMeta());

    const start = Date.now();
    await repo.appendEvents("game-1", [buildEvent(0)], 0);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("never calls remote for snapshots", async () => {
    let remoteSnapshotCalls = 0;
    const remoteInner = new InMemoryGameRepository();
    const remote = new FlakyGameRepository(remoteInner);
    const originalSaveSnapshot = remote.saveSnapshot.bind(remote);
    remote.saveSnapshot = (...args) => {
      remoteSnapshotCalls++;
      return originalSaveSnapshot(...args);
    };
    const repo = new OfflineQueueGameRepository({ local: new InMemoryGameRepository(), remote });
    await repo.createGame(buildMeta());

    await repo.saveSnapshot("game-1", 0, initialState);

    expect(remoteSnapshotCalls).toBe(0);
  });

  describe("adoptRemoteGame (#92, join-code sharing)", () => {
    it("pulls a game only known to remote into local", async () => {
      const local = new InMemoryGameRepository();
      const remote = new InMemoryGameRepository();
      const repo = new OfflineQueueGameRepository({ local, remote });

      // Simulates another device's owner creating the game and this
      // device having just redeemed its join code — remote knows it,
      // local never has.
      const meta = buildMeta();
      await remote.createGame(meta);
      const event = buildEvent(0);
      await remote.appendEvents("game-1", [event], 0);

      await adoptRemoteGame(repo, "game-1");

      await expect(local.listGames()).resolves.toEqual([meta]);
      await expect(local.loadEvents("game-1")).resolves.toEqual([event]);
    });

    it("only appends what local is missing when re-adopting an already-known game", async () => {
      const local = new InMemoryGameRepository();
      const remote = new InMemoryGameRepository();
      const repo = new OfflineQueueGameRepository({ local, remote });

      const meta = buildMeta();
      await remote.createGame(meta);
      const first = buildEvent(0);
      const second = { ...buildEvent(1), t: "RoundStarted" as const, dealerId: "alice" };
      await remote.appendEvents("game-1", [first], 0);

      await adoptRemoteGame(repo, "game-1");
      await expect(local.loadEvents("game-1")).resolves.toEqual([first]);

      await remote.appendEvents("game-1", [second], 1);
      await adoptRemoteGame(repo, "game-1");

      await expect(local.loadEvents("game-1")).resolves.toEqual([first, second]);
    });

    it("rejects adopting a game remote doesn't know either", async () => {
      const repo = new OfflineQueueGameRepository({
        local: new InMemoryGameRepository(),
        remote: new InMemoryGameRepository(),
      });

      await expect(adoptRemoteGame(repo, "missing")).rejects.toThrow(GameNotFoundError);
    });

    it("is a no-op for a plain GameRepository that doesn't support adoption", async () => {
      const repo = new InMemoryGameRepository();
      await expect(adoptRemoteGame(repo, "game-1")).resolves.toBeUndefined();
    });
  });

  describe("conflict resolution (docs/adr/0005)", () => {
    it("keeps local's log and overwrites remote when local's last event is newer", async () => {
      const local = new InMemoryGameRepository();
      const remoteInner = new InMemoryGameRepository();
      const remote = new FlakyGameRepository(remoteInner);
      const repo = new OfflineQueueGameRepository({ local, remote });

      // Both sides start from the same game, then diverge: remote gets one
      // event written directly (simulating another writer), local gets a
      // *later* one written through the queue while remote was briefly
      // unreachable.
      await repo.createGame(buildMeta());
      await repo.appendEvents("game-1", [buildEvent(0, "2026-08-08T00:00:00.000Z")], 0);
      await waitUntil(async () => (await remoteInner.loadEvents("game-1")).length === 1);

      remote.setOffline(true);
      await repo.appendEvents(
        "game-1",
        [buildEvent(1, "2026-08-08T00:10:00.000Z")], // later
        1,
      );
      await waitUntil(async () => getSyncStatus(repo, "game-1").state === "offline");

      // Something else wrote directly to remote while this device queued
      // its own (later) event — the scenario that produces a real conflict.
      await remoteInner.appendEvents(
        "game-1",
        [{ ...buildEvent(1, "2026-08-08T00:05:00.000Z"), t: "DeckReshuffled" } as GameEvent],
        1,
      );
      remote.setOffline(false);

      await repo.loadEvents("game-1");
      // Remote already sat at length 2 before resolution (from the direct
      // write above), so the length alone can't tell "resolved" apart from
      // "not yet" — check for local's actual seq-1 event landing instead.
      await waitUntil(async () => {
        const events = await remoteInner.loadEvents("game-1");
        return events[1]?.at === "2026-08-08T00:10:00.000Z";
      });

      const status = getSyncStatus(repo, "game-1");
      expect(status.resolution?.winner).toBe("local");
      await expect(remoteInner.loadEvents("game-1")).resolves.toEqual(
        await local.loadEvents("game-1"),
      );
    });

    it("adopts remote's log locally (with a backup) when remote's last event is newer", async () => {
      const local = new InMemoryGameRepository();
      const remoteInner = new InMemoryGameRepository();
      const remote = new FlakyGameRepository(remoteInner);
      const repo = new OfflineQueueGameRepository({ local, remote });

      await repo.createGame(buildMeta());
      await repo.appendEvents("game-1", [buildEvent(0, "2026-08-08T00:00:00.000Z")], 0);
      await waitUntil(async () => (await remoteInner.loadEvents("game-1")).length === 1);

      remote.setOffline(true);
      await repo.appendEvents(
        "game-1",
        [buildEvent(1, "2026-08-08T00:01:00.000Z")], // earlier than what lands on remote below
        1,
      );
      await waitUntil(async () => getSyncStatus(repo, "game-1").state === "offline");

      await remoteInner.appendEvents(
        "game-1",
        [{ ...buildEvent(1, "2026-08-08T00:20:00.000Z"), t: "DeckReshuffled" } as GameEvent],
        1,
      );
      remote.setOffline(false);

      await repo.loadEvents("game-1");
      // Local's own seq-1 was "RoundStarted" — wait for it to actually be
      // replaced by remote's "DeckReshuffled" rather than trusting length.
      await waitUntil(async () => {
        const events = await local.loadEvents("game-1");
        return events[1]?.t === "DeckReshuffled";
      });

      const status = getSyncStatus(repo, "game-1");
      expect(status.resolution?.winner).toBe("remote");
      expect(status.resolution?.backup?.events).toHaveLength(2); // local's discarded log, preserved
      await expect(local.loadEvents("game-1")).resolves.toEqual(
        await remoteInner.loadEvents("game-1"),
      );
    });
  });
});
