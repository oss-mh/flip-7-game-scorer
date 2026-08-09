import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createGameSharingActions } from "../gameSharing.js";
import { HttpGameRepository } from "../httpGameRepository.js";
import { createSupabaseGameServerActions } from "../supabaseGameServerActions.js";
import { runRepositoryContractTests } from "../testing/repositoryContract.js";

import type { GameMeta, GameRepository } from "@flip-7/engine";

/**
 * Runs the shared `GameRepository` contract suite — the exact same one
 * `InMemoryGameRepository` and `LocalStorageGameRepository` pass — against
 * a real Postgres running supabase/migrations/20260808120000_event_log_schema.sql,
 * fronted by a real PostgREST, talked to through the real
 * `@supabase/supabase-js` client and `createSupabaseGameServerActions`.
 *
 * This is the thing `httpGameRepository.test.ts`'s in-process fake
 * `GameServerActions` can't prove: that the actual table names, column
 * names, RPC argument shapes, and `error.code` checks in
 * supabaseGameServerActions.ts really match what Postgres/PostgREST send
 * back on the wire. Opt-in (`pnpm test:integration`) because it needs
 * Docker — see vitest.integration.config.ts.
 *
 * No real Supabase Auth here: PostgREST only needs a JWT it can verify
 * with a shared secret and a `role` claim to `SET ROLE` to, so a
 * hand-signed HS256 token stands in for a session, with a minimal `auth`
 * schema stub (just enough for `auth.uid()` and the `games.owner_id`
 * foreign key) standing in for the real `auth.users` table Supabase Auth
 * would otherwise manage. RLS, the append/conflict RPC, and the
 * append-only grants are all real — those are exactly what this test
 * exists to exercise.
 */

const NETWORK = `f7-it-net-${process.pid}`;
const PG_CONTAINER = `f7-it-pg-${process.pid}`;
const POSTGREST_CONTAINER = `f7-it-postgrest-${process.pid}`;
const JWT_SECRET = "test-only-secret-does-not-protect-anything-1234567890";
const TEST_OWNER_ID = randomUUID();
const TEST_OTHER_USER_ID = randomUUID();

let postgrestUrl: string;
let closeProxy: (() => Promise<void>) | undefined;

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function psql(sql: string): void {
  execFileSync(
    "docker",
    ["exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      input: sql,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Hand-signed HS256 — see the module doc for why this stands in for a real Supabase Auth session. */
function signJwt(payload: Record<string, unknown>): string {
  const encodedHeader = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function jwtFor(ownerId: string): string {
  return signJwt({
    role: "authenticated",
    sub: ownerId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

/**
 * `@supabase/supabase-js` always builds its REST endpoint as
 * `new URL("rest/v1", supabaseUrl)` — real Supabase projects serve
 * PostgREST under that path, behind Kong. A bare `postgrest/postgrest`
 * container serves the schema at its own root instead, so pointing
 * `createClient` straight at it 404s every request ("Invalid path
 * specified in request URL"). Rather than fight the URL-building supabase-
 * js has no option to disable, this strips the `/rest/v1` prefix back off
 * before forwarding — a few lines of `node:http`, not a dependency.
 */
function startRestV1Proxy(
  targetPort: string,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const prefix = "/rest/v1";
    const server = createServer((req, res) => {
      const forwardPath =
        req.url !== undefined && req.url.startsWith(prefix)
          ? (req.url.slice(prefix.length) ?? "/")
          : (req.url ?? "/");
      const proxyReq = httpRequest(
        {
          host: "127.0.0.1",
          port: targetPort,
          path: forwardPath === "" ? "/" : forwardPath,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", (err) => {
        res.writeHead(502);
        res.end(String(err));
      });
      req.pipe(proxyReq);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to bind the REST proxy to a port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

async function waitFor(check: () => Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/** Every migration, concatenated in filename (i.e. timestamp) order — the same order `supabase db push` would apply them in. */
function migrationSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(here, "../../../../supabase/migrations");
  const files = execFileSync("ls", [migrationsDir], { encoding: "utf8" })
    .split("\n")
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return files
    .map((name) => execFileSync("cat", [path.join(migrationsDir, name)], { encoding: "utf8" }))
    .join("\n");
}

beforeAll(async () => {
  docker("network", "create", NETWORK);
  docker(
    "run",
    "-d",
    "--name",
    PG_CONTAINER,
    "--network",
    NETWORK,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "postgres:16",
  );

  await waitFor(async () => {
    try {
      execFileSync("docker", ["exec", PG_CONTAINER, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  }, "Postgres to accept connections");

  // Minimal stand-in for what a real Supabase project already provides —
  // see the module doc.
  psql(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid
    language sql stable
    as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
  `);

  psql(migrationSql());
  psql(`insert into auth.users (id) values ('${TEST_OWNER_ID}'), ('${TEST_OTHER_USER_ID}');`);

  const postgrestPort = "3000";
  docker(
    "run",
    "-d",
    "--name",
    POSTGREST_CONTAINER,
    "--network",
    NETWORK,
    "-p",
    "0:3000",
    "-e",
    `PGRST_DB_URI=postgres://postgres:postgres@${PG_CONTAINER}:5432/postgres`,
    "-e",
    "PGRST_DB_SCHEMAS=public",
    "-e",
    "PGRST_DB_ANON_ROLE=anon",
    "-e",
    `PGRST_JWT_SECRET=${JWT_SECRET}`,
    "postgrest/postgrest",
  );

  const portMapping = docker("port", POSTGREST_CONTAINER, `${postgrestPort}/tcp`).trim();
  const hostPort = portMapping.split(":").pop();
  if (hostPort === undefined) {
    throw new Error(`Could not parse a host port out of "docker port" output: "${portMapping}"`);
  }
  const directUrl = `http://127.0.0.1:${hostPort}`;

  await waitFor(async () => {
    try {
      const response = await fetch(directUrl);
      return response.status < 500;
    } catch {
      return false;
    }
  }, "PostgREST to accept connections");

  const proxy = await startRestV1Proxy(hostPort);
  postgrestUrl = proxy.url;
  closeProxy = proxy.close;
}, 90_000);

afterAll(async () => {
  if (closeProxy) await closeProxy();
  for (const container of [POSTGREST_CONTAINER, PG_CONTAINER]) {
    try {
      docker("rm", "-f", container);
    } catch {
      // best-effort cleanup
    }
  }
  try {
    docker("network", "rm", NETWORK);
  } catch {
    // best-effort cleanup
  }
});

function makeRepo(): GameRepository {
  const client = createClient(postgrestUrl, jwtFor(TEST_OWNER_ID), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new HttpGameRepository(createSupabaseGameServerActions(client));
}

function buildMeta(id: string): GameMeta {
  return {
    id,
    players: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    targetScore: 200,
    createdAt: "2026-08-08T00:00:00.000Z",
    archivedAt: null,
  };
}

describe.sequential(
  "HttpGameRepository + createSupabaseGameServerActions (real Postgres + PostgREST)",
  () => {
    // Registered here, one nesting level above `runRepositoryContractTests`'s
    // own `beforeEach`, so it runs first: `games.id` is a real primary key
    // (see the migration comment on why it's `text`, not `uuid`), which is
    // global across owners, not scoped per-owner — so the fixture ids the
    // contract suite hard-codes ("game-1", "missing", ...) need the whole
    // table wiped between tests, not just a fresh owner. `truncate ...
    // cascade` runs as the `postgres` superuser, bypassing RLS entirely, so
    // this works regardless of which owner a given test's repo acts as.
    beforeEach(() => {
      psql(
        "truncate table public.games, public.game_events, public.game_snapshots, public.game_participants cascade;",
      );
    });

    runRepositoryContractTests(makeRepo);
  },
);

describe.sequential("join-code sharing (#92, real Postgres + PostgREST)", () => {
  beforeEach(() => {
    psql(
      "truncate table public.games, public.game_events, public.game_snapshots, public.game_participants cascade;",
    );
  });

  function clientFor(userId: string) {
    return createClient(postgrestUrl, jwtFor(userId), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  it("lets a participant who redeems the code read and append events", async () => {
    const ownerClient = clientFor(TEST_OWNER_ID);
    const ownerRepo = new HttpGameRepository(createSupabaseGameServerActions(ownerClient));
    await ownerRepo.createGame(buildMeta("game-1"));

    const codeResult = await createGameSharingActions(ownerClient).getJoinCode("game-1");
    if (!codeResult.ok) throw new Error(`expected ok, got ${JSON.stringify(codeResult)}`);
    const code = codeResult.value;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const participantClient = clientFor(TEST_OTHER_USER_ID);
    await expect(createGameSharingActions(participantClient).redeemJoinCode(code)).resolves.toEqual(
      { ok: true, value: "game-1" },
    );

    // Lowercase + stray whitespace, as a copy-paste might produce, still works.
    await expect(
      createGameSharingActions(participantClient).redeemJoinCode(` ${code.toLowerCase()} `),
    ).resolves.toEqual({ ok: true, value: "game-1" });

    const participantRepo = new HttpGameRepository(
      createSupabaseGameServerActions(participantClient),
    );
    await expect(participantRepo.loadEvents("game-1")).resolves.toEqual([]);
    await expect(
      participantRepo.appendEvents(
        "game-1",
        [
          {
            schemaVersion: 1,
            at: "2026-08-08T00:00:00.000Z",
            seq: 1,
            t: "GameCreated",
            players: buildMeta("game-1").players,
          },
        ],
        0,
      ),
    ).resolves.toEqual({ outcome: "appended", version: 1 });
  });

  it("keeps a game invisible to a user who never redeemed its code", async () => {
    const ownerClient = clientFor(TEST_OWNER_ID);
    const ownerRepo = new HttpGameRepository(createSupabaseGameServerActions(ownerClient));
    await ownerRepo.createGame(buildMeta("game-1"));

    const strangerRepo = new HttpGameRepository(
      createSupabaseGameServerActions(clientFor(TEST_OTHER_USER_ID)),
    );
    await expect(strangerRepo.loadEvents("game-1")).rejects.toThrow();
  });

  it("rejects redeeming a code that doesn't exist", async () => {
    const client = clientFor(TEST_OTHER_USER_ID);
    const result = await createGameSharingActions(client).redeemJoinCode("ZZZZZZ");
    expect(result.ok).toBe(false);
  });
});
