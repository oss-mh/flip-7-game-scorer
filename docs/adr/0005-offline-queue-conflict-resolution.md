# ADR-0005: Offline queue conflict resolution is last-writer-wins by timestamp, with the losing side always backed up

**Status:** Accepted

## Context

M10 (#90) asks for events to queue locally when the remote adapter (docs/adr/0004) can't be reached, flush automatically on reconnect, and for version conflicts hit during that flush to be detected and "surfaced to the user" with a chosen, documented resolution strategy. #90's acceptance criteria are explicit that local-first stays the default and remote is an enhancement, never a dependency — the app must work exactly as it does today if the remote adapter is never reachable at all.

A version conflict here means: this device's local event log has events the remote copy doesn't have yet, *and* the remote copy has events this device doesn't know about either. That second half only happens if something else — another browser tab, another signed-in device, a stale cache from before local storage was cleared — wrote to the same game's remote copy in the meantime. Multi-device *live* collaboration on one game, where this is the common case rather than the rare one, is explicitly out of scope here: that's #91. #90's conflict handling exists for the case where it happens anyway, not as the primary feature.

Real merge resolution (three-way diff of two divergent event logs, replaying a reconciled sequence through the engine) is a substantially bigger piece of work than fits a queue-and-flush issue, and this app models one physical table's log, not a multi-writer document — there generally isn't a meaningful way to interleave two people's card plays after the fact.

## Decision

`OfflineQueueGameRepository` (`packages/adapters/src/offlineQueueGameRepository.ts`) wraps a local `GameRepository` (authoritative, always written to synchronously) and a remote one (best-effort, synced in the background). Every read and write goes to `local` first and returns without waiting on `remote` — the class behaves identically to using `local` alone if `remote` is permanently unreachable.

After a local write, a background sync attempts to bring `remote` up to date by appending `local`'s events past whatever version `remote` already has. If that append comes back as a conflict — `remote` has moved in a way `local` didn't expect — resolution is **last-writer-wins by the latest event's timestamp**:

- Compare the `at` timestamp of the last event in `local`'s log against the last event in `remote`'s log.
- Whichever is later wins outright. The losing side's log is replaced with the winner's, using the same truncate-then-append path undo already uses (no new storage primitive).
- Before `local` ever loses, its current state is exported through the existing `exportGame` (`packages/adapters/src/exportImport.ts`) — the same backup `GameRecoveryPanel`'s revert flow already takes before discarding anything, see AGENTS.md design priorities, "Never lose someone's scores".
- The outcome (which side won, how many events were discarded, and the backup if local lost) is exposed through `SyncStatus`, not applied silently to whatever's currently on screen — a resolution while a round is actively rendered would otherwise invalidate `GameProviderSession`'s in-memory state out from under the player. The UI surfaces it as a notice recommending a reload, reusing the reload pattern `GameRecoveryPanel`/`retry()` already use everywhere else, rather than inventing a second way to refresh game state.

## Consequences

- No real merge: if both sides genuinely have valuable moves recorded after the divergence point, the losing side's moves are gone from the game, full stop — recoverable only by hand from the exported backup. Given the target scenario is "this device was offline for a while, not two people playing the same game as of the same moment on different screens," this is an acceptable trade for not building three-way event-log merging.
- Timestamp comparison trusts each device's clock. Two devices with badly skewed clocks could pick the "wrong" winner by human judgement even though the comparison itself is correct. Not corrected for here — pulling in NTP-style clock skew estimation is disproportionate to this issue's scope, and #91's live-sync work will make stale-clock-driven conflicts far less likely to occur in the first place by keeping devices continuously reconciled instead of periodically colliding.
- `SyncStatus` becomes a second thing UI code can observe about a repository beyond the `GameRepository` port itself. It's exposed as a duck-typed capability (`getSyncStatus`/`subscribeSyncStatus`, checked at runtime) rather than added to the `GameRepository` interface, so `InMemoryGameRepository` and `LocalStorageGameRepository` aren't forced to grow a meaningless "always synced" implementation, and `apps/web` still never imports a concrete adapter class to use it — see the `getSyncStatus`/`subscribeSyncStatus` helper functions, which work on any `GameRepository` and degrade to "nothing to sync" when the capability isn't present.
