# `.pryzm` file format — v1 specification

| | |
| --- | --- |
| **Version** | 1 |
| **Status** | Stable for Phase 1 alpha |
| **Reference impl.** | [`packages/file-format/`](../../packages/file-format) |
| **CLI** | [`apps/cli/`](../../apps/cli) (`pryzm-cli pack/unpack/inspect`) |
| **ADR** | [ADR-0018](../architecture/adr/0018-pryzm-zip-format-v1.md) |
| **Phase doc** | [`PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`](../archive/pryzm3-internal/reference/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md) §S20 |

This document is the **byte-level** spec of the `.pryzm` container.  It
covers the on-disk envelope (ZIP layout), the manifest schema, the
event-batch encoding, the chunk addressing rules, the signature
binding, and the migration framework.

For the *why*, see ADR-0018.  This document is the *what*.

## 1. Envelope

A `.pryzm` file is a ZIP archive (PKZIP 2.0, no encryption).  All
entries except `thumbnails/project.png` use compression method
**STORE (0)**; the thumbnail uses **DEFLATE (8)** at level 6.

The implementation uses [JSZip](https://stuk.github.io/jszip/) on
both the writer and reader sides.  ZIP64 is **not** used in v1
(individual entries must be < 4 GiB; total file size also < 4 GiB).

### 1.1 File layout

```
project.pryzm
├── manifest.json                       (required, STORE)
├── events/
│   ├── 000000.evt.bin                  (optional, STORE)
│   ├── 000001.evt.bin
│   └── ...
├── chunks/
│   ├── <sha256>.glb                    (optional, STORE)
│   └── ...
├── thumbnails/
│   └── project.png                     (optional, DEFLATE-6)
└── signatures/
    └── manifest.sig                    (optional, STORE)
```

### 1.2 Required vs. optional entries

| Entry | Required | Notes |
| --- | --- | --- |
| `manifest.json` | yes | Always present; readers MUST refuse a file that lacks it (`reason: 'missing-manifest'`). |
| `events/NNNNNN.evt.bin` | no | A new project with zero events legally has **zero** event batches. |
| `chunks/<hash>.glb` | no | A project that has not yet been baked legally has zero chunks. |
| `thumbnails/project.png` | no | Optional UX nicety. |
| `signatures/manifest.sig` | no | Off by default; opt in via `pack({ signingKey })`. |

### 1.3 Determinism

The writer SHOULD produce byte-identical ZIPs for byte-identical
inputs.  In practice this requires:

- Iterating chunks in lexicographic SHA-256 order before emitting them.
- Pretty-printing `manifest.json` with stable key order (ZodSchema's
  `parse` output is stable wrt input order; the writer re-parses the
  manifest before serialising).
- Setting `mtime` on every ZIP entry to the same fixed timestamp
  (JSZip default).

Determinism is a **SHOULD**, not a **MUST**: a non-deterministic
writer still produces a valid `.pryzm`, just one whose bytes won't
match a reference re-pack.  The signature binding (§5) does **not**
depend on determinism.

## 2. `manifest.json`

UTF-8 JSON, pretty-printed with 2-space indent.  Validated against
[`ManifestSchema`](../../packages/persistence-client/src/manifest.ts) on
both pack and unpack.  Schema (Zod):

```ts
{
  schemaVersion:    1,                          // literal, frozen for v1
  projectId:        string (min 1),
  formatVersion:    "pryzm-v1",                 // literal
  chunks: Array<{
    levelId:        string (min 1),
    version:        non-negative integer,       // monotonic per level
    hash:           64-char lower-case hex,     // SHA-256 of the GLB
    byteLength:     positive integer,
    elementIds:     string[],
    createdAt:      ISO-8601 datetime,
  }>,
  levels: Array<{
    id:             string (min 1),
    name:           string,
    worldY:         finite number,
    elevation:      finite number,
    latestChunkHash: 64-char hex | null,
  }>,
  eventLogLength:   non-negative integer,
  lastEventId:      string | null,              // ULID of tail event
  createdAt:        ISO-8601 datetime,
  updatedAt:        ISO-8601 datetime,
  thumbnailHash:    64-char hex | null,         // SHA-256 of project.png
}
```

The writer enforces the cross-cutting invariant that every
`hash` in `chunks[]` and every non-null `latestChunkHash` in `levels[]`
appears as a `chunks/<hash>.glb` entry.  A manifest that references a
missing chunk is rejected with `reason: 'missing-chunk'`.

The reader MAY tolerate **extra** chunks not referenced by the
manifest — they are returned in the `chunks` map but are functionally
orphans.  Garbage collection (SPEC-02 §8.2) cleans them up out of band.

## 3. `events/NNNNNN.evt.bin`

Each batch file is the [MessagePack](https://msgpack.org/) encoding of
an array of `PersistedEvent` records.  The encoding uses the standard
MessagePack codec (no custom extensions); event payloads MAY contain
the aliased-keys extension defined by the persistence-client codec
(ADR-004).

### 3.1 `PersistedEvent` shape

```ts
{
  seq:          non-negative integer,    // monotonic per project
  version:      integer,                 // codec version of `event`
  persistedAt:  ISO-8601 datetime,
  event:        EventRecord,             // see @pryzm/command-bus
}
```

### 3.2 Batch numbering

`NNNNNN` is the batch index (0-padded to 6 digits).  The Nth batch
contains events `[N * 1000, N * 1000 + 999]` from the global event
log.  All batches except possibly the last are full (1 000 events);
the last batch holds the remainder.

`EVENT_BATCH_SIZE = 1000` is **frozen** by ADR-0018.  Changing it
requires a migration step.

### 3.3 Read order

Readers MUST process batches in lexicographic-of-filename order
(equivalent to numeric order due to zero-padding) and concatenate
the resulting arrays.  The combined event array MUST be in
strictly-increasing `seq` order; readers MAY assert this invariant.

## 4. `chunks/<sha256>.glb`

Each chunk is a valid glTF 2.0 binary file (`.glb`) produced by
`@pryzm/persistence-client/chunk-writer.ts`.  The filename is the
lower-case hex SHA-256 of the **entire `.glb` byte stream** — content
addressing.

The writer MUST verify the filename matches the
`/^[0-9a-f]{64}$/` regex; non-conformant chunk keys are rejected with
`reason: 'missing-chunk'`.  The reader MAY recompute the hash, but
typically does not (the bake pipeline is the canonical hash producer;
the chunk reader downstream verifies hash → object identity at the
glTF-extras level — see `ChunkReader`).

The internal encoding of the GLB is out of scope for this document;
see [SPEC-02](../../docs/archive/pryzm3-internal/SPEC-02-CHUNKS.md) for
chunk binary layout.

## 5. `signatures/manifest.sig`

Optional Ed25519 signature over the **exact bytes** of `manifest.json`
as written into the ZIP.

### 5.1 Producing the signature

```ts
sig = subtle.sign({ name: 'Ed25519' }, signingKey, manifestBytes);
```

`signingKey` is a Web Crypto `CryptoKey` with `algorithm.name ===
'Ed25519'` and `usages: ['sign']`.

### 5.2 Verifying the signature

```ts
ok = subtle.verify(
  { name: 'Ed25519' },
  verifyingKey,
  signatureBytes,
  manifestBytes,         // bytes read from manifest.json entry
);
```

The verifier passes the bytes **read from the ZIP entry** — not a
re-serialisation of the parsed manifest — so the binding survives any
future canonical-JSON drift.

### 5.3 Behaviour matrix

| `verifyingKey` provided? | `signatures/manifest.sig` present? | Result |
| --- | --- | --- |
| no  | no  | `{ ok: true, hasSignature: false, signatureVerified: false }` |
| no  | yes | `{ ok: true, hasSignature: true,  signatureVerified: false }` (presence noted, not checked) |
| yes | no  | `{ ok: false, reason: 'signature-required' }` |
| yes | yes | `subtle.verify` runs; `ok` ⇒ `signatureVerified: true`; mismatch ⇒ `{ ok: false, reason: 'signature-mismatch' }` |

### 5.4 Migration interaction

Signature verification is **not supported on migrated files** in v1.
A migration step rewrites the manifest, invalidating the signature by
construction.  Re-sign after the migration completes.

## 6. Migration framework

`packages/file-format/src/migrations/index.ts` exports:

```ts
interface MigrationStep {
  fromVersion: number;
  toVersion:   number;       // MUST equal fromVersion + 1
  migrate(rawManifest, zip): Promise<{ manifest, zip }>;
}

const MIGRATIONS: readonly MigrationStep[];   // append-only
```

Invariants enforced by `__tests__/migrations.test.ts`:

- `step.toVersion === step.fromVersion + 1` for every step.
- No two steps share a `fromVersion`.
- Coverage from 0 → `PRYZM_FORMAT_SCHEMA_VERSION` is complete.

### 6.1 Open path

1. Reader parses `manifest.json` and reads `schemaVersion`.
2. If `schemaVersion === current`, skip migration and Zod-validate.
3. If `schemaVersion > current`, throw `FutureVersionError`
   ⇒ `reason: 'unsupported-future-version'`.
4. Otherwise, walk the registry: for each step where
   `fromVersion === currentVersion`, run it, advance `currentVersion`,
   loop until current.
5. Zod-validate the migrated manifest.

### 6.2 Phase-1 stub

The v0 → v1 step (PRYZM 1 → PRYZM 2) raises `MigrationStubError` with
the message *"PRYZM 1 → v1 migration: not yet implemented in Phase 1.
Use the PRYZM 1 importer plugin (Phase 3D)."*

Surfaced by `unpack()` as `reason: 'migration-failed'`.

## 7. Result types

### 7.1 `pack()`

```ts
PackResult =
  | { ok: true,  bytes: Uint8Array, byteLength: number, telemetry: PackTelemetry }
  | { ok: false, reason: PackErrorReason, message: string };

PackErrorReason = 'manifest-invalid' | 'missing-chunk' | 'sign-failed';
```

### 7.2 `unpack()`

```ts
UnpackResult =
  | { ok: true,  manifest, events, chunks, thumbnail, hasSignature, signatureVerified, telemetry }
  | { ok: false, reason: UnpackErrorReason, message: string };

UnpackErrorReason =
  | 'not-a-zip'
  | 'missing-manifest'
  | 'manifest-parse-error'
  | 'manifest-invalid'
  | 'event-batch-decode-error'
  | 'chunk-name-invalid'
  | 'signature-required'
  | 'signature-mismatch'
  | 'migration-failed'
  | 'unsupported-future-version';
```

Both functions return discriminated-union results instead of throwing
on user-recoverable failures, so save/load flows can branch on
`reason` without `try/catch`.  Programmer errors (e.g. importing a
function with a missing dependency) still throw.

## 8. CLI

`apps/cli/` ships `pryzm-cli` with three subcommands:

```text
pryzm-cli pack    <project-dir> <output.pryzm>
pryzm-cli unpack  <input.pryzm>  <output-dir>
pryzm-cli inspect <input.pryzm>
```

`unpack` writes a directory tree designed for shell inspection:

```
<output-dir>/
├── manifest.json          (pretty)
├── events.jsonl           (one PersistedEvent per line, JSON)
├── chunks/<hash>.glb
└── thumbnails/project.png (if present)
```

`pack` reads the same layout.  This mirror enables a developer to
round-trip a project through the shell (`unpack → grep → pack`)
without binary tooling.

## 9. Performance budgets

Measured by `apps/bench/src/benches/pack-unpack.bench.ts`:

| Metric | Budget |
| --- | --- |
| Pack medium fixture (4 levels × 3 chunks, 500 events) | < 5 s |
| Unpack medium fixture | < 3 s |

Hard-fail in CI via the regression gate.

## 10. Versioning

`PRYZM_FORMAT_SCHEMA_VERSION = 1`.  Bumping requires:

1. A new `MigrationStep` appended to `MIGRATIONS`.
2. A new entry in this document's changelog.
3. A new ADR if the schema change is non-trivial.

The append-only invariant means readers from any historical PRYZM
build can open files written by any newer build, provided the newer
build's migration framework is bundled (which it always is — it's
part of `@pryzm/file-format`).

## 11. Changelog

- **v1 (2026-04-27, S20)** — initial release.  ADR-0018.
