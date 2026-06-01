# Chunked Persistence (S19) — `packages/persistence-client/src/chunks/`

| Field | Value |
|---|---|
| Status | Active — S19 deliverable |
| Date | 2026-04-27 |
| Phase | 1D (Q4) |
| Spec | `docs/03-execution/plans/legacy/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S19 |
| Strategic ADRs | ADR-003 (object storage), ADR-013 (persistence operational) |
| Spec | `docs/03-execution/specs/SPEC-02-PERSISTENCE.md` |

---

## What S19 Delivers

S19 introduces a **second** persistence tier alongside the L0 event log:

| Tier | What | Where | When |
|---|---|---|---|
| Event log (S03/S04) | Append-only commands, MessagePack v2, ULID-keyed | IndexedDB (browser) / Postgres (server) | Source of truth |
| **Chunk store (S19)** | **Baked geometry as `.glb` bytes, content-addressed by SHA-256** | **IndexedDB (S19) → R2 / MinIO (S21)** | **Cache** |

The chunk store is what makes a cold reload of the medium fixture finish in **< 1.5 s** (S19 exit gate).  Without it, every reload re-runs every event through the kernel — that path is O(events) and breaks at the medium fixture's 2,500-wall scale.

## File Layout

```
packages/persistence-client/src/
├── manifest.ts                 # Zod schema — FROZEN by S19 D5 interface lock
├── codec/
│   ├── draco.ts                # Lazy WASM singleton — geometry compression
│   ├── meshopt.ts              # Lazy WASM singleton — index/vertex reorder
│   └── ktx2.ts                 # Stub (Phase 2 turns it on)
└── chunks/
    ├── ChunkWriter.ts          # geometry IRs → .glb bytes + SHA-256 hash
    ├── ChunkReader.ts          # .glb bytes → geometry IRs (per-element via extras)
    └── index.ts
```

## The Frozen Interface (S19 D5)

`ChunkEntry` and `Manifest` are LOCKED.  The S20 `pack.ts` and S21 bake worker both consume these shapes — breaking changes require bumping `schemaVersion` to 2 and adding a `0 → 1 → 2` migration (`packages/file-format/migrations/`, S20 D4).

```ts
interface ChunkEntry {
  levelId: string;
  version: number;          // monotonic per level; diagnostics-only
  hash: string;             // SHA-256 hex of the .glb bytes (64 char)
  byteLength: number;
  elementIds: string[];     // populated on write; lets ChunkReader skip the extras scan
  createdAt: string;        // ISO-8601
}
```

**Content-addressing**: two levels with identical geometry (e.g. floors 4 + 5 of a hotel) share one chunk file because their `.glb` bytes are byte-identical → identical SHA-256 → one row in the chunk store.

## Chunk Format (`.glb`)

We use **glTF 2.0 binary** (`.glb`) as the chunk container, written via `@gltf-transform/core`:

1. One `Document`, one `Scene` per chunk.
2. One `Mesh`/`Primitive` per element.
3. `extras = { sourceId, materialId, hash }` on every primitive — the `ChunkReader` rebuilds the `elementId → THREE.Object3D` map by reading these.  Extras live in the JSON portion of GLB and survive Draco compression (which only compresses the binary buffer).
4. Compression transforms applied in order: **Draco** (geometry quantization: pos = 14 bits, normal = 10 bits, uv = 12 bits) → **Meshopt** (vertex/index reorder + secondary quantization).
5. KTX2 stub for textures (Phase 2 enables it).

### Why Draco + Meshopt and not just one?

Draco quantizes per-attribute (great for positions); Meshopt reorders for cache + adds a second pass on smaller indices.  In a 50-wall floor benchmark target ≥ 50 % size reduction vs raw `Float32Array`.  Bench harness: `apps/bench/src/benches/produce-wall.bench.ts` (existing) measures geometry size; new bench `apps/bench/src/benches/load-large.bench.ts` (S19 D3 skeleton) measures cold-load time on the 5,000-wall fixture.

### Lazy WASM singletons

Both Draco and Meshopt ship as WASM (Draco ≈ 600 KB encoder, Meshopt ≈ 200 KB).  S19 exit gate (line 409): codec libs add **< 200 KB gzip** to the initial bundle.  Implementation: each codec is loaded via dynamic `import('draco3d')` / `import('meshoptimizer')` inside a singleton getter; main bundle stays codec-free until the first chunk is read or written.

## Storage Backends

S19 writes chunks into **IndexedDB** alongside the event log (a new object store, `chunks`, with key = SHA-256 hex).  S21 introduces the storage driver abstraction (ADR-003): the bake worker writes to **R2** (PRYZM-hosted) or **MinIO** (self-host).  The driver interface lives in `packages/object-store/` (created in S21).

S19 design choice: the IndexedDB chunk store is intentionally NOT pluggable yet — exposing the storage driver too early would over-fit the API to the S19 single-writer use case.  The driver lands when there are two writers (editor + bake worker), in S21.

## Cold-Load Path (S19 → S23)

```
1. Loader fetches manifest.json   (< 100 ms — Tier 1)
2. Loader picks the visible level
3. Loader reads chunks/<latestChunkHash>.glb from IndexedDB
4. ChunkReader decodes → geometry descriptors → committer → THREE.Scene
5. First interactive!             (< 1.5 s p95 on medium fixture, S19 gate)
6. Background levels stream in    (Tier 3 — full impl S23)
```

Today (S19 D8) the loader does steps 1–5 synchronously; tier-streaming (step 6 deferred + parallel) lands in S23 with `packages/persistence-client/loader.ts`.

## OTel Spans

| Span | Attributes |
|---|---|
| `pryzm.chunks.write` | `projectId`, `levelId`, `elementCount`, `byteLength`, `hash`, `durationMs` |
| `pryzm.chunks.read` | `projectId`, `levelId`, `hash`, `byteLength`, `elementCount`, `durationMs` |
| `pryzm.chunks.codec.draco` | `direction (encode|decode)`, `byteLengthBefore`, `byteLengthAfter`, `durationMs` |
| `pryzm.chunks.codec.meshopt` | `direction`, `byteLengthBefore`, `byteLengthAfter`, `durationMs` |

(Codec spans wrap the dynamic-import singleton call too — first call is slower because of WASM init; subsequent calls reuse the singleton.)

## Conflict Resolution

SPEC-02 §6.3 keys chunks per `(projectId, elementId, analyticHash, lod)`.  PHASE-1D §S19 (line 332) supersedes with chunk-level keys per `(projectId, hash)` — multiple elements per chunk, one chunk per `(level, version)`.  This change reflects what we learned from the medium-fixture profile (S19 D4): per-element chunks would mean ~2,500 R2 round-trips on cold-load, which is worse than the IndexedDB scenario.  The per-element analytic hash is preserved INSIDE the chunk's primitive `extras` so element-level caching still works during the bake worker's incremental rebake.

The PHASE-1D design is canonical for the v1 chunk format; SPEC-02 §6.3 is updated by reference to PHASE-1D §S19 — no SPEC-02 edit is required for v1 (the SPEC-02 wording remains correct as a higher-level model).

## What S19 Does NOT Ship

- **R2 / MinIO storage driver** — S21 (`packages/object-store/`).
- **`.pryzm` ZIP packing** — S20 (`packages/file-format/pack.ts`).
- **Tier-streamed loader** — S23 (`packages/persistence-client/loader.ts`).
- **Sync server integration** — S22 (`apps/sync-server/`).
- **Editor save-path wiring** — feature-flagged in S19 D7; full integration with the bake worker is S24.
