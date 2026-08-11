# BIM 2.0 Certification Results — Persistence (§10) + Undo/Redo (§11)

> **Generated** 2026-08-11T16:54:50.961Z by `tools/rac-conformance/certification/generate-report.ts`
> from EXECUTED runs of `tools/rac-conformance/certification/__tests__/persistence.cert.ts` and
> `__tests__/undoredo.cert.ts`. Machine-readable: `tools/rac-conformance/certification/results/certification.json`.
>
> **Format**: the founder's §6 certification format. Every axis is stamped independently from an executed
> measurement; an axis with no measurement reads **UNPROVEN** and is never inferred from a neighbouring axis.
> **Partial evidence is never promoted to VERIFIED.** `statusOf()` derives the row status from its own axes —
> it is never hand-assigned — and since **Collaboration is UNPROVEN on every row by construction** (no transport
> exists; L-391 leg C), the arithmetic ceiling for every row in this document is PARTIALLY VERIFIED.
>
> **Failure ≠ emptiness.** Every "0 divergences" cell below carries the number of records compared. A comparator
> that reached no store reports **MISCONFIGURED**, never "clean" — and one row does exactly that (`persist:opening`).

## Headline

- **Operations measured:** 34 (18 persistence kinds + 16 undo/redo capabilities)
- **PARTIALLY VERIFIED** (best attainable — see the Collaboration note): **10**
- **FAILED** (a measured axis disproved the invariant): **24**
- **UNPROVEN:** 0 · **VERIFIED:** 0 (0 is expected: Collaboration blocks it)

## Run completion (what actually happened)

| Suite | Completed? | Vitest result | Notes |
|---|---|---|---|
| `persistence.cert.ts` (§10) | YES — all 18 kind rows executed, results written | **red: 12 of 21 `it`s fail** | Every failing `it` is a MEASURED round-trip divergence (`expect.soft`, so the whole table still prints). No suite-level crash, no timeout. |
| `undoredo.cert.ts` (§11) | YES — all 16 capability rows executed, results written | **red: 12 of 18 `it`s fail** | Same: red = a measured undo/redo divergence, not a crashed suite. |
| Falsifiability checks | YES | green | See "Falsifiability" below — each comparator was watched go red on a mutated expectation. |

**Persistence run metadata (executed, verbatim):**

```
serializer error : none — the REAL ProjectSerializer ran
loader error     : none — the REAL ProjectLoader ran
LoadResult       : {"success":true,"loaded":18,"failed":0,"errors":[],"warnings":["Level L0 already exists — skipped"]}
seed outcomes    : {"level":"SEEDED","grid":"SEEDED","wall":"SEEDED","door":"SEEDED","window":"SEEDED","slab":"SEEDED","roof":"SEEDED","column":"SEEDED","stair":"SEEDED","beam":"SEEDED","curtainWall":"SEEDED","handrail":"SEEDED","plumbing":"SEEDED","furniture":"SEEDED","ceiling":"SEEDED","floor":"SEEDED","room":"SEEDED","opening":"SEEDED (via door/window CreateWallOpeningCommand)"}
mutations        : {"roof.update":"DISPATCHED OK","wall.updateDimensions":"DISPATCHED OK","door.setOffset":"DISPATCHED OK","window.setOffset":"DISPATCHED OK","element.updateParameters":"DISPATCHED OK","room.setMaterial":"DISPATCHED OK"}
```

**Undo/redo seed log (executed, verbatim):** `level L1: OK` · `wall u-wall-1: OK` · `wall u-wall-2: OK` · `door: OK` · `window: OK` · `slab: OK` · `roof: OK` · `ceiling: OK` · `room: OK`

## H1 — Persistence round-trip comparator (§10)

Protocol: seed via REAL `@pryzm/command-registry` commands → mutate via LIVE bus verbs → **capture EXPECTED
independently** → `ProjectSerializer.serialize()` (real) → `JSON.parse(JSON.stringify(...))` → `new ProjectLoader(cm).load()`
(real) → capture ACTUAL → deep per-property diff. The oracle is the loader path, never the store the handler wrote.
The documented-tolerance list is **EMPTY** — nothing was normalised away.

| Kind | Records compared | Resolve (seed) | Dispatch | Authoritative state | Geometry | Persistence (before ≡ after reload) | Undo | Sync | Report | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `level` | 2 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 2 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 2 divergence(s): level.L0.childrenIds.16: expected undefined got "dd43622f-416a-47ec-a33c-157b323a846c" \| level.L0.childrenIds.17: expected undefined got "586f304b-23a5-4cc1-b4a5-ff4abc1674b3" | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `grid` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | PROVEN — 1 record(s) round-tripped with 0 undocumented divergences (executed: serialize → JSON → ProjectLoader → re-read) | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **PARTIALLY VERIFIED** |
| `wall` | 2 | PROVEN — SEEDED | PROVEN — mutated through a LIVE bus verb before save | PROVEN — 2 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 15 divergence(s): wall.cert-wall-1.openings.0.frameThickness: expected undefined got 0.05 \| wall.cert-wall-1.openings.0.frameColor: expected undefined got "#f2f0ed" \| wall.cert-wall-1.openings.0.leafColor: expected undefined got "#f2f0ed" \| wall.cert-wall-1.ifcData.guid: expected "43293b5b-5b64-4772-948a-14b25c… | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `door` | 1 | PROVEN — SEEDED | PROVEN — mutated through a LIVE bus verb before save | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | PROVEN — 1 record(s) round-tripped with 0 undocumented divergences (executed: serialize → JSON → ProjectLoader → re-read) | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **PARTIALLY VERIFIED** |
| `window` | 1 | PROVEN — SEEDED | PROVEN — mutated through a LIVE bus verb before save | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | PROVEN — 1 record(s) round-tripped with 0 undocumented divergences (executed: serialize → JSON → ProjectLoader → re-read) | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **PARTIALLY VERIFIED** |
| `opening` | 0 | PROVEN — SEEDED (via door/window CreateWallOpeningCommand) | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | UNPROVEN — SEEDED (via door/window CreateWallOpeningCommand); records=0 | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | UNPROVEN — seed reported success but the authoritative store holds 0 records (MISCONFIGURED for this kind) | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **PARTIALLY VERIFIED** |
| `slab` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | PROVEN — 1 record(s) round-tripped with 0 undocumented divergences (executed: serialize → JSON → ProjectLoader → re-read) | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **PARTIALLY VERIFIED** |
| `roof` | 1 | PROVEN — SEEDED | PROVEN — mutated through a LIVE bus verb before save | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 4 divergence(s): roof.cert-roof-1.metadata.createdAt: expected 1786466652844 got 1786466657218 \| roof.cert-roof-1.metadata.modifiedAt: expected 1786466652895 got 1786466657218 \| roof.cert-roof-1.metadata.version: expected 2 got 1 \| roof.cert-roof-1.ifcData.guid: expected "13c4c5ce-7aeb-4438-a348-9fa1bb1f7bcf" g… | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `column` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 1 divergence(s): column.column_01KZRVBMNF5EDKF1WY3069JYNT.ifcData.guid: expected "be9ea181-95e8-4094-9e44-a211f53fd475" got "0d0a0048-07fe-4faf-97a2-6af9cd9631f7" | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `beam` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 2 divergence(s): beam.5bd52f12-1b97-49fb-8c8d-9a247ae6f029: expected "(present)" got "(absent — LOST)" \| beam.586f304b-23a5-4cc1-b4a5-ff4abc1674b3: expected "(absent)" got "(present)" | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `stair` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 2 divergence(s): stair.cert-st-1: expected "(present)" got "(absent — LOST)" \| stair.dd43622f-416a-47ec-a33c-157b323a846c: expected "(absent)" got "(present)" | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `curtainWall` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | PROVEN — 1 record(s) round-tripped with 0 undocumented divergences (executed: serialize → JSON → ProjectLoader → re-read) | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **PARTIALLY VERIFIED** |
| `handrail` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 1 divergence(s): handrail.cert-hr-1.ifcData.guid: expected "10ba9d01-9a68-4006-bfd9-ddabcc957e88" got "4b8a4940-9ec4-43e1-b19e-3a1793eddd1a" | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `plumbing` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 1 divergence(s): plumbing.cert-pl-1.position.y: expected 0 got 0.015 | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `furniture` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 1 divergence(s): furniture.cert-fu-1.position.y: expected 0 got 0.015 | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `ceiling` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 2 divergence(s): ceiling.cert-ce-1.metadata.createdAt: expected 1786466652874 got 1786466657210 \| ceiling.cert-ce-1.metadata.modifiedAt: expected 1786466652879 got 1786466657210 | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `floor` | 1 | PROVEN — SEEDED | n/a — kind seeded, not bus-mutated in H1 (H2 covers verbs) | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 2 divergence(s): floor.cert-fl-1.metadata.createdAt: expected 1786466652880 got 1786466657210 \| floor.cert-fl-1.metadata.modifiedAt: expected 1786466652880 got 1786466657210 | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |
| `room` | 1 | PROVEN — SEEDED | PROVEN — mutated through a LIVE bus verb before save | PROVEN — 1 record(s) present in the authoritative store before save (executed read-back) | UNPROVEN — no fragment builders run headlessly; meshes never built in this harn… | FAIL — 1 divergence(s): room.9e002faa-be38-45a9-a32c-f20f3330b6f5.metadata.modifiedAt: expected 1786466652910 got 1786466657221 | n/a — H2 | UNPROVEN — no transport | PROVEN — loader returned a structured LoadResult (success=true, loaded=18, failed=0) | **FAILED** |

## H2 — Undo/redo round-trip vs authoritative state (§11)

Protocol: State A (whole-store deep capture) → dispatch on the REAL composed bus → State B → `cm.undo()` ×
(entries this dispatch armed) → **compare to A** → `cm.redo()` × same → **compare to B**. Mutations are applied and
asserted ONE AT A TIME, so the 250 ms three-stack reconciliation window cannot make a stale read look like a pass.
The undo path certified is the LEGACY `CommandManager` stack — the declared owner of every verb here
(register column `undo: legacy-stack`). The unified ring-first `performUndoRedo` path is **NOT** certified here;
the three `it.fails` pins in `undoGestureOrdering.test.ts` were not touched.

| Capability | Intent | Resolve+Dispatch | Undo entries armed | Authoritative state (A→B) | Geometry | Persist | Undo (≡A) | Redo (≡B) | Sync | Report | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `roof.update` | set roof thickness | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: roof.u-roof-1.thickness, roof.u-roof-1.metadata.modifiedAt, roof.u-roof-1.metadata.version (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 1 divergence(s) from State B: roof.u-roof-1.metadata.modifiedAt: expected 1786466652868 got 1786466652875 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `wall.updateDimensions` | set wall height | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-1.height, wall.u-wall-1._renderVersion, wall.u-wall-1.metadata.modifiedAt, wall.u-wall-1.metadata.version (4 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 1 divergence(s) from State B: wall.u-wall-1.metadata.modifiedAt: expected 1786466652888 got 1786466652892 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `wall.updateBaseline` | move a wall (baseline) | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-2.baseLine.0.z, wall.u-wall-2.baseLine.1.z, wall.u-wall-2._renderVersion, wall.u-wall-2.metadata.modifiedAt, wall.u-wall-2.metadata.version, wall.u-wall-2._sourceBaseLine (6 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 1 divergence(s) from State B: wall.u-wall-2.metadata.modifiedAt: expected 1786466652895 got 1786466652898 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `element.updateParameters` | set wall colour via the generic parameter path | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-1.materialColor, wall.u-wall-1.metadata.modifiedAt, wall.u-wall-1.metadata.version (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | FAIL — after undo, 2 divergence(s) from State A: wall.u-wall-1.metadata.modifiedAt: expected 1786466652892 got 1786466652905 \| wall.u-wall-1.metadata.version: expected 2 got 4 | FAIL — after redo, 2 divergence(s) from State B: wall.u-wall-1.metadata.modifiedAt: expected 1786466652902 got 1786466652906 \| wall.u-wall-1.metadata.version: expected 3 got 5 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `wall.updateColor` | set wall colour | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-2._renderVersion, wall.u-wall-2.metadata.modifiedAt, wall.u-wall-2.metadata.version, wall.u-wall-2._sourceBaseLine, wall.u-wall-2.materialColor (5 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 1 divergence(s) from State B: wall.u-wall-2.metadata.modifiedAt: expected 1786466652910 got 1786466652913 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `slab.updateDimensions` | set slab thickness | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: slab.u-slab-1.thickness (1 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | PROVEN — after redo, authoritative state ≡ State B (deep, whole-store) | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **PARTIALLY VERIFIED** |
| `ceiling.update` | set ceiling height | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: ceiling.u-ce-1.metadata.modifiedAt, ceiling.u-ce-1.metadata.version, ceiling.u-ce-1.height (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | FAIL — after undo, 1 divergence(s) from State A: ceiling.u-ce-1.metadata.modifiedAt: expected 1786466652848 got 1786466652928 | FAIL — after redo, 1 divergence(s) from State B: ceiling.u-ce-1.metadata.modifiedAt: expected 1786466652925 got 1786466652929 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `door.setOffset` | move a door along its wall | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-1.openings.0.offset, wall.u-wall-1._renderVersion, door.da47e151-772c-4753-8d95-5886731bf569.offset (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | FAIL — after undo, 1 divergence(s) from State A: wall.u-wall-1._renderVersion: expected 3 got 5 | FAIL — after redo, 1 divergence(s) from State B: wall.u-wall-1._renderVersion: expected 4 got 6 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `window.setOffset` | move a window along its wall | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-2.openings.0.offset, wall.u-wall-2._renderVersion, window.f33c5162-675a-4593-89d9-957d22ea82a3.offset (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | FAIL — after undo, 1 divergence(s) from State A: wall.u-wall-2._renderVersion: expected 4 got 6 | FAIL — after redo, 1 divergence(s) from State B: wall.u-wall-2._renderVersion: expected 5 got 7 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `door.setSillHeight` | set door sill height (generic parameter bridge) | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-1.openings.0.sillHeight, wall.u-wall-1._renderVersion, door.da47e151-772c-4753-8d95-5886731bf569.sillHeight (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | FAIL — after undo, 1 divergence(s) from State A: wall.u-wall-1._renderVersion: expected 6 got 8 | FAIL — after redo, 1 divergence(s) from State B: wall.u-wall-1._renderVersion: expected 7 got 9 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `room.setMaterial (colour)` | set room fill colour | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: room.b9edeb43-475e-4d99-8580-c18747303a80.metadata.modifiedAt, room.b9edeb43-475e-4d99-8580-c18747303a80.metadata.version, room.b9edeb43-475e-4d99-8580-c18747303a80.colour (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 1 divergence(s) from State B: room.b9edeb43-475e-4d99-8580-c18747303a80.metadata.modifiedAt: expected 1786466652958 got 1786466652962 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `room.setName` | rename a room | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: room.b9edeb43-475e-4d99-8580-c18747303a80.name, room.b9edeb43-475e-4d99-8580-c18747303a80.metadata.modifiedAt, room.b9edeb43-475e-4d99-8580-c18747303a80.metadata.version (3 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 1 divergence(s) from State B: room.b9edeb43-475e-4d99-8580-c18747303a80.metadata.modifiedAt: expected 1786466652968 got 1786466652970 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `wall.updateSystemTypeBatch` | change ALL walls to a named type (batch = ONE undo) | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: wall.u-wall-1.thickness, wall.u-wall-1._renderVersion, wall.u-wall-1.metadata.modifiedAt, wall.u-wall-1.metadata.version, wall.u-wall-1.systemTypeId, wall.u-wall-1.layers … +6 (12 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | FAIL — after redo, 2 divergence(s) from State B: wall.u-wall-1.metadata.modifiedAt: expected 1786466652974 got 1786466652977 \| wall.u-wall-2.metadata.modifiedAt: expected 1786466652975 got 1786466652977 | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **FAILED** |
| `door.updateSystemTypeBatch` | change ALL doors to a named type (batch = ONE undo) | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: door.da47e151-772c-4753-8d95-5886731bf569.frameThickness, door.da47e151-772c-4753-8d95-5886731bf569.frameColor, door.da47e151-772c-4753-8d95-5886731bf569.leafThickness, door.da47e151-772c-4753-8d95-58867… (8 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | PROVEN — after redo, authoritative state ≡ State B (deep, whole-store) | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **PARTIALLY VERIFIED** |
| `window.updateSystemTypeBatch` | change ALL windows to a named type (batch = ONE undo) | PROVEN — resolved + dispatched on the real bus | 1 | PROVEN — authoritative state moved: window.f33c5162-675a-4593-89d9-957d22ea82a3.glazingThickness, window.f33c5162-675a-4593-89d9-957d22ea82a3.rebateDepth, window.f33c5162-675a-4593-89d9-957d22ea82a3.frameFinish, window.f33c5162-675a-4593-8… (6 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | PROVEN — after undo, authoritative state ≡ State A (deep, whole-store, 1 entry) | PROVEN — after redo, authoritative state ≡ State B (deep, whole-store) | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **PARTIALLY VERIFIED** |
| `slab.updateSystemTypeBatch` | change ALL slabs to a named type (batch = ONE undo) | PROVEN — resolved + dispatched on the real bus | 0 | REFUSES-CORRECTLY — no store changed and the bridge broadcast its refusal: The slab type catalogue is not available here. (0 paths moved) | UNPROVEN — no fragment builders headless; meshes never built | n/a — H1 | UNPROVEN — no state change to undo | UNPROVEN — no state change to redo | UNPROVEN — no transport exists (L-391 leg C) | PROVEN — dispatch resolved with a structured outcome (throw ≠ no-change, asserted separately) | **PARTIALLY VERIFIED** |

## Falsifiability — every green cell was watched go red

| Check | Executed output | Reads |
|---|---|---|
| H2 round-trip comparator, truthful vs tampered expectation | `[FALSIFY H2] undo-vs-A divergences=0 \| undo-vs-TAMPERED-A divergences=1 first={"path":"roof.u-roof-1.thickness","expected":9.99,"actual":0.4}` | A real undo compares CLEAN; the same comparison against a value nobody ever wrote (`thickness: 9.99`) goes RED and names the path. |
| H1 comparator, self vs tampered | `self-diff=CLEAN \| tampered-diff=DIVERGED`, naming `wall.<id>.height` | The persistence comparator detects a single mutated property inside a whole-store capture. |
| H1 MISCONFIGURED guard | a capture whose store read threw compares as `MISCONFIGURED`, never `CLEAN` | A comparator that reached no store can never report "0 divergences". |
| Negative control, in-run | `slab.updateSystemTypeBatch` → `REFUSES-CORRECTLY` quoting the bridge ("The slab type catalogue is not available here"), `entriesAdded=0` | A refusal that speaks is graded differently from a silent no-op — the two are never the same value. |

## Findings — the divergences this run actually found

### F-1 (BIGGEST BLOCKER) — `metadata.*` / `ifcData.guid` / `_renderVersion` are re-minted on every restore and every redo, so **no element kind round-trips byte-identically and almost no redo returns to State B**

This one mechanism produces **20 of the 24 FAILED rows**. Three faces of it:

1. **Reload re-mints identity + audit fields.** The loader restores an element by re-running its `Create*Command`,
   which stamps a FRESH `metadata.createdAt/modifiedAt/version` and a FRESH `ifcData.guid`. Measured:
   `roof.cert-roof-1.metadata.createdAt: expected 1786466652844 got 1786466657218`;
   `handrail.cert-hr-1.ifcData.guid: expected "10ba9d01-…" got "4b8a4940-…"`. The IFC GUID is a **round-trip join key**
   (`ProjectSerializer.ts` header, A.R.3 · S55) — a model saved and reopened no longer matches its own IFC/Revit export.
2. **Redo re-stamps `modifiedAt`.** `CommandManager.redo()` re-EXECUTES the command instead of re-applying a patch, so
   State-B-after-redo differs from State B by a few ms on `metadata.modifiedAt` (`expected …868 got …875`). Every
   non-batch H2 row with a clean undo fails on this and only this.
3. **Monotonic counters never return.** `element.updateParameters` left `metadata.version 4` where State A held `2`;
   the door/window offset verbs leave `wall._renderVersion` **+2 per undo cycle** (`expected 3 got 5`). Cycle after
   cycle the model is never bit-equal to where it was.

**Deliberately NOT normalised away.** The harness ships an EMPTY documented-tolerance list (STOP rule): whether
`metadata` / `_renderVersion` are legitimate derived state is a CONTRACT question — C13 §2 requires snapshots to
round-trip byte-compatibly — not a harness question. Until a contract declares them derived, they are divergences.

### F-2 — `stair` and `beam` LOSE THEIR IDENTITY across save/reload (a real data defect, not a timestamp)

Measured: `stair.cert-st-1: expected "(present)" got "(absent — LOST)"` alongside
`stair.dd43622f-…: expected "(absent)" got "(present)"` — and identically for `beam`. The element survives under a
**different id**. Source-anchored root cause: `packages/command-registry/src/project/ImportProjectCommand.ts:680`
constructs `CreateStairCommand({…})` **with no `id:`**, and `:875` constructs `CreateBeamCommand({…})` **with no
`beamId:`**, so each mints a fresh UUID — while the other loader,
`apps/editor/src/engine/persistence/ProjectLoader.ts:1011-1015`, *does* pass `id: stair.id` and cites §PERSIST-L1 for
exactly this reason. Consequence: after one save/reload every reference to that stair or beam — railings, openings,
room boundaries, selection, schedules, IFC join keys — points at an id that no longer exists. It also explains
`level.L0.childrenIds` gaining two orphan entries per round-trip (the level still lists the OLD ids).

### F-3 — `plumbing` and `furniture` MOVE 15 mm UP the Y axis on every reload

`plumbing.cert-pl-1.position.y: expected 0 got 0.015` · `furniture.cert-fu-1.position.y: expected 0 got 0.015`.
Deterministic, identical for both families, and CUMULATIVE by construction (the restored position is the next
save's input): a fixture drifts 15 mm per open-save cycle.

### F-4 — `wall.openings[*]` GAINS fields on reload that the live model never held

`wall.cert-wall-1.openings.0.frameThickness: expected undefined got 0.05` (also `frameColor`, `leafColor`). The
loader's `findOpeningElementData()` merges the door/window record into the wall's opening descriptor, so the wall
after reload is a SUPERSET of the wall before. Benign-looking, but any equality check on that descriptor (sync,
diffing, dirty-tracking) sees a change nobody made.

### F-5 — `persist:opening` is MISCONFIGURED, and says so

`UNPROVEN — seed reported success but the authoritative store holds 0 records (MISCONFIGURED for this kind)`.
`CreateWallOpeningCommand` succeeded and produced door/window records, but the standalone `openingStore` stayed
empty. **This row is deliberately not reported as "0 divergences / clean"** — that is the exact confusion the
directive forbids. Whether `openingStore` is authoritative for hosted openings at all is an open question.

### F-6 (correction to an earlier draft) — the room verbs are LIVE, not dead

An earlier run graded `room.setMaterial` / `room.setName` as SILENT SUCCESS. That verdict was a HARNESS defect: the
room seed had been rejected by `RoomStore.add` (non-UUID id + an invalid `detectionMethod`), so there was no room to
change. With a schema-valid room seeded, both verbs PROVE authoritative movement (`room.<id>.colour`, `room.<id>.name`)
and both undo cleanly. Recorded here because "the probe was wrong" is a finding too.

## UNPROVEN list (what this run does NOT claim)

| Axis / subject | Why UNPROVEN |
|---|---|
| **Geometry**, every row | no fragment builders run headlessly — no mesh is built, so "the geometry followed" is unmeasured. The roof polygon-offset oracle remains the repo's only geometry evidence. |
| **Collaboration / sync**, every row | no transport exists (L-391 leg C); nothing here can observe a second client. |
| Unified `performUndoRedo` (ring-first) path + the 250 ms cross-stack window | out of scope by design; the 3 `it.fails` pins in `undoGestureOrdering.test.ts` were left untouched. This document certifies the LEGACY `CommandManager` stack only. |
| `slab.updateSystemTypeBatch` undo/redo | the slab type catalogue is empty headlessly; the verb REFUSED-CORRECTLY, so there was no state change to undo. |
| 12 element kinds' stores under `composeRuntime` | unchanged by this work. The harness builds stores the way `initBuilders` does — which is precisely the §B.1 gap. This does NOT prove `composeRuntime` reaches them. |
| Browser save/load I/O (IndexedDB, Supabase, autosave) | only the in-memory serializer→loader pair is exercised. |
| Chat / NL rung above the bus | covered by the RAC ladder probes, not by these harnesses. |

## How to re-run

```bash
cd tools/rac-conformance/certification
npx vitest run __tests__/persistence.cert.ts __tests__/undoredo.cert.ts   # red = findings, not breakage
npx tsx generate-report.ts                                               # regenerates this file
```

## Axis legend

| Axis | What was measured | What was NOT measured |
|---|---|---|
| Resolve | the seeding/creating command was accepted by `canExecute` and executed | the chat/NL rung above the bus (covered by the RAC ladder probes, not here) |
| Dispatch | `bus.executeCommand(verb, payload)` on the REAL composed bus returned or threw — a throw is never merged with "no change" | — |
| Authoritative state | a deep whole-store re-read moved on exactly the watched property, read INDEPENDENTLY of the command result | — |
| Geometry | — | **UNPROVEN everywhere**: no fragment builders run headlessly, so no mesh is ever built in this harness |
| Persistence | real serializer → JSON → real loader → deep re-read, per property | browser save/load I/O, IndexedDB, Supabase |
| Undo / Redo | `cm.undo()`/`cm.redo()` then a whole-store deep compare to State A / State B | the unified ring-first `performUndoRedo` path and its 250 ms cross-stack window |
| Sync (Collaboration) | — | **UNPROVEN everywhere by construction**: no transport exists (L-391 leg C) |
| Report | the dispatch produced a structured outcome; refusals carry their reason verbatim (batch bridges' CustomEvent payloads are captured) | transcript wording above the bus |
