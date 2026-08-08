import { GameAlreadyExistsError, GameNotFoundError } from "./errors.js";
import { exportGame } from "./exportImport.js";

import type { ExportedGame } from "./exportImport.js";
import type {
  AppendResult,
  GameEvent,
  GameId,
  GameMeta,
  GameRepository,
  GameState,
  Snapshot,
  StoredEvent,
} from "@flip-7/engine";

/**
 * What last-writer-wins decided when a flush hit a real conflict — see
 * docs/adr/0005. `discardedCount` is the number of events beyond the two
 * logs' common prefix that got dropped, not either log's full length: two
 * logs that mostly agree and diverge only at the very end should report a
 * small number, not "everything".
 */
export interface SyncResolution {
  readonly winner: "local" | "remote";
  readonly discardedCount: number;
  /** Only set when `winner` is `"remote"` — local's diverging tail, backed up before it was discarded. */
  readonly backup?: ExportedGame;
}

export interface SyncStatus {
  readonly state: "synced" | "syncing" | "offline" | "conflict-resolved";
  /** Local events not yet confirmed present in the remote copy. */
  readonly pendingCount: number;
  readonly lastError?: string;
  /** Set only on the sync that just resolved a conflict — see `SyncResolution`. */
  readonly resolution?: SyncResolution;
}

const SYNCED: SyncStatus = { state: "synced", pendingCount: 0 };

/** Duck-typed rather than added to `GameRepository` — see docs/adr/0005. */
export interface SyncStatusSource {
  getSyncStatus(gameId: GameId): SyncStatus;
  subscribeSyncStatus(gameId: GameId, listener: (status: SyncStatus) => void): () => void;
}

function hasSyncStatus(repo: GameRepository): repo is GameRepository & SyncStatusSource {
  const candidate = repo as Partial<SyncStatusSource>;
  return (
    typeof candidate.getSyncStatus === "function" &&
    typeof candidate.subscribeSyncStatus === "function"
  );
}

/** Works on any `GameRepository` — local-only adapters trivially have nothing pending to sync. */
export function getSyncStatus(repo: GameRepository, gameId: GameId): SyncStatus {
  return hasSyncStatus(repo) ? repo.getSyncStatus(gameId) : SYNCED;
}

/** Works on any `GameRepository`; a no-op unsubscribe when there's nothing to subscribe to. */
export function subscribeSyncStatus(
  repo: GameRepository,
  gameId: GameId,
  listener: (status: SyncStatus) => void,
): () => void {
  return hasSyncStatus(repo) ? repo.subscribeSyncStatus(gameId, listener) : () => {};
}

function sameEvent(a: StoredEvent, b: StoredEvent): boolean {
  return a.seq === b.seq && a.t === b.t && a.at === b.at;
}

function commonPrefixLength(a: readonly StoredEvent[], b: readonly StoredEvent[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max) {
    const eventA = a[i];
    const eventB = b[i];
    if (eventA === undefined || eventB === undefined || !sameEvent(eventA, eventB)) break;
    i++;
  }
  return i;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `GameRepository` wrapping a `local` repository (authoritative — every
 * read and write goes here first and returns without waiting on `remote`)
 * and a `remote` one (best-effort, kept caught up in the background). See
 * docs/adr/0005 for the conflict resolution strategy and #90's acceptance
 * criteria this exists for: "local-first remains the default; remote is an
 * enhancement, never a dependency."
 *
 * If `remote` is permanently unreachable, this behaves exactly like using
 * `local` alone — every method's own return value depends only on `local`.
 * Sync status (queued/offline/conflict) is a separate, duck-typed channel
 * — see `getSyncStatus`/`subscribeSyncStatus` — not part of what any
 * method here returns or throws.
 */
export class OfflineQueueGameRepository implements GameRepository, SyncStatusSource {
  readonly #local: GameRepository;
  readonly #remote: GameRepository;
  readonly #statuses = new Map<GameId, SyncStatus>();
  readonly #listeners = new Map<GameId, Set<(status: SyncStatus) => void>>();
  readonly #syncing = new Set<GameId>();
  readonly #rerunRequested = new Set<GameId>();
  /**
   * Guards only the local truncate-then-append pair conflict resolution
   * uses to replace local's log with remote's — the one place a plain
   * write (also local-only, and otherwise safe: see the class doc on
   * `LocalStorageGameRepository`, every one of its methods is a single
   * synchronous read-modify-write with no internal `await`, so ordinary
   * calls can't interleave with each other) could otherwise land between
   * the truncate and the append and be silently overwritten. Never guards
   * anything that talks to `remote`, so a slow or hung network call can
   * never make a local write wait on it.
   */
  readonly #localGuards = new Map<GameId, Promise<void>>();

  constructor(options: { local: GameRepository; remote: GameRepository }) {
    this.#local = options.local;
    this.#remote = options.remote;

    // Catches up whatever accumulated while offline, whether that offline
    // stretch was this session or an earlier one this page reloaded past
    // — see #90's "flushed on reconnect".
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.#kickAll());
      this.#kickAll();
    }
  }

  async createGame(game: GameMeta): Promise<void> {
    await this.#withLocalGuard(game.id, () => this.#local.createGame(game));
    this.#kick(game.id);
  }

  async listGames(): Promise<readonly GameMeta[]> {
    return this.#local.listGames();
  }

  async loadEvents(gameId: GameId, sinceVersion = 0): Promise<readonly StoredEvent[]> {
    const events = await this.#local.loadEvents(gameId, sinceVersion);
    this.#kick(gameId);
    return events;
  }

  async appendEvents(
    gameId: GameId,
    events: readonly GameEvent[],
    expectedVersion: number,
  ): Promise<AppendResult> {
    const result = await this.#withLocalGuard(gameId, () =>
      this.#local.appendEvents(gameId, events, expectedVersion),
    );
    this.#kick(gameId);
    return result;
  }

  async truncateEvents(gameId: GameId, toVersion: number): Promise<void> {
    await this.#withLocalGuard(gameId, () => this.#local.truncateEvents(gameId, toVersion));
    this.#kick(gameId);
  }

  async saveSnapshot(gameId: GameId, version: number, state: GameState): Promise<void> {
    // Local only — deliberately not part of remote sync, see docs/adr/0005:
    // #90 is scoped to the event log, and a snapshot is a read-performance
    // cache the log can always reproduce.
    return this.#local.saveSnapshot(gameId, version, state);
  }

  async loadSnapshot(gameId: GameId): Promise<Snapshot | null> {
    return this.#local.loadSnapshot(gameId);
  }

  async archiveGame(gameId: GameId, archivedAt: string): Promise<void> {
    await this.#local.archiveGame(gameId, archivedAt);
    void this.#remote.archiveGame(gameId, archivedAt).catch(() => {
      // Best-effort, one shot — not part of the persistent event-log
      // queue (see the class doc). Archiving is idempotent, so the next
      // successful remote touch for this game leaves it consistent
      // regardless.
    });
  }

  async unarchiveGame(gameId: GameId): Promise<void> {
    await this.#local.unarchiveGame(gameId);
    void this.#remote.unarchiveGame(gameId).catch(() => {
      // See archiveGame.
    });
  }

  async deleteGame(gameId: GameId): Promise<void> {
    await this.#local.deleteGame(gameId);
    void this.#remote.deleteGame(gameId).catch(() => {
      // Best-effort — a lingering remote row is a cleanup gap, not data
      // loss, and out of scope for the event-log queue this class exists
      // for. See docs/adr/0005.
    });
  }

  getSyncStatus(gameId: GameId): SyncStatus {
    return this.#statuses.get(gameId) ?? SYNCED;
  }

  subscribeSyncStatus(gameId: GameId, listener: (status: SyncStatus) => void): () => void {
    const listeners = this.#listeners.get(gameId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(gameId, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  #setStatus(gameId: GameId, status: SyncStatus): void {
    this.#statuses.set(gameId, status);
    for (const listener of this.#listeners.get(gameId) ?? []) {
      listener(status);
    }
  }

  async #withLocalGuard<T>(gameId: GameId, run: () => Promise<T>): Promise<T> {
    const previous = this.#localGuards.get(gameId) ?? Promise.resolve();
    const settled = previous.then(run, run);
    this.#localGuards.set(
      gameId,
      settled.then(
        () => undefined,
        () => undefined,
      ),
    );
    return settled;
  }

  #kickAll(): void {
    void this.#local
      .listGames()
      .then((games) => {
        for (const game of games) this.#kick(game.id);
      })
      .catch(() => {
        // Local itself unavailable — nothing to sync yet.
      });
  }

  /** Fire-and-forget: never awaited by a port method, so a caller never waits on the network. */
  #kick(gameId: GameId): void {
    if (this.#syncing.has(gameId)) {
      this.#rerunRequested.add(gameId);
      return;
    }
    this.#syncing.add(gameId);
    void this.#syncOnce(gameId).finally(() => {
      this.#syncing.delete(gameId);
      if (this.#rerunRequested.delete(gameId)) {
        this.#kick(gameId);
      }
    });
  }

  async #findLocalMeta(gameId: GameId): Promise<GameMeta | null> {
    const games = await this.#local.listGames();
    return games.find((game) => game.id === gameId) ?? null;
  }

  async #syncOnce(gameId: GameId): Promise<void> {
    let localEvents: readonly StoredEvent[];
    try {
      localEvents = await this.#local.loadEvents(gameId);
    } catch {
      return; // Not a game this repository knows about locally — nothing to do.
    }

    this.#setStatus(gameId, { state: "syncing", pendingCount: localEvents.length });

    let remoteEvents: readonly StoredEvent[];
    try {
      remoteEvents = await this.#remote.loadEvents(gameId);
    } catch (error) {
      if (!(error instanceof GameNotFoundError)) {
        this.#markOffline(gameId, localEvents.length, error);
        return;
      }
      const created = await this.#createRemoteGame(gameId);
      if (created === null) return;
      remoteEvents = created;
    }

    // Comparing lengths alone isn't enough: two logs that diverged but
    // happened to grow back to the same length would look "in sync" while
    // actually holding different events. `commonPrefixLength` is what
    // actually tells the two apart.
    const prefixLength = commonPrefixLength(localEvents, remoteEvents);

    if (prefixLength === localEvents.length && prefixLength === remoteEvents.length) {
      this.#setStatus(gameId, SYNCED);
      return;
    }

    // remote is exactly local's prefix — a plain push catches it up, no
    // conflict. Anything else (remote has events beyond the shared prefix,
    // whether or not it's also shorter than local) is a real divergence.
    if (prefixLength === remoteEvents.length) {
      let result: AppendResult;
      try {
        result = await this.#remote.appendEvents(
          gameId,
          localEvents.slice(remoteEvents.length),
          remoteEvents.length,
        );
      } catch (error) {
        this.#markOffline(gameId, localEvents.length - remoteEvents.length, error);
        return;
      }
      if (result.outcome === "appended") {
        this.#setStatus(gameId, SYNCED);
        return;
      }
      // outcome === "conflict": remote moved between our read above and
      // this append — fall through to conflict resolution with a fresh
      // read rather than the now-stale `remoteEvents`.
      try {
        remoteEvents = await this.#remote.loadEvents(gameId);
      } catch (error) {
        this.#markOffline(gameId, localEvents.length, error);
        return;
      }
    }

    await this.#resolveConflict(gameId, localEvents, remoteEvents);
  }

  /** Returns the resulting remote event log, or `null` if it couldn't be determined and the sync should stop. */
  async #createRemoteGame(gameId: GameId): Promise<readonly StoredEvent[] | null> {
    const meta = await this.#findLocalMeta(gameId);
    if (!meta) return null;

    try {
      await this.#remote.createGame(meta);
      return [];
    } catch (error) {
      if (error instanceof GameAlreadyExistsError) {
        return this.#remote.loadEvents(gameId);
      }
      this.#markOffline(gameId, 0, error);
      return null;
    }
  }

  async #resolveConflict(
    gameId: GameId,
    localEvents: readonly StoredEvent[],
    remoteEvents: readonly StoredEvent[],
  ): Promise<void> {
    const localLatest = localEvents.at(-1);
    const remoteLatest = remoteEvents.at(-1);
    const localWins =
      remoteLatest === undefined ||
      (localLatest !== undefined && localLatest.at >= remoteLatest.at);
    const discardedCount =
      (localWins ? remoteEvents.length : localEvents.length) -
      commonPrefixLength(localEvents, remoteEvents);

    try {
      if (localWins) {
        await this.#remote.truncateEvents(gameId, 0);
        await this.#remote.appendEvents(gameId, localEvents, 0);
        this.#setStatus(gameId, {
          state: "conflict-resolved",
          pendingCount: 0,
          resolution: { winner: "local", discardedCount },
        });
        return;
      }

      await this.#withLocalGuard(gameId, async () => {
        const freshLocal = await this.#local.loadEvents(gameId);
        if (freshLocal.length !== localEvents.length) {
          // A write landed while we were deciding — bail and let the
          // rerun this triggers reassess with current data rather than
          // risk discarding it.
          this.#kick(gameId);
          return;
        }

        const backup = await exportGame(this.#local, gameId).catch(() => null);
        await this.#local.truncateEvents(gameId, 0);
        await this.#local.appendEvents(gameId, remoteEvents, 0);
        this.#setStatus(gameId, {
          state: "conflict-resolved",
          pendingCount: 0,
          resolution:
            backup === null
              ? { winner: "remote", discardedCount }
              : { winner: "remote", discardedCount, backup },
        });
      });
    } catch (error) {
      this.#markOffline(gameId, localEvents.length, error);
    }
  }

  #markOffline(gameId: GameId, pendingCount: number, error: unknown): void {
    this.#setStatus(gameId, { state: "offline", pendingCount, lastError: toMessage(error) });
  }
}
