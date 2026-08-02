# ADR-0002: Repository port carries optimistic concurrency, even though localStorage never conflicts

**Status:** Accepted

## Context

`packages/adapters` (M3) ships a `localStorage`-backed `GameRepository` first, and for a long time it will be the only adapter that ships. `localStorage` is single-device and single-writer — there is never a scenario where two writers race to append events to the same game, so a version check on write can never actually reject anything for that adapter.

Given that, the simplest port would drop concurrency control entirely: `appendEvents(gameId, events): Promise<void>`. That's less code in the one adapter that exists today, and it's tempting to add the version parameter later, "when we actually need it."

## Decision

`GameRepository.appendEvents` takes an `expectedVersion` and returns an `AppendResult` indicating whether the append succeeded or was rejected because another write landed first — from the moment the port is defined, not deferred to whenever a networked adapter shows up. The `localStorage` adapter implements the check honestly (compare-and-reject against its own stored version) even though, in practice, it can only ever have one writer and so can only ever take the success path.

## Consequences

- The `localStorage` adapter carries a version-check branch that never observably rejects anything today — a few lines that look like dead code to anyone reading the adapter in isolation.
- When a networked or `Supabase` adapter (M10) is added, it drops in behind the same port and implements real optimistic-concurrency conflict detection without changing the port's shape — and therefore without changing anything above it: `apps/web`, the composition root, `GameProvider`. The alternative is a breaking port change at exactly the point where the app has the most existing callers depending on the old shape.
- Every adapter — including future ones — can be run against one shared contract test suite, including a "reject on stale version" case, even for adapters where that path is currently unreachable. That shared suite is what makes swapping storage later a mechanical exercise rather than a hopeful one.
- This is explicitly called out in AGENTS.md as a trap: don't remove `expectedVersion` as apparently-dead code. This ADR is the record of why it's there.
