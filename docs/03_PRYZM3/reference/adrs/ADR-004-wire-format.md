# ADR-004 — Wire Format

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-004 |
| Required by | Sprint S01 (Phase 1A start — first event written) |
| Owner | Architecture lead |
| Implementation | `packages/wire/` (encode/decode). Used by `packages/event-log/`, `apps/sync-server/`, `apps/bake-worker/`. |
| Spec dependency | `SPEC-02-PERSISTENCE.md` §2, `SPEC-03-SYNC-CRDT.md` §2 |

---

## Context

The PRYZM event stream (per ADR-002) is the canonical persistence + audit + undo + public-API + `.pryzm`-file format. It needs:

- Compact binary representation (avoiding JSON's bloat for high-volume edits).
- Fast encode/decode in **both** browser and Node (the bake-worker and sync-server replay events).
- Schema-less in transport (so plugin authors can add element families without coordinating server upgrades) but typed at the boundary (Zod schemas in `packages/schemas/`).
- Ext types so we can carry binary geometry blobs without base64 inflation.
- Deterministic encoding for content-addressed hashing (chunk SHA, snapshot integrity).

The Yjs update stream is a separate byte stream (per ADR-002) and is **not** governed by this ADR.

---

## Decision

**MessagePack via [`msgpackr`](https://github.com/kriszyp/msgpackr).**

- Library: `msgpackr` (BSD-3, ~30 KiB browser bundle).
- One canonical `Encoder` and `Decoder` instance per process, shared across the codebase.
- Structures: enabled (msgpackr's record-shape compression). Structures are pre-registered for the high-frequency event shapes (`Wall.create.v1`, `Wall.update.v1`, `Door.create.v1`, …) at boot to maximise compression and lock the wire schema.
- Ext types reserved:
  - `0x01` — `ULID` (16 bytes raw).
  - `0x02` — `BufferGeometryDescriptor.indices` (Uint32Array tagged).
  - `0x03` — `BufferGeometryDescriptor.positions` (Float32Array tagged).
  - `0x04` — `Date` (ISO-8601 string fallback if missing).
- Determinism: `useRecords: true`, `mapsAsObjects: false`, structure ID set explicitly. Encoded bytes for the same logical event are byte-identical across Node and browser; asserted by `packages/wire/__tests__/determinism.test.ts`.

### Event envelope

Every wire-level event uses the same envelope:

```ts
type WireEvent = {
  ulid: ULID,            // 26-char canonical, encoded as ext 0x01
  type: string,          // 'wall.create.v1' etc
  actorId: ActorId,
  projectId: ProjectId,
  ts: number,            // ms since epoch (Lamport-augmented at L3)
  payload: unknown,      // Zod-validated at the boundary
  meta?: { causedBy?: ULID, batchId?: ULID, source?: 'user'|'ai'|'plugin'|'system' },
};
```

### Schema versioning
- Event `type` carries an explicit version suffix (`.v1`, `.v2`).
- Migrations live in `packages/event-migrations/`; per SPEC-02 §3.
- A v2 event's `payload` is upgraded on read; the original v1 bytes are preserved in the event log for audit.

### Size targets (CI gate, P8)
- Median event encoded size: ≤ 256 B.
- p95 event encoded size: ≤ 1 KiB.
- Geometry-bearing event (chunked separately): payload ≤ 64 KiB after structure compression; larger payloads MUST go via R2 reference, not inline.

---

## Consequences

**Positive:**
- ~5× smaller than JSON for our event mix (measured on Pascal historical traces).
- Zero-allocation decode of high-frequency events (msgpackr structures hit a hot path).
- Binary geometry rides natively (no base64).
- Same encoder in Node + browser; deterministic bytes; hashable for content-address.

**Negative:**
- Not human-readable. Diagnostics must decode to JSON for inspection (a `wire-debug` CLI ships in `packages/wire/bin/`).
- Schema discipline required: structures registered globally; new event shapes need a structure registration step (handled by `defineEvent()` helper).
- msgpackr is a single-maintainer-leaning project; mitigated by lock-step pinning + a vendor copy in `packages/wire/vendor/` that we can fork if needed.

---

## Alternatives considered

### JSON
- Rejected: 4–6× larger; no native binary; no determinism guarantee in the JS spec.

### CBOR (`cbor-x`)
- Rejected: similar size to MessagePack but smaller community; no record-shape compression; tagged ext types more verbose.

### Protocol Buffers
- Rejected: schema-coupled wire format works against the open plugin model (D4); adding a new element family would require regenerating proto descriptors everywhere.

### FlatBuffers / Cap'n Proto
- Rejected: zero-copy access is not a bottleneck for us (the bottleneck is the geometry kernel, not parsing). Schema rigidity is the same problem as Protobuf.

### Custom binary format
- Rejected: maintenance cost dwarfs the marginal compression win.

---

## Phase rollout
- S01 — `packages/wire/` lands with msgpackr + structure registry.
- S02 — `defineEvent()` helper in use; first event types registered (`wall.*`).
- S04 — determinism CI gate active (warning).
- S08 — determinism CI gate at error level; size budgets enforced.
- S22 (M12 alpha) — `wire-debug` CLI ships; structure registry stable.
- S48 (M24 beta) — schema migration framework in place; first `.v2` event landed end-to-end.
- S72 (M36 GA) — wire format frozen for v1; future shape additions require a structure-registry version bump and a documented migration.
