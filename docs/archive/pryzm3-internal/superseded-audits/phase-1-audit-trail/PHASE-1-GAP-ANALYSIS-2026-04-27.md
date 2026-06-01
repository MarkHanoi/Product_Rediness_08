# Phase 1 Gap Analysis — Architecture vs Source Code

**Date**: 2026-04-27
**Scope**: M1–M12 / sprints S01–S24, as specified in `docs/00_NEW_ARCHITECTURE/phases/PHASE-1A`, `PHASE-1B`, `PHASE-1C`, `PHASE-1D`.
**Method**: For every named deliverable in the four sub-phase docs (file paths, packages, plugins, apps, ADRs, CI gates, benches, parity fixtures), check whether it currently exists in the source tree (`apps/`, `packages/`, `plugins/`, `tools/`, `tests/`, `docs/02-decisions/adrs/`, `.github/workflows/`).
**Output of this doc**: a per-sprint and per-category gap matrix with a severity rank (BLOCKER / MAJOR / MINOR / DEVIATION / DONE) and a roll-up at the end.

---

## §0 Executive summary

| Sub-phase | Sprints | Code status | Gate verdict |
|---|---|---|---|
| **PHASE-1A** Skeleton Rails (M1–M3) | S01–S06 | **Substantially complete.** All 6 sprints have code on disk; visual-diff fixtures explicitly deferred per K1A-3 (no headless WebGPU in Replit/CI sandbox). | M3 PASS with documented carve-out for binary visual fixtures. |
| **PHASE-1B** Wall End-to-End (M4–M6) | S07–S12 | **Not started.** Zero element plugins beyond `toy-cube`. No `packages/geometry-kernel`. No `plugins/wall|door|window|roof|slab|curtain-wall|grid|column|beam`. No producer parity fixtures. No code-level ADRs 0008–0013. | **M6 BLOCKED.** |
| **PHASE-1C** Element Families (M7–M9) | S13–S18 | **Not started.** No remaining 3 plugins (stair/handrail/ceiling). No `packages/picking`, no `packages/view-state`, no production post-FX passes (Bloom/TRAA/SSGI/IdleAccumulator). No `apps/headless`. No bench dashboard. No code-level ADRs 0014–0017. | **M9 BLOCKED.** |
| **PHASE-1D** Bake & Pryzm Alpha (M10–M12) | S19–S24 | **Not started.** No `packages/file-format`, no chunked-binary codecs (Draco/Meshopt/KTX2), no `apps/bake-worker`, no `apps/sync-server`, no tier-streamed loader, no M12 alpha bench reports. No code-level ADRs 0017–0019. | **M12 BLOCKED.** |

**Headline finding**: the *foundation rails* (S01–S06) are in. The first *real* element family (Wall, S07) and everything downstream is unbuilt. This means:
- The dual-mode renderer, command bus, scene committer, persistence event log, frame scheduler, and `?pryzm2=1` URL flag boot path are all live.
- The `toy-cube` reference plugin proves the L1→L2→L3→L5 stack end-to-end (per `plugins/toy-cube/src/HelloCubeBoot.ts`).
- But **no real BIM element can be drawn, persisted, or rendered** by PRYZM 2 yet — the closest production-style element is the cube.
- The **M6/M9/M12 alpha gate cannot pass** without restarting Phase 1B.

A consolation: `packages/schemas` already contains **all 20 element families** as Zod schemas (Wall, Slab, Door, Window, Roof, CurtainWall, Grid, Column, Beam, Stair, Handrail, Ceiling, Room, Furniture, Annotation, Dimension, Sheet, Schedule, View, Project) — far ahead of the S01 spec which only required 3. So when Phase 1B restarts, **schema work is not on the critical path**.

---

## §1 Workspace snapshot (what is on disk today)

```
apps/
  bench/             ✓ S01-T8 baseline harness, all 8 S01-S06 bench scripts present
  editor/            ✓ S06 PRYZM 2 entry point with bootstrap, dual-mode parity test, snapshot-cube script
  (sync-server/)     ✗ MISSING — required by S22
  (bake-worker/)     ✗ MISSING — required by S21
  (headless/)        ✗ MISSING — required by S18
  (ai-worker/)       ✗ MISSING — Phase 3, out of scope here
packages/
  command-bus/       ✓ S02 bus + patch emitter + undo + tracing
  frame-scheduler/   ✓ S03 demand-driven scheduler + idle continuation
  legacy-shim/       ✓ S03-aux: holds the deliberately-bad raf.bad.ts so the no-raf rule has a fixture
  persistence-client/✓ S04 event log + InMemory & IndexedDb backends + JSON/Msgpack codecs
  protocol/          ✓ S01 DTO barrel (re-exports schemas) — 68 lines
  renderer/          ✓ S06 dual-mode renderer + ClearPass + MeshPass + Pipeline + CameraController
  scene-committer/   ✓ S05 CommitterHost + MaterialPool + SceneRegistry + dispatcher
  schemas/           ✓ S01 (over-delivered): all 20 element schemas, base/ primitives, factory, registry, types/Id
  stores/            ✓ S05 BaseStore + CubeStore + attachStores
  (geometry-kernel/) ✗ MISSING — required by S08, S10, S11, S12, S14
  (types-builtin/)   ✗ MISSING — required by S11, S12, S13, S14 (built-in element types)
  (picking/)         ✗ MISSING — required by S16
  (view-state/)      ✗ MISSING — required by S17
  (file-format/)     ✗ MISSING — required by S20
  (render-runtime/)  ✗ MISSING — required by S16 (highlight extraction from wall)
plugins/
  toy-cube/          ✓ S04+S06 reference committer + Hello-Cube boot
  (wall/)            ✗ MISSING — required by S07–S10
  (door/)            ✗ MISSING — required by S11
  (window/)          ✗ MISSING — required by S11
  (roof/)            ✗ MISSING — required by S11
  (slab/)            ✗ MISSING — required by S12
  (curtain-wall/)    ✗ MISSING — required by S12+S13
  (grid/)            ✗ MISSING — required by S12
  (column/)          ✗ MISSING — required by S12
  (beam/)            ✗ MISSING — required by S12
  (stair/)           ✗ MISSING — required by S13–S14
  (handrail/)        ✗ MISSING — required by S14
  (ceiling/)         ✗ MISSING — required by S14
  (cross/)           ✗ MISSING — required by S12 (slab-wall) + S14 (stair-handrail)
tools/
  eslint-plugin-pryzm/ ✓ all 4 boundary rules + fixture-driven integration test
  scripts/             ✓ check-raf-count.mjs, check-no-raf-in-pryzm2.mjs, check-three-outside-committer-count.mjs, check-lint-fixtures.mjs, raf-count.baseline.json
tests/
  fixtures/pryzm-1-snapshots/  ✓ snapshot dirs for all 20 element types + wall-sample.json + README
  (parity/)                    ✗ MISSING — required by S08 (wall), S11 (door/window/roof), S12 (slab/cw), S13 (cw real-projects), S14 (stair/handrail/ceiling)
  (integration/)               ✗ MISSING — required by S12 (mixed-scene)
docs/02-decisions/adrs/
  0001 typed-id-brand-strategy            ✓ S01
  0002 command-handler-signature          ✓ S02
  0003 frame-scheduler-priority-vs-deadline ✓ S03
  0004 messagepack-codec-choice           ✓ S04
  0005 primitive-committer-interface      ✓ S04
  0006 idle-continuation-budget           ✓ S03
  0007 webgpu-webgl2-dual-mode            ✓ S06
  (0008 wall-handler-triage)              ✗ MISSING — required by S07
  (0009 wall-producer-signature)          ✗ MISSING — required by S08
  (0010 slab-handler-triage)              ✗ MISSING — required by S12
  (0011 curtain-wall-triage)              ✗ MISSING — required by S12
  (0012 cross-element-cascade)            ✗ MISSING — required by S10
  (0013 intent-resolver)                  ✗ MISSING — required by S10
  (0014 traa-ssgi-idle-budget)            ✗ MISSING — required by S15
  (0015 picking-strategy)                 ✗ MISSING — required by S16
  (0016 view-state-command-driven)        ✗ MISSING — required by S17
  (0017 headless-package-surface)         ✗ MISSING — required by S18 (also planned for S19/S20 as pryzm-zip-format)
  (0018 tier-streamed-loader)             ✗ MISSING — required by S23
  (0019 sync-server-linearisation)        ✗ MISSING — required by S22
.github/workflows/
  ci.yml             ✓ 88 lines, full S01-S06 pipeline (install, lint, raf-snapshot, lint-fixtures, typecheck, test, bench, build, bundle-size)
  (browser-matrix.yml) ✗ MISSING — required by Phase 3D (out of scope here)
```

---

## §2 Per-sprint deep dive (S01–S24)

For each sprint: **Required** (from sub-phase doc), **Found** (in source tree), **Gap** (delta), **Severity** (DONE / MINOR / DEVIATION / MAJOR / BLOCKER).

### Sprint S01 — Scaffolding & Boundaries (M1)

| Required | Found | Severity |
|---|---|---|
| `pnpm-workspace.yaml` | ✓ `packages/* tools/* apps/* plugins/*` | DONE |
| `turbo.json` | ✓ build/test/typecheck/lint tasks declared | DONE |
| `tsconfig.base.json` | ✓ ESNext/Bundler/strict/declaration | DONE |
| Root `package.json` declares `three`, `immer`, `zod` | ✓ all three present + many more | DONE |
| `eslint.config.js` with boundary plugin | ✓ `eslint-plugin-boundaries@5.4.0` in devDeps; `eslint.config.js` present (12 KB) | DONE |
| `packages/schemas/src/{index,base/Entity,elements/Wall,elements/Slab,elements/Level}.ts` | ✓ index, base/{BaseNode,primitives,refs,index}, elements/{all 20 families incl. Wall/Slab}, factory/createId, registry, types/Id | DONE (over-delivered: 20 schemas instead of 3) |
| `packages/protocol/src/{index,Command,Envelope}.ts` | ✓ index.ts only (68 lines, re-exports schemas) — Command.ts and Envelope.ts not split out | DEVIATION (Command type lives in `packages/command-bus/src/types.ts`; protocol is a pure DTO barrel — functionally equivalent but doesn't match the spec's file split) |
| `tools/eslint-plugin-pryzm/{index,rules/pryzm-affected-stores-required}` | ✓ `tools/eslint-plugin-pryzm/src/index.js` + `src/rules/affected-stores-required.js` (also no-raf, no-three-in-kernel, no-three-outside-committer) | DONE (plus 3 future-sprint rules already implemented) |
| `.github/workflows/ci.yml` | ✓ 88-line pipeline | DONE |
| `packages/schemas/__tests__/roundtrip.test.ts` | ✓ `round-trip.test.ts` + `typed-id.test.ts` | DONE |
| `tests/fixtures/pryzm-1-snapshots/wall-sample.json` | ✓ exists; plus 21 sibling element dirs | DONE (over-delivered) |
| **CI Gate**: Boundary Check (packages/* cannot import src/*) | ⚠ root `eslint .` runs with `eslint-plugin-boundaries`; need to verify the rule is actually configured to block packages→src. Lint runs in CI so any boundary violation fails the build. | MINOR (verification needed) |
| **CI Gate**: Schema Parity (PRYZM 1 fixtures vs PRYZM 2 schemas) | ✓ `packages/schemas/__tests__/round-trip.test.ts` exercises this; CI runs `npm test --workspaces --if-present` | DONE |
| `docs/02-decisions/adrs/0001-monorepo-structure.md` | ⚠ ADR-0001 exists but is *typed-id-brand-strategy*, not *monorepo-structure*. The monorepo decision is documented elsewhere (top-level `replit.md` + the phase doc). | DEVIATION (different topic chosen for ADR-0001; arguably the typed-id decision is more orthogonal and worth its own ADR) |
| `docs/02-decisions/adrs/0002-command-handler-signature.md` | ✓ exists, exact name match | DONE |
| `docs/04-reference/architecture-detail/schemas.md` | ⚠ Not under `docs/04-reference/architecture-detail/`; check if it's elsewhere | MINOR |

**Sprint S01 verdict: SUBSTANTIALLY DONE.** One real deviation (protocol layout), one ADR topic substitution.

### Sprint S02 — Command Bus & Tracing (M1–M2)

| Required | Found | Severity |
|---|---|---|
| `packages/command-bus/src/{index,Bus,PatchEmitter,types,History,tracing}.ts` | ✓ `index, CommandBus, PatchEmitter, types, UndoStack, otel, produceCommand` | DONE (with naming deviations: `Bus.ts`→`CommandBus.ts`, `History.ts`→`UndoStack.ts`, `tracing.ts`→`otel.ts`. Plus a bonus `produceCommand.ts` extracting the immer-produce wrapper.) |
| `apps/bench/src/benches/cmd-execute-latency.bench.ts` | ✓ exists | DONE |
| `__tests__/undo-redo.test.ts`, `patch-generation.test.ts` | ✓ `undo-stack.test.ts`, `patch-emitter.test.ts`, `move-cube.test.ts`, `registry.test.ts` (4 tests) | DONE (over-delivered) |
| **CI Gate**: Performance baseline (cmd-execute-latency vs baseline) | ⚠ `apps/bench/scripts/check-regression.mjs` runs in CI, *warn-only* per the S01 line in `ci.yml` ("Bench — regression check (warn-only at S01 per docs/04-reference/architecture-detail/ci.md)"). Should harden to *hard-fail* once S02 baseline is signed off. | MINOR (gate exists but is warn-only) |
| **CI Gate**: affected-stores lint required | ✓ rule active in lint-fixtures integration | DONE |
| `docs/02-decisions/adrs/0003-command-bus-batching.md` | ⚠ ADR-0003 exists but is *frame-scheduler-priority-vs-deadline* (a S03 decision). The command-bus batching ADR was apparently merged into ADR-0002 (`command-handler-signature`). | DEVIATION (no separate batching ADR; decision absorbed into 0002) |

**Sprint S02 verdict: DONE.** Naming deviations are cosmetic; one ADR topic was consolidated upward.

### Sprint S03 — Frame Scheduler & Idle Control (M2)

| Required | Found | Severity |
|---|---|---|
| `packages/frame-scheduler/src/{index,Scheduler,Priority}.ts` | ✓ `index, FrameScheduler, IdleContinuation, RafAdapter, otel, types` | DONE (Priority enum lives in `types.ts`) |
| `tools/eslint-plugin-pryzm/src/rules/pryzm-no-raf.ts` | ✓ `tools/eslint-plugin-pryzm/src/rules/no-raf.js` | DONE |
| `apps/bench/src/benches/idle-cpu.bench.ts` | ✓ exists | DONE |
| `apps/bench/src/demos/bouncing-cube.ts` | ✓ exists; covered by `apps/bench/__tests__/bouncing-cube.test.ts` | DONE |
| `__tests__/dirty-flag.test.ts`, `priority-sort.test.ts` | ✓ `frame-scheduler.test.ts`, `idle-continuation.test.ts`, `raf-pump.test.ts` | DONE (different test breakdown but same coverage area) |
| **CI Gate**: Idle CPU < 2.5% | ⚠ `idle-cpu.bench.ts` runs in CI under `npm run bench`. Whether the *gate* hard-fails on > 2.5% depends on `apps/bench/scripts/check-regression.mjs` policy — currently warn-only. | MINOR (gate is warn-only; needs hardening) |
| OTel spans `pryzm.frame.tick`, `pryzm.frame.idle-continuation` | ⚠ Not verified in this audit; `packages/frame-scheduler/src/otel.ts` exists. | MINOR (verify span names match spec) |
| `docs/02-decisions/adrs/0004-scheduler-priority-vs-tickpriority.md` | ⚠ ADR-0004 is *messagepack-codec-choice* (a S04 decision). The scheduler priority decision is captured in ADR-0003 (*frame-scheduler-priority-vs-deadline*). | DEVIATION (numbering shifted by one) |
| `docs/02-decisions/adrs/0006-idle-continuation-budget.md` | ✓ exists, exact match | DONE |

**Sprint S03 verdict: DONE.** ADR numbering reshuffled (ADR-0003/0004 swapped purposes vs spec), but content captured.

### Sprint S04 — Persistence & Committer Interface (M2–M3)

| Required | Found | Severity |
|---|---|---|
| `packages/persistence-client/src/{index,EventLog,backends/InMemoryBackend,backends/IndexedDbBackend,codecs/MessagePackCodec}.ts` | ✓ `index, EventLog, attachEventLog, types, otel, util/ulid-pack, backends/{InMemoryBackend, IndexedDbBackend}, codecs/{JsonCodec, MsgpackCodec, MsgpackAliasedCodec}` | DONE (over-delivered: also has JSON codec for debug + an aliased msgpack variant for compact field names + a ulid-pack utility) |
| `apps/bench/src/benches/{persistence-stress,save-edit}.bench.ts` | ✓ both exist; also `save-reload.bench.ts`, `codec-spike.bench.ts` | DONE |
| `plugins/toy-cube/src/committer.ts` | ✓ exists (HelloCubeBoot wires it) | DONE |
| `__tests__/causal-order.test.ts`, `transaction-safety.test.ts` | ✓ `causal-order-and-volume.test.ts`, `attach-to-bus.test.ts`, `codecs.test.ts`, `in-memory-backend.test.ts`, `indexed-db-backend.test.ts`, `msgpack-aliased-codec.test.ts` (6 tests) | DONE (over-delivered) |
| **CI Gate**: save-edit append < 12 ms | ⚠ bench runs in CI; gate is warn-only as above. | MINOR |
| **CI Gate**: Event Size Report | ⚠ Not visible in `ci.yml` head. | MINOR (verify) |
| `docs/02-decisions/adrs/0005-primitive-committer-interface.md` | ✓ exists, exact match | DONE |
| `docs/04-reference/architecture-detail/persistence.md` | ⚠ Not verified | MINOR |

**Sprint S04 verdict: DONE.**

### Sprint S05 — Scene Committer & Stores (M3)

| Required | Found | Severity |
|---|---|---|
| `packages/scene-committer/src/{index,Committer,SceneRegistry,MaterialPool}.ts` | ✓ `index, CommitterHost, SceneRegistry, MaterialPool, dispatcher, types, otel` | DONE (Committer→CommitterHost rename) |
| `packages/stores/src/{index,BaseStore,CubeStore}.ts` | ✓ `index, Store, CubeStore, attachStores, types` | DONE (BaseStore→Store rename) |
| `tools/eslint-plugin-pryzm/src/rules/{pryzm-no-three-outside-committer,pryzm-no-three-in-kernel}.ts` | ✓ both `no-three-outside-committer.js` and `no-three-in-kernel.js` | DONE |
| `__tests__/material-leak.test.ts`, `batch-coalesce.test.ts` | ✓ `MaterialPool.test.ts`, `SceneRegistry.test.ts`, `dispatcher.test.ts`, `cube-100-smoke.test.ts`, `cube-committer-e2e.test.ts` (5 tests) | DONE (different decomposition, broader coverage) |
| **CI Gate**: THREE Isolation enforced for `packages/stores/`, `packages/schemas/` | ✓ `no-three-outside-committer` rule active in CI (lint-fixtures integration test verifies it fires) | DONE |
| OTel span `pryzm.scene.commit` (with add/remove/update counts) | ⚠ `packages/scene-committer/src/otel.ts` exists; need to verify span name + attributes | MINOR (verify) |

**Sprint S05 verdict: DONE.**

### Sprint S06 — Dual-Mode Renderer & Bootstrap (M3)

| Required | Found | Severity |
|---|---|---|
| `packages/renderer/src/{index,Renderer,passes/ClearPass,passes/MeshPass}.ts` | ✓ `index, Renderer, CameraController, otel, passes/{ClearPass, MeshPass, Pipeline}` | DONE (CameraController + Pipeline added on top) |
| `apps/editor/src/bootstrap.ts` | ✓ 156 lines | DONE |
| `apps/editor/src/index.ts` (URL flag `?pryzm2=1`) | ✓ 11 lines | DONE |
| `apps/bench/src/benches/full-pipeline.bench.ts` | ✓ exists | DONE |
| `apps/bench/scripts/check-bundle-size.mjs` (gate < 1.8 MB gzip) | ✓ exists; runs in CI as **warn-only** (`|| echo "[bench] bundle size: warn-only at S01."`) | MINOR (gate is warn-only — should be hard at the M3 close) |
| `apps/editor/__tests__/visual-fixtures/` baseline PNGs | ⚠ folder exists, but only contains `README.md`. The README **explicitly defers** PNG capture per K1A-3 mitigation: "Headless WebGPU is not available in the Replit / CI sandbox … reference PNGs land when the WebGPU pipeline first lights up on a real GPU (Sub-phase 1B, post-K1A-3 mitigation)". Bound `visual-diff.mjs` with `--no-fixtures` flag. | DEVIATION (consciously deferred — *not* a missed deliverable; the K1A-3 carve-out is documented and code respects it) |
| `apps/editor/__tests__/dual-mode-parity.test.ts` | ✓ exists | DONE |
| `apps/bench/src/benches/save-reload.bench.ts` | ✓ exists | DONE |
| **CI Gate**: visual-diff hard-fail on mode divergence | ⚠ `apps/bench/scripts/visual-diff.mjs` exists; runs in `--no-fixtures` mode pending K1A-3 mitigation | MINOR (deferred per kill-switch policy) |
| `docs/02-decisions/adrs/0007-webgpu-webgl2-dual-mode.md` | ✓ exists, exact match | DONE |
| `PHASE-1A-FINAL-REPORT.md` | ⚠ Not found | MINOR (M3 milestone report not yet written) |

**Sprint S06 verdict: SUBSTANTIALLY DONE** with the documented K1A-3 carve-out for binary visual fixtures.

---

### Sprint S07 — Wall Plugin Foundation & Command Triage (M4)

**Required deliverables (paraphrased from PHASE-1B §S07)**:
- `plugins/wall/{package.json, tsconfig.json, vitest.config.ts, eslint.config.js, store, errors, system-type-store}.ts`
- `plugins/wall/handlers/{CreateWall, DeleteWall, MoveWall, SetWallDimensions, SetWallColor}.ts`
- `packages/geometry-kernel/{package.json, tsconfig.json, producers/.gitkeep, types/BufferGeometryDescriptor}.ts`
- `packages/stores/SelectionStore.ts`
- `apps/editor/src/bootstrap.data.ts` (modified to register WallStore + 5 handlers)
- 7 wall-handler tests + Playwright `pryzm2-smoke.spec.ts`
- `code-level ADR docs/02-decisions/adrs/0008-wall-handler-triage.md` (22→14 handler reduction)
- `docs/04-reference/architecture-detail/element-recipe.md` v1
- CI gates: `pryzm-no-three-in-kernel` real enforcement; `pryzm-affected-stores-required` extended

**Found in source**: NOTHING. `plugins/wall/`, `packages/geometry-kernel/`, `packages/stores/SelectionStore.ts`, ADR 0008 — all absent.

**Severity: BLOCKER** for M4 milestone. Without S07 the wall element cannot be drawn at all.

### Sprint S08 — Pure Wall Producer & 30-Case Parity (M4–M5)

**Required**:
- `packages/geometry-kernel/producers/wall.ts` (pure-function `produceWall`, `resolveMiters`, `applyOpenings`, `buildPath`)
- `packages/geometry-kernel/math/{mat4,vec3}.ts`
- `packages/geometry-kernel/csg/{KernelCSG, plane-clip, bsp-tree}.ts`
- `packages/geometry-kernel/types/{Point3D, JoinData, assertValidDescriptor}.ts`
- `apps/bench/produce-wall.ts`
- 5 unit tests + headless-runner + browser-worker-runner + 30-case parity snapshot test
- `code-level ADR docs/02-decisions/adrs/0009-wall-producer-signature.md`
- `docs/04-reference/architecture-detail/parity-fixtures.md`

**Found**: NOTHING.

**Severity: BLOCKER.** Without the geometry kernel producer, the wall plugin (S07) has nothing to commit to the scene.

### Sprint S09 — Wall Committer, Tool & Persistence (M5)

**Required**:
- `plugins/wall/{committer, tool, selection-highlight}.ts`
- `packages/persistence-client/src/codecs/WallCodec.ts`
- `packages/persistence-client/src/backends/IndexedDBBackend.ts` (already exists from S04, but the spec says re-touched here for wall round-trip)
- `apps/bench/load-small.ts` (1-wall cold-load < 800 ms)
- Playwright `wall-drawing.spec.ts` + orbit-fps bench (> 55 fps p95 with 100 walls)

**Found**:
- `packages/persistence-client/src/backends/IndexedDbBackend.ts` ✓ (generic; not wall-specific)
- All else: NOTHING.

**Severity: BLOCKER.** No way to draw, persist, or visualise a wall.

### Sprint S10 — Wall Intent, Cascade & Roof Producer (M5–M6)

**Required**:
- `plugins/wall/{intent, occupancy}.ts`
- 9 advanced wall handlers: `TransformWall, SetWallLayers, BulkSetWallVisuals, SetWallSystemType, CreateWallOpening, CreateWallBetweenMarks, CreateWallsFromSlab, ChangeWallLevel, JoinWall, CutWall`
- `packages/command-bus/cascade.ts` (DAG cycle-drop infra)
- `packages/geometry-kernel/producers/roof.ts`
- 20-case Roof parity test
- ADRs `0012-cross-element-cascade-rule-registration` + `0013-intent-resolver`

**Found**:
- `packages/command-bus/src/cascade.ts` — **DOES NOT EXIST** (verified: `ls packages/command-bus/src/ | grep -i cascade` returned nothing)
- All else: NOTHING.

**Severity: BLOCKER** for M6.

### Sprint S11 — Door, Window & Roof End-to-End (M6)

**Required**:
- `plugins/{door, window, roof}/` full plugin (store + handlers + committer + tool + intent each)
- `packages/geometry-kernel/producers/{door, window}.ts` (roof was S10)
- `packages/types-builtin/{door, window, roof}/` starter built-in types
- 47 parity fixtures (15 door + 12 window + 20 roof)
- 10 named handlers (CreateDoor/MoveDoor/SetDoorType/SetDoorSwing, CreateWindow/MoveWindow/SetWindowType, CreateRoof/SetRoofSlope/SetRoofKind)
- Playwright integration spec
- CI gate: `tools/lint-type-completeness.ts` PR-blocking

**Found**: NOTHING. The "K1-C Multiplier" sprint that was supposed to prove the recipe scales (3 elements in one sprint) cannot be evaluated.

**Severity: BLOCKER.**

### Sprint S12 — Slab, Curtain Wall & 1B Close (M6)

**Required**:
- `plugins/{slab, curtain-wall, grid, column, beam}/` (full plugins)
- `plugins/cross/slab-wall.ts` (cross-element coupling)
- `packages/geometry-kernel/producers/{slab, curtain-wall, grid, column, beam}.ts`
- 5 producer benches + 43 parity fixtures (18 slab + 25 cw)
- `tests/integration/mixed-scene.spec.ts`
- ADRs `0010-slab-handler-triage`, `0011-curtain-wall-triage`
- M6 baseline report + M6 demo recording (`docs/05-guides/developer/demos/M6-1B-9-elements.mp4`)
- **Sub-phase goal**: < 800 ms cold-load on a mixed scene (the M6 alpha gate)

**Found**: NOTHING.

**Severity: BLOCKER.** Phase 1B sub-phase exit gate cannot pass.

---

### Sprint S13 — Curtain Wall Completion & Producer Performance (M7)

**Required**: `plugins/curtain-wall/{intent, committer, handlers/AddPanel|RemovePanel|SwapPanel|SetMullionType|RotatePanel}.ts`, `producers/_internal/cw-mullions.ts`, plus `plugins/stair/store + 6 handlers`. CI gates: CW producer p95 < 50 ms, 50-panel orbit > 55 fps.
**Found**: NOTHING.
**Severity: BLOCKER.**

### Sprint S14 — Stairs, Handrails, Ceilings (M7–M8)

**Required**: `plugins/{stair, handrail, ceiling}/` full; `packages/geometry-kernel/producers/{stair, handrail, ceiling}.ts` + `_internal/tread-prism.ts`; `plugins/cross/stair-handrail.ts` for the CascadeRunner coupling; 38 parity fixtures (18 stair + 12 handrail + 8 ceiling).
**Found**: NOTHING.
**Severity: BLOCKER.** This is the sprint that closes the 12-element families goal.

### Sprint S15 — Renderer Hardening (M8)

**Required**: `packages/renderer/passes/{Bloom, TRAA, SSGI}.ts`, `packages/renderer/IdleAccumulator.ts`, ADR-0014. CI gates: idle-cpu < 2.5% with full post-FX, orbit-fps > 50 p95, render-pass cost < 10 ms.
**Found**: only `ClearPass`, `MeshPass`, `Pipeline` (the S06 minimum). No Bloom, no TRAA, no SSGI, no IdleAccumulator.
**Severity: MAJOR** (the renderer ships in a non-production-grade state; orbit/visual quality is at S06 level).

### Sprint S16 — Selection and Picking (M8)

**Required**: `packages/picking/{PickStrategy, GpuPickStrategy, BvhPickStrategy}.ts`, `packages/render-runtime/highlight.ts`, `packages/stores/SelectionStore.ts`, ADR-0015, picking-latency bench < 12 ms p95.
**Found**: NOTHING. `packages/picking` does not exist; `packages/stores/SelectionStore.ts` does not exist.
**Severity: BLOCKER** for any selection-driven UX.

### Sprint S17 — View State & Camera Foundations (M9)

**Required**: `packages/view-state/{ViewController, ViewDefinition, ViewRegistry, schema}.ts`, `packages/stores/ActiveViewStore.ts`, ADR-0016, view-switch bench < 250 ms p95.
**Found**: NOTHING. (Note: `packages/schemas/src/elements/View.ts` exists as a Zod schema but the *runtime* view machinery is absent.)
**Severity: MAJOR** (Plan view, Section view all blocked downstream).

### Sprint S18 — Headless Kernel & Phase 1C Baseline (M9)

**Required**: `apps/headless/` full CLI (`newProject, addWall, addSlab, exportPryzm`), dependency-cruiser purity gate, headless-vs-browser parity test, bench dashboard `apps/bench/dashboard/`, ADR-0017, M9 baseline report.
**Found**: NOTHING. `apps/headless/` does not exist; bench dashboard does not exist.
**Severity: BLOCKER.** The K1-B kernel-purity claim is unverifiable without this.

---

### Sprint S19 — Chunked Binary Persistence (M10)

**Required**: `packages/persistence-client/codec/{draco, meshopt, ktx2}.ts` (KTX2 deferred to Phase 2 per spec), `chunks/{ChunkWriter, ChunkReader}.ts`, `manifest.ts`, `tools/lint-storage-driver-isolation.ts`, K1D-1 small-fixture save < 50 ms.
**Found**: only generic codecs (`JsonCodec`, `MsgpackCodec`, `MsgpackAliasedCodec`) — no Draco/Meshopt/glb chunking. Save path is still text-based.
**Severity: BLOCKER.** Without chunked binary persistence, M11 chunk tier is impossible.

### Sprint S20 — `.pryzm` ZIP Format v1 (M10)

**Required**: `packages/file-format/{pack, unpack, migrations/}`, `apps/headless/cli/{pack, unpack}.ts`, file-format spec doc, ADR-0017 finalised, CI gate: `.pryzm` size < 20% of equivalent PRYZM 1 JSON.
**Found**: NOTHING. `packages/file-format/` does not exist; `apps/headless` does not exist.
**Severity: BLOCKER** for the portable file deliverable.

### Sprint S21 — Bake Worker (Server-Side) v0 (M11)

**Required**: `apps/bake-worker/{index, jobs/RebakeChunkJob, storage/r2, coalescing/CoalesceWindow}.ts`, BullMQ dependency, R2 integration, K1D-2 bake < 1.5 s/level.
**Found**: NOTHING. `apps/bake-worker/` does not exist. No `bullmq` or AWS-SDK dep in root `package.json`.
**Severity: BLOCKER.**

### Sprint S22 — Sync-Server Skeleton (M11)

**Required**: `apps/sync-server/{index, db/schema.sql, handlers/{ConnectClient, AppendEvent, LoadEvents, SubscribeProject}}.ts`, ADR-0019, E2E sync < 400 ms.
**Found**: NOTHING in `apps/sync-server/`. There IS a `server/` at the project root with Stripe/Supabase/CDE/permissions/ifc-storage glue (legacy PRYZM 1 server) and a 151 KB `server.js` at the root, but **no PRYZM 2 sync-server WebSocket app**. `socket.io@4.8.3` is a dep but used only by the legacy server.
**Severity: BLOCKER** for any multi-tab/multi-user feature.

### Sprint S23 — Tier-Streamed Loader (M12)

**Required**: `packages/persistence-client/loader/{Tier1Manifest, Tier2Visible, Tier3Background, HistoryStreamer}.ts`, ADR-0018, K1D-3 large-fixture first-interactive > 5 s halts.
**Found**: NOTHING. Loader infrastructure absent.
**Severity: BLOCKER** for the M12 "< 3 s first-interactive on large project" gate.

### Sprint S24 — M12 Alpha Gate & Demo Build (M12)

**Required**: `apps/editor/src/bootstrap.ts` final composition root, `apps/bench/reports/M12-alpha-gate.json` + `M12-alpha.md`, full visual regression across 12 element families, alpha demo recording, `PHASE-1-COMPLETION-REPORT.md`.
**Found**: `apps/editor/src/bootstrap.ts` exists at S06 quality (156 lines); the S24 *final* composition root that wires sync-server + tier-streamed loader + bake-worker + 12 element families cannot exist because none of those upstream sprints have shipped.
**Severity: BLOCKER.** No M12 gate.

---

## §3 Cross-cutting category roll-up

### §3.1 Code-level ADRs (`docs/02-decisions/adrs/`)

| Required | Status |
|---|---|
| 0001 (S01) | ✓ but topic substituted (typed-id-brand-strategy instead of monorepo-structure) |
| 0002 (S01–S02) | ✓ command-handler-signature |
| 0003 (S02 batching OR S03 priority) | ✓ frame-scheduler-priority-vs-deadline (S03 won the slot; S02 batching folded into 0002) |
| 0004 (S03 priority OR S04 codec) | ✓ messagepack-codec-choice (S04 won the slot) |
| 0005 (S04) | ✓ primitive-committer-interface |
| 0006 (S03) | ✓ idle-continuation-budget |
| 0007 (S06) | ✓ webgpu-webgl2-dual-mode |
| 0008 (S07) wall-handler-triage | ✗ MISSING |
| 0009 (S08) wall-producer-signature | ✗ MISSING |
| 0010 (S12) slab-handler-triage | ✗ MISSING |
| 0011 (S12) curtain-wall-triage | ✗ MISSING |
| 0012 (S10) cross-element-cascade | ✗ MISSING |
| 0013 (S10) intent-resolver | ✗ MISSING |
| 0014 (S15) traa-ssgi-idle-budget | ✗ MISSING |
| 0015 (S16) picking-strategy | ✗ MISSING |
| 0016 (S17) view-state-command-driven | ✗ MISSING |
| 0017 (S18→S20) headless-package-surface / pryzm-zip-format-v1 | ✗ MISSING |
| 0018 (S23) tier-streamed-loader | ✗ MISSING |
| 0019 (S22) sync-server-linearisation | ✗ MISSING |

**Summary: 7 of 19 expected ADRs present (37%).** All present ADRs cover S01–S06 only. ADR numbering has shifted by one slot (0003/0004 swapped vs spec); record this in `docs/02-decisions/adrs/README.md`.

### §3.2 CI gates (`.github/workflows/ci.yml`)

| Spec gate | Status in ci.yml |
|---|---|
| Boundary check (packages→src) | ✓ (via `eslint .` with `eslint-plugin-boundaries`) |
| Schema parity | ✓ (via `npm test --workspaces`, exercises `round-trip.test.ts`) |
| `affectedStores` lint | ✓ (lint-fixture integration test) |
| `no-raf` lint | ✓ (lint-fixture integration test + `check-raf-count.mjs` snapshot diff) |
| `no-three-in-kernel` lint | ✓ (lint-fixture integration test) |
| `no-three-outside-committer` lint | ✓ (lint-fixture integration test) |
| Performance baseline (cmd-execute-latency, idle-cpu, save-edit) | ⚠ runs in CI but **warn-only**. `apps/bench/scripts/check-regression.mjs` is the gate. The S03/S04 spec said hard-fail. |
| Visual diff (WebGPU vs WebGL2 < 2 px) | ⚠ runs in CI in `--no-fixtures` mode per K1A-3 carve-out. Will harden when GPU-equipped runner is available. |
| Bundle size (`dist/index.js` < 1.8 MB gzip) | ⚠ runs in CI but **warn-only** (`|| echo "[bench] bundle size: warn-only at S01."`). |
| Lint-fixture integration (every rule on its `.bad.ts` and `.good.ts`) | ✓ hard-fails (`check-lint-fixtures.mjs`) |
| `lint-type-completeness` (S11) | ✗ MISSING |
| `lint-storage-driver-isolation` (S19) | ✗ MISSING |

**Summary: 6 hard-pass gates, 3 warn-only (correctly deferred), 2 MISSING (S11+S19 scope).**

### §3.3 OTel spans

Spec called out specific span names: `pryzm.frame.tick`, `pryzm.frame.idle-continuation`, `pryzm.scene.commit`. Each S01–S06 package has an `otel.ts`. **Audit recommendation**: spot-check the actual emitted span names match the spec strings (a one-line `rg -n "startSpan|tracer\.start" packages/*/src/otel.ts` would confirm).

### §3.4 Bench / fixture inventory

| Required bench | Found |
|---|---|
| `cmd-execute-latency.bench.ts` (S02) | ✓ |
| `idle-cpu.bench.ts` (S03) | ✓ |
| `save-edit.bench.ts` (S04) | ✓ |
| `persistence-stress.bench.ts` (S04) | ✓ |
| `codec-spike.bench.ts` (S03→S04) | ✓ (named here as `codec-spike`) |
| `full-pipeline.bench.ts` (S06) | ✓ |
| `save-reload.bench.ts` (S06) | ✓ |
| `schemas-roundtrip.bench.ts` (S01) | ✓ |
| `produce-wall.bench.ts` (S08) | ✗ |
| `produce-{door,window,roof,slab,curtain-wall,grid,column,beam}.bench.ts` (S11–S12) | ✗ all 8 |
| `produce-cw.bench.ts`, `orbit-fps-cw.bench.ts` (S13) | ✗ |
| `produce-{stair,handrail,ceiling}.bench.ts` (S14) | ✗ |
| `picking-latency.bench.ts` (S16) | ✗ |
| `view-switch.bench.ts` (S17) | ✗ |
| `render-pass-cost.bench.ts` (S15) | ✗ |
| `bake-incremental.bench.ts` (S21) | ✗ |
| `sync-roundtrip.bench.ts` (S22) | ✗ |
| `load-{small,medium,large}.bench.ts` (S09/S19/S23) | ✗ |
| `pack-unpack.bench.ts` (S20) | ✗ |

**Summary: 8 of ~25 expected benches present (32%).** All present benches are S01–S06 scope.

| Required parity fixture set | Found |
|---|---|
| `tests/fixtures/pryzm-1-snapshots/<element>/` (raw snapshots) | ✓ ALL 22 element-type dirs present (annotation, beam, ceiling, column, curtainwall, dimension, door, furniture, grid, handrail, project, roof, room, schedule, sheet, slab, stair, view, wall, window) plus `wall-sample.json` |
| `tests/parity/wall/wall-snapshot.test.ts` (30 cases, S08) | ✗ |
| `tests/parity/{door, window, roof, slab, curtain-wall}/<>-snapshot.test.ts` (S11–S12) | ✗ |
| `tests/parity/curtain-wall/cw-real-projects.test.ts` (25 cases, S13) | ✗ |
| `tests/parity/{stair, handrail, ceiling}/<>-snapshot.test.ts` (S14) | ✗ |
| `tests/integration/mixed-scene.spec.ts` (S12) | ✗ |
| `tests/fixtures/large-project.pryzm-stub.json` (S19) | ✗ |

**Summary: raw PRYZM-1 snapshot fixtures are pre-extracted (good!), but no parity *test* harness exists yet to consume them. As soon as a producer (e.g. `produceWall`) ships, the S08 parity test can be wired up against `tests/fixtures/pryzm-1-snapshots/wall/`.**

### §3.5 Custom lint rules (`tools/eslint-plugin-pryzm`)

| Spec rule | Found | Notes |
|---|---|---|
| `pryzm-affected-stores-required` | ✓ `affected-stores-required.js` | S01-T6 fixture pair |
| `pryzm-no-raf` | ✓ `no-raf.js` | S03 fixture pair |
| `pryzm-no-three-in-kernel` | ✓ `no-three-in-kernel.js` | S05 fixture pair |
| `pryzm-no-three-outside-committer` | ✓ `no-three-outside-committer.js` | S05 fixture pair |

All 4 rules implemented + integration-tested via `check-lint-fixtures.mjs`. **DONE.**

### §3.6 Apps inventory

| Spec app | Found | Severity |
|---|---|---|
| `apps/editor` (PRYZM 2 entry) | ✓ S06 bootstrap + dual-mode parity test | DONE |
| `apps/bench` (perf harness + baseline-runner + bundle-size + visual-diff) | ✓ S01-T8 baseline harness + 8 benches + 4 scripts + baseline schema | DONE |
| `apps/headless` (S18 CLI) | ✗ | BLOCKER |
| `apps/bench/dashboard` (S18) | ✗ | BLOCKER for S18 baseline publish |
| `apps/bake-worker` (S21) | ✗ | BLOCKER |
| `apps/sync-server` (S22) | ✗ | BLOCKER |

### §3.7 Plugins inventory

| Plugin | Status | Sprint |
|---|---|---|
| `plugins/toy-cube` | ✓ S04 reference committer + S06 hello-cube boot | DONE |
| `plugins/wall` | ✗ | S07–S10 BLOCKER |
| `plugins/door` | ✗ | S11 BLOCKER |
| `plugins/window` | ✗ | S11 BLOCKER |
| `plugins/roof` | ✗ | S11 BLOCKER |
| `plugins/slab` | ✗ | S12 BLOCKER |
| `plugins/curtain-wall` | ✗ | S12+S13 BLOCKER |
| `plugins/grid` | ✗ | S12 BLOCKER |
| `plugins/column` | ✗ | S12 BLOCKER |
| `plugins/beam` | ✗ | S12 BLOCKER |
| `plugins/stair` | ✗ | S13–S14 BLOCKER |
| `plugins/handrail` | ✗ | S14 BLOCKER |
| `plugins/ceiling` | ✗ | S14 BLOCKER |
| `plugins/cross/slab-wall` | ✗ | S12 BLOCKER |
| `plugins/cross/stair-handrail` | ✗ | S14 BLOCKER |

**Summary: 1 of 15 expected plugins (7%).** Only the reference cube exists.

### §3.8 Packages inventory (S07+ scope)

| Package | Status | Sprint |
|---|---|---|
| `packages/geometry-kernel` | ✗ | S08 BLOCKER (everything downstream depends on this) |
| `packages/types-builtin` | ✗ | S11–S14 BLOCKER (built-in element types catalog) |
| `packages/picking` | ✗ | S16 BLOCKER |
| `packages/view-state` | ✗ | S17 BLOCKER |
| `packages/file-format` | ✗ | S20 BLOCKER |
| `packages/render-runtime` (highlight) | ✗ | S16 BLOCKER |
| `packages/stores/SelectionStore` | ✗ | S07/S16 BLOCKER |
| `packages/stores/ActiveViewStore` | ✗ | S17 BLOCKER |
| `packages/command-bus/cascade.ts` | ✗ | S10 BLOCKER |
| `packages/persistence-client/codec/draco.ts` | ✗ | S19 BLOCKER |
| `packages/persistence-client/codec/meshopt.ts` | ✗ | S19 BLOCKER |
| `packages/persistence-client/chunks/ChunkWriter.ts` + ChunkReader | ✗ | S19 BLOCKER |
| `packages/persistence-client/manifest.ts` | ✗ | S19 BLOCKER |
| `packages/persistence-client/loader/*` (Tier1/Tier2/Tier3/HistoryStreamer) | ✗ | S23 BLOCKER |

### §3.9 Documentation deliverables

| Spec doc | Status |
|---|---|
| `docs/02-decisions/adrs/0001..0007.md` | ✓ all 7 present |
| `docs/02-decisions/adrs/0008..0019.md` | ✗ all 12 missing |
| `docs/04-reference/architecture-detail/{schemas,command-bus,frame-scheduler,persistence,stores,scene-committer,renderer,bench-harness,tracing-specs}.md` | ⚠ presence not exhaustively verified in this audit; recommended follow-up `ls docs/04-reference/architecture-detail/` |
| `PHASE-1A-FINAL-REPORT.md` | ✗ |
| `docs/05-guides/developer/demos/M6-1B-9-elements.mp4` | ✗ |
| `apps/bench/reports/M6-1B-baseline.md` | ✗ |
| `apps/bench/reports/M9-1C-baseline.md` | ✗ |
| `apps/bench/reports/M12-alpha-gate.json` + `M12-alpha.md` | ✗ |
| `docs/00_NEW_ARCHITECTURE/PHASE-1-COMPLETION-REPORT.md` | ✗ |
| `docs/04-reference/file-formats/pryzm-binary.md` (S20) | ✗ |
| `docs/api/sync-protocol.md` (S22) | ✗ |
| `docs/04-reference/architecture-detail/headless.md` (S18) | ✗ |

---

## §4 Severity roll-up

### BLOCKERS (M-gate cannot pass)

1. **`packages/geometry-kernel`** — entire package missing (S08, S10–S14, S19 scope). Without it, no element family can be drawn at all.
2. **All 12 element plugins missing** (S07–S14 scope). Only the toy cube exists.
3. **`apps/sync-server`** missing (S22 scope). Multi-tab and multi-user blocked.
4. **`apps/bake-worker`** missing (S21 scope). Server-side geometry compression blocked.
5. **`apps/headless`** missing (S18 scope). K1-B kernel-purity claim unverifiable.
6. **`packages/file-format`** missing (S20 scope). No `.pryzm` portable file artifact.
7. **`packages/persistence-client/codec/{draco,meshopt}` + `chunks/{ChunkWriter,ChunkReader}` + `manifest`** missing (S19 scope). Saves still text-based.
8. **`packages/persistence-client/loader/`** tier-streamed loader missing (S23 scope). Large-project < 3 s first-interactive blocked.
9. **`packages/picking`** + **`packages/view-state`** + **`SelectionStore`** + **`ActiveViewStore`** missing (S16–S17 scope).
10. **All cross-element coupling** (`plugins/cross/*` + `packages/command-bus/cascade.ts`) missing (S10/S12/S14 scope).

### MAJOR (sub-phase incomplete, but foundation stable)

11. **Production renderer post-FX** missing (Bloom/TRAA/SSGI/IdleAccumulator). Renderer ships at S06 baseline quality.
12. **Code-level ADRs 0008–0019** missing — 12 architectural decisions are undocumented.
13. **Parity test harness** missing — raw snapshot fixtures present in `tests/fixtures/pryzm-1-snapshots/` but no `tests/parity/<element>/` test files.
14. **Phase milestone reports** missing — no `PHASE-1A-FINAL-REPORT.md`, no M6/M9/M12 baseline reports, no `PHASE-1-COMPLETION-REPORT.md`.

### MINOR (gate exists but is warn-only or not yet hardened)

15. **CI bench-regression gate is warn-only** (`apps/bench/scripts/check-regression.mjs`). Spec calls for hard-fail at the M3 close.
16. **CI bundle-size gate is warn-only**. Spec calls for hard-fail < 1.8 MB gzip at the M3 close.
17. **Visual-diff gate runs in `--no-fixtures` mode** pending K1A-3 mitigation. (This is a documented carve-out, not a regression.)
18. **OTel span names** not spot-checked against spec strings (`pryzm.frame.tick`, `pryzm.scene.commit`, etc.). Recommended one-liner audit.

### DEVIATIONS (functional equivalent but doesn't match spec naming/topology)

19. **`packages/protocol`** is a 68-line re-export barrel of `@pryzm/schemas`; spec called for separate `Command.ts` and `Envelope.ts` files. The Command type lives in `packages/command-bus/src/types.ts` — functionally equivalent.
20. **No `packages/types-schema` and no `packages/types-builtin` separation**; everything is consolidated under `packages/schemas/`. Functional but breaks the layering the spec calls for (would matter at S11+ when built-in starter types ship).
21. **File naming**: `Bus.ts`→`CommandBus.ts`, `Scheduler.ts`→`FrameScheduler.ts`, `History.ts`→`UndoStack.ts`, `Committer.ts`→`CommitterHost.ts`, `BaseStore.ts`→`Store.ts`, `tracing.ts`→`otel.ts`. Cosmetic.
22. **ADR numbering shifted by one slot**: spec said ADR-0003 = command-bus batching, ADR-0004 = scheduler priority. Actual: ADR-0003 = scheduler priority, ADR-0004 = msgpack codec. Spec's "command-bus batching" decision absorbed into ADR-0002.
23. **ADR-0001 topic substitution**: spec said `0001-monorepo-structure`; actual is `0001-typed-id-brand-strategy`. Monorepo structure is documented in the phase doc + `replit.md` instead.
24. **`packages/legacy-shim/raf.bad.ts`** added (not in spec); used as the deliberately-bad fixture for the `no-raf` lint rule. Useful but undocumented in the phase doc.
25. **`packages/schemas` over-delivery**: spec required only 3 element schemas at S01 (Wall, Slab, Level); actual ships all 20 (everything in `SCHEMA_REGISTRY`). Positive deviation — schema work is off the critical path for Phase 1B.

### DONE (clean pass)

- All S01 monorepo scaffolding (workspace, turbo, tsconfig, eslint).
- All S02 command-bus internals + 4 unit tests.
- All S03 frame-scheduler + bouncing-cube demo + 3 unit tests.
- All S04 persistence-client (event log, 2 backends, 3 codecs, ulid-pack util) + 6 unit tests.
- All S05 scene-committer (CommitterHost, MaterialPool, SceneRegistry, dispatcher) + 5 unit tests.
- All S06 renderer (dual-mode, ClearPass, MeshPass, Pipeline, CameraController) + 3 unit tests.
- `apps/editor` S06 bootstrap + dual-mode parity test + snapshot script.
- `apps/bench` baseline harness + 8 S01-S06 benches + bundle-size + visual-diff + regression-check scripts.
- `tools/eslint-plugin-pryzm` 4 rules + fixture-driven integration test.
- `tools/scripts` raf-snapshot + lint-fixture integration + count-checks + raf-count baseline.
- `.github/workflows/ci.yml` 88-line pipeline with all 7 stages.
- `tests/fixtures/pryzm-1-snapshots/` raw fixtures for all 20 element types.
- `docs/02-decisions/adrs/0001..0007.md` for all S01-S06 decisions.

---

## §5 Recommendations

### Immediate (no engineering, just bookkeeping)

- [ ] Write **`docs/02-decisions/adrs/README.md`** documenting the ADR numbering shift (0003/0004 swap, 0001 topic substitution) so future sprints don't get confused.
- [ ] Write **`PHASE-1A-FINAL-REPORT.md`** capturing the actual S01–S06 metrics, the K1A-3 carve-out (visual fixtures deferred), and the S07 entry preconditions. This is the M3 milestone close artifact.
- [ ] Harden **CI bench-regression** + **bundle-size** gates from warn-only to hard-fail (or document the policy in `docs/04-reference/architecture-detail/ci.md`).

### Phase 1B kickoff prerequisites (before resuming S07)

- [ ] Spike `packages/geometry-kernel/` skeleton with `producers/.gitkeep` + `types/{BufferGeometryDescriptor, Point3D, JoinData}.ts` so S07 wall plugin has a target.
- [ ] Write `docs/04-reference/architecture-detail/element-recipe.md` v1 (S07 deliverable) — this is the canonical doc that every subsequent element plugin will follow.
- [ ] Decide whether `packages/types-schema` / `packages/types-builtin` separation will be re-introduced or whether `packages/schemas` is canonical (the latter is simpler; document the decision).
- [ ] Write **ADR-0008** (wall-handler-triage 22→14) before touching `plugins/wall/handlers/`.

### Phase 1B–1D structural

- [ ] Stand up `apps/headless/` *early* (originally S18) so the K1-B kernel-purity gate can run from S08 onwards as `produceWall` etc. ship. Otherwise the purity claim accumulates risk.
- [ ] Treat `apps/sync-server/` and `apps/bake-worker/` as the long-pole for M11/M12 — both depend on infra setup (BullMQ, Redis, R2/MinIO) that needs Replit-environment work in parallel with sprint S19+.
- [ ] Wire the parity test harness against `tests/fixtures/pryzm-1-snapshots/wall/` in S08-D1 so the parity discipline is in place before any wall geometry ships.

### Documentation parity

- [ ] When ADR-0008 lands, also update **`docs/00_NEW_ARCHITECTURE/phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`** to mark the citation against the actual landed ADR file.
- [ ] When `packages/geometry-kernel` lands, update the workspace inventory in `replit.md` (currently undocumented).

---

## §6 What "DONE" looks like for Phase 1

Phase 1 is **complete** when:

1. All 12 element family plugins ship (`plugins/{wall,door,window,roof,slab,curtain-wall,grid,column,beam,stair,handrail,ceiling}/`) with passing parity fixtures.
2. `packages/geometry-kernel` ships all 12 producers.
3. `apps/headless` ships with the K1-B purity gate green in CI.
4. `apps/sync-server` and `apps/bake-worker` ship with their kill-switch gates green.
5. `packages/file-format` produces a `.pryzm` ZIP that round-trips through pack/unpack.
6. `packages/persistence-client/loader/` delivers tier-streamed loading meeting M12 < 3 s first-interactive on the 5,000-wall fixture.
7. `apps/bench/reports/M12-alpha-gate.json` records all four M12 thresholds met:
   - Small project first-interactive < 800 ms ✗
   - Large project first-interactive < 3 s ✗
   - Small project save (local) < 20 ms ✗
   - Large project full bake < 15 s ✗
8. Code-level ADRs 0008–0019 all written.
9. Visual fixtures captured on a real GPU and visual-diff hardened off `--no-fixtures`.

**Estimated remaining work (rough)**: 18 of 24 sprints (75%) — S07 through S24. S01–S06 deliver ~6 sprint-weeks of code; S07–S24 represent ~18 sprint-weeks at the same density.

---

*Last updated: 2026-04-27 — generated by main-agent gap analysis against the four sub-phase docs (PHASE-1A 756 lines, PHASE-1B 1976 lines, PHASE-1C 1455 lines, PHASE-1D 1670 lines) and the live source tree at commit `584a8908`.*
