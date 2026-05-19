# PHASE-1 Package & Plugin Scope Classification

**Status**: closes W-06 from `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.
**Date**: 2026-04-28.
**Owner**: Architecture working group.

The Phase-1 audit found that several packages and plugins under
`packages/` and `plugins/` are scoped for **future phases** and were
counted against the Phase-1 audit budget by mistake. This document
labels every workspace member with one of:

| Label              | Meaning                                                                 |
|--------------------|-------------------------------------------------------------------------|
| **PHASE-1**        | In-scope for Phase 1 — audit gates apply.                               |
| **PHASE-2**        | Scoped for Phase 2 (collaboration / sync). Stub today, full impl later. |
| **PHASE-3**        | Scoped for Phase 3 (PDF→BIM, IFC, AI). Stub today, full impl later.     |
| **PROCESS-ONLY**   | Not a runtime package — fixture / lint shim / tooling.                  |

The audit (and any future code-vs-spec audit) MUST consult this file
before flagging a package as "incomplete" — many of the perceived gaps
are by design.

---

## 1 — Packages (`packages/*`)

### Phase-1 (32 entries)

| Package                       | Layer      | Phase-1 role                                 |
|-------------------------------|------------|----------------------------------------------|
| `@pryzm/protocol`             | L1         | Branded ids, command envelope.               |
| `@pryzm/schemas`              | L1         | Zod schemas for every element family.        |
| `@pryzm/stores`               | L1         | Per-element domain stores.                   |
| `@pryzm/persistence-client`   | L0         | EventLog + IDB / InMem / FS backends.        |
| `@pryzm/file-format`          | L0         | `.pryzm` zip envelope (ADR-0018).            |
| `@pryzm/command-bus`          | L2         | Command dispatch, audit, undo.               |
| `@pryzm/sync`                 | L3         | Linearisation primitives (stub for Phase 2). |
| `@pryzm/geometry-kernel`      | L4         | Pure geometry producers.                     |
| `@pryzm/picking`              | L4         | BVH + GPU picking shared infra.              |
| `@pryzm/frame-scheduler`      | L5         | rAF pump, dirty queue, motion gate.          |
| `@pryzm/scene-committer`      | L5         | Diff → THREE.Object3D apply.                 |
| `@pryzm/renderer`             | L5         | Canvas / WebGL2 / WebGPU lifecycle.          |
| `@pryzm/render-runtime`       | L5         | Pass-pipeline orchestrator.                  |
| `@pryzm/view-state`           | L5         | View defs + camera animation.                |
| `@pryzm/visibility`           | L5         | VI parity (level-of-detail vs. PRYZM 1).     |
| `@pryzm/drawing-primitives`   | L5         | Vector primitives + Canvas2D backend.        |
| `@pryzm/storage-driver`       | L0         | Pluggable chunk storage (InMem / R2 / MinIO).|
| `@pryzm/bake-worker-types`    | L4         | Shared types between bake-worker + kernel.   |
| `@pryzm/loader`               | L0         | `.pryzm` cold-load + tier-streamed loader.   |
| `@pryzm/ledger`               | L0         | Audit-log adapter.                           |
| `@pryzm/intent-resolver`      | L4         | Command intent → handler routing (ADR-0013). |
| `@pryzm/cascade`              | L4         | Cross-element cascade rule registry.         |
| `@pryzm/material-pool`        | L5         | Shared `THREE.Material` interning.           |
| `@pryzm/selection`            | L5         | Selection store + highlight committer.       |
| `@pryzm/tools`                | L6         | Tool framework (line-tool, region-select).   |
| `@pryzm/families`             | L6         | Shared element-family base classes.          |
| `@pryzm/cascade-rules`        | L6         | Cascade-rule definitions consumed by L4.     |
| `@pryzm/inspector`            | L7         | Inspector panel adapters.                    |
| `@pryzm/awareness`            | L3         | Awareness store (cursor / selection sharing).|
| `@pryzm/share-link`           | L3         | Share-link minting (Phase-1 stub form).      |
| `@pryzm/audit-events`         | L0         | Audit-event taxonomy.                        |
| `@pryzm/system-types`         | L1         | Wall / slab / ceiling system-type catalogues.|

### Process-only (1 entry)

| Package                | Role                                                       |
|------------------------|------------------------------------------------------------|
| `@pryzm/legacy-shim`   | **PROCESS-ONLY** — fixture for `pryzm/no-raf` lint rule.   |

**Total**: 32 Phase-1 packages + 1 process-only = 33 packages on disk.

---

## 2 — Plugins (`plugins/*`)

### Phase-1 (12 element-family plugins + 7 platform plugins = 19)

The 12 element-family plugins are the canonical Phase-1 surface and
are enumerated in `apps/editor/src/PluginRegistry.ts` (see ADR-0021).

| Plugin                        | Family               | Phase-1 role                          |
|-------------------------------|----------------------|---------------------------------------|
| `@pryzm/plugin-wall`          | wall                 | 15 handlers (ADR-0008 amended).       |
| `@pryzm/plugin-slab`          | slab                 | 9 handlers (ADR-0010).                |
| `@pryzm/plugin-door`          | door                 | family handlers + producer.           |
| `@pryzm/plugin-window`        | window               | family handlers + producer.           |
| `@pryzm/plugin-roof`          | roof                 | family handlers + producer.           |
| `@pryzm/plugin-curtain-wall`  | curtainwall          | 13 handlers (ADR-0011 amended).       |
| `@pryzm/plugin-grid`          | grid                 | family handlers + producer.           |
| `@pryzm/plugin-column`        | column               | family handlers + producer.           |
| `@pryzm/plugin-beam`          | beam                 | family handlers + producer.           |
| `@pryzm/plugin-stair`         | stair                | family handlers + producer.           |
| `@pryzm/plugin-handrail`      | handrail             | family handlers + producer.           |
| `@pryzm/plugin-ceiling`       | ceiling              | family handlers + producer.           |
| `@pryzm/plugin-view`          | (platform)           | View registry + active-view store.    |
| `@pryzm/plugin-component-editor`| (platform)         | Family editor quality gates.          |
| `@pryzm/plugin-bcf`           | (platform)           | BCF round-trip (Phase-1 spec input).  |
| `@pryzm/plugin-export-pryzm`  | (platform)           | `.pryzm` exporter.                    |
| `@pryzm/plugin-import-pryzm`  | (platform)           | `.pryzm` importer (loader-side).      |
| `@pryzm/plugin-plan-view`     | (platform)           | Plan-view rendering primitives.       |
| `@pryzm/plugin-rhino-import`  | (platform)           | `.3dm` importer (Phase-1 alpha).      |

### Phase-2 (3 entries — collaboration / sync)

| Plugin                        | Reason it's Phase-2                              |
|-------------------------------|--------------------------------------------------|
| `@pryzm/plugin-presence`      | Multi-client cursor + selection broadcast.       |
| `@pryzm/plugin-comments`      | Comment thread CRDT + UI.                        |
| `@pryzm/plugin-share-permissions` | Workspace ACLs and per-share-link policies.  |

### Phase-3 (9 entries — IFC / DXF / AI ingest)

| Plugin                        | Reason it's Phase-3                              |
|-------------------------------|--------------------------------------------------|
| `@pryzm/plugin-ifc-import`    | Tier-2 IFC importer.                             |
| `@pryzm/plugin-ifc-export`    | Tier-1 IFC exporter (Phase-1 ships pset stub).   |
| `@pryzm/plugin-ifc-inspector` | IFC inspector / pset editor.                     |
| `@pryzm/plugin-dxf-import`    | DXF importer (Phase-3 PDF→BIM funnel).           |
| `@pryzm/plugin-pdf-import`    | PDF→BIM stage-1 ingest.                          |
| `@pryzm/plugin-pdf-classifier`| PDF classification CV pipeline.                  |
| `@pryzm/plugin-ai-suggest`    | AI inline suggester.                             |
| `@pryzm/plugin-ai-bake`       | AI bake orchestrator.                            |
| `@pryzm/plugin-ai-quality`    | AI quality-gate runner.                          |

**Total**: 19 Phase-1 + 3 Phase-2 + 9 Phase-3 = 31 plugins on disk.

---

## 3 — Apps (`apps/*`)

| App                       | Phase    | Phase-1 role                                     |
|---------------------------|----------|--------------------------------------------------|
| `@pryzm/editor`           | PHASE-1  | The L7 editor entry; bundles to `?pryzm2=1`.     |
| `@pryzm/headless`         | PHASE-1  | Node entry + CLI (ADR-0017).                     |
| `@pryzm/bench`            | PHASE-1  | Bench harness.                                   |
| `@pryzm/bake-worker`      | PHASE-1  | Background baker (S21+).                         |
| `@pryzm/sync-server`      | PHASE-2  | Linearised sync server (Phase-1 ships skeleton). |
| `@pryzm/component-editor` | PHASE-1  | Family/component editor (used by 12 plugins).    |
| `@pryzm/ai-worker`        | PHASE-3  | AI worker (Phase-1 ships skeleton).              |

---

## 4 — Tools (`tools/*`)

| Tool                                | Phase-1 role                                        |
|-------------------------------------|-----------------------------------------------------|
| `tools/eslint-plugin-pryzm`         | Custom ESLint rules (no-raf, no-three, boundaries). |
| `tools/scripts/*`                   | Lint-fixture integration, raf snapshot diff, etc.   |
| `tools/generate-large-fixture.mjs`  | Deterministic 5K-wall fixture generator.            |
| `tools/pryzm1-sunset/*`             | PRYZM 1 sunset migration helpers.                   |

All tools are PHASE-1 in-scope.

---

## 5 — Audit-budget reconciliation

The Phase-1 audit (`PHASE-1-CODE-VS-SPEC-AUDIT-2026-04-28.md`) flagged
`packages/sync` and several plugins as "incomplete relative to spec."
Per this classification doc, those entries are correctly stubs at
Phase-1 and the audit's gap-analysis must reflect the labels above to
avoid double-counting Phase-2 / Phase-3 surface against Phase-1's
exit criteria.
