# Sync-server architecture (`apps/sync-server`)

> **Sprint**: S22 — `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` lines 888-1078.
> **ADR**: [`adr/0019-sync-server-linearisation.md`](./adr/0019-sync-server-linearisation.md).
> **Implementation**: [`apps/sync-server/`](../../apps/sync-server/).
> **CI gate**: [`apps/bench/src/benches/sync-roundtrip.bench.ts`](../../apps/bench/src/benches/sync-roundtrip.bench.ts) — hard-fail > 250 ms p95.

## 1. What this server does

The sync-server is the **single source of order** for a PRYZM project.
It accepts CommandEvents over WebSocket from any number of editor
clients, assigns each one a per-project monotonic `sequenceNumber`,
broadcasts the sequenced event to every subscribed peer, and asks the
bake-worker to re-bake the affected level.

It does **not** apply events to scene state — that is the editor's job.
It does **not** persist `.pryzm` files — that is the file-format
package (ADR-018).  Its single concern is "everyone sees the same
events in the same order, fast."

```
                 +---------------------+
   editor A ───▶ │                     │ ───▶  editor A  (event.push, ack)
                 │     sync-server     │
   editor B ───▶ │  ┌──────────────┐   │ ───▶  editor B  (event.push)
                 │  │ EventLog     │   │
   editor C ───▶ │  │ (mem | pg)   │   │ ───▶  editor C  (event.push)
                 │  └──────┬───────┘   │
                 │         │           │
                 │   ┌─────▼────────┐  │
                 │   │ BakeEnqueuer │──┼───▶ bake-worker (fire-and-forget)
                 │   └──────────────┘  │
                 +---------------------+
```

## 2. Process model

Single Node process.  Default port `4000` (override via `SYNC_PORT`).
HTTP and WebSocket share one `http.Server`; WS lives on `/sync`.

Top-level entrypoint: [`apps/sync-server/src/index.ts`](../../apps/sync-server/src/index.ts).

```
createSyncServer({ /* env-driven defaults */ })
  └─ EventLog          (InMemoryEventLog | PgEventLog)
  └─ BakeEnqueuer      (Noop | Http | InProcess)
  └─ SessionManager    (in-memory client+project indexes)
  └─ Express app
       ├─ GET /health  → { status, sessions, log, bake }
       └─ Upgrade /sync → WebSocketServer
                          └─ AppendEvent / LoadEvents handlers
```

Graceful shutdown: `SIGTERM` and `SIGINT` close the WS server, then
the HTTP server, then resolve the in-flight handler promises before
exiting.  See `index.ts` `shutdown()`.

## 3. Wire format

JSON over WebSocket, version `v0`.  Every message is a JSON object
with a `type` discriminator.  See
[`apps/sync-server/src/protocol/messages.ts`](../../apps/sync-server/src/protocol/messages.ts)
for the canonical types.

### 3.1 Connect

```
                          ws://host:4000/sync?clientId=cl-A&userId=u-1
client ────────────────▶ HTTP upgrade (handshake)
                       ◀────────────────────  101 Switching Protocols
                       ◀────────────────────  { type: "session.opened", clientId, userId }
```

`clientId` and `userId` are required query-string params.  v0 trusts
them; production (S38) will swap for signed JWTs.

### 3.2 Subscribe + catch-up

```
client  ────────────────▶  { type: "project.subscribe", projectId: "p1" }
        ◀────────────────  { type: "project.subscribed", projectId: "p1", latestSeq: 0 }

client  ────────────────▶  { type: "project.subscribe", projectId: "p1", fromSeq: 17 }
        ◀────────────────  { type: "project.subscribed", projectId: "p1", latestSeq: 23 }
        ◀────────────────  { type: "events.page", projectId: "p1",
                              events: [<seq 18..23>], hasMore: false }
```

Subscribing without `fromSeq` is the "I don't have a local cache"
path.  Subscribing with `fromSeq` is the **reconnect** path; the
server replays everything `> fromSeq` from the log in pages of up to
`EVENTS_LOAD_PAGE_LIMIT = 500`.

### 3.3 Append + broadcast

```
client A  ──▶  { type: "event.append",
                 payload: { projectId, clientId, event: { id, type, actorId, payload } } }

server: log.append() → assigns sequenceNumber; broadcast to room.

server  ──▶  client A:  { type: "event.push",
                           projectId, event: { …, sequenceNumber: 18 } }
server  ──▶  client A:  { type: "event.ack", id, sequenceNumber: 18 }
server  ──▶  client B:  { type: "event.push",
                           projectId, event: { …, sequenceNumber: 18 } }
```

Note that **client A receives both `event.push` and `event.ack`** for
its own event.  This is intentional: `event.push` is the single source
of truth for "this event has a real `sequenceNumber`", and the
originator needs the same view of its own write that everyone else
gets.  The originator can dedup against its own optimistic local apply
by `event.id` (which it generated) — that is the same dedup mechanism
the log itself uses.

### 3.4 Pagination

```
client  ──▶  { type: "events.load", projectId: "p1", fromSeq: 17, limit: 200 }
        ◀──  { type: "events.page", projectId: "p1",
               events: [<seq 18..217>], hasMore: true }
```

`fromSeq` is **exclusive** (`> fromSeq`).  `limit` defaults to 500 and
is hard-capped to 500.

### 3.5 Errors

```
        ◀──  { type: "error", code: "VALIDATION_FAILED",
               message: "event.payload.documentName: required" }
```

Codes: `MALFORMED_MESSAGE`, `UNKNOWN_TYPE`, `VALIDATION_FAILED`,
`NOT_SUBSCRIBED`, `SEQUENCE_GAP`, `INTERNAL`.

## 4. Linearisation

Two `EventLog` implementations satisfy the same interface
([`apps/sync-server/src/eventLog/types.ts`](../../apps/sync-server/src/eventLog/types.ts)):

```ts
interface EventLog {
  append(projectId: string, event: AppendInput): Promise<PersistedEvent>;
  load(projectId: string, fromSeq: number, limit: number): Promise<PersistedEvent[]>;
  latestSeq(projectId: string): Promise<number>;
}
```

### 4.1 InMemoryEventLog (default)

Per-project chained-promise mutex.  `append` enqueues a microtask onto
the project's promise chain; the next sequence number is
`events.length + 1`.  ULID dedup is a linear scan (cheap at thousands
of events; we will swap for a Set when we wire the per-project size
cap in S24).

Selected when `SYNC_EVENT_LOG` is unset OR equals `memory`.

### 4.2 PgEventLog

Postgres advisory lock.  Hashes the projectId via FNV-1a to a 32-bit
key, takes a `pg_advisory_xact_lock(key)`, computes
`MAX(sequence_number) + 1`, and `INSERT … ON CONFLICT (id) DO NOTHING`.
The lock auto-releases at COMMIT.

Selected when `SYNC_EVENT_LOG=pg`.  Requires `DATABASE_URL`.

Schema (one table):

```sql
CREATE TABLE sync_events (
  project_id        text   NOT NULL,
  sequence_number   bigint NOT NULL,
  id                text   NOT NULL,
  type              text   NOT NULL,
  actor_id          text   NOT NULL,
  payload           jsonb  NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, sequence_number),
  UNIQUE (id)
);
CREATE INDEX sync_events_project_seq ON sync_events (project_id, sequence_number);
```

## 5. Bake hand-off

After `log.append` succeeds **and** `broadcast` has been queued, the
handler calls `bakeEnqueuer.enqueue({ projectId, levelId })` from a
`queueMicrotask`.  Three implementations:

| Class                     | Selection rule                  | Purpose |
| ------------------------- | ------------------------------- | ------- |
| `NoopBakeEnqueuer`        | `BAKE_URL` unset (default)      | Replit, contributor dev, tests that don't care about bake. |
| `HttpBakeEnqueuer`        | `BAKE_URL` set                  | Production: POSTs `{ projectId, levelId }` to `${BAKE_URL}/enqueue`.  3 s timeout, single attempt — the bake worker's BullMQ queue handles retry. |
| `InProcessBakeEnqueuer`   | Manually wired in tests         | Drives the real bake-coalescer in `apps/bake-worker` from the same Node process — used by `__tests__/AppendEvent.test.ts` to assert the hand-off. |

Failures are caught and logged via the OTel `pryzm.sync.broadcast`
span; they are **never** propagated back to the client.  See ADR-0019
§2.4 for the rationale.

## 6. Telemetry

Four spans under `pryzm.sync.*`:

- `pryzm.sync.append`   — wraps the entire `event.append` handler.
- `pryzm.sync.sequence` — wraps the `EventLog.append` call.
- `pryzm.sync.broadcast` — wraps the `SessionManager.broadcast` call.
- `pryzm.sync.load`     — wraps the `events.load` handler.

Common attributes: `pryzm.project_id`, `pryzm.client_id`,
`pryzm.user_id`.  Where applicable: `pryzm.event.sequence_number`,
`pryzm.event.type`, `pryzm.events.page.size`.

OTel exporter env follows ADR-007.  No service-specific config.

## 7. Configuration

| Env var            | Default     | Effect |
| ------------------ | ----------- | ------ |
| `SYNC_PORT`        | `4000`      | HTTP+WS listen port. |
| `SYNC_EVENT_LOG`   | `memory`    | `memory` or `pg`. |
| `DATABASE_URL`     | _(unset)_   | Required when `SYNC_EVENT_LOG=pg`. |
| `BAKE_URL`         | _(unset)_   | When set, `HttpBakeEnqueuer` POSTs `${BAKE_URL}/enqueue`.  When unset, `NoopBakeEnqueuer` is used. |
| `BAKE_ENQUEUE_TIMEOUT_MS` | `3000` | HTTP enqueue timeout. |

`createSyncServer({ overrides })` accepts the same shape
programmatically — used by tests and the bench.

## 8. Health

```
GET /health
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "uptimeMs": 1234567,
  "sessions":  { "sessions": 2, "projects": 1 },
  "log":       { "selection": "memory" },
  "bake":      { "selection": "noop" }
}
```

`status` is `"ok"` when the WS server is accepting connections AND
the EventLog backend is responsive (the `pg` backend issues a
`SELECT 1` on every `/health`; `memory` returns synchronously).

## 9. CDE legacy commands

Three event types are validated server-side and passed through the
log unchanged:

- `cde.linkDocument` — attach a document (drawing, spec, RFI) to a
  project or to a specific element.  Payload:
  `{ documentId, documentName, mimeType, sizeBytes, sha256, attachedToElementId? }`.
- `cde.issueComment` — post a comment to an issue (or reply to one).
  Payload: `{ issueId, commentId, body, parentCommentId?, mentions? }`.
- `cde.markupCreate` — create a markup pin (cloud, callout, redline)
  on a view.  Payload:
  `{ markupId, viewId, kind, geometry, color, label?, attachedToElementId? }`.

Validators live in
[`apps/sync-server/src/cde/index.ts`](../../apps/sync-server/src/cde/index.ts)
and reject malformed events **before** the log accepts them.  Once
the editor consumes these (S25), the validators move to
`@pryzm/schemas` and the sync-server imports them.

## 10. What this server is NOT

- **Not a CRDT.**  v0 ships LWW.  Yjs lands in Phase 2D (S43).
- **Not a multi-instance fan-out.**  v0 holds the session map in
  memory.  Redis Pub/Sub lands in Phase 2D (S46).
- **Not a presence service.**  Cursors, selections, "X is editing Y"
  are out of scope until S26.
- **Not the auth boundary.**  v0 trusts the WS query string; signed
  JWTs land in S38.

## 11. Verification matrix

See ADR-0019 §5 for the full list.  Summary:

- 8 test files in `apps/sync-server/__tests__/` — 75 unit + 4
  integration tests, all green.
- 1 bench file in `apps/bench/src/benches/sync-roundtrip.bench.ts` —
  measures end-to-end client A append → client B `event.push` over
  real `ws` sockets, hard-fails CI > 250 ms p95.

Run locally:

```bash
npm test --workspace=@pryzm/sync-server
npm run bench --workspace=@pryzm/bench -- src/benches/sync-roundtrip.bench.ts
```
