# SPEC-26 — `.pryzm` File Format v1 (Binary, Portable, Versioned)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | **format v1** (file format version is independent of this SPEC's version) |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §10, §29 #2` (.pryzm referenced 80+ times, 0 specification) |
| Phases | 1D (alpha format land), 2A (round-trip), 2D (sync-aware), 3D (GA frozen) |
| Replaces / extends | the textual references in `08-VISION.md`, `[strategic ADR-002]`, `SPEC-02 §6`, `10-MASTER…` §3 |

> **The `.pryzm` file is the single portable artefact for a PRYZM project.** It is the upload, the share, the export, the headless-CLI input, the offline backup, and the self-host hand-off. This SPEC defines its byte layout, manifest, version-evolution rules, and CI gates. Every persistence / sync / bake / IFC decision downstream depends on it.

---

## §1 What a `.pryzm` is

A **`.pryzm` is a ZIP archive** with a fixed internal layout. The ZIP shell is chosen so that:
- Standard tools can open it (debugging, support).
- Per-file compression is independent (Draco for chunks, Zstd for text, Stored for already-compressed).
- Append-only edits at upload time are cheap (no full re-ZIP on every save).

The `.pryzm` is a **complete, self-describing project**. Opening one in PRYZM 2 requires only the file, no server.

---

## §2 Byte layout

```
project.pryzm  (ZIP)
├── manifest.json                 # JSON, deflated; the index
├── events/
│   ├── 00000000.evt.bin          # MessagePack event blocks; ULID-ordered
│   ├── 00000001.evt.bin
│   └── ...                       # 4 MiB each; appended monotonically
├── snapshots/
│   └── 00000000.snap.evt.bin     # __snapshot.v1 events (compaction outputs per SPEC-02 §3)
├── chunks/
│   ├── lod0/
│   │   ├── L0_walls_<hash>.glb   # Draco-compressed glTF; per-element-class per-level
│   │   └── ...
│   ├── lod1/
│   └── lod2/
├── imports/
│   ├── source.ifc.zst            # original IFC (if imported); zstd-compressed
│   ├── source.dxf.zst            # original DXF (if imported)
│   └── source.3dm.zst            # original Rhino (if imported)
├── thumbnails/
│   ├── thumb_512.webp            # project tile thumbnail
│   └── thumb_1024.webp
├── plugins/
│   ├── installed.json            # plugin install state at save-time (manifest IDs + versions)
│   └── data/
│       └── <plugin-id>/...       # per-plugin opaque data (sandboxed)
├── ai/
│   ├── proposals/                # archived AI proposals (approved + rejected)
│   ├── usage.jsonl               # AI usage events for cost audit (SPEC-28)
│   └── prompts.jsonl             # prompt SHAs used (immutable; SPEC-07)
└── meta/
    ├── README.txt                # plain-text human-readable explainer
    ├── LICENSE                   # if applicable
    └── checksum.sha256           # SHA-256 of all files in archive (excluding meta/checksum.sha256)
```

---

## §3 `manifest.json` schema

`manifest.json` is the index. Without it the archive is malformed.

```ts
interface PryzmManifestV1 {
  /** Schema version; this is `1`. Every breaking change increments the integer. */
  formatVersion: 1;
  /** PRYZM application semver that wrote this file. Informational. */
  writerVersion: string;          // e.g. "2.4.7-beta"
  /** Project identity. */
  project: {
    id: ProjectId;                // ULID
    name: string;
    createdAt: string;            // ISO-8601 UTC
    lastModifiedAt: string;       // ISO-8601 UTC
    creatorUserId: UserId | null; // null if exported anonymously
  };
  /** Counts — quick to read without scanning. */
  counts: {
    events: number;
    snapshots: number;
    elementsByFamily: Record<ElementFamily, number>;
    chunksByLOD: Record<'lod0'|'lod1'|'lod2', number>;
  };
  /** Event-log ranges. */
  eventRanges: Array<{ file: string; firstUlid: string; lastUlid: string; count: number }>;
  /** Snapshot index. */
  snapshots: Array<{ file: string; ulidAtSnapshot: string; coversEventCount: number }>;
  /** Chunk index. */
  chunks: Array<{
    file: string;
    lod: 'lod0'|'lod1'|'lod2';
    family: ElementFamily;
    levelId: LevelId;
    instanceCount: number;
    sizeBytes: number;
  }>;
  /** Imports preserved. */
  imports: Array<{ kind: 'ifc'|'dxf'|'3dm'|'gltf'; file: string; sizeBytes: number; importedAt: string }>;
  /** Plugins state. */
  plugins: Array<{ id: string; version: string; manifestSha: string; data?: string /* path */ }>;
  /** AI footprint. */
  ai: { proposalCount: number; usageEvents: number; promptCount: number };
  /** Provenance. */
  provenance: {
    parentFileSha?: string;       // SHA-256 of the prior `.pryzm` it was derived from
    transformations?: Array<{ at: string; kind: 'compaction'|'export'|'merge'; note?: string }>;
  };
  /** Integrity. */
  integrity: {
    eventsSha256: string;         // SHA-256 of concatenated events/*.evt.bin in event-range order
    chunksSha256: string;         // SHA-256 of concatenated chunks/**/*.glb in manifest order
    fullSha256: string;           // SHA-256 of all files except meta/checksum.sha256
  };
}
```

---

## §4 Event block format (`events/*.evt.bin`)

Each `.evt.bin` is a sequence of MessagePack-encoded **event records**:

```ts
interface EventRecord {
  ulid: string;            // 26-char Crockford ULID; monotonic per project
  sequence: number;        // global sequence within the project
  actorId: ActorId;        // user or AI actor
  actorKind: 'user'|'ai'|'system'|'plugin';
  type: string;            // e.g. "wall.create", "wall.move", "__snapshot.v1"
  payload: unknown;        // family-specific shape, validated at apply-time by Zod
  causedBy?: string;       // ULID of the event this depended on (for command-causality graphs)
  appliedAt: string;       // ISO-8601 UTC, when the writer applied it
}
```

Records are length-prefixed (4-byte big-endian uint32). Reader streams; never loads a whole `.evt.bin` into memory.

`__snapshot.v1` events carry a full projection of the model state at a ULID checkpoint. Per SPEC-02 §3, snapshots are emitted at >500k events or >1GB cumulative payload.

---

## §5 Chunk format (`chunks/**/*.glb`)

- **Container:** glTF 2.0 binary (`.glb`).
- **Mesh compression:** Draco level 7 (per `[strategic ADR-003]` reasoning: best size/decode balance at the editor's mesh density).
- **Texture compression:** KTX2 / Basis where used.
- **Naming:** `<level>_<family>_<contentHash>.glb` where `<contentHash>` is the first 12 chars of SHA-256 of the chunk's input envelope set. This makes chunks **content-addressable**: same input → same chunk → CDN cacheability.
- **LOD policy:** lod0 (visible-on-paint), lod1 (after-paint within frustum), lod2 (zoomed-out / far-frustum). Per SPEC-12 §9.

Each chunk's `extras.pryzmMeta` holds `{ levelId, family, instanceCount, contentHash, lod }`.

---

## §6 Migration & forward compatibility

### §6.1 Format-version-bump policy
- **Patch additions** (new optional manifest fields, new optional chunk metadata): no version bump; readers that don't understand silently ignore.
- **Backward-compatible reads** (e.g. new event types): no version bump; reader skips events whose `type` it doesn't know (with a warning).
- **Breaking changes** (new required field, layout change): bump `formatVersion`; old reader refuses to open.

### §6.2 Migrators
- Live in `packages/file-format/migrations/<from>-to-<to>.ts`.
- Each migrator is `(oldArchive: PryzmArchive) => Promise<PryzmArchive>`.
- Migrations are **pure functions of the archive** — no network, no DB, no time.
- CI gate `pnpm test packages/file-format/migrations` exercises every registered migrator on a fixture corpus; >0% diff fails.

### §6.3 Rollback
- A `.pryzm` saved at format vN is **not openable** at vN-1 readers.
- Customers downgrading PRYZM 2 must use `pnpm pryzm migrate-down --target-version=N-1 file.pryzm` (best-effort; lossy).

---

## §7 CI gates (mandatory)

### §7.1 Round-trip identity
```
load(file.pryzm) → save → load → save
```
The two `save` outputs must be byte-identical except for `manifest.lastModifiedAt`. Asserted by `apps/bench/pryzm-roundtrip.ts`. Any drift fails CI.

### §7.2 Headless / Node parity
The same `.pryzm` opened in a browser worker and in `apps/bake-worker` produces the same chunks. Asserted by `apps/bench/pryzm-headless-parity.ts` (per SPEC-13 §6 byte-identity).

### §7.3 Compaction stability
Repeated compactions of the same file converge to a fixed-point manifest after at most 3 iterations. Asserted by `apps/bench/pryzm-compaction-stability.ts`.

### §7.4 Migration round-trip
Every registered migration `(vA → vB)` pairs with an inverse-or-bestEffort `(vB → vA-best-effort)`. Both directions are exercised on the migration fixture corpus.

---

## §8 Public API surface

The `.pryzm` is the canonical input/output for these public surfaces:
- `POST /api/v1/projects/{id}/import` — upload `.pryzm` to create or restore a project.
- `GET /api/v1/projects/{id}/export.pryzm` — download.
- `pnpm headless open file.pryzm` — open in CLI.
- `pnpm headless export-ifc file.pryzm out.ifc` — convert.
- Plugin SDK `host.exportProjectAsPryzm()` — expose to plugins (capability `project:export`).

The byte layout in §2 + manifest in §3 are **part of the public API**. Breaking changes follow §6.1 policy.

---

## §9 Security considerations

- **No code execution on open.** A `.pryzm` is data. Plugins reference manifests by `id + version`; they are not bundled inside.
- **Plugin data sandboxing.** `plugins/data/<plugin-id>/` is opaque to the host. The plugin is responsible for parsing its own data.
- **PII.** A `.pryzm` may contain user names, comments, AI prompt history. Exporting requires user consent (UI affordance) and is logged in the audit trail.
- **Imports/** preserves the original IFC/DXF/Rhino. **Customer choice:** at export time, "include originals" toggle (default ON for backups, default OFF for shares).

---

## §10 Error model (Result types)

```ts
type PryzmReadError =
  | { kind: 'malformed-zip' }
  | { kind: 'missing-manifest' }
  | { kind: 'unsupported-version'; got: number; max: 1 }
  | { kind: 'integrity-mismatch'; field: string }
  | { kind: 'malformed-event-block'; file: string; offset: number }
  | { kind: 'unknown-event-type'; type: string; ulid: string }     // soft; reader can skip
  | { kind: 'chunk-missing'; expected: string }
  | { kind: 'plugin-data-unrecognised'; pluginId: string };        // soft
```

The reader returns `Result<PryzmArchive, PryzmReadError>`; never throws on parse.

---

## §11 Phase rollout

| Sprint | Deliverable |
|---|---|
| S20 | `packages/file-format/` v1 lit; manifest schema frozen at format v1. |
| S22 (M12 alpha gate) | round-trip CI gate green; alpha demo opens a real `.pryzm`. |
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | importers (IFC/DXF/3dm) write `imports/` blobs; `manifest.imports` populated; plugin data sandbox lit; `plugins/data/<id>/` paths reserved. |
| S33 | AI proposal archive lit (`ai/proposals/*`). |
| S38 | snapshot compaction emits `snapshots/*.snap.evt.bin`; manifest snapshot index used. |
| S55 | bundle splitting respects `chunks/lod0` for first paint (per SPEC-12 §9). |
| S65 | public REST `import` / `export.pryzm` endpoints lit; OpenAPI schema published. |
| S72 (M36 GA) | format v1 frozen; v2 RFC opens for post-GA. |

---

## §12 Cross-references
- ADR-002 sync (event log byte format upstream); ADR-003 R2 (chunk store); ADR-004 wire format (MessagePack); ADR-008 IFC scope; ADR-018 cut list (T1.5 PDF export); ADR-022 backend runtime topology.
- SPEC-02 persistence (event log shape, compaction); SPEC-03 sync (translator round-trip); SPEC-09 plugin SDK (data sandbox); SPEC-12 bundle splitting (LOD chunking); SPEC-15 deployment (R2 hosting); SPEC-27 migration & rollback.
- Phase docs: PHASE-1D §4 alpha format; PHASE-2A §3 imports; PHASE-3D §6 GA freeze.
