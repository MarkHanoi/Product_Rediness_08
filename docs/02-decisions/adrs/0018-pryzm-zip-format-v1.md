# ADR-0018 — `.pryzm` ZIP file format v1

- **Status**: Accepted
- **Date**: 2026-04-27
- **Supersedes**: PRYZM 1's `project.json` Postgres blob (incompatible)
- **Phase**: 1D — `Q4 — M10-M12 BAKE & PRYZM ALPHA`, sprint **S20**
- **Spec source**: `docs/03-execution/plans/legacy/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
  §S20 (lines 418-611)
- **Implementation**: `packages/file-format/`, `apps/cli/`
- **Spec doc**: `docs/04-reference/file-formats/pryzm-binary.md`

## 1. Context

A PRYZM project is the union of three things:

1. The **manifest** — project-level metadata: levels, chunk index,
   thumbnail hash, event-log pointer.
2. The **event log** — every command the user ever issued, ULID-ordered,
   with forward + inverse JSON Patches (the L0 source of truth per
   ADR-002).
3. The **baked geometry** — content-addressed `.glb` chunks, one per
   `(level, version)` (the L2 cache per SPEC-02).

Today, every reader and writer that touches "a project" — the editor,
the headless tester, the bake worker, the future Phase 3 CLI — invents
its own way to plumb the three pieces together.  This ADR fixes the
on-disk container so all of them can speak one format.

We need:

- **A single file** the user can drag-and-drop and email.
- **Lossless** round-trip: bytes in == bytes out for every event and
  every chunk; the editor must reload exactly what it saved.
- **Deterministic** output: re-packing identical inputs must produce
  identical bytes (so content-addressing extends to the envelope, and
  diffs stay small in version control).
- **Forward-compat**: the schema MUST evolve.  We commit today to a
  migration framework that runs on open.
- **Optional integrity**: organizations that mandate signed artefacts
  (govt, enterprise) can opt into Ed25519 signing without changing the
  format for everyone else.

## 2. Decision

A `.pryzm` file is a **STORE-mode ZIP** with a fixed internal layout:

| Path                          | Compression | Required | Contents |
| ----------------------------- | ----------- | -------- | -------- |
| `manifest.json`               | STORE       | yes      | Pretty-printed JSON, Zod-validated against `ManifestSchema`. |
| `events/NNNNNN.evt.bin`       | STORE       | no\*     | MessagePack-encoded `PersistedEvent[]`, `EVENT_BATCH_SIZE = 1000` events per file, `NNNNNN` = batch index padded to 6 digits. |
| `chunks/<sha256>.glb`         | STORE       | no\*     | Content-addressed Draco/Meshopt-compressed glTF binary. |
| `thumbnails/project.png`      | DEFLATE-6   | no       | 512×512 PNG screenshot of the project. |
| `signatures/manifest.sig`     | STORE       | no       | Ed25519 signature of the **exact** `manifest.json` bytes the writer emitted. |

\* Empty projects legally have zero events and zero chunks.

### 2.1 Why ZIP

- **One file** is a hard product requirement.
- **STORE-mode ZIP** is byte-stable across implementations: JSZip,
  Python `zipfile`, `unzip`, Archive Utility all produce identical
  central directories given identical inputs and `mtime`.
- **Inspectable**: `unzip -p file.pryzm manifest.json` works on any
  POSIX system without PRYZM tooling.  This was the deciding factor
  over a custom binary container.
- **Industry precedent**: `.docx`, `.xlsx`, `.apk`, `.epub`, `.usdz`,
  `.kmz`, and Sketch's `.sketch` are all "ZIP with a known internal
  layout".  Tooling exists.

### 2.2 Why MessagePack for events (not JSON, not protobuf)

- JSON would re-inflate every event payload by ~3× (UUID keys, JSON
  number representation, Date strings).  A 10 000-event project would
  go from ~3 MB MessagePack to ~9 MB JSON.
- protobuf would force a `.proto` schema to be in lock-step with
  `EventRecord`'s discriminated union, and the union changes every
  sprint a new command lands.  Maintenance cost is too high in Phase 1.
- MessagePack is **already** the persistence-client codec (ADR-004); we
  reuse it.  One codec across L0 (IndexedDB) and L1 (`.pryzm`) means
  one set of bugs.

### 2.3 Why STORE for events and chunks

Each entry is **already compressed** at the application layer:

- Events: MessagePack with the `aliased-keys` extension (ADR-004) —
  attempting DEFLATE on top yields < 5% size win at 4× CPU.
- Chunks: glTF chunks contain Draco-compressed positions + Meshopt-
  compressed indices.  ZIP DEFLATE on top costs ~30% pack time for ~1%
  size reduction.  See `apps/bench/src/benches/codec-spike.bench.ts`.

The thumbnail PNG is the exception: 512×512 is small enough that
DEFLATE-6 still helps (~5% size, immeasurable time).

### 2.4 Event batching at 1 000 events / file

- Streaming readers can decode batches incrementally; a 100 000-event
  project doesn't have to materialise as one giant buffer.
- ZIP central-directory cost is per-entry; 1 000 events / batch keeps
  the directory under ~100 entries even for large projects (vs. one
  entry per event, which would push the directory past 100 KiB on big
  files).
- 1 000 is also the natural checkpoint cadence in `EventLog`
  (S06-T1) — pack and event log align.

### 2.5 Sorted-by-hash chunk emission

The packer iterates `chunks` sorted by SHA-256 hash before emitting
ZIP entries.  ZIP central directories preserve insertion order, so
sorted insertion makes byte-by-byte equality across re-packs of
identical content achievable.  This extends content-addressing from
the chunk level to the envelope level: two identical projects packed
on different machines yield byte-equal `.pryzm` files.

### 2.6 Optional Ed25519 signature

- The signature, when present, binds to the **exact bytes** the packer
  wrote for `manifest.json`.  The verifier reads the bytes off disk and
  passes them straight to `subtle.verify` — there is no canonical-JSON
  re-serialisation step that could drift.
- The manifest pins `lastEventId` + `eventLogLength` + `chunks[]`
  hashes, so signing the manifest transitively binds the rest of the
  envelope.
- Off by default in Phase 1.  Opt in via `pack({ signingKey })`; verify
  via `unpack({ verifyingKey })`.
- v1 does **not** support signature verification on migrated files
  (the migration step rewrites the manifest, invalidating the
  signature).  Re-sign after migration.

## 3. Forward compatibility — migration framework

`packages/file-format/src/migrations/index.ts` exports a frozen,
**append-only** registry of `MigrationStep`s:

```ts
{ fromVersion: number; toVersion: number; migrate(...) }
```

Invariants enforced by tests:

1. `toVersion === fromVersion + 1` (no multi-version jumps).
2. No two steps share a `fromVersion` (no ambiguity).
3. Coverage from 0 → `PRYZM_FORMAT_SCHEMA_VERSION` is complete.

`unpack()` reads the file's `schemaVersion`, walks the registry until
it reaches the current version, and Zod-validates the result.  Files
with `schemaVersion > current` are rejected with
`unsupported-future-version` ("update PRYZM").

The v0 → v1 step (PRYZM 1's Postgres blob → `.pryzm`) is intentionally
a stub in Phase 1; the full PRYZM 1 importer ships as a Phase 3D
plugin.  The stub raises `MigrationStubError`, surfaced by `unpack()`
as `migration-failed` with the explanatory message.

## 4. Consequences

### Positive

- One file, one schema, one validator across editor, headless, CLI,
  and bake worker.
- Re-packing identical content produces identical bytes — diffs in
  version control stay small, and the envelope itself becomes
  content-addressable.
- Migration framework forces every future schema change to be a
  testable, versioned step rather than ad-hoc field renames.
- CLI (`pryzm-cli pack/unpack/inspect`) lets ops, QA, and developers
  inspect a project at the shell without booting the editor.

### Negative

- Locks us to ZIP forever, including its 4 GiB single-entry size cap.
  Future "huge" projects (chunks > 4 GiB) will need a ZIP64 upgrade.
  Mitigation: chunks are content-addressed and per-`(level, version)`,
  so a single chunk passing 4 GiB would already indicate a baking
  problem before envelope size becomes an issue.
- MessagePack for events means non-PRYZM tools cannot read the event
  log without the codec.  We accept this — `manifest.json` is the
  human-inspectable summary and remains plain JSON.
- The signature is over `manifest.json` bytes only.  An attacker who
  appends or removes a chunk file but doesn't alter the manifest's
  recorded hashes will be caught at chunk-load time
  (`ChunkReader.verifyHash`), not at envelope-open time.  Layered
  defence is intentional.

## 5. Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Custom binary container (TLV) | Loses `unzip -p` inspectability; we'd have to ship our own viewer. |
| SQLite database file | Cannot stream large chunks without loading them; doesn't compose with content-addressing; 8 KiB page overhead amplifies metadata cost. |
| Tarball (`.tar.gz`) | Random-access read requires decompressing the whole stream; the editor needs O(1) chunk reads on open. |
| OCI image layout | Overkill for a non-container format; tooling is enterprise-heavy and Linux-centric. |
| JSON-only events | 3× size, slower decode; loses parity with the L0 codec we already ship. |

## 6. Open questions / future work

- Phase 2: ZIP64 promotion path for projects > 4 GiB.
- Phase 3: PRYZM 1 importer plugin replaces the v0 → v1 stub.
- Phase 3: signature transparency log (Sigstore-style) for
  enterprise distributions.
