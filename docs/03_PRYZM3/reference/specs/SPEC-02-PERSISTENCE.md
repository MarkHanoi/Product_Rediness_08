# SPEC-02 — Persistence (L0) & `.pryzm` File Format

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B2` |
| Phases | 1A (event log), 1D (.pryzm v1, bake), 2D (sync hardening), 3D (GA hardening) |
| Required ADRs | ADR-013 (persistence operational semantics) |

> L0 is the durable substrate. Three artefacts: the **event log** (append-only, MessagePack, source of truth), the **chunk store** (per-element baked `glb`s on R2), and the **`.pryzm` ZIP** (portable file format = the union of both). This spec defines compaction, schema migration, idempotency, multi-region consistency, and the streaming-read protocol.

---

## §1 Storage tiers

| Tier | Backend | Purpose | Consistency |
|---|---|---|---|
| **Event log** | Postgres (`events` table, partitioned by project_id and sprint of created_at) | Source of truth: every command is one row. | Strongly consistent; serial within (project_id, sequence). |
| **Chunk store** | R2 (or S3-compatible) | Baked geometry: per-element `glb` chunks at multiple LODs. | Eventually consistent (R2 SLA) — see §5. |
| **Cold archive** | R2 Glacier-equivalent | Compacted snapshots of inactive projects. | Archive — load = warm-up + replay. |
| **Local cache** | IndexedDB | Browser-side mirror of recent events + chunks. | Last-known-good; replaced on Yjs reconciliation. |

---

## §2 Event log schema

### §2.1 Postgres table (additive on existing `02-ORCHESTRATION` schema)

```sql
CREATE TABLE events (
  project_id    UUID         NOT NULL,
  sequence      BIGINT       NOT NULL,        -- monotonic per project
  ulid          CHAR(26)     NOT NULL UNIQUE, -- monotonic across projects
  actor_id      UUID         NOT NULL,
  actor_kind    TEXT         NOT NULL CHECK (actor_kind IN ('human','ai','system','migration')),
  command_id    TEXT         NOT NULL,        -- e.g. 'wall.create.v1'
  payload_codec TEXT         NOT NULL CHECK (payload_codec IN ('msgpack','msgpack+zstd')),
  payload       BYTEA        NOT NULL,
  parent_ulid   CHAR(26),                      -- for causal threads (AI-generated batches)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, sequence)
);
CREATE INDEX events_by_ulid ON events (ulid);
CREATE INDEX events_by_project_time ON events (project_id, created_at);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- RLS policy: project member with read scope.
```

Per-row size budget: < 4 KB for >95% of events (typical command). Larger payloads (e.g. AI-generated batch of 200 wall creates) are split or chunked (§2.2).

### §2.2 Large payloads
Payloads > 64 KB are stored externally:
- The `payload` column carries a header `{ kind: 'external', ref: 'r2://events-large/<sha256>' }`.
- The blob is written to R2 first, then the row inserted (so a successful row guarantees the blob exists).

---

## §3 Compaction (closes B2 gap "no compaction policy")

### §3.1 Trigger conditions
A project is compacted when **any** of:
- Event count > 500,000.
- Compressed event-log size > 1 GiB.
- Last compaction > 90 days ago AND event count > 100,000.
- Manual trigger by project owner ("Optimise project").

### §3.2 Compaction algorithm
1. Take a project-wide read advisory lock (no new commits accepted for the duration; typically < 30 s).
2. Replay the entire event log into projections (kernel + L1 stores).
3. Materialise a **snapshot event** `__snapshot.v1` whose payload is the current full L1 state, MessagePack-encoded with zstd.
4. Insert the snapshot event at the next sequence number with `actor_kind='system'`.
5. Mark all events with `sequence < snapshot.sequence` as compactable in `events_compaction` table.
6. Move compactable events to `events_archive` partition (separate physical table; same RLS).
7. Release lock.

### §3.3 Loading after compaction
- Loader requests "events from sequence S onwards."
- If S < latest snapshot's sequence, loader reads the snapshot first, then events from `snapshot.sequence + 1`.
- If S >= latest snapshot's sequence, loader reads only the events.
- Archive events are reachable for audit but not used for normal load.

### §3.4 What compaction is not
- Not deletion. Archive events are retained for 7 years (audit + legal).
- Not destructive. The snapshot is one event; reverting a project past the snapshot replays from archive.
- Not automatic on small projects. Below the §3.1 thresholds, compaction is suppressed.

---

## §4 Schema migrations (closes B2 gap "no schema migration story")

### §4.1 Two version dimensions
- **Manifest schema** — overall `.pryzm` ZIP layout. Version field in `manifest.json`.
- **Event payload schema** — per command, e.g. `wall.create.v1` vs `wall.create.v2`.

### §4.2 Migration rule
- Every event payload carries the command_id with explicit version: `'wall.create.v1'`.
- Migrations live forever in `packages/file-format/migrations/`.
- A v2 client encountering a v1 event MUST run the registered migration `wall.create.v1 → wall.create.v2` before applying.
- Migrations are pure functions `(oldPayload) => newPayload` and must be deterministic.
- Removing a migration is forbidden.

### §4.3 Re-bake requirement
A schema migration that changes geometry semantics (not just field renames) marks the project as **bake-stale**. On next open, the bake worker is invoked to regenerate `glb` chunks. The user sees a one-time "Optimising project" toast.

### §4.4 Migration registry
```ts
// packages/file-format/migrations/registry.ts
export const MIGRATIONS: Migration[] = [
  { from: 'wall.create.v1', to: 'wall.create.v2', migrate: walls_v1_to_v2, requiresRebake: false },
  { from: 'door.create.v1', to: 'door.create.v2', migrate: doors_v1_to_v2, requiresRebake: true },
  // ...
];
```

CI gate: any change to a payload schema requires either bumping its version AND adding a migration, or proving via lint that the change is purely additive (new optional field).

---

## §5 Multi-region consistency window (closes B2 gap "R2 ↔ Postgres consistency")

### §5.1 The gap
- Postgres commits are strongly consistent.
- R2 chunk writes are eventually consistent (R2 SLA: typically < 5 s, occasionally up to 60 s).
- An open question: when an event commits at T0 and the bake worker writes chunks at T0+200 ms, when does a different region's reader see those chunks?

### §5.2 The contract
- The event log is the source of truth. Chunks are a cache.
- Every event commit includes `chunkRefs[]` listing the R2 keys the bake worker will (or has) written.
- Readers requesting a chunk get a **303 See Other** with `Retry-After` if the chunk is not yet readable; the loader retries with exponential backoff (max 10 s total).
- If after 10 s the chunk is still unavailable, the loader **falls back to client-side baking** of that element using the kernel. This is slower but correct.

### §5.3 Region pinning
- Until M36 GA, R2 + Postgres are pinned to a single region (EU-West for EU customers, US-East for the rest).
- Multi-region replication is post-GA.

---

## §6 Bake worker (closes B2 gap "bake-worker idempotency")

### §6.1 Architecture
- `apps/bake-worker/` runs as a BullMQ consumer (Postgres-backed queue, no Redis required).
- One worker per project at any time (queue concurrency = 1 per project_id key).
- Workers are stateless; restart-safe.

### §6.2 Job model
A bake job is `{ project_id, fromSequence, toSequence }`. The worker:
1. Reads events `[fromSequence, toSequence]`.
2. Replays them into the projection cache (in-memory).
3. For each affected element, computes the display geometry via the kernel.
4. Writes `glb` chunks to R2 with content-addressable keys: `chunks/<projectId>/<elementId>/<analyticHash>/<lod>.glb`.
5. Writes a `chunk-manifest` event to the event log: `{ kind: 'system.bake-complete', chunkRefs: [...] }`.
6. ACKs the job.

### §6.3 Idempotency
- Content-addressable keys mean re-baking the same input writes the same bytes; clobber is safe.
- `chunk-manifest` events are idempotent: replaying the same one is a no-op for the loader.
- Partial-failure recovery: if the worker crashes between step 4 and step 5, the next run replays steps 4–5; the R2 writes are no-ops for already-existing keys.

### §6.4 Tier-streamed bake
- LOD 0 (proxy) is baked first and committed to the manifest first.
- LOD 1 (medium) and LOD 2 (full) bake asynchronously.
- The loader can render LOD 0 immediately; LOD 1/2 stream in.

---

## §7 `.pryzm` ZIP format (closes B2 gap "no signed-format spec, no streaming-read")

### §7.1 Layout

```
project.pryzm/                       (ZIP container)
├── manifest.json                    # MUST be the first entry; uncompressed; CRC32 in central directory
├── manifest.sig                     # OPTIONAL Ed25519 signature of manifest.json
├── events/
│   ├── 00000000.evt.bin             # MessagePack events, sequence-ordered chunks of ≤ 4 MiB
│   ├── 00000001.evt.bin
│   └── ...
├── chunks/
│   ├── <elementId>/<analyticHash>/<lod>.glb
│   └── ...
├── thumbnails/
│   ├── cover.webp                   # 1024 × 1024
│   ├── lod0.webp                    # 256 × 256
│   └── views/<viewId>.webp
└── signatures/
    └── chunks.sig                   # OPTIONAL signed list of chunk hashes
```

### §7.2 Manifest (the "first entry" rule)

```json
{
  "schemaVersion": 1,
  "pryzmVersion": "2.0.0",
  "projectId": "01HXYZ...",
  "createdAt": "2026-04-27T12:00:00Z",
  "creatorActorId": "01HXYZ...",
  "eventCount": 12450,
  "lastEventUlid": "01HXYZ...",
  "chunkManifest": "chunks.idx.json",
  "ifcMetadata": null,
  "minLoaderVersion": "2.0.0"
}
```

`manifest.json` MUST be the **first entry** in the ZIP. This enables a streaming reader to validate compatibility before downloading the rest. ZIP central directory still lives at the end (ZIP spec); the first-entry convention is a streaming-friendly producer convention.

### §7.3 Streaming-read protocol
A loader streaming from HTTP:
1. Range-requests bytes `[0, 64KiB)`. This contains the local-header for `manifest.json` (first entry) and its body.
2. Parses `manifest.json`, validates `minLoaderVersion`, `schemaVersion`.
3. Range-requests the central directory (last 64 KiB).
4. From the central directory, identifies the `events/00000000.evt.bin` offset.
5. Range-requests it. Begins replaying events.
6. As events touch elements, the loader requests the corresponding chunks (also via central-directory offsets).

**Why this works despite ZIP central directory being at the end:** the central directory is small (~tens of KiB even for thousands of entries) and a single Range request fetches it. The first-entry-is-manifest convention lets the loader make a compatibility decision before any large reads.

### §7.4 Open vs sealed
- Open `.pryzm`: writable; round-trips to PRYZM cloud unchanged; signature optional.
- Sealed `.pryzm`: signed by issuer (Ed25519); embedded `signatures/`. Loader rejects modifications. For compliance archive use.

### §7.5 IFC sidecar
- IFC import/export is via `plugins/ifc-import/` and `plugins/ifc-export/`.
- `.pryzm` MAY embed the original IFC at `.pryzm/imports/source.ifc.zst` for round-trip fidelity.
- `manifest.json.ifcMetadata` carries `{ schema: 'IFC4', source: 'imported|exported', sha256 }`.

---

## §8 Storage cost model (closes B2 gap "no storage cost ceiling")

### §8.1 Per-project budgets
| Tier | Free | Solo | Team | Enterprise |
|---|---|---|---|---|
| Active event-log size | 100 MiB | 1 GiB | 10 GiB | unlimited |
| Active chunk-store size | 500 MiB | 5 GiB | 50 GiB | unlimited |
| Archive retention | 30 days | 1 year | 7 years | configurable |
| Bake jobs / day | 50 | unlimited | unlimited | unlimited |

### §8.2 Garbage collection
- Chunks not referenced by the current `chunk-manifest` for > 7 days are deleted.
- Events older than the most recent snapshot are moved to archive (§3.2).
- Thumbnails older than the most recent view-bake are deleted.
- All deletes are logged; never destructive without 7-day grace.

### §8.3 Tiered storage
- Hot: chunks accessed in last 30 days → R2 standard.
- Warm: 30–180 days → R2 infrequent-access.
- Cold: > 180 days → R2 archive (60 s warm-up on first access).

---

## §9 RLS & isolation
- All Postgres tables (`events`, `events_archive`, `chunks_index`, `bake_jobs`) carry RLS.
- Service-role-key access is **forbidden** in client code (Contract 07 violation today; remediated by S08).
- Per-project R2 prefix isolation: `chunks/<projectId>/...`; signed URL TTL = 5 min.

---

## §10 OpenTelemetry instrumentation
- `persistence.event.append` — input `(projectId, commandId, payloadBytes)`; output `(sequence, durationMs)`.
- `persistence.event.read` — input `(projectId, fromSequence)`; output `(eventCount, bytesRead, durationMs)`.
- `persistence.chunk.write` — input `(projectId, elementId, lod, bytes)`; output `(durationMs, etag)`.
- `persistence.chunk.read` — input `(projectId, elementId, lod)`; output `(durationMs, bytesRead, cacheHit)`.
- `persistence.compaction.run` — input `(projectId, beforeEventCount, beforeBytes)`; output `(afterEventCount, afterBytes, durationMs)`.
- `persistence.bake.job` — input `(projectId, fromSequence, toSequence)`; output `(elementsBaked, chunksWritten, durationMs)`.

---

## §11 Cross-references
- Layer placement: `08-VISION §4` (L0).
- Wire format: `CONFLICT-ANALYSIS.md §3.4`.
- Phase deliverables: `phases/PHASE-1A` (event log), `phases/PHASE-1D` (.pryzm v1, bake worker).
- ADR: `adrs/ADR-013-persistence-operational.md`.
- Open conflict (Y.Doc bridge): `CONFLICT-ANALYSIS.md §6.1` and ADR-002.
