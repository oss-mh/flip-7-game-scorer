# ADR-0004: Supabase as the backend for remote storage and sync

**Status:** Accepted

## Context

M10 (#87) asks for a timeboxed comparison of backend options for the remote side of `GameRepository` — the event log, and everything M10 hangs off it: a schema with an append-only event table (#89), an `HttpGameRepository` adapter (#88), an offline queue with conflict resolution (#90), multi-device live sync for a shared game (#91), and lightweight auth plus join codes (#92).

Three options were compared:

- **Supabase** — hosted Postgres plus bundled Realtime (logical-replication-backed pub/sub over WebSockets), Auth (including magic-link and anonymous sign-in), and Row Level Security enforced at the database layer.
- **Turso** — hosted libSQL (a cloud-native SQLite fork), HTTP-native, no connection pooling required. No bundled auth or realtime/pub-sub product.
- **Plain Postgres + Server Actions** — a bare Postgres instance (e.g. Neon or Vercel Postgres) reached only through Next.js Server Actions, with no managed product above the database itself.

Judged against: fit for an append-only event log, realtime support, auth, free-tier limits, and offline reconciliation — the same five axes the milestone's issues collectively require.

**Append-only fit.** All three support the shape #89 needs: an events table with a unique constraint on `(game_id, seq)` and an atomic conditional insert as the optimistic-concurrency check `GameRepository.appendEvents` already requires (docs/adr/0002). No differentiator here — Postgres and SQLite both do this natively.

**Realtime.** Supabase ships Realtime as part of the same product — Postgres changes broadcast to subscribed clients over WebSockets, which is exactly the transport #91 (multi-device live sync) needs, with polling as an already-documented fallback where sockets are unavailable. Turso has no pub/sub story; a live-sync feature on Turso means building and hosting a separate broadcast service. Plain Postgres has the same gap — Server Actions are request/response, not push, so #91 would need bolting on Pusher, Ably, or a hand-rolled SSE/polling layer.

**Auth.** Supabase Auth supports both magic-link and anonymous device identity out of the box, which is what #92 asks for verbatim, plus first-class session integration with its own RLS. Turso and plain Postgres have neither; both would need Auth.js or an equivalent assembled and wired to a separate identity table.

**Free-tier limits.** Turso's free tier is the most generous of the three for a low-traffic hobby app — 5GB storage, 500M monthly row reads, 10M monthly row writes, no time limit, and (notably) no idle pause. Supabase's free tier is more constrained: a project with no API traffic for 7 days is auto-paused (data retained, but the project goes offline until the next request wakes it, with a cold-start delay). Plain Postgres depends entirely on the host chosen; a comparably-free option (e.g. Neon) has a similar idle-suspend behavior to Supabase's.

**Offline reconciliation.** #90 needs queued local writes to flush against a conditional append and surface a real conflict when another device won the race. This is a client-side and schema concern more than a backend-product concern — it works the same shape on Postgres or SQLite. Supabase Realtime gives a natural way for a reconnecting device to catch up (subscribe, then reconcile), which Turso and plain Postgres would have to build by polling instead.

## Decision

Use **Supabase** as the remote backend for M10: hosted Postgres for the event log and snapshot tables (#89), Supabase Auth for magic-link and anonymous identity (#92), Row Level Security as the authorization boundary so players only reach their own games (#89's stated requirement), and Supabase Realtime as the transport for live sync (#91). `HttpGameRepository` (#88) talks to it through Next.js Server Actions rather than the client SDK directly, keeping the server as the place that validates events before they're persisted.

Turso is rejected because its free tier's generosity doesn't offset the cost of building realtime and auth from scratch — both are hard requirements of this milestone, not optional extras. Plain Postgres + Server Actions is rejected for the same reason: it's the same integration burden as Turso (assemble auth, assemble realtime) with no free-tier advantage to show for it.

## Consequences

- #91 and #92 need no separate realtime or auth service — both ride on the same Supabase project as #89's schema, which is the main reason this saves real implementation time in a size:l milestone that's already ambitious.
- The 7-day idle-pause on the free tier is a real problem for this app's actual usage pattern — game nights are irregular, so a project can plausibly sit idle past a week between uses. `HttpGameRepository` (#88) must tolerate a slow or initially-failing request against a paused project (retry with backoff, not a hard failure) and #90's "local-first remains the default; remote is an enhancement, never a dependency" requirement is what makes this survivable — play is never blocked on the remote adapter waking up.
- RLS policies become the actual authorization boundary, not application code above the port. #89's schema work now includes writing and testing those policies, which is more upfront work than Turso's simpler model would have needed, but was already an explicit acceptance criterion.
- All three of Postgres, Auth, and Realtime now come from one vendor. If Supabase has an outage, every remote-dependent feature degrades at once — acceptable here specifically because of the local-first design priority (AGENTS.md, "Never lose someone's scores"): the app keeps working fully offline regardless.
- Because Supabase is Postgres underneath, a future move off Supabase's managed layer (to plain hosted Postgres) is a real, bounded option later if the vendor coupling becomes a problem — it is not a proprietary data format being committed to here, only the managed Auth/Realtime products above it.
