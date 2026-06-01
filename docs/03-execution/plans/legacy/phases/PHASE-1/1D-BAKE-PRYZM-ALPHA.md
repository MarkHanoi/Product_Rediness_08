# Phase 1D — Bake Worker, `.pryzm` Format & M12 Alpha Gate

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03-execution/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/02-decisions/adrs/` (the `[strategic ADR-001]`..`[strategic ADR-024]` collective range — individual files live as `adrs/ADR-NNN-<slug>.md`).
> 3. `docs/archive/pryzm3-internal/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03-execution/plans/legacy/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. **ADR citations**: bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `02-decisions/adrs/`, or fully-qualified `code-level ADR docs/02-decisions/adrs/NNNN-<slug>.md` for sprint-scoped decisions.
>
> **Sprint-scoped ADRs introduced in this document.** Phase 1D introduces **two sprint-scoped ADRs** whose canonical text lives in §4.1 / inline:
>
> | §4.1 heading | Code-level slug | Sprint |
> |---|---|---|
> | ADR-017 — `.pryzm` ZIP format v1 spec | `docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` | S20 |
> | ADR-018 — Tier-streamed loader strategy | `docs/02-decisions/adrs/0018-tier-streamed-loader.md` | S23 |
> | ADR-019 — Sync-server linearisation (LWW until 2D CRDT) | `docs/02-decisions/adrs/0019-sync-server-linearisation.md` | S22 |
>
> **Pre-existing strategic ADRs invoked** (no new sprint-scoped ADR is created in S21; the §4.1 entry "`[strategic ADR-010]` — Bake coalescing window" is **superseded** by `[strategic ADR-010]` 250 ms bake debounce, which is canonical):
>
> | Strategic ADR | Sprint(s) | What it governs |
> |---|---|---|
> | `[strategic ADR-002]` Yjs CRDT | Phase 2D (S43+) only | mentioned in S22 as "future work" |
> | `[strategic ADR-003]` Storage driver isolation | S19, S21 | every R2/MinIO call goes through `packages/storage-driver/` |
> | `[strategic ADR-004]` MessagePack codec | S20, S22 | wire format for events |
> | `[strategic ADR-005]` Worker-thread pool sizing | S21 | `os.cpus().length - 1` |
> | `[strategic ADR-010]` 250 ms bake debounce | S21 (canonical) | the coalescing window — replaces the old "`[strategic ADR-010]`" stub |
> | `[strategic ADR-018]` Capacity cut-list | All | scope-cut order under capacity pressure |
>
> **Numbering collision notes.**
> 1. Phase 1C drafted `code-level ADR 0017-headless-package-surface.md`. Phase 1D's `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` (`.pryzm` ZIP format v1) is a different decision; when both files materialize one will need a disambiguating slug (e.g., `0017a-...`).
> 2. The strategic series has both `[strategic ADR-018]` (capacity cut-list) and `[strategic ADR-019]` (cost & pricing). Phase 1D's sprint-scoped `0018-tier-streamed-loader.md` and `0019-sync-server-linearisation.md` live in the `docs/02-decisions/adrs/` namespace and do not collide with the strategic numbering — they collide only when text refers to "`code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md`" or "`code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md`" without qualification, which is exactly why the `[strategic …]` vs `code-level …` convention exists.

**§0.x SPECs binding Phase 1D**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-02 (Event log + chunk store) | §1–§3 chunk format; §5 bake debounce; §6 file-format addendum | S19, S20, S21, S23 |
| SPEC-09 (Plugin sandbox) | §3 sandbox (only as-of-S22 baseline) | S22 |
| SPEC-10 (Plugin manifest + capability surface) | All | All |

**§0.y Capacity envelope**

> **Capacity envelope (`[strategic ADR-018]`).** Phase 1D accepts the 6-sprint scope, with the M12 Alpha Gate as the hard exit. If sprint capacity is exhausted, the cut-list defined in `02-decisions/adrs/`code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md`-capacity-cut-list.md` is the ratified order. The first cut available in 1D is the Ed25519 signature in `.pryzm` v1 (already opt-in / off by default per S20 D5 decision); the second is reducing the tier-streamed loader to 2 tiers (manifest + visible-level only) and deferring background tier to Phase 2A. Defer items per the `[strategic ADR-018]` ranking — never improvise scope reductions.
## Q4 · Months 10–12 · Sprints S19–S24

> **Strategic anchor**: This document is subordinate to `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.
> Conflict order: `06-PRYZM-IDENTITY-AND-RECOUNT.md` + `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` → this doc.

---

## Executive Summary

**Sub-phase goal**: By end of M12, the **persistence-and-streaming spine stands up end-to-end**. Small, medium, and large fixtures all open through tier-streamed chunks plus event-log replay. The bake worker generates chunks server-side in < 1.5 s. The `.pryzm` portable ZIP format round-trips losslessly. The sync server linearises events and broadcasts them to connected clients. Every M12 ALPHA GATE performance bench is green. Sub-phase 1D closes Phase 1.

**Why 1D is the hardest sub-phase of Phase 1**: Sub-phases 1A–1C proved the architecture works. 1D proves the architecture performs — specifically that "PRYZM 2 opens in < 800 ms" is a fact backed by a reproducible CI bench, not a slogan. The four systems 1D must ship (chunked binary persistence, `.pryzm` ZIP format, server bake worker, tier-streamed loader) are each individually non-trivial. All four must be **operationally correct together** by S24. The integration sprint (S24) is the most important sprint in Phase 1, and the M12 gate is the most important quality gate in the entire 36-month plan.

**The compound risk**: every sprint in 1D has a performance gate that, if missed, triggers a halt. K1D-1 (S19), K1D-2 (S21), K1D-3 (S23), and K1D-4 (S24) form a cascade — if S19's gate fires and costs 2 weeks to fix, S24's integration window shrinks by 2 weeks. The mitigation is front-loading profiling: every sprint's D5 includes an explicit performance measurement before implementation is "done". Surprises at D9 are too late; surprises at D5 are recoverable.

**What 1D explicitly does NOT deliver**: CRDT / Yjs (Phase 2D), conflict resolution UI (Phase 2D), production R2 deployment infra (Phase 3D), customer migration (Phase 2D/3A), browser matrix beyond Chromium (Phase 3D), multi-tenant access control (Phase 3C). These are architectural non-goals for 1D — they are explicitly named in §7 to prevent scope creep.

---

## §0 Reading Conventions

**Team model**: 1 Founder (F) + 2 parallel agents (A, B). Solo execution: F alternates A/B roles or delegates mechanical work to Replit Agent.

**Sprint rhythm** (10 working days):
- **D1**: Kickoff (30 min) — ADR drafts assigned, performance budgets set, integration interfaces locked.
- **D2–D4**: Deep implementation.
- **D5**: Mid-sprint sync (1 h) — **mandatory performance measurement** in addition to integration review. No sprint exits without a D5 bench.
- **D6–D8**: Completion, tests, documentation.
- **D9**: Sprint demo + retro (1 h). Demos are recorded.
- **D10**: Buffer. If not consumed, pull next-sprint items forward.

**Branch model**:
- `agentA/sNN-<topic>` and `agentB/sNN-<topic>` branch from `pryzm2/main`.
- F reviews and merges via PR with CI green.
- No PR merges if: (a) any CI gate is red, (b) a bench regresses > 5%, (c) boundaries lint fails.

**Kill-switch discipline**: four kill-switches in 1D (K1D-1 through K1D-4). K1D-4 is the highest-severity gate in all of Phase 1 — it gates entry to Phase 2. Details per sprint.

---

## §1 Track Allocation for 1D

1D is the most server-heavy sub-phase. The track split is **client persistence + `.pryzm` portable format (Track A)** versus **server bake worker + tier-streamed loader (Track B)**. They synchronise at two integration interfaces: (1) the **chunk format** (both sides must agree on the binary layout of a `.glb` chunk before S21 starts) and (2) the **bake job protocol** (the payload shape of a `RebakeChunkJob` that A's sync server enqueues and B's bake worker consumes).

### Track A — Client Persistence + `.pryzm` Format (Agent A / Founder-A Role)

Responsible for: L0 client-side chunk read/write, codec wrappers (Draco/Meshopt/KTX2), `.pryzm` ZIP pack/unpack, migration framework, sync-server skeleton, event-log API.

| Item | First Sprint | Key Dependency |
|---|---|---|
| `packages/persistence-client/codec/draco.ts` | S19 | None |
| `packages/persistence-client/codec/meshopt.ts` | S19 | None |
| `packages/persistence-client/codec/ktx2.ts` | S19 | None |
| `packages/persistence-client/chunks/ChunkWriter.ts` | S19 | Draco/Meshopt/KTX2 codecs |
| `packages/persistence-client/chunks/ChunkReader.ts` | S19 | Draco/Meshopt/KTX2 codecs |
| `packages/persistence-client/manifest.ts` | S19 | ChunkWriter (schema) |
| `packages/file-format/pack.ts` | S20 | Manifest + ChunkWriter |
| `packages/file-format/unpack.ts` | S20 | Manifest + ChunkReader |
| `packages/file-format/migrations/` | S20 | `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` spec |
| `docs/04-reference/file-formats/pryzm-binary.md` | S20 | `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` |
| `apps/headless/cli/{pack,unpack}.ts` | S20 | `file-format/pack/unpack` |
| `apps/sync-server/index.ts` | S22 | Postgres connection, BullMQ |
| `apps/sync-server/db/schema.sql` | S22 | Postgres |
| `apps/sync-server/handlers/ConnectClient.ts` | S22 | WS + auth |
| `apps/sync-server/handlers/AppendEvent.ts` | S22 | EventLog + BullMQ enqueue |
| `apps/sync-server/handlers/LoadEvents.ts` | S22 | EventLog |
| `apps/sync-server/handlers/SubscribeProject.ts` | S22 | WS broadcast |
| `apps/bench/load-medium.ts` re-tune | S19 | Medium fixture chunks |
| `apps/bench/pack-unpack.ts` | S20 | `file-format/pack/unpack` |
| `apps/bench/sync-roundtrip.ts` | S22 | Sync server live |

### Track B — Bake Worker + Tier-Streamed Loader (Agent B / Founder-B Role)

Responsible for: `apps/bake-worker` (BullMQ consumer, `worker_threads`, `gltf-transform`, Cloudflare R2), tier-streamed loader, large-fixture bench, alpha gate integration.

| Item | First Sprint | Key Dependency |
|---|---|---|
| `tests/fixtures/large-project.pryzm-stub.json` skeleton | S19 | None (data only) |
| `apps/bench/load-large.ts` skeleton | S19 | Large fixture |
| `apps/bake-worker/index.ts` | S21 | BullMQ + Express |
| `apps/bake-worker/jobs/RebakeChunkJob.ts` | S21 | `@pryzm/geometry-kernel` + `gltf-transform` |
| `apps/bake-worker/storage/r2.ts` | S21 | Cloudflare R2 env-vars |
| `apps/bake-worker/coalescing/CoalesceWindow.ts` | S21 | `[strategic ADR-010]` |
| `apps/bench/bake-incremental.ts` | S21 | Bake worker + R2 live |
| `packages/persistence-client/loader.ts` | S23 | `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` + Manifest + ChunkReader |
| Loader ↔ FrameScheduler integration | S23 | S15 FrameScheduler |
| `tests/fixtures/large-project.pryzm-stub.json` (full content) | S23 | Bake worker |
| `apps/bench/load-large.ts` (full impl) | S23 | Large fixture + loader |
| Alpha gate final integration + recording | S24 | All S19–S23 items |

### Joint Deliverables

| Item | Sprint | Owner |
|---|---|---|
| Chunk format interface spec (A and B must agree before S21) | S19 D5 | Joint |
| `RebakeChunkJob` payload schema | S21 D1 | Joint |
| `[strategic ADR-010]` — Bake coalescing window (250 ms) | S21 D1 | F decides; B drafts |
| `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` — `.pryzm` format v1 spec | S20 D1 | F decides; A drafts |
| `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` — Tier-streamed loader strategy (3 tiers, priorities, eviction) | S23 D1 | F decides; B drafts |
| `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` — Sync-server linearisation (LWW until 2D CRDT) | S22 D1 | F decides; A drafts |
| `apps/editor/src/bootstrap.ts` final integration (data half + render half) | S24 D2–D4 | Joint paired |
| Alpha demo recording (10-min screencast) | S24 D7 | Joint |
| `apps/bench/reports/M12-alpha.md` | S24 D6 | Joint |

---

## §2 Sprint-by-Sprint Two-Agent Breakdown

---

### S19 — Chunked Binary Persistence

> **Storage abstraction (`[strategic ADR-003]`)**: every R2 call MUST go through `packages/storage-driver/` (with R2 and MinIO drivers behind the same interface). No direct `@aws-sdk/client-s3` import outside the driver. Lint: `tools/lint-storage-driver-isolation.ts` (PR-blocking).
**Weeks 37–38 (Month 10)**

---

#### Context and Why This Matters

S19 introduces PRYZM 2's second major departure from PRYZM 1's persistence model. PRYZM 1 saves as a JSON blob (O(project) cost, 380 ms per save). PRYZM 2 saves as:
- **Events**: one ~400 byte MessagePack record per command (O(1) cost, < 10 ms — already working from S04).
- **Chunks**: one compressed `.glb` binary per `(level, version)` pair — introduced in S19.

The chunk is the unit of both storage (on R2 / IndexedDB) and streaming (the tier-streamed loader fetches chunks one level at a time). Every subsequent sprint in 1D depends on the chunk format being stable. **`code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` is the format spec; it must be frozen at S20 D1 before the bake worker (S21) can be built against it.** Any format change after that point requires a migration.

The **three compression layers** applied to each chunk are not arbitrary — they are specifically chosen for their complementary characteristics:
- **Draco**: compresses attribute data (positions, normals, UVs). Achieves 50–70% reduction on mesh position buffers. Decoder is WebAssembly (< 40 KB gzip, loaded once).
- **Meshopt**: vertex order optimisation (improves GPU cache locality) + additional delta encoding. Works after Draco decompression. Achieves 10–20% additional reduction with better decode speed than Draco alone.
- **KTX2**: texture compression (BC7/ETC2/ASTC depending on GPU). Not applied to geometry, only to material textures embedded in the `.glb`. Not needed in Phase 1 (Phase 1 uses flat colours, not textures). Codec implemented now; activated in Phase 2.

---

#### Implementation Detail — Codec Wrappers

```typescript
// packages/persistence-client/codec/draco.ts
// IMPORTANT: this module is used both in the browser (via WebAssembly) and in Node.
// The import path switches based on runtime environment.

import type { Encoder, Decoder } from '@loaders.gl/draco';

let _encoder: Encoder | null = null;
let _decoder: Decoder | null = null;

async function getEncoder(): Promise<Encoder> {
  if (_encoder) return _encoder;
  const { DracoEncoder } = await import('@loaders.gl/draco');
  _encoder = new DracoEncoder();
  return _encoder;
}

async function getDecoder(): Promise<Decoder> {
  if (_decoder) return _decoder;
  const { DracoDecoder } = await import('@loaders.gl/draco');
  _decoder = new DracoDecoder();
  return _decoder;
}

export async function dracoEncode(geometry: GeometryIR): Promise<Uint8Array> {
  const encoder = await getEncoder();
  return encoder.encode({
    positions:  geometry.meshes.flatMap(m => Array.from(m.positions)),
    normals:    geometry.meshes.flatMap(m => Array.from(m.normals ?? [])),
    uvs:        geometry.meshes.flatMap(m => Array.from(m.uvs ?? [])),
    indices:    geometry.meshes.flatMap(m => Array.from(m.indices)),
  }, { method: 'MESH_EDGEBREAKER', quantization: { position: 14, normal: 10, uv: 12 } });
}

export async function dracoDecode(encoded: Uint8Array): Promise<RawMeshBuffers> {
  const decoder = await getDecoder();
  const result = decoder.decode(encoded);
  return {
    positions:  new Float32Array(result.attributes.POSITION),
    normals:    result.attributes.NORMAL ? new Float32Array(result.attributes.NORMAL) : undefined,
    uvs:        result.attributes.TEX_COORD_0 ? new Float32Array(result.attributes.TEX_COORD_0) : undefined,
    indices:    new Uint32Array(result.indices),
  };
}
```

**Quantization choices**: 14-bit position quantization is the sweet spot — better than the default 11-bit (which loses millimetre precision on large buildings), but avoids the 16-bit overhead. At 14 bits, positions have sub-millimetre precision across a 100 m building span, which is sufficient for BIM.

**Why lazy singleton pattern?** The Draco WebAssembly binary is large (~400 KB uncompressed). Eagerly loading it on editor start would add ~100 ms to cold load. The lazy singleton ensures the WASM is loaded once, on first chunk encode or decode, and cached for the session.

---

#### Implementation Detail — `ChunkWriter.ts`

```typescript
// packages/persistence-client/chunks/ChunkWriter.ts

import { Document, NodeIO, WebIO } from '@gltf-transform/core';
import { DracoMeshCompression, MeshoptCompression } from '@gltf-transform/extensions';

export interface ChunkWriteOptions {
  useDraco?: boolean;    // default: true
  useMeshopt?: boolean;  // default: true
  useKtx2?: boolean;     // default: false (Phase 2)
}

export interface ChunkDescriptor {
  projectId: string;
  levelId: string;
  version: number;       // monotonically increasing per level; matches event sequence number
  byteLength: number;
  hash: string;          // SHA-256 of raw bytes; used for content-addressed storage
}

export class ChunkWriter {
  private io: NodeIO | WebIO;

  constructor(env: 'browser' | 'node') {
    this.io = env === 'node'
      ? new NodeIO().registerExtensions([DracoMeshCompression, MeshoptCompression])
      : new WebIO().registerExtensions([DracoMeshCompression, MeshoptCompression]);
  }

  async write(
    geometryIR: GeometryIR[],  // one per element in the level
    descriptor: Omit<ChunkDescriptor, 'byteLength' | 'hash'>,
    opts: ChunkWriteOptions = {}
  ): Promise<{ bytes: Uint8Array; descriptor: ChunkDescriptor }> {
    const doc = new Document();
    const scene = doc.createScene();

    for (const ir of geometryIR) {
      for (const meshDesc of ir.meshes) {
        // 1. Create gltf-transform mesh node from GeometryIR.
        const accessor_pos = doc.createAccessor()
          .setType('VEC3')
          .setArray(meshDesc.positions);
        const accessor_idx = doc.createAccessor()
          .setType('SCALAR')
          .setArray(meshDesc.indices);
        const prim = doc.createPrimitive()
          .setAttribute('POSITION', accessor_pos)
          .setIndices(accessor_idx);

        if (meshDesc.normals) {
          prim.setAttribute('NORMAL', doc.createAccessor()
            .setType('VEC3')
            .setArray(meshDesc.normals));
        }

        // 2. Embed element ID + material ID in extras for ChunkReader to recover.
        prim.setExtras({
          sourceId: ir.metadata.sourceId,
          materialId: meshDesc.materialId,
        });

        const mesh = doc.createMesh().addPrimitive(prim);
        const node = doc.createNode(ir.metadata.sourceId).setMesh(mesh);
        scene.addChild(node);
      }
    }

    // 3. Apply compression transforms.
    if (opts.useDraco ?? true) {
      await doc.transform(
        DracoMeshCompression.DEFAULTS
          ? /* use extension default options */ undefined
          : undefined
      );
    }
    if (opts.useMeshopt ?? true) {
      await doc.transform(/* MeshoptCompression.DEFAULTS */ undefined);
    }

    // 4. Serialise to binary GLB.
    const bytes = await this.io.writeBinary(doc);

    // 5. Compute content-addressed hash.
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      bytes,
      descriptor: { ...descriptor, byteLength: bytes.byteLength, hash },
    };
  }
}
```

**Critical design decision — `extras` for element ID recovery**: when the `ChunkReader` loads a `.glb`, it needs to know which element each mesh belongs to (to build the scene registry mapping `elementId → THREE.Object3D`). Rather than maintaining a separate sidecar index, we embed `sourceId` and `materialId` in gltf-transform's `.extras` field on each `Primitive`. This survives Draco compression unchanged (extras are in the JSON portion of GLB, not the binary buffer that Draco compresses).

**Chunk content-addressing**: chunks are stored at `r2://chunks/<projectId>/<hash>.glb` (not at `<projectId>/<levelId>/<version>.glb`). This means two levels with identical geometry (e.g. a hotel with identical floor plans) share the same chunk bytes on R2. The manifest maps `(levelId, version) → hash`. This is a significant storage efficiency win for large multi-level projects.

---

#### Implementation Detail — `packages/persistence-client/manifest.ts`

```typescript
// packages/persistence-client/manifest.ts

import { z } from 'zod';

export const ChunkEntrySchema = z.object({
  levelId:    z.string(),
  version:    z.number().int().nonnegative(),
  hash:       z.string().length(64),   // SHA-256 hex
  byteLength: z.number().int().positive(),
  elementIds: z.array(z.string()),     // element IDs covered by this chunk
  createdAt:  z.string().datetime(),   // ISO-8601; used for cache eviction
});
export type ChunkEntry = z.infer<typeof ChunkEntrySchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  projectId:     z.string(),
  formatVersion: z.literal('pryzm-v1'),
  chunks:        z.array(ChunkEntrySchema),
  levels: z.array(z.object({
    id:          z.string(),
    name:        z.string(),
    worldY:      z.number(),           // metres from site datum
    elevation:   z.number(),           // metres from sea level (optional, informational)
    latestChunkHash: z.string().length(64).nullable(),
  })),
  eventLogLength: z.number().int().nonnegative(), // number of events in the log
  lastEventId:    z.string().nullable(),          // ULID of last event
  createdAt:      z.string().datetime(),
  updatedAt:      z.string().datetime(),
  thumbnailHash:  z.string().nullable(),          // SHA-256 of thumbnail PNG; null if not yet generated
});
export type Manifest = z.infer<typeof ManifestSchema>;
```

**`latestChunkHash` per level**: this is the index into the content-addressed chunk store. When the bake worker produces a new chunk for a level, it updates the manifest's `latestChunkHash` for that level. The tier-streamed loader fetches `latestChunkHash` per level, not by version number — the hash is the stable identifier.

**`eventLogLength`**: used by the tier-streamed loader to decide whether to fetch history events. If `eventLogLength === 0`, the project is new and no event replay is needed. If `eventLogLength > 0` and the client needs undo history beyond what is in-memory, events are fetched on demand (Tier 3).

---

#### D1 — Kickoff (30 min)

- A presents chunk format design — one chunk per `(level, version)`; content-addressed by SHA-256 hash; geometry IR baked through `gltf-transform` to `.glb`; Draco → Meshopt pipeline; KTX2 deferred.
- B confirms: (a) the bake worker (S21) will use the same `ChunkWriter` class running in a Node `worker_thread`; (b) the large-fixture skeleton needs a level distribution that is realistic (not 250 walls on level 1 and 1 wall on each of levels 2–20).
- **Critical interface lock**: A and B agree the `ChunkEntry` schema at D5 of this sprint. Neither can start S21 (B) or `pack.ts` (A) until the manifest schema is frozen.

#### D2–D8 Parallel Work

| Day | Agent A (Track A — codecs + ChunkWriter + manifest) | Agent B (Track B — large-fixture skeleton + tooling) |
|---|---|---|
| D2 | Implement `codec/draco.ts` — lazy singleton pattern; encode + decode with quantization config. Unit test: round-trip `Float32Array(1000 random positions)` → encode → decode → assert max delta < 0.5 mm. | Build `tests/fixtures/large-project.pryzm-stub.json` skeleton — 5,000 walls × 20 levels. Realistic distribution: levels 1–20 get 200–300 walls each with random lengths from PRYZM 1 real project distributions. No geometry yet — data model only. |
| D3 | Implement `codec/meshopt.ts` — encode with reorder + quantize; decode with fast WASM decoder. Unit test: Meshopt + Draco round-trip; compare total compressed size vs Draco-only (target: Meshopt adds ≥ 10% additional savings). | Bench harness `apps/bench/load-large.ts` skeleton — Playwright cold-load harness; waits for `pryzm:first-interactive`; reports p50/p95 over 5 runs. Full impl in S23; skeleton now so B can refine it without blocking A. |
| D4 | Implement `codec/ktx2.ts` — stub only (returns input PNG unchanged; real encoding in Phase 2). Document the stub clearly: `// TODO Phase 2: enable KTX2 encoding via basis_universal WASM`. Stub is necessary now so the `ChunkWriter` pipeline doesn't hardcode the absence of KTX2. | Profile PRYZM 2's current medium-fixture cold-load (pre-chunks, from S15 bench) — identify whether persistence load, store hydration, geometry produce, or committer is the dominant cost. This profile guides A's codec priority. |
| D5 | **Mid-sprint sync (1 h)** — **interface lock**: A presents final `ManifestSchema` and `ChunkEntry` shape. B confirms the schema is sufficient for the large fixture (correct level metadata fields). Both sign off. This is the critical interface that S21 and S23 depend on. Also: A confirms `ChunkWriter` works in Node (not just browser) — critical for S21 bake worker. | Same paired session — B confirms large-fixture distribution is realistic; reviews codec perf numbers from D2/D3 tests. |
| D6 | Implement `packages/persistence-client/chunks/ChunkWriter.ts` per spec. Implement `packages/persistence-client/chunks/ChunkReader.ts` in parallel (A owns writer, but should draft reader too — B will polish it). | Wire `ChunkReader` into the editor load path (behind the S18 `?pryzm2=1` flag + new `?chunks=1` flag). This is a draft wiring — full integration in S24. |
| D7 | Implement `packages/persistence-client/manifest.ts` — Zod schema + CRUD operations (`addChunk`, `updateLevel`, `setLastEvent`, `toJSON`, `fromJSON`). Wire `ChunkWriter` into the save path (behind feature flag). | Wire `ChunkReader` into `apps/editor/src/bootstrap.ts` load path (feature flagged). Medium fixture save → chunk written to IndexedDB → reload reads chunk instead of reconstructing from events. |
| D8 | `apps/bench/load-medium.ts` re-run — target: medium fixture reload < 1.5 s with chunked persistence (no tier-streaming yet — that is S23). Document the timing profile: time to manifest parse, time to ChunkReader decode, time to committer scene-build. | Bundle impact audit: `gltf-transform` + Draco WASM + Meshopt WASM add < 200 KB gzip to the initial bundle. If > 200 KB, move codec loading behind a dynamic `import()` so it doesn't appear in the initial bundle. |

#### D9 — Sprint Demo + Retro

- A demos: medium fixture saves to IndexedDB chunks (visible in DevTools > Application > IndexedDB); reload < 1.5 s; timing profile showing where the 1.5 s is spent (manifest: ~20 ms, Draco decode: ~180 ms, committer: ~600 ms, remaining budget: ~700 ms — this is the profile S23 will work with).
- B demos: large-fixture skeleton data stats (wall count per level distribution chart); bundle impact audit result; codec compression ratio on a 50-wall floor (target: ≥ 50% size reduction vs raw `Float32Array`).
- Retro: did the Draco + Meshopt pipeline add significant decode latency? Is the D8 timing profile what we expected? What does the committer cost on medium fixture tell us about S23 large fixture?

#### S19 Exit Criteria

- [ ] Medium fixture saves to IndexedDB as chunks; reload < 1.5 s (CI gate in `apps/bench/load-medium.ts`).
- [ ] Draco + Meshopt round-trip is lossless within 0.5 mm position error (unit test).
- [ ] Codec adds ≥ 50% size reduction vs raw `Float32Array` on a 50-wall floor (bench report).
- [ ] Bundle: codec libs add < 200 KB gzip to initial bundle (CI gate).
- [ ] `ManifestSchema` + `ChunkEntry` interface frozen and committed to `packages/persistence-client/manifest.ts` (both A and B sign off).
- [ ] OTel `pryzm.chunks.write`, `pryzm.chunks.read` spans visible.
- [ ] `docs/04-reference/architecture-detail/chunks.md` committed.

**Kill-switch K1D-1**: if medium-fixture reload > 2 s at end of D8 — **halt 1D forward work**. Spend up to 2 days profiling before S20 begins. Most likely culprit: Draco decode latency on the main thread (solution: move decode to a Web Worker). Second culprit: committer building THREE.Mesh synchronously (solution: batch mesh creation across multiple frames via FrameScheduler). Do not proceed to S20 until reload < 1.5 s.

---

### S20 — `.pryzm` ZIP Format v1 + Spec Document
**Weeks 39–40 (Month 10)**

---

#### Context and Why This Matters

The `.pryzm` portable ZIP is one of PRYZM 2's defining differentiators. PRYZM 1 has no portable file — a project lives in a Postgres BLOB column and cannot be shared as a file. PRYZM 2's `.pryzm` file is the equivalent of a `.pdf` for drawings or a `.rvt` for Revit: a self-contained portable archive that opens PRYZM 2 anywhere — including in `@pryzm/headless` from the CLI.

**`code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md`** defines the `.pryzm` v1 format. Once merged, the format is **frozen for v1** — any breaking change requires a new `schemaVersion` and a migration. This is not a soft guideline; the migration framework introduced in S20 enforces it mechanically: `unpack.ts` calls `migrate(manifest)` which raises if `manifest.schemaVersion > CURRENT_VERSION` and migrates automatically if `manifest.schemaVersion < CURRENT_VERSION`.

**Why ZIP?** The USDZ precedent (Apple's 3D format) uses ZIP for the same reasons: ZIP is universal (no dependency on a custom container library), supports streaming per-file extraction, and can be inspected with any archive tool (`unzip -l demo.pryzm`). The `.pryzm` ZIP is signed with an Ed25519 signature in `signatures/manifest.sig` to detect corruption or tampering — important for enterprise archival and audit.

---

#### Implementation Detail — `.pryzm` ZIP Layout (`code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md`)

```
demo.pryzm (ZIP, no compression at ZIP level — each entry is pre-compressed)
├── manifest.json                    # Manifest (JSON, Zod-validated on unpack)
├── events/
│   ├── 000000.evt.bin               # MessagePack event batch, ULID-ordered
│   ├── 000001.evt.bin
│   └── ...
├── chunks/
│   ├── <hash-1>.glb                 # Content-addressed; filename = SHA-256 hex
│   ├── <hash-2>.glb
│   └── ...
├── thumbnails/
│   └── project.png                  # 512×512 PNG; generated by renderer at save time
└── signatures/
    └── manifest.sig                 # Ed25519 signature of manifest.json bytes
```

**Key design decisions**:
1. **No compression at the ZIP level** — each entry is pre-compressed. Adding a second compression layer at ZIP level would slow pack/unpack without meaningfully reducing size (already-compressed data rarely benefits from ZIP's DEFLATE).
2. **Event batches in numbered files** — `000000.evt.bin` contains events 0–999, `000001.evt.bin` contains events 1000–1999, etc. This allows selective loading (e.g. "load only the last 100 events for undo display") without parsing the full log.
3. **Content-addressed chunks** — chunk filenames are SHA-256 hashes, not level IDs. Two identical floors in a hotel share one chunk file.
4. **`signatures/manifest.sig`** — generated with an Ed25519 key stored in the user's PRYZM keychain (similar to GPG signing). Verified on unpack. If invalid, `unpack()` returns `{ ok: false, reason: 'signature-mismatch' }`.

---

#### Implementation Detail — `packages/file-format/pack.ts`

```typescript
// packages/file-format/pack.ts

import JSZip from 'jszip'; // < 50 KB gzip; browser + Node compatible
import { encode as msgpackEncode } from '@msgpack/msgpack';

export interface PackInput {
  manifest: Manifest;
  events: readonly CommandEvent[];     // ordered by ULID
  chunks: Map<string, Uint8Array>;     // hash → compressed glb bytes
  thumbnail?: Uint8Array;             // PNG bytes; optional
  signingKey?: CryptoKey;            // Ed25519 private key; if undefined, no signature
}

export interface PackResult {
  ok: true;
  bytes: Uint8Array;     // the .pryzm ZIP file
  byteLength: number;
  packDuration: number; // ms
} | {
  ok: false;
  reason: string;
};

export async function pack(input: PackInput): Promise<PackResult> {
  const t0 = performance.now();
  const zip = new JSZip();

  // 1. manifest.json
  zip.file('manifest.json', JSON.stringify(input.manifest, null, 2));

  // 2. events/*.evt.bin (batches of 1000)
  const BATCH_SIZE = 1000;
  for (let i = 0; i < input.events.length; i += BATCH_SIZE) {
    const batch = input.events.slice(i, i + BATCH_SIZE);
    const batchBytes = msgpackEncode(batch);
    const batchIndex = String(Math.floor(i / BATCH_SIZE)).padStart(6, '0');
    zip.file(`events/${batchIndex}.evt.bin`, batchBytes, { compression: 'STORE' }); // already MessagePack, no ZIP compression
  }

  // 3. chunks/*.glb (content-addressed; already Draco + Meshopt compressed)
  for (const [hash, bytes] of input.chunks) {
    zip.file(`chunks/${hash}.glb`, bytes, { compression: 'STORE' }); // already compressed
  }

  // 4. thumbnails/project.png
  if (input.thumbnail) {
    zip.file('thumbnails/project.png', input.thumbnail, { compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  // 5. signatures/manifest.sig
  if (input.signingKey) {
    const manifestBytes = new TextEncoder().encode(JSON.stringify(input.manifest, null, 2));
    const sigBytes = await crypto.subtle.sign({ name: 'Ed25519' }, input.signingKey, manifestBytes);
    zip.file('signatures/manifest.sig', new Uint8Array(sigBytes), { compression: 'STORE' });
  }

  const zipBytes = await zip.generateAsync({ type: 'uint8array', streamFiles: false });
  return { ok: true, bytes: zipBytes, byteLength: zipBytes.byteLength, packDuration: performance.now() - t0 };
}
```

**Performance target**: medium fixture (500 walls × 5 levels) packs in < 5 s. The dominant cost is `JSZip.generateAsync` iterating over all chunk bytes. If this is slow, switch to a streaming ZIP writer that doesn't buffer the entire output in memory.

---

#### Implementation Detail — Migration Framework

```typescript
// packages/file-format/migrations/index.ts

export interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate: (manifest: unknown, zip: JSZip) => Promise<{ manifest: unknown; zip: JSZip }>;
}

const migrations: MigrationStep[] = [
  // v0 (PRYZM 1 JSON blob) → v1 (.pryzm ZIP)
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: async (rawJson, _zip) => {
      // This migration converts a PRYZM 1 `project.json` blob into a v1 manifest + events + chunks.
      // Full implementation in Phase 3D (not Phase 1); stub here raises clearly.
      throw new Error('PRYZM 1 → v1 migration: not yet implemented. Use PRYZM 1 importer plugin (Phase 3D).');
    },
  },
];

export async function migrate(manifest: { schemaVersion: number }, zip: JSZip): Promise<{ manifest: Manifest; zip: JSZip }> {
  let currentVersion = manifest.schemaVersion;
  const CURRENT_VERSION = 1;

  if (currentVersion === CURRENT_VERSION) return { manifest: manifest as Manifest, zip };
  if (currentVersion > CURRENT_VERSION) {
    throw new Error(`Cannot open: project is schema v${currentVersion}, this PRYZM build supports up to v${CURRENT_VERSION}. Update PRYZM.`);
  }

  // Apply migrations in sequence.
  for (const step of migrations.filter(m => m.fromVersion >= currentVersion)) {
    const result = await step.migrate(manifest, zip);
    manifest = result.manifest as { schemaVersion: number };
    zip = result.zip;
    currentVersion = manifest.schemaVersion;
  }

  return { manifest: manifest as Manifest, zip };
}
```

**Why the v0 → v1 migration is a stub in Phase 1**: PRYZM 1 customers' data lives in Postgres as JSON blobs. The full migration (read PRYZM 1 blob → extract element data → re-produce geometry → write chunks + events → pack as `.pryzm`) requires the bake worker and the PRYZM 1 element parsers. Both land fully in Phase 3D. The stub raises a clear error with a user-facing message rather than silently failing — the `PRYZM 1 importer plugin` is the official migration path.

**Invariant**: the migration framework is **append-only** in `migrations/index.ts`. Once a migration step is shipped, it is never removed. Removing a migration step would break the upgrade path for any project that skipped intermediate versions.

---

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` draft — ZIP layout, batch size for events, content-addressing for chunks, Ed25519 signature. F decides.
- B confirms the bake worker (S21) will produce chunks already in the format described by `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` (content-addressed hash filenames). The bake worker does not need to know about the ZIP; it just uploads `.glb` bytes to R2 keyed by hash. `pack.ts` assembles the ZIP from those bytes.
- Both: confirm JSZip is browser + Node compatible (it is — pure JS, no native bindings). Alternative considered: native `zip` command in Node via `child_process` — rejected because it would break browser usage of `pack.ts`.

#### D2–D8 Parallel Work

| Day | Agent A (Track A — pack/unpack + spec) | Agent B (Track B — bake worker design + S21 prep) |
|---|---|---|
| D2 | Implement `packages/file-format/pack.ts` per spec. Test with small fixture: pack → file on disk (< 5 s). | Sketch `apps/bake-worker/` directory layout: `index.ts` (Express + BullMQ), `jobs/` (job handlers), `storage/` (R2), `coalescing/` (250 ms window), `producers/` (re-uses `@pryzm/geometry-kernel` directly). |
| D3 | Implement `packages/file-format/unpack.ts` — parse ZIP, validate manifest via Zod, verify Ed25519 signature if present, apply migrations, return typed result. | Bake job protocol design — `RebakeChunkJob` payload shape: `{ projectId, levelId, eventBatch: CommandEvent[], previousChunkHash: string | null }`. Draft in `apps/bake-worker/jobs/RebakeChunkJob.ts`. |
| D4 | Implement `packages/file-format/migrations/index.ts` — framework + v0→v1 stub. | BullMQ topology: one queue `bake-jobs`, FIFO within a project, different projects can run concurrently (one `worker_threads` pool per CPU core). `[strategic ADR-010]` draft (coalescing window). |
| D5 | **Mid-sprint sync (1 h)** — paired session: A walks through unpack → migrate → validate flow. B confirms bake worker output (S21) will be unpack-compatible. Final `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` decisions: batch size 1000 events, SHA-256 hash filenames, Ed25519 optional (off by default in Phase 1, opt-in). | Same session — B presents BullMQ queue topology decision; F approves or adjusts. |
| D6 | `packages/file-format/__tests__/round-trip.test.ts` — pack → unpack → verify identical events, identical chunks (byte-by-byte), manifest fields preserved. Both small and medium fixtures tested. | R2 storage design: content-addressed path `r2://pryzm-chunks/<hash>.glb`; signed GET URL TTL = 1 hour (configurable); presigned PUT URL TTL = 5 minutes (for bake worker upload). |
| D7 | Implement CLI `pryzm-cli pack <project> -o <file.pryzm>` and `pryzm-cli unpack <file.pryzm> -o <dir>`. Both use the same `pack.ts`/`unpack.ts` as the browser editor. | Documentation `docs/04-reference/architecture-detail/bake-worker.md` (design section; implementation in S21). Includes: job lifecycle diagram, coalescing logic, R2 storage layout. |
| D8 | `docs/04-reference/file-formats/pryzm-binary.md` — complete v1 spec document (ZIP layout, manifest schema, event batch format, signature scheme, migration contract). Bench `apps/bench/pack-unpack.ts` — pack < 5 s, unpack < 3 s on medium fixture. | `[strategic ADR-010]` finalised draft — coalescing window = 250 ms with per-project FIFO queue. Bench skeleton for `apps/bench/bake-incremental.ts` (full impl S21). |

#### D9 — Sprint Demo + Retro

- A demos: `pryzm-cli pack medium-fixture -o medium.pryzm` → file on disk → inspect ZIP contents with `unzip -l` (events, chunks, manifest visible) → `pryzm-cli unpack medium.pryzm -o recovered/` → open recovered project in `?pryzm2=1` → byte-identical to original.
- B demos: bake worker directory layout + `[strategic ADR-010]` walkthrough; R2 storage diagram; `RebakeChunkJob` payload schema signed off.
- Retro: was the 1000-event batch size right? How large was the medium fixture `.pryzm` file? (Target: < 5 MB for medium — if larger, investigate which chunks dominate.)

#### S20 Exit Criteria

- [ ] `.pryzm` v1 round-trips losslessly on small and medium fixtures (byte-identical events + chunks after pack/unpack).
- [ ] `docs/04-reference/file-formats/pryzm-binary.md` complete and committed.
- [ ] CLI `pryzm-cli pack/unpack` works in Node.
- [ ] `apps/bench/pack-unpack.ts`: medium fixture pack < 5 s, unpack < 3 s (CI gate).
- [ ] Migration framework live: `fromVersion > CURRENT_VERSION` raises clear error; v0→v1 stub raises clear "use importer plugin" error.
- [ ] Ed25519 signature verification implemented (off by default; `{ sign: false }` option).
- [ ] `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` merged.

---

### S21 — Bake Worker (Server-Side) v0

> **Worker pool topology (`[strategic ADR-005]`)**: server-side bake worker uses BullMQ + `worker_threads` pool sized at `os.cpus().length - 1`. The pool sizing is canonical; per-job concurrency is a queue-level concern.
>
> **Storage driver (`[strategic ADR-003]`)**: bake worker writes chunks via the storage driver. R2 in PRYZM-hosted; MinIO in self-host. The driver is the only abstraction the bake worker sees.
>
> **Coalescing window**: the 250 ms coalescing window in S21 is the implementation of `[strategic ADR-010]` (250 ms bake debounce per SPEC-02 §5). No separate code-level ADR is created in this sprint; the sprint output is the implementation log against the strategic ADR.

**Weeks 41–42 (Month 11)**

---

#### Context and Why This Matters

The bake worker is the server-side process that turns a command event into a compressed `.glb` chunk on Cloudflare R2. It is the component that makes "PRYZM 2 opens in < 800 ms" true for the second user (not just the first) — because the second user downloads a pre-baked chunk from R2 rather than re-computing geometry in their browser.

The bake worker is also the **first deployment of `@pryzm/headless` in a real production-like context**. It runs the same geometry producers that run in the browser worker — but in a Node `worker_thread`. If K1C-2 revealed any kernel impurity in S18, the bake worker will reveal the consequences operationally. Any THREE or DOM import in the kernel would cause the bake worker to fail immediately on startup — making K1D-2 fire.

**The three hardest problems in S21**:

1. **Coalescing window correctness**: the 250 ms coalescing window (`[strategic ADR-010]`) must prevent thundering-herd bake jobs when a user makes rapid edits (e.g. 20 wall move operations in 2 seconds). But it must not delay a bake by more than 250 ms + bake duration. The coalescing logic is deceptively tricky — see implementation detail below.

2. **`worker_threads` pool management**: each geometry producer call can take 20–200 ms of CPU. The pool must prevent N concurrent bake jobs from saturating all CPU cores. The policy (one worker thread per CPU core, minus 1 for the main BullMQ process) must be configurable per deployment — a 1-vCPU Replit container behaves very differently from a 16-vCPU production VM.

3. **R2 cost model**: each chunk upload to R2 costs ~$0.015 per GB stored + ~$0.36 per million Class B (write) operations. For a project with 5 levels and an active user making 100 edits/hour, that is 500 bake jobs/hour = 500 Class B operations. At full coalescing effectiveness, this drops to ~100 jobs/hour. The cost must be audited in S21 D7 — if the per-user R2 cost exceeds the PRYZM subscription margin, the coalescing window or bake-on-save (not bake-on-event) policy must be revisited.

---

#### Implementation Detail — `apps/bake-worker/index.ts`

```typescript
// apps/bake-worker/index.ts

import express from 'express';
import { Queue, Worker, Job } from 'bullmq';
import { createClient } from 'ioredis';
import os from 'os';
import { RebakeChunkJob } from './jobs/RebakeChunkJob';
import { CoalesceWindow } from './coalescing/CoalesceWindow';
import { R2Storage } from './storage/r2';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const PORT = parseInt(process.env.BAKE_PORT ?? '4001', 10);
const WORKER_CONCURRENCY = Math.max(1, os.cpus().length - 1); // leave 1 core for BullMQ main

const redis = createClient({ url: REDIS_URL });
const bakeQueue = new Queue<RebakeChunkJob>('bake-jobs', { connection: redis });
const coalescer = new CoalesceWindow(bakeQueue, { windowMs: 250 });
const r2 = new R2Storage({
  accountId:      process.env.R2_ACCOUNT_ID!,
  accessKeyId:    process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucketName:     process.env.R2_BUCKET_NAME!,
});

// BullMQ worker — consumes jobs from the queue.
const worker = new Worker<RebakeChunkJob>(
  'bake-jobs',
  async (job: Job<RebakeChunkJob>) => {
    return await processRebakeJob(job.data, r2);
  },
  { connection: redis, concurrency: WORKER_CONCURRENCY }
);

worker.on('completed', (job, result) => {
  console.log(`Bake job ${job.id} completed: ${result.chunkHash} in ${result.durationMs} ms`);
});

worker.on('failed', (job, err) => {
  console.error(`Bake job ${job?.id} failed: ${err.message}`);
  // OTel: emit error span here.
});

// Express health + enqueue API.
const app = express();
app.use(express.json());

// Called by sync-server when an event is linearised.
app.post('/enqueue', async (req, res) => {
  const { projectId, levelId, events } = req.body;
  await coalescer.enqueue({ projectId, levelId, events });
  res.json({ ok: true });
});

// Health check for deployment orchestration.
app.get('/health', (_, res) => res.json({ status: 'ok', concurrency: WORKER_CONCURRENCY }));

app.listen(PORT, () => console.log(`Bake worker listening on port ${PORT}`));
```

---

#### Implementation Detail — `CoalesceWindow.ts`

```typescript
// apps/bake-worker/coalescing/CoalesceWindow.ts

import { Queue } from 'bullmq';
import type { RebakeChunkJob } from '../jobs/RebakeChunkJob';

interface PendingBatch {
  events: CommandEvent[];
  timer: ReturnType<typeof setTimeout>;
}

export class CoalesceWindow {
  // Key: `${projectId}/${levelId}` → pending batch
  private pending: Map<string, PendingBatch> = new Map();

  constructor(
    private queue: Queue<RebakeChunkJob>,
    private opts: { windowMs: number }
  ) {}

  async enqueue(job: { projectId: string; levelId: string; events: CommandEvent[] }): Promise<void> {
    const key = `${job.projectId}/${job.levelId}`;
    const existing = this.pending.get(key);

    if (existing) {
      // Coalesce: extend the event list and reset the timer.
      existing.events.push(...job.events);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flush(key), this.opts.windowMs);
    } else {
      // New batch: start the timer.
      const timer = setTimeout(() => this.flush(key), this.opts.windowMs);
      this.pending.set(key, { events: [...job.events], timer });
    }
  }

  private async flush(key: string): Promise<void> {
    const batch = this.pending.get(key);
    if (!batch) return;
    this.pending.delete(key);

    const [projectId, levelId] = key.split('/');
    await this.queue.add('rebake', {
      projectId,
      levelId,
      eventBatch: batch.events,
      previousChunkHash: null, // fetched by the job from manifest
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      jobId: `${projectId}-${levelId}-${Date.now()}`,
    });
  }
}
```

**Critical correctness issue — coalescing and ordering**: the `events` array in each coalesced batch must maintain ULID order (already guaranteed by the sync server which assigns ULIDs before enqueuing). If two events arrive out of order (network reorder), the coalescer must sort by ULID before flushing. Add: `batch.events.sort((a, b) => a.id.localeCompare(b.id))` before `queue.add`.

**Critical correctness issue — flush on process shutdown**: if the bake worker process is killed while a coalescing window is open, the pending batch is lost. Mitigation: on `SIGTERM`, flush all pending batches synchronously before exiting. The `CoalesceWindow` must register a `process.on('SIGTERM', () => this.flushAll())` handler.

---

#### Implementation Detail — `RebakeChunkJob.ts`

```typescript
// apps/bake-worker/jobs/RebakeChunkJob.ts

import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { createHeadlessSession } from '@pryzm/headless';
import { ChunkWriter } from '@pryzm/persistence-client/chunks/ChunkWriter';
import { R2Storage } from '../storage/r2';

export interface RebakeChunkJob {
  projectId: string;
  levelId: string;
  eventBatch: CommandEvent[];
  previousChunkHash: string | null;
}

export interface RebakeChunkResult {
  chunkHash: string;
  byteLength: number;
  durationMs: number;
}

export async function processRebakeJob(job: RebakeChunkJob, r2: R2Storage): Promise<RebakeChunkResult> {
  const t0 = performance.now();

  // 1. Create a headless session.
  const session = createHeadlessSession();

  // 2. If there is a previous chunk, load the existing project state.
  //    This avoids re-running all events from project creation — only the delta batch.
  if (job.previousChunkHash) {
    const existingChunkBytes = await r2.get(job.previousChunkHash);
    // Replay the existing chunk into the headless session stores.
    await session.persistence.loadFromChunk(existingChunkBytes, job.levelId);
  }

  // 3. Apply the new event batch.
  for (const event of job.eventBatch) {
    session.commandBus.applyEvent(event);
  }

  // 4. Produce geometry for all elements in the level.
  const elementIds = session.stores.get('wall').selectors(
    session.stores.get('wall').getSnapshot()
  ).byLevel(job.levelId)
    .map(w => w.id);
  // ... same for slab, door, window, stair, etc. (all element stores)

  const geometryIRs = await Promise.all(
    elementIds.map(id => session.kernel.produce(id))
  );

  // 5. Write chunk.
  const writer = new ChunkWriter('node');
  const { bytes, descriptor } = await writer.write(geometryIRs, {
    projectId: job.projectId,
    levelId: job.levelId,
    version: job.eventBatch[job.eventBatch.length - 1]?.sequenceNumber ?? 0,
  });

  // 6. Upload to R2.
  await r2.put(descriptor.hash, bytes);

  session.dispose();
  return { chunkHash: descriptor.hash, byteLength: bytes.byteLength, durationMs: performance.now() - t0 };
}
```

**Why load from the previous chunk rather than replaying all events?**: replaying the full event log for a large project on every edit would make the bake worker O(event log length) per edit — unacceptable for projects with thousands of edits. By loading the previous chunk (which encodes the state after all prior events), the bake worker only needs to apply the new `eventBatch` delta. This is the **incremental bake pattern** and it is what makes the 1.5 s target achievable.

**`session.persistence.loadFromChunk`**: this method does not exist yet — it needs to be added to `@pryzm/headless` in S21 alongside `processRebakeJob`. It reads a `.glb` chunk, decodes element geometry descriptors from `extras`, and hydrates the element stores (Wall, Slab, Door, etc.) with the state at the time the chunk was produced. The state is reconstructed via a reverse mapping: `extras.sourceId → element store entry`.

---

#### D1 — Kickoff (30 min)

- B presents `[strategic ADR-010]` draft — coalescing window = 250 ms; one BullMQ queue per project; concurrency = CPU count - 1. F decides.
- A confirms the sync server (S22) will call `POST /enqueue` on the bake worker whenever an event is linearised. This is the integration interface between S21 (B) and S22 (A).
- Both: confirm `RebakeChunkJob` payload schema is stable (signed off at S20 D5 — any change now requires F's decision).
- F explicitly reviews K1D-2: if bake incremental > 30 s on production-scale data at end of S21, halt 1D.

#### D2–D8 Parallel Work

| Day | Agent A (Track A — sync server prep + integration support) | Agent B (Track B — bake worker impl) |
|---|---|---|
| D2 | Begin `apps/sync-server/` skeleton (full impl S22): Express + WebSocket server (`ws` library, not Socket.io) + Postgres connection pool. The sync server's `POST /append-event` handler will call the bake worker's `POST /enqueue`. This coupling must be tested end-to-end in D5. | Implement `apps/bake-worker/index.ts` per spec — Express + BullMQ + `worker_threads` pool. Smoke test: start bake worker, call `POST /health`, confirm 200. |
| D3 | Implement `apps/sync-server/db/schema.sql` — `event_log` table: `(id BIGSERIAL, project_id TEXT, sequence_number BIGINT, ulid TEXT, actor_id TEXT, event_bytes BYTEA, created_at TIMESTAMPTZ)`. Run migration via `pg_migrate`. | Implement `apps/bake-worker/jobs/RebakeChunkJob.ts` per spec — headless session + incremental bake from previous chunk + ChunkWriter + R2 upload. |
| D4 | Wire `EventLog.appendEvent` to call `POST /enqueue` on the bake worker (via HTTP, localhost-only in dev). The sync server is the BullMQ producer; the bake worker is the BullMQ consumer. | Implement `apps/bake-worker/storage/r2.ts` — Cloudflare R2 PUT (via presigned URL) + GET (via signed URL with 1 h TTL). Use `@aws-sdk/client-s3` with the R2 S3-compatible endpoint. Env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. |
| D5 | **Mid-sprint sync (1 h)** — end-to-end test: A's sync server receives a fake wall-edit event → calls `POST /enqueue` on bake worker → B's coalescer batches → job runs → chunk uploaded to R2 → signed URL returned. Measure total latency. Target: < 1.5 s. | Same paired session. Confirm `session.persistence.loadFromChunk` works for the incremental bake pattern. |
| D6 | Test enqueue path under burst: 20 wall-edit events in 500 ms → coalescer batches into 2 jobs (250 ms window = 2 flushes) → 2 bake jobs, not 20. Confirm coalescing behaviour with unit tests on `CoalesceWindow`. | Implement `CoalesceWindow.ts` per spec — including SIGTERM flush and ULID sort. Confirm flush-on-shutdown with a Node test that sends SIGTERM during an open window. |
| D7 | Audit chunk cost: log per-event R2 API calls in OTel. Calculate: 100 edits/hour × 5 levels = 500 → coalesced to ~100 jobs/hour → 100 Class B operations/hour. At $0.36/million, cost per user per month ≈ negligible. Log this as baseline in `docs/04-reference/architecture-detail/bake-worker.md`. | `apps/bench/bake-incremental.ts` — single wall-edit event → trigger bake → poll R2 for chunk availability (with 100 ms polling interval) → report total latency. Target: < 1.5 s. |
| D8 | `docs/04-reference/architecture-detail/sync-server-protocol.md` — design section (impl in S22): event linearisation model, sequence numbering, LWW policy, bake-worker enqueue flow. | `docs/04-reference/architecture-detail/bake-worker.md` — full implementation section + ops runbook: how to start, configure, scale, monitor. |

#### D9 — Sprint Demo + Retro

- B demos: edit wall in browser → OTel trace shows event → sync-server → bake-enqueue → bake-worker → R2 upload → signed URL → < 1.5 s total. Coalescing: rapid edits collapse from 20 requests to 2 bake jobs in the OTel timeline.
- A demos: sync-server schema + enqueue path + per-event R2 cost report.
- Retro: K1D check — any bake taking > 5 s on the medium fixture? If yes, profile immediately rather than deferring to S22.

#### S21 Exit Criteria

- [ ] Single wall-edit event → chunk at signed R2 URL in **< 1.5 s** (CI gate in `apps/bench/bake-incremental.ts`).
- [ ] Coalescing window functional: 20 edits in 500 ms → ≤ 2 bake jobs (unit test on `CoalesceWindow`).
- [ ] SIGTERM flush: pending coalesced batch is flushed before process exit (Node integration test).
- [ ] OTel spans `pryzm.bake.enqueue`, `pryzm.bake.chunk`, `pryzm.bake.r2-upload` visible in Honeycomb.
- [ ] Per-event R2 cost audited and documented.
- [ ] `apps/bake-worker/` starts cleanly with `docker-compose up` or `node dist/index.js`.
- [ ] `[strategic ADR-010]` (250 ms bake debounce) implementation log linked from the strategic ADR appendix; no separate phase-doc ADR is created.
- [ ] `[strategic ADR-005]` `worker_threads` pool sizing (`os.cpus().length - 1`) verified.
- [ ] `[strategic ADR-003]` storage driver isolation lint green.
- [ ] Per-event bake cost telemetry stream live (`bake.event.cost`); used to validate `[strategic ADR-018]` cut-list pricing assumptions.

**Kill-switch K1D-2**: if incremental re-bake > 30 s on production-scale data (5K-wall fixture, single level of 250 walls) — **halt 1D forward work**. Investigate: (1) is `createHeadlessSession()` slow? (2) is `loadFromChunk` re-parsing the full chunk? (3) is the geometry producer O(N²) for a dense level? Do not proceed to S22 until < 1.5 s is confirmed on the production-scale fixture.

---

### S22 — `apps/sync-server` Skeleton + Event Linearisation

> **Note on CRDT.** S22 ships the sync server *skeleton* (single-tab event durability) only. The full Yjs CRDT bridge (`[strategic ADR-002]`) lands in Phase 2D (S43). S22's wire-format is JSON; MessagePack (`[strategic ADR-004]`) is the wire format from S04 already, and the sync server adopts it for the event-log channel by S22 close.
**Weeks 43–44 (Month 11)**

---

#### Context and Why This Matters

The sync server is the **collaboration backbone** of PRYZM 2. In Phase 1D, it does two things: linearises events (assigns monotonically increasing sequence numbers) and broadcasts them to all connected clients. It does NOT do Yjs CRDT yet — that arrives in Phase 2D. The Phase 1D sync server is deliberately minimal: last-writer-wins (LWW) with sequence guarantees. Two browser tabs editing the same wall simultaneously will have one write overwrite the other — this is acceptable for the internal alpha (Phase 1D produces an alpha build, not a beta with paying users).

**Why LWW is acceptable in Phase 1D**: the alpha demo target is "two browser tabs see each other's events" — not "two tabs editing simultaneously with conflict-free merge". LWW with sequences gives enough consistency for the demo, for internal testing, and for the three CDE legacy commands that need to fold into the sync protocol. Phase 2D (M22–M24) upgrades to Yjs CRDT.

**`code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` (Sync-server linearisation)** must explicitly document this limitation and the upgrade path to Yjs, so no engineer is surprised by the LWW semantics during the Phase 1D alpha and no customer is put on the LWW server without knowing its limits.

---

#### Implementation Detail — Event Linearisation Protocol

```typescript
// apps/sync-server/handlers/AppendEvent.ts

import type { WebSocket } from 'ws';
import type { Pool } from 'pg';
import type { Queue } from 'bullmq';

export interface AppendEventPayload {
  projectId: string;
  clientId: string;
  event: CommandEvent;  // from @pryzm/protocol — includes ULID, actor, payload
}

export async function handleAppendEvent(
  ws: WebSocket,
  payload: AppendEventPayload,
  db: Pool,
  bakeQueue: Queue,
  broadcastToProject: (projectId: string, event: LinearisedEvent) => void,
): Promise<void> {
  const { projectId, event } = payload;

  // 1. Assign monotonic sequence number within the project.
  //    Using Postgres advisory lock to ensure no two events get the same sequence number.
  await db.query('SELECT pg_advisory_lock($1)', [hashProjectId(projectId)]);
  let sequenceNumber: number;
  try {
    const { rows } = await db.query(
      `INSERT INTO event_log (project_id, ulid, actor_id, event_bytes, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id AS sequence_number`,
      [projectId, event.id, event.actorId, encodeEvent(event)]
    );
    sequenceNumber = rows[0].sequence_number;
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [hashProjectId(projectId)]);
  }

  // 2. Create linearised event (adds sequence_number to the original event).
  const linearised: LinearisedEvent = {
    ...event,
    sequenceNumber,
    projectId,
  };

  // 3. Broadcast to all connected clients subscribed to this project.
  broadcastToProject(projectId, linearised);

  // 4. Enqueue bake job (non-blocking — fire and forget; the bake worker handles errors).
  await bakeQueue.add('rebake', {
    projectId,
    levelId: event.payload.levelId ?? inferLevelId(event),
    eventBatch: [linearised],
    previousChunkHash: null, // bake worker fetches from manifest
  }, { jobId: `bake-${event.id}` });

  // 5. Acknowledge to the sending client.
  ws.send(JSON.stringify({ type: 'event.ack', id: event.id, sequenceNumber }));
}
```

**Why Postgres advisory lock?** The sequence number must be monotonically increasing and gap-free within a project (gaps would mean the sync client can't know if it has "all events up to sequence N"). Using `pg_advisory_lock(hashProjectId)` prevents two concurrent `AppendEvent` calls from assigning the same sequence number. The advisory lock is released after the INSERT — not a long-lived lock.

**Alternative considered — Postgres `SERIAL` + `RETURNING`**: this is simpler but gives a *table-global* sequence, not a per-project sequence. Per-project sequences (`CREATE SEQUENCE event_log_<projectId>`) would work but require dynamic sequence creation, which is operationally complex. The advisory lock approach uses the `id BIGSERIAL` primary key as the sequence number, accepting that sequence numbers are globally unique but per-project monotonic (since we filter by `project_id`).

**Why fire-and-forget for bake enqueue?** The bake job failure should never block event linearisation. If R2 is temporarily down, events are still linearised and clients stay in sync — the chunk just isn't updated until the bake worker recovers. BullMQ's retry policy (3 attempts, exponential backoff) handles transient failures. A bake failure after 3 retries is logged as an OTel error but does not cascade to the event log.

---

#### Implementation Detail — WebSocket Session Management

```typescript
// apps/sync-server/handlers/ConnectClient.ts

import { WebSocket, WebSocketServer } from 'ws';

interface ClientSession {
  ws: WebSocket;
  clientId: string;
  projectId: string | null;
  userId: string;
}

export class SessionManager {
  private sessions: Map<string, ClientSession> = new Map(); // clientId → session

  register(ws: WebSocket, clientId: string, userId: string): ClientSession {
    const session: ClientSession = { ws, clientId, projectId: null, userId };
    this.sessions.set(clientId, session);

    ws.on('message', (data) => this.handleMessage(session, data));
    ws.on('close', () => {
      this.sessions.delete(clientId);
      console.log(`Client ${clientId} disconnected (${this.sessions.size} remaining)`);
    });
    ws.on('error', (err) => {
      console.error(`WebSocket error for client ${clientId}: ${err.message}`);
    });

    return session;
  }

  broadcastToProject(projectId: string, event: LinearisedEvent): void {
    const payload = JSON.stringify({ type: 'event.push', event });
    let broadcastCount = 0;
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payload);
        broadcastCount++;
      }
    }
    // OTel: record broadcastCount as a metric.
  }

  private handleMessage(session: ClientSession, data: Buffer): void {
    // Parse and dispatch: 'project.subscribe', 'event.append', 'events.load'
    const msg = JSON.parse(data.toString());
    switch (msg.type) {
      case 'project.subscribe':
        session.projectId = msg.projectId;
        session.ws.send(JSON.stringify({ type: 'project.subscribed', projectId: msg.projectId }));
        break;
      case 'event.append':
        handleAppendEvent(session.ws, msg.payload, db, bakeQueue, this.broadcastToProject.bind(this));
        break;
      case 'events.load':
        handleLoadEvents(session.ws, msg.payload, db);
        break;
    }
  }
}
```

**Memory model**: in Phase 1D, all sessions are in-memory in the sync-server process. This means horizontal scaling (multiple sync-server instances) is not supported in Phase 1D — one instance only. Phase 2D's Yjs integration will require a shared state store (Redis Pub/Sub for broadcast), enabling multi-instance horizontal scaling.

**Auth model**: Phase 1D auth is minimal — the client sends a `userId` on connect, and the server accepts it. No JWT verification, no role check. Full auth (JWT + Supabase RLS) lands in Phase 3C. Document this explicitly in `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` to prevent alpha users from connecting without auth being enforced.

---

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` draft — LWW with sequence numbers; per-project advisory lock; no CRDT until 2D; explicit list of what LWW breaks (concurrent same-element edits). F decides.
- B prepares for S23 tier-streamed loader — reviews `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` draft (to be presented S23 D1).
- Confirm: sync server runs on port 4000 in dev (bake worker on port 4001; editor on port 5000). All configurable via env vars.

#### D2–D8 Parallel Work

| Day | Agent A (Track A — sync server real impl) | Agent B (Track B — bake worker polish + loader design) |
|---|---|---|
| D2 | Implement `SessionManager` + `ConnectClient` per spec. Smoke test: two tabs connect, `sessions.size === 2` after both connect. | Profile bake worker under burst: 10 events/sec for 60 s → confirm < 1.5 s avg bake time holds under sustained load. If not, tune `worker_threads` pool size. |
| D3 | Implement `AppendEvent` per spec — Postgres advisory lock + insert + broadcast + enqueue. Unit test: two concurrent `AppendEvent` calls → sequence numbers are distinct and monotonic. | Begin `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` draft (tier-streamed loader strategy). Key decisions: 3 tiers (manifest → visible-level → background), chunk fetch priority, eviction policy (LRU, max 200 MB per session). |
| D4 | Implement `LoadEvents` — given `(projectId, fromSeq)` → stream all events with `sequenceNumber >= fromSeq` back to client as a batch. Pagination: 500 events per response. | Implement chunk request prioritiser in `packages/persistence-client/loader.ts` skeleton — in-memory priority queue of `{ tier, levelId, hash, priority }` (full impl S23). |
| D5 | **Mid-sprint sync (1 h)** — two browser tabs side-by-side: tab A draws wall → event linearised → tab B receives it via broadcast. Measure end-to-end latency from tab A's `event.append` to tab B's `event.push` receipt. Target < 250 ms p95. | Same paired session — confirm chunk prioritiser API is compatible with `FrameScheduler`'s background priority system. |
| D6 | Implement `SubscribeProject` — client sends `{ type: 'project.subscribe', projectId }`, server registers the session and begins broadcasting events for that project. Handle re-subscribe on reconnect (resync from `fromSeq`). | Wire tier-streamed loader skeleton into `apps/editor/src/bootstrap.ts` (feature flag `?stream=1`). Confirms the integration point is stable before S23 full implementation. |
| D7 | Fold 3 CDE legacy commands per `09-AS-IS-VS-TO-BE.md §4` into the sync-server protocol. These are: `CDE.LinkDocument`, `CDE.IssueComment`, `CDE.MarkupCreate` — currently in PRYZM 1's Socket.io layer. Port to the new `event.append` protocol, preserving payload shape. | `apps/bench/load-large.ts` skeleton update — wire to stream from sync-server (not IndexedDB) when `?stream=1` is active. |
| D8 | `apps/bench/sync-roundtrip.ts` — tab A emits event, tab B receives; measure from `ws.send()` in tab A to `onmessage` in tab B. Target < 250 ms p95 on localhost. On Replit infra: target < 400 ms (additional WS relay hop). | `docs/04-reference/architecture-detail/loader.md` — design section (`code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` draft decisions). |

#### D9 — Sprint Demo + Retro

- A demos: two browser tabs side-by-side — tab A draws 5 walls, tab B sees each appear as it's drawn; LWW demonstrated (draw wall in both tabs simultaneously — last one wins); sync-roundtrip bench < 250 ms on localhost.
- B demos: bake worker under 60 s burst load — < 1.5 s avg confirmed; `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` decision summary.
- Retro: does the LWW behaviour in the demo look acceptable for an alpha? Is there any case where users would lose data unacceptably? If yes, document in `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md`'s "known limitations" section.

#### S22 Exit Criteria

- [ ] Two browser tabs see each other's events with LWW (visual demo + automated Playwright test).
- [ ] Event log in Postgres; bake jobs enqueued.
- [ ] OTel `pryzm.sync.append`, `pryzm.sync.broadcast`, `pryzm.sync.sequence` spans visible.
- [ ] `apps/bench/sync-roundtrip.ts` < 250 ms p95 on localhost.
- [ ] 3 CDE legacy commands folded into new protocol (parity with PRYZM 1 CDE).
- [ ] Reconnect + re-subscribe works: close tab → reopen → events from `lastSeq + 1` loaded.
- [ ] `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` merged.

---

### S23 — Tier-Streamed Loader
**Weeks 45–46 (Month 12)**

---

#### Context and Why This Matters

The tier-streamed loader is **why PRYZM 2 opens a large project in < 3 s** rather than in > 30 s (the current PRYZM 1 behaviour). Without tier-streaming, the editor must download and decompress every chunk for every level before rendering anything. With tier-streaming, the editor:
1. Fetches the manifest first (< 100 ms — it's a few KB of JSON).
2. Identifies the visible level (the level the user was last on, or level 1 if new).
3. Fetches only the visible-level chunk (< 500 ms for a 200-wall level — the dominant chunk).
4. Commits the visible-level chunk to the scene → first interactive.
5. Fetches background level chunks lazily, in priority order (levels near the visible level first), via the `FrameScheduler`'s `'background'` priority queue.

**`code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md`** defines the tier strategy. The three key decisions:
1. **Tier priorities**: Tier 1 (manifest) = critical, blocks load. Tier 2 (visible level) = high, first interactive. Tier 3 (background levels + history events) = low, progressive.
2. **Eviction policy**: LRU, maximum 200 MB per session. Levels evicted when the limit is hit. Re-fetched on demand when the user navigates to the evicted level.
3. **History events on demand**: the full event log is not loaded on startup. Events are fetched in segments of 500 (matching the sync-server's `LoadEvents` pagination) only when the user scrubs history.

---

#### Implementation Detail — `packages/persistence-client/loader.ts`

```typescript
// packages/persistence-client/loader.ts

import type { FrameScheduler } from '@pryzm/frame-scheduler';
import type { ChunkReader } from './chunks/ChunkReader';
import type { Manifest, ChunkEntry } from './manifest';

export type LoaderTier = 1 | 2 | 3;

interface ChunkRequest {
  tier: LoaderTier;
  levelId: string;
  hash: string;
  priority: number;   // lower = higher priority within a tier
}

export class TierStreamedLoader {
  private queue: ChunkRequest[] = [];  // sorted by tier, then priority
  private loaded: Map<string, Uint8Array> = new Map(); // hash → decompressed bytes (for LRU)
  private totalBytes = 0;
  private readonly MAX_BYTES = 200 * 1024 * 1024; // 200 MB LRU budget

  constructor(
    private scheduler: FrameScheduler,
    private reader: ChunkReader,
    private fetchManifest: () => Promise<Manifest>,
    private onChunkReady: (levelId: string, chunk: Uint8Array) => void,
    private onFirstInteractive: () => void,
  ) {}

  async load(projectId: string, visibleLevelId?: string): Promise<void> {
    // TIER 1: Manifest.
    const manifest = await this.fetchManifest(); // < 100 ms target
    // dispatch(window, 'pryzm:manifest-ready') for any listener

    const levels = manifest.levels;
    const visibleLevel = levels.find(l => l.id === visibleLevelId) ?? levels[0];

    // TIER 2: Visible level chunk — immediate fetch, not queued.
    if (visibleLevel.latestChunkHash) {
      const chunkBytes = await this.fetchChunk(visibleLevel.latestChunkHash);
      this.onChunkReady(visibleLevel.id, chunkBytes);
      this.onFirstInteractive(); // dispatch 'pryzm:first-interactive'
    } else {
      this.onFirstInteractive(); // empty project — still first interactive
    }

    // TIER 3: Background levels — queued with background priority.
    const backgroundLevels = levels.filter(l => l.id !== visibleLevel.id && l.latestChunkHash);
    const distanceFromVisible = (l: typeof levels[0]) => Math.abs(
      levels.indexOf(l) - levels.indexOf(visibleLevel)
    );

    for (const level of backgroundLevels.sort((a, b) => distanceFromVisible(a) - distanceFromVisible(b))) {
      this.queue.push({ tier: 3, levelId: level.id, hash: level.latestChunkHash!, priority: distanceFromVisible(level) });
    }

    this.scheduler.requestFrame('tier3-background-load', 'background');
  }

  async processNextTier3(): Promise<void> {
    // Called from FrameScheduler background queue — max 1 chunk per background frame.
    const next = this.queue.shift();
    if (!next) return;

    const chunkBytes = await this.fetchChunk(next.hash);
    this.onChunkReady(next.levelId, chunkBytes);

    if (this.queue.length > 0) {
      this.scheduler.requestFrame('tier3-background-load', 'background');
    }
  }

  private async fetchChunk(hash: string): Promise<Uint8Array> {
    if (this.loaded.has(hash)) return this.loaded.get(hash)!;

    const bytes = await fetch(`/api/chunks/${hash}`).then(r => r.arrayBuffer()).then(b => new Uint8Array(b));
    this.evictIfNeeded(bytes.byteLength);
    this.loaded.set(hash, bytes);
    this.totalBytes += bytes.byteLength;
    return bytes;
  }

  private evictIfNeeded(incomingBytes: number): void {
    if (this.totalBytes + incomingBytes <= this.MAX_BYTES) return;
    // LRU eviction: remove least-recently-loaded entries until budget is within limit.
    for (const [hash, bytes] of this.loaded) {
      this.loaded.delete(hash);
      this.totalBytes -= bytes.byteLength;
      if (this.totalBytes + incomingBytes <= this.MAX_BYTES) break;
    }
  }
}
```

**Progressive UI reveal**: the editor shows a "Loading level data…" status in the lower-left corner that updates as each background level completes. The `onChunkReady` callback is called with the level ID — the presentation layer uses this to update the status bar. When all levels are loaded, the status bar hides.

**LRU eviction and user navigation**: if the user navigates from Level 1 to Level 15 and back to Level 1, Level 1 may have been evicted. The `fetchChunk` method checks `this.loaded.has(hash)` and re-fetches from R2 if evicted. The 200 MB budget is large enough for ~20 typical levels (each ~10 MB compressed) — eviction should be rare in Phase 1D's fixture scale.

---

#### Implementation Detail — Large Fixture Baking

The 5K-wall × 20-level large fixture must be baked before S23 can be benchmarked. This means the S21 bake worker must process the large fixture in advance. The baking is done in a one-time script:

```bash
# apps/scripts/bake-large-fixture.sh
# Runs once to pre-bake the large fixture for the S23 tier-streamed loader bench.

node apps/bake-worker/dist/cli.js bake-fixture \
  --fixture tests/fixtures/large-project.pryzm-stub.json \
  --output tests/fixtures/large-project-baked/ \
  --levels 20
```

The script calls the bake worker synchronously on each level's events, writes chunks to the local `tests/fixtures/large-project-baked/chunks/` directory (not R2 — local for CI), and writes a `manifest.json`. The tier-streamed loader bench (`apps/bench/load-large.ts`) serves these local files from an Express static server on `localhost:4002`.

**Why local files for CI instead of R2?** R2 adds ~50–150 ms of network latency per chunk fetch (CDN edge, not origin). For CI reproducibility, the bench must be deterministic — R2 latency is not. Local files on the same machine have < 1 ms fetch latency, making the bench reproducible and portable. Production R2 latency is compensated by CDN caching — a user's second load of the same project is served from CDN with < 10 ms latency.

---

#### D1 — Kickoff (30 min)

- B presents `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` draft — 3 tiers, background priority via FrameScheduler, LRU 200 MB eviction, history events on demand. F decides.
- A pivots to large-fixture data preparation — baking 5K walls × 20 levels requires the bake worker from S21 to be operational. Confirm S21 bake worker is ready for batch baking.
- Both: confirm the integration point — `TierStreamedLoader.onChunkReady(levelId, bytes)` → `ChunkReader.read(bytes)` → `SceneCommitter.commit(geometryIRs)`. This chain must be end-to-end tested at D5.

#### D2–D8 Parallel Work

| Day | Agent A (Track A — large-fixture data + integration support) | Agent B (Track B — tier-streamed loader impl) |
|---|---|---|
| D2 | Build large-fixture content: run the S21 bake-fixture script on the 5K-wall skeleton from S19. Monitor bake time — 20 levels × ~20 ms per 250-wall level = ~4 s expected total bake time. Confirm all 20 chunks are produced. | Implement `TierStreamedLoader` Tier 1 (manifest fetch + parse). Unit test: manifest fetch → returns correctly typed `Manifest` in < 100 ms on a small fixture. |
| D3 | Verify large-fixture chunk sizes — measure bytes per level chunk (compressed). Target: ~5–15 MB per 250-wall level after Draco + Meshopt. If > 20 MB per level, investigate why (likely large material textures — not present in Phase 1 — or non-deduplication). | Implement `TierStreamedLoader` Tier 2 (visible-level chunk immediate fetch + commit). End-to-end test: large fixture → manifest → visible-level chunk → `pryzm:first-interactive` event dispatched. Measure time. |
| D4 | Audit fixture realism: compare wall density per level against PRYZM 1 real project benchmarks (target: 200–300 walls per level, varied, not uniform). Adjust fixture if needed. | Implement `TierStreamedLoader` Tier 3 (background levels in FrameScheduler background queue, distance-ordered). |
| D5 | **Mid-sprint sync (1 h)** — run end-to-end large-fixture cold load in `?pryzm2=1&stream=1`. Profile: manifest + Tier 2 timing. Target: < 3 s first interactive. If > 3 s, identify bottleneck now (not at D9). | Same paired session — confirm `FrameScheduler.requestFrame('tier3-background-load', 'background')` is correctly scheduled without interfering with interactive frame budget. |
| D6 | Profile and tune any bottleneck from D5. Common candidates: (1) `ChunkReader.read()` decompressing Draco on the main thread → move to a Web Worker; (2) `SceneCommitter.commit()` building `THREE.Mesh` synchronously → batch across frames; (3) manifest fetch blocked by auth. | Implement progressive UI reveal: `onChunkReady` updates a status bar component with "Loading level X of 20…" feedback. |
| D7 | Stress test: 100 sequential large-fixture loads (no page reload — simulate tab reuse). Assert: no memory leak (heap stable after GC between loads), average first-interactive < 3.5 s. | Implement history events on demand: `TierStreamedLoader.loadHistorySegment(fromSeq, toSeq)` — fetches 500 events from sync server's `LoadEvents` handler, applies to stores. Used by undo-panel when it needs events older than the in-memory undo stack. |
| D8 | `apps/bench/load-large.ts` final implementation — 5 cold-load runs, report p50 and p95. Target: p95 < 3 s first interactive, p95 < 12 s full. CI hard-fail > 4 s. | `docs/04-reference/architecture-detail/loader.md` — full implementation section: tier strategy, eviction policy, history on demand, integration with FrameScheduler. |

#### D9 — Sprint Demo + Retro

- B demos: cold-load 5K-wall × 20-level fixture in `?pryzm2=1&stream=1` — manifest appears, visible-level renders (< 3 s), background levels stream in progressively over ~9 s, OTel shows `pryzm.loader.tier1`, `pryzm.loader.tier2`, `pryzm.loader.tier3` spans with correct latencies.
- A demos: large-fixture bench results; stress test (100 loads, no memory leak); chunk size distribution per level.
- Retro: **K1-E preview check** — small-fixture first-interactive < 800 ms? If not, halt entry to S24 and fix before the alpha gate attempt.

#### S23 Exit Criteria

- [ ] Large fixture (5K walls × 20 levels) first interactive **< 3 s p95**, full **< 12 s** (CI gate).
- [ ] OTel `pryzm.loader.tier1`, `pryzm.loader.tier2`, `pryzm.loader.tier3` spans visible.
- [ ] Progressive UI reveal: level loading status updates correctly.
- [ ] LRU eviction: 100-load stress test shows stable heap (no leak).
- [ ] History-on-demand: `loadHistorySegment(0, 499)` returns events correctly.
- [ ] `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` merged.
- [ ] **K1-E preview**: small-fixture first-interactive < 800 ms confirmed. If not, halt entry to S24.

**Kill-switch K1D-3**: if large-fixture first-interactive > 5 s at D5 — halt. Fix Draco/Meshopt decode latency (move to Web Worker) before proceeding to S24. A > 5 s first interactive means the M12 alpha gate cannot pass — catching this at D5 gives 4 days to fix rather than 0.

---

### S24 — M12 Alpha Gate + Alpha Demo Build
**Weeks 47–48 (Month 12)**

---

#### Context and Why This Matters

S24 is the **most important sprint in Phase 1** — and arguably in the entire 36-month plan. No new features. No new infrastructure. S24's entire purpose is:
1. **Final integration** — wire all Phase 1D systems together in `apps/editor/src/bootstrap.ts`.
2. **Final bench run** — measure every M12 alpha gate target, commit the results.
3. **Alpha demo recording** — a 10-minute screencast that proves to the team and to investors that PRYZM 2 is real and fast.
4. **Phase 1 closure** — archive retros, update risk registers, rest.

**What makes S24 hard**: not complexity — the systems exist. What makes it hard is **integration surprises** — systems that work in isolation but interact badly when fully wired together. The D5 paired integration session (4 h, F + A + B) is the single most important working session of Phase 1. Every surprise found in D5 must be fixed in D6–D8. Surprises found in D9 (demo day) are too late — they delay the alpha gate.

**The integration chain** that must work end-to-end:
```
User click → Command → Handler → Immer patch → SelectionStore/WallStore/...
                                                → ChunkWriter → IndexedDB (local)
                                                → EventLog.appendEvent
                                                    → SyncServer.AppendEvent → Postgres
                                                                             → BullMQ enqueue
                                                                             → BakeWorker → R2
                                                → TierStreamedLoader.invalidate(levelId)
                                                    → fetch new chunk from R2 (signed URL)
                                                    → ChunkReader.read()
                                                    → SceneCommitter.commit()
                                                    → FrameScheduler.requestFrame('scene-changed')
                                                    → Renderer renders frame
                                                    → IdleAccumulator.onMotionStop() → TRAA/SSGI
```

Every arrow in this chain must be tested end-to-end in S24 D5. The OTel trace from a single wall edit should show every step.

---

#### Implementation Detail — `apps/editor/src/bootstrap.ts` Final Integration

The `bootstrap.ts` is the composition root of the PRYZM 2 editor. S24 produces the **final Phase 1 version** of this file:

```typescript
// apps/editor/src/bootstrap.ts (Phase 1D final)

import { ServiceRegistry } from '@pryzm/service-registry';
import { CommandBus } from '@pryzm/command-bus';
import { StoreRegistry } from '@pryzm/stores';
import { FrameScheduler } from '@pryzm/frame-scheduler';
import { SceneCommitter } from '@pryzm/scene-committer';
import { GpuPicker } from '@pryzm/picking';
import { PersistenceClient } from '@pryzm/persistence-client';
import { TierStreamedLoader } from '@pryzm/persistence-client/loader';
import { SyncClient } from '@pryzm/sync-client';
import { ViewRegistry } from '@pryzm/view-state';
import { IdleAccumulator } from '@pryzm/renderer/IdleAccumulator';
import { OTelSDK } from '@pryzm/otel';

// All plugins (Phase 1 element families + selection + view).
import { WallPlugin } from 'plugins/wall';
import { SlabPlugin } from 'plugins/slab';
// ... (all 12 element families + picking + view + selection)

export async function bootstrap(container: HTMLElement): Promise<void> {
  // 1. Observability first — spans must cover all subsequent init.
  const otel = new OTelSDK({ serviceName: 'pryzm-editor', version: '2.0.0-alpha' });
  const span = otel.startSpan('pryzm.boot');

  try {
    // 2. Core layer init (L1 → L2 → L3 → L5).
    const stores = new StoreRegistry();
    const commandBus = new CommandBus(stores);
    const scheduler = new FrameScheduler();

    // 3. Renderer (L5) — WebGPU if available, WebGL2 fallback.
    const renderer = await createRenderer(container, scheduler);
    const idleAccumulator = new IdleAccumulator(scheduler);
    idleAccumulator.register({ id: 'traa', budget: 16, priority: 10, execute: traaPass.execute.bind(traaPass), reset: traaPass.reset.bind(traaPass) });
    idleAccumulator.register({ id: 'ssgi', budget: 32, priority: 5,  execute: ssgiPass.execute.bind(ssgiPass), reset: ssgiPass.reset.bind(ssgiPass) });

    // 4. Scene committer (bridge between L4 and L5).
    const sceneCommitter = new SceneCommitter(renderer.scene, stores, scheduler);

    // 5. Selection + picking.
    const picker = new GpuPicker(renderer.renderer, renderer.scene, renderer.camera);

    // 6. View state.
    const viewRegistry = new ViewRegistry();
    const activeViewStore = stores.get('activeView');

    // 7. Persistence — client side.
    const persistence = new PersistenceClient({ transport: new IndexedDbTransport() });
    const loader = new TierStreamedLoader(
      scheduler, new ChunkReader(), () => persistence.fetchManifest(),
      (levelId, bytes) => sceneCommitter.loadChunk(levelId, bytes),
      () => { window.__pryzmFirstInteractive = true; document.dispatchEvent(new Event('pryzm:first-interactive')); }
    );

    // 8. Sync client (connects to sync-server).
    const syncClient = new SyncClient({
      url: import.meta.env.VITE_SYNC_SERVER_URL ?? 'ws://localhost:4000',
      commandBus,
      onRemoteEvent: (event) => {
        commandBus.applyEvent(event);
        loader.invalidateLevel(event.payload.levelId);
      },
    });

    // 9. Register all plugins.
    const registry = new ServiceRegistry({ stores, commandBus, scheduler, sceneCommitter, picker, viewRegistry, persistence, syncClient });
    [WallPlugin, SlabPlugin, /* ...all 12... */].forEach(p => p.activate(registry));

    // 10. Load the project (tier-streamed).
    const projectId = new URLSearchParams(location.search).get('projectId') ?? 'default';
    const visibleLevelId = new URLSearchParams(location.search).get('levelId') ?? undefined;
    await loader.load(projectId, visibleLevelId);

    // 11. Start the frame loop.
    scheduler.start();

    span.setStatus({ code: 'OK' });
  } catch (err) {
    span.setStatus({ code: 'ERROR', message: String(err) });
    throw err;
  } finally {
    span.end();
  }
}
```

**Why `bootstrap.ts` is a flat imperative sequence**: dependency injection frameworks (InversifyJS, tsyringe) add complexity without clarity for a system of this size. The boot sequence has a natural total order (stores before command bus, command bus before plugins, plugins before load, load before scheduler start). A flat imperative sequence makes this order explicit and readable. The `ServiceRegistry` is passed to plugins, not the full `bootstrap.ts` scope.

**`loader.invalidateLevel`**: when the sync client receives a remote event, it calls `loader.invalidateLevel(levelId)` after applying the event to the stores. This causes the loader to re-fetch the latest chunk for that level from R2 (using the updated `latestChunkHash` from the manifest — which the sync server updates after the bake worker completes). The UI shows the updated geometry within bake-time (< 1.5 s) of the event being received.

---

#### Implementation Detail — Final Bench Run Script

```bash
#!/usr/bin/env bash
# apps/bench/run-all.sh — runs all M12 alpha gate benches in sequence.
# Each bench writes to apps/bench/reports/<bench-name>.json.
# Final report summarised in apps/bench/reports/M12-alpha.md.

set -e

echo "=== M12 ALPHA GATE BENCH RUN ==="
echo "Started: $(date)"

# Load performance
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/load-small.ts
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/load-medium.ts
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/load-large.ts

# Edit + persistence
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/save-edit.ts
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/bake-incremental.ts

# Rendering
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/idle-cpu.ts
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/orbit-fps.ts

# Sync
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/sync-roundtrip.ts

# Undo
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/undo-single.ts

# Pack / unpack
node --experimental-vm-modules node_modules/.bin/vitest run apps/bench/pack-unpack.ts

# Bundle size
pnpm vite build --mode production --outDir dist/alpha
node apps/bench/bundle-size.js dist/alpha

# Headless
node apps/headless/dist/cli.js new-project bench && \
  node apps/headless/dist/cli.js add-wall bench --x1 0 --y1 0 --x2 5 --y2 0 --height 3 && \
  node apps/headless/dist/cli.js export-pryzm bench -o bench.pryzm-stub

# Compile M12 alpha report
node apps/bench/generate-report.js > apps/bench/reports/M12-alpha.md

echo "=== BENCH RUN COMPLETE ==="
cat apps/bench/reports/M12-alpha.md
```

**`generate-report.js`**: reads all `apps/bench/reports/*.json`, formats them into a markdown table showing Target / Actual / Status (PASS / FAIL) for each metric, and exits with code 1 if any metric fails. The CI runs this script on every PR in the integration sprint — any regression blocks merge.

---

#### D1 — Kickoff (45 min, F + A + B)

- F walks through the M12 ALPHA GATE checklist (§S24 exit criteria) — every item discussed; expected status of each based on S19–S23 outcomes.
- A and B agree integration plan: D2–D4 final wiring, D5 paired integration session (4 h), D6 bench run, D7 demo recording, D8 retro prep.
- **No new features in S24** — explicitly stated and agreed. If a missing feature is discovered in D5, it is either fixed in < 2 h or filed as a Phase 2 backlog item. It is not added to S24's scope.
- F reviews all four kill-switches (K1D-1 through K1D-4). K1D-4: if any performance criterion fails at D6 bench run, Phase 2 does not start. S24 is extended by up to 4 weeks (S25-prep sprint) to fix the failures.

#### D2–D8 Parallel Work

| Day | Agent A (Track A — persistence + sync integration final pass) | Agent B (Track B — bake + loader + render integration final pass) |
|---|---|---|
| D2 | Final `bootstrap.ts` data half: event log, chunk writer, sync client, tier-streamed loader — all wired. Confirm `SyncClient.onRemoteEvent → loader.invalidateLevel` chain. | Final `bootstrap.ts` render half: tier-streamed loader → chunk reader → scene committer → frame scheduler — wired. Confirm `loader.onChunkReady → sceneCommitter.loadChunk`. |
| D3 | Audit: do all 12 element family commands round-trip through sync server? Create one of each, verify event appears in Postgres `event_log` table. | Audit: are idle-CPU, orbit-fps, picking-latency benches still green with full integration (all systems running together)? Individual bench green ≠ integration green. |
| D4 | Re-run all 12 element parity fixtures end-to-end: create element via command → save → reload → geometry matches snapshot. Confirm no regressions from S18's parity tests. | Re-run all 1A-1C bench dashboard items: `idle-cpu`, `orbit-fps`, `picking-latency`, `view-switch` — all must still be green with the full 1D persistence stack active. |
| D5 | **Paired integration session (4 h, F + A + B)** — open `?pryzm2=1`; walk through complete user workflow: create project → draw 5 walls + 1 slab + 1 door → undo → redo → export `.pryzm` → reload from `.pryzm` → open in headless → add wall in headless → pack → open in browser → multi-tab (2 tabs, draw in each, both see the other's walls). Profile OTel trace of single wall edit — every arrow in the integration chain must have a span. | Same session. |
| D6 | **`apps/bench/run-all.sh`** — every M12 alpha gate target measured. Report in `apps/bench/reports/M12-alpha.md`. If any target misses, this is K1D-4 — F decides: extend by up to 4 weeks to fix, or scope-cut. | Same — partner with A on running the bench suite and analysing failures. |
| D7 | Alpha demo recording (joint, 10-min screencast — see §3 for script). | Same — co-pilot the recording. |
| D8 | Phase 2 kickoff readiness: fill in `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md §0`; update risk register with lessons from Phase 1; confirm S25 sprint plan is drafted. | Phase 1 retro report `docs/03-execution/status/retros/PHASE-1-CLOSE.md`: what worked (two-agent parallel structure), what didn't (any sprint that blew its kill-switch), what changes for Phase 2. |

#### D9 — M12 Alpha Gate: Sprint Demo + Retro (Joint, 2 h)

- F walks the M12 ALPHA GATE checklist with A + B; each item checked off live against the `M12-alpha.md` bench report.
- Joint demo: play the recorded alpha screencast (see §3). All checklist items confirmed.
- Retro covers all of Phase 1: what worked in the two-agent parallel structure? What slowed it? What structural changes for Phase 2's larger scope?
- F formally signs off: "Phase 1 complete" (all criteria green) **or** "extend by N weeks" (criteria still failing; scope-cut or tune).

#### D10 — Phase 1 Close (1 day, F + A + B)

- Archive all sprint retros S01–S24 in `docs/03-execution/status/retros/`.
- Move any open backlog items not addressed in Phase 1 → `docs/phase-2-backlog.md`.
- Founder rest week (7 days, non-negotiable) — no coding, no PR reviews. Starts D10 of S24, ends before S25 D1.

#### S24 Exit Criteria (= M12 Alpha Gate)

The following criteria are the **binding contract for Phase 1 close**. All must be green before F signs off.

##### Functional
- [ ] 12 element families end-to-end: Wall, Slab, Door, Window, Roof, Curtain Wall, Grid, Column, Beam, Stair, Handrail, Ceiling.
- [ ] Parity tests vs PRYZM 1 green on `tests/parity/` (all snapshot fixtures).
- [ ] Selection + picking work across all 12 element types.
- [ ] `?pryzm2=1` URL flag swaps stacks; PRYZM 1 unchanged at default URL.
- [ ] Multi-tab: two tabs editing the same project see each other's events (LWW).
- [ ] 3 CDE legacy commands folded into sync protocol.

##### Performance
- [ ] Cold load — small **< 800 ms** first interactive (CI gate, `apps/bench/load-small.ts`).
- [ ] Cold load — medium **< 1.5 s** first interactive (CI gate, `apps/bench/load-medium.ts`).
- [ ] Cold load — large **< 3 s** first interactive (CI gate, `apps/bench/load-large.ts`).
- [ ] Save: **< 10 ms** event append (CI gate, `apps/bench/save-edit.ts`).
- [ ] Idle CPU: **< 2%** with full post-FX (CI gate, `apps/bench/idle-cpu.ts`).
- [ ] Orbit fps: **> 55 fps p95** (CI gate, `apps/bench/orbit-fps.ts`).
- [ ] Bake incremental: **< 1.5 s** single-element edit → chunk available (CI gate, `apps/bench/bake-incremental.ts`).
- [ ] Bundle: **< 1.8 MB gzip** initial (CI gate, `apps/bench/bundle-size.js`).
- [ ] Undo: **< 5 ms** single wall edit (CI gate, `apps/bench/undo-single.ts`).
- [ ] Sync roundtrip: **< 250 ms p95** (CI gate, `apps/bench/sync-roundtrip.ts`).

##### Architectural
- [ ] Zero `(window as any)` in PRYZM 2 `packages/` and `plugins/`.
- [ ] Zero non-scheduler `requestAnimationFrame(` in PRYZM 2 code.
- [ ] Zero THREE imports outside `packages/scene-committer/` and `plugins/*/committer.ts`.
- [ ] All boundary lint rules (`eslint-plugin-boundaries`) active and PR-blocking.
- [ ] 100% of command handlers declare `affectedStores` (CI gate).
- [ ] Zero ESLint disable comments on boundary rules.

##### Persistence + Portability
- [ ] `.pryzm` v1 round-trips losslessly on all three fixtures (small, medium, large).
- [ ] `@pryzm/headless` runs small fixture in Node; produces identical `.pryzm` to browser.
- [ ] Bake worker producing R2-hosted chunks with signed URLs.
- [ ] Tier-streamed loader operational with all 3 tiers.
- [ ] Migration framework live; v0 → v1 stub raises clear error.

##### Observability
- [ ] OTel coverage: `pryzm.command.execute`, `pryzm.persistence.append`, `pryzm.scene.commit`, `pryzm.frame.render`, `pryzm.bake.chunk`, `pryzm.loader.tier1`, `pryzm.loader.tier2`, `pryzm.loader.tier3` all firing in production build.
- [ ] Honeycomb / Tempo dashboard live for the alpha build (configured in `apps/editor/src/otel-config.ts`).
- [ ] Single wall-edit OTel trace spans all layers from command to pixel (verifiable in Honeycomb).

##### Documentation
- [ ] All 15 architecture docs committed: `schemas`, `command-bus`, `frame-scheduler`, `scene-committer`, `renderer`, `persistence`, `chunks`, `bake-worker`, `file-format`, `loader`, `sync-server-protocol`, `headless`, `picking`, `selection`, `view-state`, `camera`, `element-coupling`, `element-recipe`.
- [ ] `docs/04-reference/file-formats/pryzm-binary.md` complete.
- [ ] `apps/bench/reports/M12-alpha.md` published with all numbers.
- [ ] 10-min alpha demo screencast in `docs/05-guides/developer/demos/M12-alpha.mp4`.

##### Process
- [ ] All 19 Phase 1 ADRs: 18 merged, ≤ 1 deferred (with reason in `docs/adr/deferred.md`).
- [ ] Sprint retros S01–S24 archived in `docs/03-execution/status/retros/`.
- [ ] Phase 1 retro `docs/03-execution/status/retros/PHASE-1-CLOSE.md` published.
- [ ] Phase 2 risk register updated.
- [ ] S25 sprint plan drafted in `docs/03-execution/status/sprints/S25.md`.
- [ ] One full week of buffer before S25 begins (founder rest week — non-negotiable).
- [ ] PRYZM 1 customer support queue: no P0/P1 unresolved.

---

## §3 The M12 Alpha Demo Recording (Joint, 10-min Screencast)

Committed to `docs/05-guides/developer/demos/M12-alpha.mp4`. Every timestamp is scripted — do not ad-lib.

**(0:00–0:30) Proof PRYZM 1 still ships**: open `apps/editor` at the default URL — PRYZM 1 loads with a real customer project. Caption: "PRYZM 1 is unchanged. Our paying customers are unaffected."

**(0:30–1:30) Speed proof — small fixture**: navigate to `?pryzm2=1`. Stopwatch overlay (via OBS or browser extension). Small fixture loads. Caption: "< 800 ms first interactive." Switch to DevTools Network tab: manifest fetch → chunk fetch → first-interactive event. Then switch to OTel (Honeycomb): trace shows every layer.

**(1:30–3:00) Edit + undo + redo**: place 5 walls using the wall tool, then 1 slab, then 1 door. Each placement shows the event appended in OTel (< 10 ms). Undo 3 times (each < 5 ms). Redo 3 times. Cut to DevTools performance profile: Immer patch reverse-apply on undo, no full-state clone.

**(3:00–4:00) Save + reload**: hard-reload the page (`Ctrl+Shift+R`) — same project restores in < 800 ms. Caption: "Zero full-snapshot POST. Events only."

**(4:00–5:30) `.pryzm` round-trip**: click "Export" → `demo.pryzm` downloads. Open terminal beside browser: `unzip -l demo.pryzm` — show ZIP contents (manifest, events, chunks). `pryzm-cli unpack demo.pryzm -o recovered/` → `pryzm-cli add-wall recovered/demo ...` → `pryzm-cli pack recovered/demo -o modified.pryzm` → drag `modified.pryzm` into browser → modified project opens with the new wall.

**(5:30–7:00) Medium fixture — tier streaming**: `?pryzm2=1&open=medium-fixture.pryzm` → visible level appears (stopwatch: < 1.5 s). Background levels stream in over ~3 s — subtle status bar shows "Loading level X of 5". Caption: "500 walls × 5 levels. 1.5 s to first interactive."

**(7:00–8:30) Large fixture**: open 5K-wall × 20-level fixture → stopwatch → < 3 s first interactive; full scene over ~12 s. Caption: "5,000 walls × 20 levels. < 3 s to first interactive."

**(8:30–9:00) Multi-tab**: two browser windows side-by-side, same project. Draw wall in left window — appears in right within ~1 s. Caption: "Real-time sync. Last-writer-wins in Phase 1; CRDT in Phase 2."

**(9:00–9:30) CI dashboard**: show `docs/bench/dashboard.html` — all rows green. Caption: "Every promise on a CI gate."

**(9:30–10:00) OTel flame graph**: single wall-edit trace in Honeycomb — click to pixel, every layer instrumented. Caption: "100% OTel coverage on hot paths."

---

## §4 Cross-Cutting Deliverables for 1D

### §4.1 ADRs Merged by M12

| ID | Subject | Key Decision | Owner | Sprint |
|---|---|---|---|---|
| `[strategic ADR-010]` | Bake coalescing window | 250 ms window; per-project FIFO BullMQ queue; SIGTERM flush; ULID sort | B (F decides) | S21 |
| `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` | `.pryzm` format v1 spec | ZIP layout; content-addressed chunks; 1000-event batches; Ed25519 optional; migration framework | A (F decides) | S20 |
| `code-level ADR docs/02-decisions/adrs/0018-tier-streamed-loader.md` | Tier-streamed loader strategy | 3 tiers; FrameScheduler background priority; LRU 200 MB eviction; history on demand in 500-event pages | B (F decides) | S23 |
| `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` | Sync-server linearisation (LWW until 2D CRDT) | Postgres advisory lock per project; per-project monotonic sequences; LWW; explicit limitations documented; upgrade path to Yjs in 2D | A (F decides) | S22 |

### §4.2 CI Gates Added in 1D

| Gate | File | Hard-fail Threshold | Sprint |
|---|---|---|---|
| `load-medium` with chunked persistence | `apps/bench/load-medium.ts` | > 2 s first interactive | S19 |
| Codec compression ratio | `apps/bench/codec-ratio.ts` | < 50% reduction vs raw Float32Array | S19 |
| Bundle impact (codec libs) | `apps/bench/bundle-size.js` | > 200 KB additional gzip | S19 |
| `pack-unpack` medium fixture | `apps/bench/pack-unpack.ts` | pack > 7 s, unpack > 4 s | S20 |
| `.pryzm` round-trip lossless | `packages/file-format/__tests__/round-trip.test.ts` | Any byte difference | S20 |
| `bake-incremental` single wall edit → chunk | `apps/bench/bake-incremental.ts` | > 2 s | S21 |
| Coalescing: 20 edits in 500 ms → ≤ 2 jobs | Unit test on `CoalesceWindow` | > 2 jobs produced | S21 |
| `sync-roundtrip` event latency | `apps/bench/sync-roundtrip.ts` | > 350 ms p95 | S22 |
| `load-large` first interactive | `apps/bench/load-large.ts` | > 4 s | S23 |
| `load-small` (final, with full stack) | `apps/bench/load-small.ts` | > 1 s | S24 |
| `idle-cpu` (full integration) | `apps/bench/idle-cpu.ts` | > 2.5% | S24 |
| `orbit-fps` (full integration) | `apps/bench/orbit-fps.ts` | < 50 fps p95 | S24 |
| Bundle size (final) | `apps/bench/bundle-size.js` | > 1.8 MB gzip initial | S24 |
| OTel coverage (hot paths) | Custom CI check | Any uncovered hot-path function in L0–L6 | S24 |

### §4.3 OTel Spans Added in 1D

| Span Name | Layer | Where Emitted | Sprint |
|---|---|---|---|
| `pryzm.chunks.write` | L0 | `ChunkWriter.write()` entry | S19 |
| `pryzm.chunks.read` | L0 | `ChunkReader.read()` entry | S19 |
| `pryzm.chunks.codec.draco.encode` | L0 | `dracoEncode()` | S19 |
| `pryzm.chunks.codec.draco.decode` | L0 | `dracoDecode()` | S19 |
| `pryzm.format.pack` | L0 | `pack()` entry | S20 |
| `pryzm.format.unpack` | L0 | `unpack()` entry | S20 |
| `pryzm.bake.enqueue` | L0 | `CoalesceWindow.flush()` → queue.add | S21 |
| `pryzm.bake.chunk` | L0 | `processRebakeJob()` entry | S21 |
| `pryzm.bake.r2.upload` | L0 | `R2Storage.put()` | S21 |
| `pryzm.bake.r2.get` | L0 | `R2Storage.get()` | S21 |
| `pryzm.sync.append` | L3 | `handleAppendEvent()` | S22 |
| `pryzm.sync.broadcast` | L3 | `SessionManager.broadcastToProject()` | S22 |
| `pryzm.sync.sequence` | L3 | Sequence assignment in `handleAppendEvent` | S22 |
| `pryzm.loader.tier1` | L0 | `TierStreamedLoader.load()` manifest fetch | S23 |
| `pryzm.loader.tier2` | L0 | Visible-level chunk fetch | S23 |
| `pryzm.loader.tier3` | L0 | Background-level chunk fetch | S23 |
| `pryzm.loader.evict` | L0 | `TierStreamedLoader.evictIfNeeded()` | S23 |
| `pryzm.boot` | L7 | `bootstrap()` root span | S24 |

### §4.4 Documentation Produced in 1D

| File | Content | Sprint |
|---|---|---|
| `docs/04-reference/architecture-detail/chunks.md` | Chunk format, ChunkWriter/Reader, codec pipeline, content-addressing | S19 |
| `docs/04-reference/file-formats/pryzm-binary.md` | `.pryzm` v1 full spec — ZIP layout, manifest schema, event batch format, signature scheme, migration contract | S20 |
| `docs/04-reference/architecture-detail/bake-worker.md` | Job lifecycle, coalescing logic, R2 layout, ops runbook (start, configure, scale, monitor) | S21 |
| `docs/04-reference/architecture-detail/sync-server-protocol.md` | Event linearisation model, sequence numbering, LWW policy, limitations, upgrade path to CRDT | S22 |
| `docs/04-reference/architecture-detail/loader.md` | Tier strategy, eviction policy, history on demand, FrameScheduler integration | S23 |
| `apps/bench/reports/M12-alpha.md` | All M12 alpha gate bench results (target / actual / status) | S24 |
| `docs/03-execution/status/retros/PHASE-1-CLOSE.md` | Phase 1 retrospective: what worked, what didn't, what changes for Phase 2 | S24 |
| `docs/05-guides/developer/demos/M12-alpha.mp4` | 10-min alpha demo recording | S24 |

---

## §5 Risk Register (1D-Specific)

| ID | Risk | Likelihood | Impact | Mitigation | Sprint at Risk | Escalation Trigger |
|---|---|---|---|---|---|---|
| **R1D-01** | Draco decode latency dominates chunk load time (main thread WASM) | High | High | Move Draco decode to a dedicated Web Worker; post decoded `Float32Array` to main thread via `Transferable` | S19 | > 300 ms Draco decode on main thread at D5 |
| **R1D-02** | `ChunkWriter` produces chunks too large for the 200 MB LRU budget per session | Medium | Medium | Audit chunk sizes at S19 D3; if > 20 MB per 250-wall level, investigate: (1) un-deduplicated material textures, (2) un-quantized positions | S19 | Any chunk > 20 MB |
| **R1D-03** | `.pryzm` format spec changes after `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` is merged | Low | High | `code-level ADR docs/02-decisions/adrs/0017-pryzm-zip-format-v1.md` frozen at S20 D1; any change requires a new ADR and a new `schemaVersion`; migration framework enforces this mechanically | S20+ | Any PR attempting to change `ManifestSchema` without a new ADR |
| **R1D-04** | Bake worker OOM (geometry producer builds large intermediate arrays for dense levels) | Medium | High | Pre-allocate `Float32Array` in producers (established in S14 Stair producer); run bake worker with `--max-old-space-size=1024`; profile heap at S21 D5 | S21 | Bake worker OOM on large fixture |
| **R1D-05** | R2 outage or credential misconfiguration blocks S21 | Low | High | Use local-file transport for CI (not R2); R2 only for integration tests; S3-compatible interface allows MinIO fallback for self-host | S21 | Any R2 connectivity failure in CI |
| **R1D-06** | BullMQ Redis dependency adds operational complexity for self-host | Medium | Medium | Document Redis requirement in self-host guide; provide `docker-compose.yml` with Redis included; consider in-process BullMQ alternative for single-instance deploys | S21 | Self-host guide review |
| **R1D-07** | Sync server advisory lock becomes a bottleneck at high event rate (> 10 events/s per project) | Low | Medium | At 10 events/s: lock held < 1 ms per event → < 1% contention. At 100 events/s: investigate Postgres sequence per project as alternative. Coalescing window (`[strategic ADR-010]`) reduces effective rate | S22 | Sync-roundtrip bench > 250 ms under load |
| **R1D-08** | LWW data loss in alpha testing (two users overwrite each other) | Medium | Medium | `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` explicitly documents the limitation; alpha build shows "Multi-user caution" banner when > 1 user connected; CRDT in 2D removes this | S22 | Any alpha user reports data loss |
| **R1D-09** | Tier-streamed loader misses < 3 s on large fixture | Medium | High | D5 measurement in S23 (not D9 — leaves 4 days to fix); primary knobs: move Draco decode off main thread, batch `SceneCommitter.commit()` across frames | S23 | > 4 s at D5 → halt |
| **R1D-10** | S24 integration reveals a show-stopper incompatibility between systems | Medium | Critical | D5 paired session (4 h, F + A + B) explicitly designed to surface this; any incompatibility found in D5 has 3 days (D6–D8) to be fixed before demo | S24 | Any system incompatibility at D5 |
| **R1D-11** | Headless K1-B re-fires under final integration (bake worker introduces a THREE import) | Low | Critical | S24 D2 audit: run `pryzm-no-three-in-kernel` lint on `@pryzm/headless` + bake worker dependency graph; if it fires, halt | S24 | Lint failure → halt immediately |
| **R1D-12** | M12 alpha gate misses on a performance criterion in S24 | Medium | Critical | K1D-4 — do not enter Phase 2. S24 extended by up to 4 weeks. F makes scope-cut decisions if needed | S24 | Any performance criterion red at D6 bench run |

### Kill-Switches (1D-Specific)

- **K1D-1**: If medium-fixture reload > 2 s at end of S19 D8 — **halt 1D**. Investigate Draco decode latency on main thread. Most likely fix: move `dracoDecode()` to a `Worker` (via `Comlink` or `postMessage` with `Transferable`). Do not proceed to S20 until < 1.5 s is achieved.

- **K1D-2**: If bake-incremental > 30 s on production-scale data at end of S21 D9 — **halt 1D**. Investigate: (1) `createHeadlessSession()` startup cost, (2) `loadFromChunk()` parsing the full chunk on every edit (fix: cache the parsed state per chunk hash), (3) geometry producer being O(N²) for dense levels. Do not proceed to S22 until < 1.5 s is confirmed.

- **K1D-3**: If large-fixture first-interactive > 5 s at S23 D5 — **halt S23**. Fix before D9. Primary options: (1) move all Draco decode to a `Worker` pool, (2) batch `SceneCommitter.commit()` across frames using FrameScheduler, (3) reduce large-fixture wall count if the fixture is pathological (verify realism first). Do not proceed to S24 until < 3 s is achieved.

- **K1D-4 (THE BIG ONE)**: If S24 D6 bench run shows any M12 alpha gate performance criterion failing — **do not enter Phase 2**. Extend S24 by up to 4 additional weeks (a de facto S25-prep sprint). Use those weeks to: (1) profile and fix the failing criterion, (2) re-run the full bench suite, (3) get F's explicit sign-off on each green criterion. Phase 2 starts only after the sign-off. No exceptions — cutting Phase 2 scope to compensate for Phase 1 performance gaps rebuilds PRYZM 1 a second time.

---

## §6 1D → Phase 2 Handoff Checklist

This checklist must be **entirely green** on M13 D1 (S25 kickoff), after the founder's rest week. Any red item blocks S25.

### Performance (The Alpha Gate)
- [ ] All M12 ALPHA GATE performance criteria green (see §S24 exit criteria performance section).
- [ ] `apps/bench/reports/M12-alpha.md` reviewed by F and committed.
- [ ] No bench regressed > 5% vs its own historical baseline from S19–S23.

### Architecture
- [ ] All 19 Phase 1 ADRs: 18 merged, ≤ 1 explicitly deferred (with reason in `docs/adr/deferred.md`).
- [ ] All Phase 1 CI gates active and PR-blocking.
- [ ] Zero `(window as any)` in PRYZM 2 packages.
- [ ] Zero non-scheduler `requestAnimationFrame(` in PRYZM 2 packages.
- [ ] Zero THREE imports outside committers.
- [ ] All boundary lint rules active.

### Systems
- [ ] Bake worker operational (R2 + BullMQ + worker_threads).
- [ ] Sync server operational (Postgres + WebSocket + LWW linearisation).
- [ ] Tier-streamed loader operational (all 3 tiers).
- [ ] `.pryzm` v1 format frozen and round-tripping.
- [ ] `@pryzm/headless` running in Node (K1-B confirmed and holding).

### Documentation
- [ ] All 18 architecture docs committed and reviewed.
- [ ] `docs/04-reference/file-formats/pryzm-binary.md` complete.
- [ ] `docs/03-execution/status/retros/PHASE-1-CLOSE.md` published.
- [ ] `docs/05-guides/developer/demos/M12-alpha.mp4` committed.

### Process
- [ ] Sprint retros S01–S24 archived in `docs/03-execution/status/retros/`.
- [ ] Phase 2 risk register updated with lessons from Phase 1.
- [ ] S25 sprint plan drafted in `docs/03-execution/status/sprints/S25.md`.
- [ ] Phase 2 hiring plan confirmed (any hires needed per `10-MASTER-IMPLEMENTATION-PLAN-36M.md`).
- [ ] PRYZM 1 customer support queue reviewed; no P0/P1 unresolved.
- [ ] Founder rest week completed (non-negotiable — this is operationally critical for a 36-month programme).
- [ ] Open backlog items documented in `docs/phase-2-backlog.md`.
- [ ] One-day buffer between S24 D10 and S25 D1 (rest week + planning).

---

## §7 What Sub-phase 1D Explicitly Did NOT Do

For architectural honesty — these items are deferred by design, not oversight:

- **No CRDT.** The sync server uses last-writer-wins with sequence guarantees. Full Yjs-based CRDT (conflict-free merge of concurrent geometry edits) lands in Phase 2D (S43–S44). `code-level ADR docs/02-decisions/adrs/0019-sync-server-linearisation.md` documents this limitation and the upgrade path explicitly.
- **No conflict resolution UI.** The conflict inbox (shows conflicting edits for user resolution) requires CRDT to identify conflicts. It lands in Phase 2D.
- **No production R2 deployment.** S21's R2 wiring uses dev credentials and a dev bucket. Production deployment infrastructure (terraform, IAM, CDN config, multi-region) lands in Phase 3D.
- **No customer migration.** No PRYZM 1 paying customer is migrated to PRYZM 2 in M12. The v0 → v1 migration script stub (S20) raises a clear "use the importer plugin" error. Full PRYZM 1 import lands in Phase 3D.
- **No marketing or public release.** The M12 alpha is internal — team + investors only. The demo recording is proof of architecture, not a marketing asset. The first public release is the Phase 2D beta (M24).
- **No multi-tenant access control.** The sync server accepts any `userId` without JWT verification. Role-based access control, Supabase RLS, and per-project permissions land in Phase 3C.
- **No browser matrix beyond Chromium.** Firefox, Safari, Edge, and mobile browsers are not tested or verified in Phase 1D. The browser matrix pass happens in Phase 3D.
- **No accessibility audit.** WCAG compliance pass lands in Phase 3D.
- **No BullMQ Redis HA.** Phase 1D uses a single Redis instance. Redis HA (Sentinel or Cluster) is a Phase 3D ops concern.

---

*Last updated: 2026-04-26. Owner: Founder + Architecture lead.*
*Conflicts? `08-VISION.md` overrides. Predecessor: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md`. Successor: `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md`. The M12 ALPHA GATE in §S24 is the binding contract for Phase 1 close.*
