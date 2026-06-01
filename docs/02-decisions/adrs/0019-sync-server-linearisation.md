# ADR-0019 — Sync-server linearisation, broadcast, and bake hand-off

- **Status**: Accepted
- **Date**: 2026-04-27
- **Phase**: 1D — `Q4 — M10-M12 BAKE & PRYZM ALPHA`, sprint **S22**
- **Spec source**: `docs/03_PRYZM3/reference/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
  §S22 (lines 888-1078)
- **Implementation**: `apps/sync-server/`
- **Architecture doc**: `docs/architecture/sync-server.md`
- **Bench gate**: `apps/bench/src/benches/sync-roundtrip.bench.ts`
  (`sync.roundtrip.append-to-push`, **hard-fail > 250 ms p95**)
- **Related ADRs**: ADR-002 (CRDT ↔ event-log bridge), ADR-010 (bake
  debounce), ADR-018 (`.pryzm` ZIP envelope)

## 1. Context

PRYZM 2 is multi-user from day one.  Two browsers — a Pascal seat in
Sao Paulo and a Crow seat in Lisbon — must observe the **same** project
state with the **same** event ordering, even when both edit the same
wall in the same second.

PRYZM 1 punted: it had a per-tab IndexedDB log, a `socket.io` "broadcast
my last command" channel, and **no** server-side ordering.  A
late-arriving event from one tab could displace an earlier event in
another tab, which is how PRYZM 1 produced the "ghost wall" bug
(P1-2117) that we never managed to root-cause in production.

S22 introduces `apps/sync-server` — a tiny WebSocket server that does
exactly four things:

1. **Linearises** every CommandEvent into a monotonic, gap-free,
   per-project sequence number.
2. **Broadcasts** the sequenced event to all subscribers of that
   project (including the originator, so the originator sees its own
   `sequenceNumber`).
3. **Acks** the originator with `{ id, sequenceNumber }`.
4. **Fire-and-forget enqueues** a bake job for the affected level via
   `BakeEnqueuer` (HTTP for prod, in-process for tests, noop for dev).

It also serves a `LoadEvents` page-fetch (default 500 events/page) so a
reconnecting client can catch up cheaply, and a `/health` endpoint for
ops.

Out of scope here:

- **CRDT semantics** — ADR-002 deferred Yjs to Phase 2D (S43).  Today
  v0 ships **last-writer-wins** at the event level: if two clients both
  set `wall.color = "red"` and `"blue"` at the same wall-clock time,
  the one whose event reaches the server first wins, and the loser sees
  the winning event arrive after its own.  This is not "merge"; it is
  "linearise + replay".
- **Multi-instance scale-out** — v0 holds the session map and the
  in-memory event log in one Node process.  Phase 2D (S46) adds Redis
  Pub/Sub for cross-instance fan-out.

## 2. Decision

### 2.1 Wire format

JSON over WebSocket.  No protobuf, no MessagePack on the wire — the
binary cost is in the **chunks** (ADR-018), not the events.  The per-
event payload is a few hundred bytes and JSON keeps the protocol
debuggable from a browser DevTools panel.

| Direction | `type`                | Purpose |
| --------- | --------------------- | ------- |
| `→ srv`   | `project.subscribe`   | Join a project room.  Optional `fromSeq` triggers an `events.page` catch-up. |
| `→ srv`   | `event.append`        | Submit an event.  Server assigns `sequenceNumber`. |
| `→ srv`   | `events.load`         | Page-fetch events `> fromSeq`, up to `limit` (default 500). |
| `srv →`   | `session.opened`      | First message after WS upgrade — confirms `clientId`/`userId`. |
| `srv →`   | `project.subscribed`  | Ack for `project.subscribe`; carries `latestSeq`. |
| `srv →`   | `event.ack`           | Ack for `event.append`; carries `id` + `sequenceNumber`. |
| `srv →`   | `event.push`          | Broadcast — fan-out of an event to every subscriber. |
| `srv →`   | `events.page`         | Page-fetch response. |
| `srv →`   | `error`               | Validation / protocol failure.  `code` ∈ enum. |

Auth in v0 is `clientId` + `userId` from the WS query string.  This is
**not** a security boundary — Phase 2 (S38) replaces it with signed
JWTs from the auth-server.  ADR-021 (enterprise security) tracks the
upgrade.

### 2.2 Linearisation

The server holds an `EventLog` interface (`apps/sync-server/src/eventLog/`)
with two implementations:

- **`InMemoryEventLog`** — default; used by tests, dev, and Replit.
  Per-project chained-promise mutex serialises `append` calls; the
  next sequence number is `events.length + 1`.  ULID dedup is a
  linear scan (cheap at thousands of events; we will swap for a Set
  when we wire the per-project size cap in S24).

- **`PgEventLog`** — gated by `SYNC_EVENT_LOG=pg` + `DATABASE_URL`.
  Hashes the projectId via FNV-1a to a 32-bit advisory-lock key,
  takes a `pg_advisory_xact_lock`, computes `MAX(sequence_number) + 1`,
  and `INSERT … ON CONFLICT (id) DO NOTHING` for dedup.  The
  advisory lock is released automatically at COMMIT.

Both implementations satisfy the same contract:

> For any two `append(p, eventA)` and `append(p, eventB)` calls that
> overlap in wall-clock time, the server returns sequence numbers
> `nA != nB`, and **every** subscriber observes them in `(nA, nB)`
> order — i.e. there is exactly one global order per project, and
> every observer agrees on it.

We did NOT use a process-global mutex (that would serialise *all*
projects on a single bus), and we did NOT use a Postgres SERIAL
sequence (that would be globally monotonic and would force one rebake
per global tick).  Per-project locks are the smallest unit that makes
the bake-debounce window in ADR-010 work cleanly.

### 2.3 Broadcast

`SessionManager` keeps two indexes:

- `byClientId : Map<ClientId, Session>`
- `byProject  : Map<ProjectId, Set<Session>>`

`broadcast(projectId, msg)` iterates the per-project set and calls
`ws.send(JSON.stringify(msg))` on every `OPEN` socket.  Closed sockets
are reaped on the `'close'` event.

We send to **every** subscriber including the originator.  The
alternative — "ack the sender, push to others" — would force the
sender to invent its own `sequenceNumber` for optimistic local apply,
and would break the invariant that `event.push` is the single source
of truth for "this event has a real sequence number now".  See
`docs/architecture/sync-server.md` §3.3 for the client-side
implications.

### 2.4 Bake hand-off

After `log.append` succeeds and **before** the response goes out, we
call `bakeEnqueuer.enqueue({ projectId, levelId })` from a
`queueMicrotask` — fire-and-forget.  Failures are logged via the OTel
`pryzm.sync.broadcast` span but **never** propagated back to the
client.  The contract is:

> A successful `event.ack` means "your event is in the log and every
> connected peer has been told about it."  It does NOT mean "the bake
> has happened" — the bake is async, debounced (ADR-010), and observed
> via a separate `chunk.updated` event in S23.

Three implementations satisfy `BakeEnqueuer`:

| Impl                         | Selected when                | Used by |
| ---------------------------- | ---------------------------- | ------- |
| `NoopBakeEnqueuer`           | `BAKE_URL` unset (default)   | Replit, dev, tests that don't care |
| `HttpBakeEnqueuer`           | `BAKE_URL` set               | Production: POSTs to `BAKE_URL/enqueue` |
| `InProcessBakeEnqueuer`      | Manually wired in a test     | `__tests__/AppendEvent.test.ts` |

### 2.5 OpenTelemetry

Four spans, all under the `pryzm.sync.*` namespace:

- `pryzm.sync.append`   — wraps the whole `event.append` handler.
- `pryzm.sync.sequence` — wraps the `EventLog.append` call (the
  linearisation cost).
- `pryzm.sync.broadcast` — wraps the `SessionManager.broadcast` call.
- `pryzm.sync.load`     — wraps the `events.load` handler.

Each span carries `pryzm.project_id`, `pryzm.client_id`, `pryzm.user_id`,
and where applicable `pryzm.event.sequence_number` and
`pryzm.event.type` as attributes.  The OTel exporter is configured
via the same env vars as the rest of PRYZM 2 (ADR-007); the sync-server
adds nothing service-specific.

### 2.6 CDE legacy commands

PRYZM 1 had a thin BIM-collaboration layer ("CDE", common data
environment): document linking, issue threading, markup pins.  S22
re-introduces them as **typed event payloads** validated by the same
sync-server pipeline:

- `cde.linkDocument` — `{ documentId, documentName, mimeType, sizeBytes, sha256, attachedToElementId? }`
- `cde.issueComment` — `{ issueId, commentId, body, parentCommentId?, mentions? }`
- `cde.markupCreate` — `{ markupId, viewId, kind, geometry, color, label?, attachedToElementId? }`

The validators (`apps/sync-server/src/cde/index.ts`) reject malformed
events **before** `EventLog.append` so the log never holds invalid CDE
payloads.  These types are intentionally NOT in `@pryzm/schemas` yet —
they will move there in S25 once the editor consumes them, at which
point the sync-server will import them.

## 3. Alternatives considered

### 3.1 Reuse PRYZM 1's `socket.io` server

Rejected.  PRYZM 1's server is a thin pass-through; it does not
linearise and it shares state with the editor via shared modules.
Lifting it into PRYZM 2 would mean inheriting the "ghost wall" bug.

### 3.2 Yjs CRDT today

Considered and **deferred**.  Yjs gives us proper merge semantics
(both edits land, both clients see the same merged state) and removes
the need for server linearisation entirely.  But:

- Yjs document loading requires the **whole** doc, which clashes with
  the chunk-streaming model (ADR-018).  The Yjs ↔ event-log bridge
  (ADR-002) is non-trivial and not yet specified.
- Yjs over WS is its own protocol with its own awareness layer; we
  would need to stand it up, secure it, and gate it behind feature
  flags — none of which fits in S22's budget.
- LWW is sufficient for the M10-M12 alpha because the alpha targets
  single-user-at-a-time editing with multi-user **viewing**.  The
  "two users edit the same wall in the same second" case is rare in
  practice and produces an obvious "your edit lost" message; this is
  acceptable for alpha.

We will revisit in Phase 2D (S43).

### 3.3 Postgres `LISTEN`/`NOTIFY` for fan-out

Rejected for v0 because we have one Node instance.  Will be revisited
when we scale out (Phase 2D, S46) — most likely we will pick Redis
Pub/Sub over `NOTIFY` because Redis is already in the stack for the
bake-worker's BullMQ queue (S21).

### 3.4 Globally monotonic `sequenceNumber`

Rejected.  A SERIAL sequence forces every project's bake to share the
same tick, which defeats the per-project debounce in ADR-010.  Per-
project sequences also keep the integer small (a single project will
never see > 10⁹ events), which matters for client-side storage in
IndexedDB.

## 4. Consequences

### 4.1 Positive

- **One global order per project**, observed identically by every
  client.  The "ghost wall" class of bug is structurally impossible.
- **The bake worker can trust the event ordering** — it consumes
  events in `sequenceNumber` order and produces deterministic chunks
  (per ADR-018 §3).
- **Reconnect is cheap** — `project.subscribe` with `fromSeq` returns
  a single `events.page` of up to 500 events; for projects with more
  than 500 missed events the client paginates.
- **Postgres is optional** — `SYNC_EVENT_LOG=memory` (default) lets
  every contributor run the full stack with zero infrastructure.
- **CDE payloads are validated server-side** — the editor cannot
  push a malformed `markup.create` because the sync-server rejects it
  before the log accepts it.

### 4.2 Negative

- **No merge semantics** — concurrent edits to the same field LWW.
  Mitigated by alpha targeting single-user-at-a-time editing; will be
  fixed by Yjs in Phase 2D.
- **Single-instance** — one Node process holds the session map.  A
  process restart drops every connection (clients reconnect with
  `fromSeq` so no events are lost, but the ~200 ms reconnect blip is
  visible).  Multi-instance lands in Phase 2D (S46).
- **JSON wire format is verbose** — a `wall.create` message is ~500
  bytes vs ~150 for MessagePack.  At alpha event rates (peak ~10
  events/sec/project) this is a rounding error on bandwidth; we will
  revisit if/when we hit 100+ events/sec.
- **Auth is trust-the-query-string** — explicitly v0; ADR-021 tracks
  the JWT upgrade.

### 4.3 Mitigations

- **Postgres advisory locks** — for the `pg` backend, the per-project
  lock is held only across the single `INSERT` and is released at
  COMMIT.  No risk of cross-request leaks.
- **Bake-enqueue failures are logged, not propagated** — a transient
  bake-worker outage does NOT block edits.  The bake worker re-derives
  on next event arrival because chunks are content-addressed
  (ADR-018 §2.1).
- **Reconnect race** — clients send `project.subscribe { fromSeq }`
  on reconnect.  The server replays everything `> fromSeq` from the
  log; new events that arrive **during** the replay are buffered by
  the broadcast and delivered after the page (the server holds the
  per-project mutex for the duration of the page-fetch — see
  `apps/sync-server/__tests__/Reconnect.test.ts`).

## 5. Verification

| Concern | Where it's tested |
| ------- | ----------------- |
| Per-project monotonic sequence (in-memory) | `apps/sync-server/__tests__/EventLog.test.ts` |
| Per-project monotonic sequence (Postgres, with stub `Pool`) | `apps/sync-server/__tests__/PgEventLog.test.ts` |
| Wire-format parser round-trip | `apps/sync-server/__tests__/Protocol.test.ts` |
| Subscribe → broadcast → push fan-out | `apps/sync-server/__tests__/SessionManager.test.ts` |
| `event.append` happy path + dedup + bake enqueue | `apps/sync-server/__tests__/AppendEvent.test.ts` |
| Reconnect with `fromSeq` triggers `events.page` | `apps/sync-server/__tests__/Reconnect.test.ts` |
| CDE payload validation rejects malformed | `apps/sync-server/__tests__/Cde.test.ts` |
| Two-client roundtrip end-to-end on real `ws` | `apps/sync-server/__tests__/Roundtrip.test.ts` |
| **Latency budget < 250 ms p95** | `apps/bench/src/benches/sync-roundtrip.bench.ts` |

S22 exit criterion #4 ("round-trip latency < 250 ms p95 on localhost")
is the hard CI gate — `apps/bench/baseline.json` carries
`sync.roundtrip.append-to-push` with `hardFail: true`.

## 6. Open questions deferred to future sprints

- **S23**: server-emitted `chunk.updated` event so the editor knows
  when a baked chunk is ready (today the editor polls the manifest).
- **S24**: per-project event-log size cap and cold-event compaction.
- **S38**: replace query-string auth with signed JWTs from the
  auth-server (ADR-021).
- **S43**: Yjs CRDT replacing LWW; ADR-002 will be amended.
- **S46**: Redis Pub/Sub for cross-instance fan-out.
