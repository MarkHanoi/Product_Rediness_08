# Phase 1 — Foundation (Months 1–12, Sprints S01–S24).

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03_PRYZM3/reference/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/03_PRYZM3/reference/adrs/` (ADR-001..ADR-024 of the strategic series).
> 3. `docs/03_PRYZM3/archive/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03_PRYZM3/reference/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. Bare `ADR-NNN` references inside this phase document refer to the **sprint-scoped / code-level** ADR series at `docs/architecture/adr/NNNN-*.md` after the renumbering applied 2026-04-27 (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md` §1). References to the **strategic** ADR series are written explicitly as `[strategic ADR-NNN]`.
>
> **ADR citation rule.** Bare `ADR-NNN` is forbidden going forward. Use `[strategic ADR-NNN]` for entries in `03_PRYZM3/reference/adrs/`, or fully-qualified `code-level ADR docs/architecture/adr/NNNN-<slug>.md` for sprint-scoped decisions.

> **Phase goal**: produce an alpha PRYZM 2 build that opens a small/medium/large fixture project end-to-end through every layer (L0 → L7.5) under feature flag, alongside the unaltered PRYZM 1, with all CI gates active. By M12 we know the architecture works.
>
> **The bet**: spend 12 months on rails so we never touch them again. The remaining 24 months become a multiplication exercise (per-element-family, per-document-type, per-AI-workflow, per-plugin) instead of architectural archaeology.

This document expands `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §4 with sprint-level detail. Companion docs: `08-VISION.md` (the contract), `09-AS-IS-VS-TO-BE.md` (the gap), `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` (what comes next).

---

## §1 Phase 1 strategic context

### §1.1 What Phase 1 must deliver (the spine)

A "spine" is the minimum slice through every architectural layer that proves the architecture is sound. By M12 we must have:

- L0 — Persistence: event log + chunked binary, both backends working, `.pryzm` v1 round-tripping losslessly, tier-streamed loader operational.
- L1 — Stores: ~12 stores defined, Zod-validated, with typed IDs.
- L2 — Command bus: handler registry, Immer patches, `affectedStores` enforced, OTel-traced.
- L3 — Sync: server skeleton in place, single-tab event durability proven (CRDT comes in 2D).
- L4 — Geometry kernel: pure producers for 9 element families, headless-Node-compatible.
- L5 — Frame scheduler + renderer: single rAF owner, dirty-flag render, post-FX driven by scheduler.
- L6 — Plugin host: deferred to Phase 3C, but layer boundaries enforced from S01.
- L7 — Presentation: vanilla TS, scene-committer the only THREE bridge.
- L7.5 — AI Operations: deferred to Phase 3A.
- **Robustness budget — `[strategic ADR-020]`** (geometry-kernel robustness budget) gates S07 onward. The wall miter property test (`packages/geometry-kernel/__tests__/robustness/wall-join.spec.ts`) must pass at PR-merge from S08 onward.
- **Type catalog — `[strategic ADR-017]`**: by S11 the `Wall` family schema must be complete in `packages/types-schema/`. The legacy 271-line Contract-17 is **DEPRECATED**.

### §1.2 What Phase 1 deliberately does NOT do

To make 12 months tractable for a solo founder + Replit Agent, these are out-of-scope until later phases:

| Deferred | When |
|---|---|
| Constraint solver (loadable family parametric authoring) | Phase 3A — `[strategic ADR-024]` |
| Per-element ACLs (per-instance permissions) | Out of v1 — `[strategic ADR-011]` |
| Helm chart / single-binary self-host | Post-GA — `[strategic ADR-012]` |
| Rooms, Structural, MEP, Furniture | Phase 2A |
| Plan view, Section view, Dimensions, Annotations | Phase 2A–2B |
| Sheets, Schedules, Title blocks, PDF export | Phase 2C |
| Multi-user CRDT, Awareness, Soft locks | Phase 2D |
| Visibility-Intent (the 11 waves) | Phases 2D + 3A |
| AI subsystem (the 31-file moat) | Phase 3A |
| IFC, DXF, Rhino, Component editor | Phase 3B |
| Plugin SDK 1.0, Marketplace, Public APIs | Phase 3C |
| Self-host packaging | Phase 3D |
| Browser matrix beyond Chromium | Phase 3D |

PRYZM 1 continues to ship the deferred capabilities to existing users under feature freeze. PRYZM 2 grows alongside until Phase 3D when legacy is deleted.

### §1.3 Two binary tests of Phase 1 success

These are the M12 gate-defining yes/no questions. Everything else is verification of these two.

1. **Does `apps/headless` (Node) run a wall+slab project end-to-end and produce a valid `.pryzm` file?** If yes, the kernel is genuinely pure (P1 holds). If no, the architecture's central claim is broken.
2. **Does the small fixture cold-load in < 800 ms?** If yes, every NFT downstream is achievable. If no, profile until it does — do not enter Phase 2 with a missed perf gate.

### §1.4 Phase 1 sub-phase shape

```
M1  ─┐
M2   │  Sub-phase 1A — Skeleton & Rails           S01–S06
M3  ─┘
M4  ─┐
M5   │  Sub-phase 1B — Wall end-to-end            S07–S12
M6  ─┘
M7  ─┐
M8   │  Sub-phase 1C — Element families finish    S13–S18
M9  ─┘
M10 ─┐
M11  │  Sub-phase 1D — Bake + .pryzm + alpha gate S19–S24
M12 ─┘                                            ★ M12 ALPHA GATE
```

---

## §2 Sub-phase 1A — Skeleton & Rails (M1–M3, S01–S06)

**Sub-phase goal**: the spine. By end of M3 a "Hello Cube" renders through L0–L7 with patch-based undo, demand-driven render, MessagePack persistence, all CI gates active. PRYZM 1 unchanged.

**Critical decisions due in 1A**:
- Final monorepo layout (locked at end of S01).
- Final boundaries matrix in `eslint.config.js` (locked at end of S02).
- Final OTel span naming (`pryzm.<layer>.<verb>`) locked at S03.
- Final scheduler API (`requestFrame(reason, priority)` vs `requestFrame(reason, deadline)`) — decided in S03 spike.

### S01 — Schemas + ID system + protocol package (Weeks 1–2, M1)

**Goal**: every PRYZM 2 primitive has a Zod schema with a typed ID; the protocol package exports a stable DTO surface that L1 stores will consume.

**Why now**: schemas are the L1 contract. Nothing else can be built without them; conversely, once they exist, everything else is mechanical.

**Deliverables**:
- `packages/schemas/{Wall,Slab,Door,Window,Roof,CurtainWall,Grid,Column,Beam,Stair,Handrail,Ceiling,Room,Furniture,Annotation,Dimension,Sheet,Schedule,View,Project}.ts` — 20 Zod schemas with defaults and refinements.
- `packages/schemas/types/Id.ts` — typed-ID brands (`type WallId = string & { __brand: 'wall' }`, etc.).
- `packages/schemas/factory/createId.ts` — `createId(prefix, ulid)` factory backed by `ulid` npm package.
- `packages/protocol/index.ts` — re-exports all DTOs + ID types as the public surface.
- `packages/schemas/__tests__/round-trip.test.ts` — every schema parses → serialises → re-parses with byte equality.
- `packages/schemas/__tests__/typed-id.test.ts` — compile-time test that `WallId` cannot be substituted for `SlabId`.

**Daily breakdown**:
- D1 — Lock final monorepo layout in `pnpm-workspace.yaml` and `turbo.json`. Bootstrap `packages/schemas` and `packages/protocol`. Implement `createId` + `Id` types.
- D2 — Author the canonical `Wall.ts` schema with all defaults, refinements, typed ID, JSDoc, fixture parse test. This is the template the agent multiplies.
- D3–D4 — Agent multiplies pattern across the remaining 19 schemas; human reviews each PR for schema fidelity vs PRYZM 1 behaviour.
- D5 — `packages/protocol/index.ts` barrel; downstream typecheck check.
- D6–D7 — Round-trip tests for all 20 schemas; refinement edge-cases (nested objects, optional vs default, discriminated unions).
- D8 — Lint, typecheck, bundle-size measurement; first PR-level CI green.
- D9 — Sprint demo recording (3-min schema walkthrough); retro notes.
- D10 — Buffer / docs update (`docs/architecture/schemas.md` stub).

**Exit criteria**:
- All 20 schemas validate sample fixtures extracted from `tests/fixtures/pryzm-1-snapshots/`.
- `Wall.parse({})` produces a valid wall with typed `WallId` and sensible defaults.
- 100% schema branch coverage in vitest.
- `packages/protocol` ships < 50 KB raw, < 15 KB gzip.
- Zero TypeScript errors across the workspace.

**Demo (recorded)**: open the round-trip test in CI; show all 20 round-tripping; show typed-ID compile-time error when `SlabId` is passed where `WallId` expected.

**Dependencies**: Pre-flight ADRs merged. **Risks**: schemas drift silently from PRYZM 1 semantics — mitigated by extracting fixtures from real exports.

---

### S02 — Command bus + Immer patches + audit emitter (Weeks 3–4, M1–M2)

**Goal**: every state mutation flows through a typed `CommandHandler<T>`; handlers produce Immer forward+inverse patches scoped to declared `affectedStores`; the same patches are emitted as MessagePack-encoded events with ULIDs.

**Why now**: the command bus is L2; without it there is no undo, no persistence, no sync, no audit trail. Everything above stalls.

**Deliverables**:
- `packages/command-bus/CommandHandler.ts` — `interface CommandHandler<T> { type: string; affectedStores: readonly StoreId[]; execute(payload: T, ctx: HandlerContext): Promise<{forward: Patch[]; inverse: Patch[]}>; }`.
- `packages/command-bus/CommandBus.ts` — `executeCommand`, `register`, OTel span `pryzm.command.execute`.
- `packages/command-bus/PatchEmitter.ts` — MessagePack encoding, ULID generation, audit metadata (`actorId`, `projectId`, `clientId`, `timestamp`).
- `packages/command-bus/UndoStack.ts` — bounded stack of `{forward, inverse}` patch pairs; `undo()`, `redo()`, `clear()`.
- Custom ESLint rule `pryzm-affected-stores-required` in `tools/eslint-plugin-pryzm/`.
- `packages/command-bus/__tests__/sample-handler.test.ts` — `MoveCubeCommand` produces correct patches.
- `packages/command-bus/__tests__/affected-stores-lint.test.ts` — fixture file with missing `affectedStores` fails lint.

**Daily breakdown**:
- D1 — `CommandHandler` interface + `HandlerContext` type. Decide handler signature with `agent`, formalise.
- D2 — `CommandBus.executeCommand` + OTel wiring + handler registry.
- D3 — Immer integration; `produceWithPatches` wrapper; patch normalisation.
- D4 — `PatchEmitter` with MessagePack codec (msgpack-lite or `@msgpack/msgpack`).
- D5 — `UndoStack` with bounded size + `clear-on-load` integration.
- D6 — Custom ESLint rule + AST walker; lint test fixture.
- D7 — Sample `MoveCubeCommand` end-to-end test (registry → execute → patches → emitter → undo).
- D8 — OTel span verification; bench `cmd-execute-latency.bench.ts`.
- D9 — Demo + retro.
- D10 — Buffer / docs.

**Exit criteria**:
- `MoveCubeCommand` executes in < 1 ms (excluding store apply); patches are correct on undo.
- `affected-stores-required` lint blocks PRs with missing declarations (CI test proves it).
- MessagePack-encoded events are < 200 bytes for typical mutations.
- OTel spans visible in dev (Honeycomb/Tempo).
- Bundle: `packages/command-bus` < 80 KB raw / < 25 KB gzip.

**Demo**: live in dev tools — execute, undo, redo a sample mutation; show the OTel trace; show the lint error blocking a malformed PR fixture.

**Dependencies**: S01 schemas. **Risks**: Immer serialisation quirks with discriminated unions — mitigated by canonical wall fixture in tests.

---

### S03 — Frame scheduler + no-rAF lint + dirty-flag set (Weeks 5–6, M2)

**Goal**: a single `FrameScheduler` owns `requestAnimationFrame`; everything else calls `requestFrame(reason, priority)`; the scheduler reads a dirty-flag set and skips frames when no flags are set; CI lint blocks any new rAF outside the scheduler.

**Why now**: idle CPU < 2% is an L5 contract that depends on this. Adding it later means refactoring every render call; adding it now sets the rule for the next 36 months.

**Deliverables**:
- `packages/frame-scheduler/FrameScheduler.ts` — `requestFrame(reason: string, priority?: 'interaction'|'idle'|'background'): FrameToken`, `cancelFrame(token)`, `markDirty(flag)`, `isDirty()`.
- `packages/frame-scheduler/IdleContinuation.ts` — bounded N-frame budget after motion stops (for TRAA/SSGI accumulation).
- Custom ESLint rule `pryzm-no-raf` blocking any `requestAnimationFrame(` import or call outside `packages/frame-scheduler/`.
- `packages/frame-scheduler/__tests__/idle-zero-fps.test.ts` — proves no rAF callbacks fire when no dirty flags set.
- `packages/frame-scheduler/__tests__/interaction-60fps.test.ts` — proves 60 fps achievable under continuous dirty flags.
- `apps/bench/idle-cpu.ts` — wired to scheduler; baseline captured.

**Daily breakdown**:
- D1 — Scheduler core API; reason + priority semantics.
- D2 — Dirty-flag set; `markDirty`/`clearDirty`; per-flag OTel events.
- D3 — Idle continuation logic; bounded N-frame budget.
- D4 — Custom ESLint rule + AST walker; unit-test the rule itself.
- D5 — Demo "bouncing cube" scene driven only by scheduler; idle profile in DevTools.
- D6 — Bench wiring (idle-cpu, orbit-fps); baseline numbers in `baseline.json`.
- D7 — Replace any pre-flight rAF usages in scaffolding with scheduler calls.
- D8 — Documentation in `docs/architecture/frame-scheduler.md`.
- D9 — Demo + retro.
- D10 — Buffer.

**Exit criteria**:
- Demo cube: 60 fps when interacting (mouse move dirties), 0 fps when idle (DevTools profile).
- Lint blocks any `requestAnimationFrame(` outside the scheduler package — CI proves it on a fixture file.
- `apps/bench/idle-cpu.ts` reports < 2% CPU on idle scene.
- Scheduler API documented; OTel reasons consistent.

**Demo**: open Chrome DevTools Performance tab; show flat-line CPU when idle; show 60 fps when dragging the cube; then show the lint error blocking a fixture PR.

**Dependencies**: none structural. **Risks**: idle continuation budget is wrong for TRAA — mitigated by S15 hardening sprint.

---

### S04 — Persistence client v0 (event log only) (Weeks 7–8, M2–M3)

**Goal**: events are durable; appends are < 10 ms; loads replay events in causal order; both in-memory and IndexedDB backends work; the wire format is MessagePack with ULID + actor metadata.

**Why now**: command bus produces events; without a sink, S02 work cannot persist. Save < 10 ms is a binding NFT contract.

**Deliverables**:
- `packages/persistence-client/EventLog.ts` — `appendEvent(event)`, `loadEvents(from, to)`, `getLatest()`.
- `packages/persistence-client/backends/{InMemoryBackend,IndexedDbBackend}.ts` — pluggable backends.
- `packages/persistence-client/codec/msgpack.ts` — encode/decode with ULID injection.
- `packages/persistence-client/Snapshotter.ts` (skeleton; full impl in S20) — captures store state for `.pryzm` export.
- `apps/bench/save-edit.ts` — measures append latency under load.
- `packages/persistence-client/__tests__/event-roundtrip.test.ts` — 10K events in/out, sequence preserved.
- `packages/persistence-client/__tests__/causal-order.test.ts` — events with same timestamp ordered by ULID.

**Daily breakdown**:
- D1 — `EventLog` interface + `Backend` interface.
- D2 — `InMemoryBackend` for tests; basic round-trip.
- D3 — `IndexedDbBackend` with `idb` wrapper; transaction safety.
- D4 — MessagePack codec; ULID injection; size-bench.
- D5 — Hook `EventLog` into `command-bus.PatchEmitter`; end-to-end command → event → log.
- D6 — `apps/bench/save-edit.ts` wired; baseline captured (target < 10 ms).
- D7 — Causal-order tests; large-volume tests (10K events).
- D8 — OTel `pryzm.persistence.append` span.
- D9 — Demo + retro.
- D10 — Buffer.

**Exit criteria**:
- 100 events round-trip in < 1 s; sequence preserved.
- `save-edit.ts` bench: < 10 ms p95 for single event append.
- IndexedDB backend survives page reload + replays correctly.
- OTel spans visible.
- Per-event size: < 200 bytes typical (mutation), < 2 KB worst-case (large geometry diff).

**Demo**: in dev tools, open IndexedDB inspector; execute 5 commands; show events appearing; reload page; show events replayed.

**Dependencies**: S02. **Risks**: IndexedDB transaction races under burst — mitigated by single-writer queue.

---

### S05 — Scene committer + scene registry (Weeks 9–10, M3)

**Goal**: the **only** place THREE objects are instantiated is `packages/scene-committer/`; per-element committers implement a narrow `PrimitiveCommitter<TStore>` interface; the scene registry is a `Map<id, Object3D>` with O(1) updates.

**Why now**: P2 (the Scene Committer is the only place THREE exists) is the architectural rule that lets us swap renderers later. Establish it before S07 wall work writes any THREE code.

**Deliverables**:
- `packages/scene-committer/SceneCommitter.ts` — `bindStore<T>(store, committer)`, applies patches → calls committer.
- `packages/scene-committer/SceneRegistry.ts` — `Map<ElementId, THREE.Object3D>`; `add`/`remove`/`get`/`updateTransform`.
- `packages/scene-committer/PrimitiveCommitter.ts` — interface every per-element committer implements.
- `packages/scene-committer/__tests__/cube-committer.test.ts` — sample `CubeCommitter` end-to-end (store update → patch → committer → THREE mesh added).
- Custom ESLint rule `pryzm-no-three-outside-committer` blocking `import * as THREE` outside `packages/scene-committer/` and `plugins/*/committer.ts` (rule active but allowlist initially open until S07).

**Daily breakdown**:
- D1 — `PrimitiveCommitter<TStore>` interface design.
- D2 — `SceneRegistry` core; transform/material update paths.
- D3 — `SceneCommitter` patch dispatcher.
- D4 — Sample `CubeStore` + `CubeCommitter`; end-to-end test.
- D5 — Custom ESLint rule (initially warn-only, will be error post-S07).
- D6 — Material caching skeleton (`MaterialPool`); shared materials by hash.
- D7 — OTel `pryzm.scene.commit` span.
- D8 — Documentation `docs/architecture/scene-committer.md`.
- D9 — Demo + retro.
- D10 — Buffer.

**Exit criteria**:
- Sample cube: store update → patch → committer → THREE mesh appears in scene; remove command → mesh removed.
- Material pool deduplicates a 100-cube scene to one material.
- OTel span fires per commit.
- Lint rule warns on any THREE import outside allowed locations.

**Demo**: dev page with two cubes, change colour via store update, mesh re-skinned; profile shows zero garbage from material churn.

**Dependencies**: S02, S03. **Risks**: dispose paths leak GPU memory — mitigated by `MaterialPool.releaseRef` and an end-of-test memory assertion.

---

### S06 — Renderer skeleton + WebGPU/WebGL2 dual-mode (Weeks 11–12, M3)

**Goal**: `packages/renderer/` clears, draws one mesh, owns the camera; WebGPU is default with WebGL2 fallback; render is dirty-flag driven (no continuous loop); initial bundle stays under 1.8 MB gzip.

**Why now**: closing 1A means a frame goes from input → command → patch → store → committer → render. Renderer is the last link.

**Deliverables**:
- `packages/renderer/Renderer.ts` — `init(canvas, mode: 'auto'|'webgpu'|'webgl2')`, `render()` (called by scheduler).
- `packages/renderer/CameraController.ts` — vanilla orbit camera; pointer events; dirty-flag integration.
- `packages/renderer/passes/{ClearPass,MeshPass}.ts` — minimal pipeline.
- `packages/renderer/__tests__/dual-mode.test.ts` — same scene renders identical under WebGPU and WebGL2 (visual diff < 2 px).
- `apps/editor/src/bootstrap.ts` (composition root) — wires schemas + bus + scheduler + persistence + committer + renderer + the cube demo.
- `apps/bench/orbit-fps.ts` wired; baseline captured.
- Bundle-size CI gate: `dist/index.js` < 1.8 MB gzip on first build.

**Daily breakdown**:
- D1 — Renderer init + canvas binding; mode auto-detect.
- D2 — WebGPU path with `@webgpu/types`; fallback to WebGL2 on no `navigator.gpu`.
- D3 — Camera controller; pointer + wheel; scheduler dirty-flag on input.
- D4 — Single mesh pass; one render → one frame → 0 fps idle proof.
- D5 — `bootstrap.ts` composition root wiring.
- D6 — `apps/editor/src/index.html` flag `?pryzm2=1` to swap from PRYZM 1 to PRYZM 2 cube demo.
- D7 — Visual-diff test harness (`pixelmatch` or similar).
- D8 — Bundle-size CI gate; treeshaking audit; bench harness.
- D9 — **Sub-phase 1A demo recording** (full spine demo: schemas → command → event → store → committer → scene → render → idle-zero → lint guards).
- D10 — Buffer / sub-phase retro.

**Exit criteria**:
- `?pryzm2=1` URL flag swaps in PRYZM 2 stack and renders the cube demo.
- Cube demo passes: orbit at 60 fps, idle at 0 fps, undo/redo via patches, save persists across reload.
- WebGPU + WebGL2 both pass visual-diff parity test.
- Initial bundle: `< 1.8 MB gzip` (CI gate hard-fails if exceeded).
- All custom ESLint rules active; CI green on a clean clone.

**Demo (sub-phase 1A close)**: 5-min screencast — open `?pryzm2=1`, draw a cube, undo, redo, reload, cube persists; switch from WebGPU to WebGL2 by flag, identical rendering; show CI dashboard with all gates green.

**Dependencies**: S03–S05. **Risks**: WebGPU instability on Linux — fallback path is the safety net.

### Sub-phase 1A exit criteria

- Spine works end-to-end: input → command → event → store → committer → scene → render.
- All 4 custom ESLint rules active and CI-enforced.
- Bundle gate, idle-CPU bench, save-edit bench all green.
- `apps/editor` (PRYZM 1) unchanged and shipping; `?pryzm2=1` swaps in new stack.
- Documentation: per-package `README.md` + `docs/architecture/{schemas,command-bus,frame-scheduler,scene-committer,renderer}.md`.

**If 1A misses**: extend by 4 weeks; do not begin 1B until rails are green. Element-family migration on top of broken rails is the failure mode this plan exists to avoid.

---

## §3 Sub-phase 1B — Wall end-to-end (M4–M6, S07–S12)

**Sub-phase goal**: the **Wall primitive** is fully migrated — schema, store, ~14 commands, pure producer, committer, tool, panel — to parity with PRYZM 1's wall tool. **Wall is the canonical example**; every other element family in 1B/1C/2A copies the recipe verbatim.

**Critical decisions due in 1B**:
- Final `PrimitiveCommitter<TStore>` interface (locked at S09; everything else inherits).
- Final intent-resolution model (`plugins/wall/intent.ts`) — locked at S10.
- Final per-element snapshot test format (`tests/parity/<element>.snap`) — locked at S08.

### S07 — Wall schema + store + 5 simplest commands (Weeks 13–14, M4)

**Goal**: `WallStore` exists; 5 commands (`CreateWall`, `DeleteWall`, `MoveWall`, `SetWallType`, `SetWallHeight`) execute end-to-end through the bus.

**Deliverables**:
- `packages/stores/WallStore.ts` — `applyPatch(patches)`, `subscribeDirty(diff => ...)`, Zod-validated state.
- `plugins/wall/handlers/{CreateWall,DeleteWall,MoveWall,SetWallType,SetWallHeight}.ts` — 5 handlers.
- `plugins/wall/handlers/__tests__/*.test.ts` — patch correctness + undo round-trip.
- `tests/parity/wall-create.snap`, `wall-move.snap`, `wall-delete.snap` — snapshot fixtures.

**Daily**: D1 store; D2 first handler (CreateWall) as canonical; D3–D5 remaining 4; D6 undo round-trips; D7 OTel + perf; D8 PR-cleanup; D9 demo; D10 buffer.

**Exit**: 5 commands round-trip; undo restores state byte-for-byte; OTel spans cover handler + store apply; bench `cmd-execute-latency` < 1 ms.

---

### S08 — Pure wall producer (Weeks 15–16, M4)

**Goal**: `packages/geometry-kernel/producers/wall.ts` is a **pure function** `(WallDto, JoinData, worldY) => BufferGeometryDescriptor`. No THREE imports. No DOM. Runs in browser worker AND Node `worker_thread`.

**Deliverables**:
- `packages/geometry-kernel/producers/wall.ts` — simple wall, layered wall, openings, curved.
- `packages/geometry-kernel/types/{BufferGeometryDescriptor,JoinData}.ts`.
- `packages/geometry-kernel/__tests__/wall-snapshot.test.ts` — 30 wall configurations vs `__snapshots__/wall.snap`.
- `packages/geometry-kernel/__tests__/wall-headless-node.test.ts` — runs the producer in Node `worker_thread`, byte-equivalent to browser worker output.

**Daily**: D1 type design; D2 simple wall; D3 layered; D4 openings; D5 curved; D6 join/miter math; D7 snapshot fixtures + tests; D8 Node worker test; D9 demo; D10 buffer.

**Exit**: 30 snapshot configs pass; Node + browser produce byte-identical buffers; producer is allowlisted in the `pryzm-no-three-in-kernel` lint rule (no THREE imports).

**Risk**: CSG edge cases differ between PRYZM 1 and pure producer — mitigated by extracting fixtures from real PRYZM 1 wall geometries.

---

### S09 — Wall committer + wall tool (Weeks 17–18, M5)

**Goal**: drawing a wall in `?pryzm2=1` editor produces a correct 3D mesh, persists across reload, undo/redo work; `plugins/wall/committer.ts` is the bridge from buffer descriptor → THREE.

**Deliverables**:
- `plugins/wall/committer.ts` — `PrimitiveCommitter<WallStore>` impl; calls producer, builds `THREE.Mesh`, manages materials via `MaterialPool`.
- `plugins/wall/tool.ts` — vanilla TS `Tool` subclass; click/drag/escape; emits `CreateWall` commands.
- `plugins/wall/tool/__tests__/integration.test.ts` — Playwright drawing test.

**Daily**: D1 committer pattern (locked); D2 committer impl; D3 tool skeleton; D4 click/drag UX; D5 undo/redo + reload integration; D6 Playwright test; D7 perf — orbit-fps with 100 walls; D8 lint+typecheck; D9 demo; D10 buffer.

**Exit**: Playwright draws 10 walls in 30 s; orbit-fps p95 > 55 with 100 walls; reload persists; undo/redo correct; only `plugins/wall/committer.ts` imports THREE in the wall plugin.

---

### S10 — Wall remaining ops + intent resolution (Weeks 19–20, M5)

**Goal**: `Mirror`, `Scale`, `Offset`, `Join`, `Cut`, `ReferenceEdit` handlers operational; intent resolver in `plugins/wall/intent.ts` matches PRYZM 1 behaviour on the parity test set.

**Deliverables**:
- `plugins/wall/handlers/{MirrorWall,ScaleWall,OffsetWall,JoinWall,CutWall,ReferenceEdit}.ts`.
- `plugins/wall/intent.ts` — resolves user intent (which wall to join to, miter direction, etc.).
- `tests/parity/wall/` — 30-case parity fixture (PRYZM 1 input → expected DTO + geometry).
- All 22 wall commands triaged per `09-AS-IS-VS-TO-BE.md §4` (DROP 4, MERGE 6, PORT 14, LIFT 4 → 14 final handlers).

**Daily**: D1–D4 handlers (1–2/day, agent-multiplied from S07 template); D5 intent resolver; D6 parity fixture extraction; D7 parity test pass; D8 perf bench; D9 demo; D10 buffer.

**Exit**: 30-case parity test green; all 14 handlers have `affectedStores` declared; CI green; wall is "done" for Phase 1.

**Risk**: intent resolution edge cases — mitigated by parity fixtures from real user files.

---

### S11 — Roof + Door + Window (Weeks 21–22, M6)

**Goal**: 3 more element families end-to-end, copying the wall recipe. Roof producer is already 80% pure in PRYZM 1 (`RoofGeometryBuilder.generate()`); door + window are simpler than walls.

**Deliverables** per element: schema (S01 done), store, ~10 handlers, pure producer, committer, tool, ~20 parity fixtures.

**Daily**: D1–D3 Door (simplest, multiplier validation); D4–D6 Window; D7–D9 Roof; D10 retro.

**Exit**: 3 elements parity-tested; orbit-fps with 100 of each > 55 fps p95; only committers contain THREE.

**Note**: this sprint validates whether the "Wall pattern multiplies cleanly" pivot question. If a single element takes > 4 days of agent+human time, the pattern is wrong — pause and refactor in S12 buffer.

---

### S12 — Slab + Curtain Wall + Grid + Column + Beam (Weeks 23–24, M6)

**Goal**: 5 more element families; by end of S12 the **9 core structural primitives** (Wall, Slab, Door, Window, Roof, Curtain Wall, Grid, Column, Beam) are end-to-end through PRYZM 2.

**Deliverables**: 5 plugins following the canonical recipe.

**Daily**: D1–D2 Slab (similar complexity to wall); D3–D4 Grid + Column + Beam (simple primitives); D5–D7 Curtain Wall (most complex of the 5); D8 cross-element integration tests; D9 **sub-phase 1B demo recording**; D10 retro.

**Exit (1B)**: 9 element families parity-tested; small fixture project (1 wall, 1 slab, 1 door) opens in PRYZM 2 in < 800 ms cold; PRYZM 1 still ships; the Wall pattern proven to multiply.

---

## §4 Sub-phase 1C — Element families completion + supporting systems (M7–M9, S13–S18)

**Sub-phase goal**: complete the remaining buildings element families (Curtain Wall depth, Stairs, Handrails, Ceilings); harden the renderer (post-FX, TRAA, SSGI under scheduler control); land selection/picking and view-state foundations; prove `@pryzm/headless` works in Node.

### S13 — Curtain Wall handlers complete + producer perf tune (Weeks 25–26, M7)

**Goal**: all 12 (-2 dropped) curtain-wall handlers; producer < 50 ms for typical façade.

**Deliverables**: `plugins/curtain-wall/handlers/*.ts` (12 → 9 per triage), producer perf-pass, `tests/parity/curtain-wall/` 25-case fixture.

**Exit**: producer benchmark < 50 ms p95; all parity cases pass; orbit-fps with a 50-panel façade > 55 fps.

---

### S14 — Stairs + Handrails + Ceilings (Weeks 27–28, M7)

**Goal**: 3 element families. Stairs + Handrails are coupled (handrail follows stair); Ceilings are simple.

**Deliverables**: 3 plugins; `tests/parity/{stair,handrail,ceiling}/` fixtures.

**Exit**: parity tests green; stair-handrail coupling correct on common configurations (straight, L-turn, U-turn).

---

### S15 — Renderer hardening: post-FX, TRAA, SSGI under scheduler (Weeks 29–30, M8)

**Goal**: bloom, TRAA, SSGI all driven by `FrameScheduler` with idle-continuation budget; idle CPU < 2% confirmed; no continuous render loop.

**Deliverables**:
- `packages/renderer/passes/{Bloom,TRAA,SSGI}.ts` — all post passes.
- `packages/renderer/IdleAccumulator.ts` — N-frame budget for accumulation passes.
- `apps/bench/idle-cpu.ts` re-run with full post-FX active; must stay < 2%.
- `apps/bench/orbit-fps.ts` re-run with post-FX; must stay > 55 fps p95.

**Exit**: post-FX visually correct (visual-diff vs PRYZM 1 reference); idle CPU green; orbit fps green; OTel spans tag each pass.

**Risk**: TRAA jitter under idle-continuation — mitigated by 30-frame budget chosen in code-level ADR `docs/architecture/adr/0006-idle-continuation-budget.md`, re-validated here. (Distinct from `[strategic ADR-006]` which is render mode.)

---

### S16 — Selection / picking system (Weeks 31–32, M8)

**Goal**: click-to-select latency < 10 ms; selection store; selection events; visual highlight via committer.

**Deliverables**:
- `packages/picking/` — gpu-pick (default) + BVH-pick (fallback).
- `packages/stores/SelectionStore.ts` — selection set + emit events.
- `plugins/wall/selection-highlight.ts` (committer extension) — outline rendering on selection diff.

**Exit**: click latency < 10 ms p95; multi-select via shift; box-select skeleton (full UX in 2C); OTel `pryzm.picking.pick` span; works across all 9 element families.

---

### S17 — Camera + viewport + multi-view foundation (Weeks 33–34, M9)

**Goal**: `packages/view-state/` defines view definitions, view registry, view switching via commands; one canonical 3D view (plan + section come in 2A/2B).

**Deliverables**:
- `packages/view-state/{ViewController,ViewDefinition,ViewRegistry}.ts`.
- `packages/stores/ActiveViewStore.ts` — current view, active tool.
- Commands: `SwitchView`, `CreateView`, `DeleteView`, `RenameView`.

**Exit**: switching views via command updates camera and re-renders; OTel spans visible; views persist via S04 event log.

---

### S18 — `@pryzm/headless` package alpha (Weeks 35–36, M9)

**Goal**: `apps/headless` builds; CLI `pryzm-cli` runs in Node and produces a `wall + slab` project end-to-end.

**Deliverables**:
- `apps/headless/index.ts` — Node entry; loads `@pryzm/protocol`, `@pryzm/command-bus`, `@pryzm/stores`, `@pryzm/geometry-kernel`, `@pryzm/persistence-client` (in-memory backend in Node).
- `apps/headless/cli/{new-project,add-wall,add-slab,export-pryzm}.ts` — CLI subcommands.
- `apps/headless/__tests__/headless-node.test.ts` — runs the full pipeline in Node; produces a `.pryzm`-stub file (full format in S20).

**Exit**: `node apps/headless/dist/cli.js new-project foo && pryzm-cli add-wall foo --x1 0 --x2 5 && pryzm-cli export-pryzm foo` works; produces a file that S20 will be able to validate.

**This is a Phase 1 pivot test**: if `apps/headless` cannot run, the kernel is impure — halt and root-cause before 1D.

### Sub-phase 1C exit

- 12 element families end-to-end (the 9 from 1B + Stairs/Handrails/Ceilings).
- Renderer hardening complete; all NFT idle/orbit benches green with full post-FX.
- Selection works; view switching works.
- `@pryzm/headless` alpha runs in Node — kernel purity confirmed.

---

## §5 Sub-phase 1D — Bake worker + .pryzm format + alpha gate (M10–M12, S19–S24)

**Sub-phase goal**: the persistence-and-streaming story stands up. By M12 a small/medium/large fixture loads through chunks + event log + tier-streamed loader + (optionally) bake-worker-generated chunks. Alpha gate fires.

### S19 — Chunked binary persistence (Weeks 37–38, M10)

**Goal**: `packages/persistence-client/chunks.ts` writes glb chunks (Draco + Meshopt + KTX2) per level; chunk index in manifest; medium fixture saves to chunks + event log; reload in < 1.5 s.

**Deliverables**:
- `packages/persistence-client/chunks/{ChunkWriter,ChunkReader}.ts` — glb encode/decode with `gltf-transform`.
- `packages/persistence-client/manifest.ts` — chunk index + per-level metadata.
- `packages/persistence-client/codec/{draco,meshopt,ktx2}.ts` — compression wrappers.
- `apps/bench/load-medium.ts` re-run: must hit < 1.5 s.

**Exit**: medium fixture saves chunks to IndexedDB (and R2 once S22 wires it); reload < 1.5 s; bundle impact < 200 KB additional gzip.

---

### S20 — `.pryzm` ZIP format v1 + spec doc (Weeks 39–40, M10)

**Goal**: portable `.pryzm` ZIP round-trips losslessly; spec published; CLI `pryzm-cli pack/unpack` works.

**Deliverables**:
- `packages/file-format/{pack,unpack}.ts` — ZIP layout: `manifest.json`, `events/*.evt.bin`, `chunks/*.glb`, `thumbnails/*.png`, `signatures/`.
- `packages/file-format/migrations/` — migration framework (`v0-pryzm1-to-v1.ts` stub for later).
- `packages/file-format/__tests__/round-trip.test.ts` — pack → unpack → byte-identical content.
- `docs/file-format/spec.md` — full spec doc; published with the SDK docs site in S63.
- `apps/headless/cli/{pack,unpack}.ts`.

**Exit**: round-trip lossless; spec doc complete; medium fixture packed in < 5 s; unpacked in < 3 s; CLI works.

**Risk**: format will need to evolve — mitigated by `schemaVersion` in manifest + migration framework live in this sprint.

---

### S21 — Bake worker (server-side) v0 (Weeks 41–42, M11)

**Goal**: `apps/bake-worker` re-bakes per-element chunks on event commit; OTel spans cover the pipeline; single-element edit → ready-to-stream chunk in < 1.5 s.

**Deliverables**:
- `apps/bake-worker/` — Express + BullMQ + Node `worker_threads` + `gltf-transform`.
- `apps/bake-worker/jobs/RebakeChunkJob.ts` — runs the same producer (P1 holds, kernel pure) in Node.
- `apps/bake-worker/storage/r2.ts` — Cloudflare R2 upload; signed URL distribution.
- `[strategic ADR-010]` (250 ms bake debounce) implemented per SPEC-02 §5.
- `apps/bench/bake-incremental.ts` wired.

**Exit**: single wall edit triggers per-chunk re-bake; chunk available at signed R2 URL in < 1.5 s; OTel spans visible; per-event cost measured (initial baseline; `[strategic ADR-010]` §pricing-audit per SPEC-02 §5.3).

**Risk**: per-event $ cost too high — mitigated by coalescing window + tiered bake (R-04 in master plan risk register).

---

### S22 — `apps/sync-server` skeleton + event linearisation (Weeks 43–44, M11)

**Goal**: `apps/sync-server` accepts events, linearises, persists to Postgres, enqueues bake jobs, broadcasts to connected clients. CRDT comes in 2D — for now last-writer-wins with sequence guarantees.

**Deliverables**:
- `apps/sync-server/` — Express + ws server + Postgres event log + BullMQ queue.
- `apps/sync-server/db/schema.sql` — `event_log` table (id ULID, project_id, actor_id, type, payload bytea, ts).
- `apps/sync-server/handlers/{ConnectClient,AppendEvent,LoadEvents,SubscribeProject}.ts`.
- CDE legacy commands folded in (3 commands per `09-AS-IS-VS-TO-BE.md §4`).
- OTel spans cover end-to-end (`pryzm.sync.append`, `pryzm.sync.broadcast`).

**Exit**: two browser tabs see each other's events with last-writer-wins (CRDT in 2D); event log in Postgres; bake jobs enqueued; OTel green.

---

### S23 — Tier-streamed loader (Weeks 45–46, M12)

**Goal**: the `packages/persistence-client/loader.ts` streams **manifest first**, **visible-level chunks second**, **background-level chunks third**, **history events on demand**. Large fixture (5K walls × 20 levels) hits **first interactive < 3 s**.

**Deliverables**:
- `packages/persistence-client/loader.ts` — tier scheduling + chunk request prioritiser.
- Integration with `FrameScheduler` (load tasks scheduled at `priority: 'background'`).
- `apps/bench/load-large.ts` — full bench harness on the 5K-wall fixture; CI gate.

**Exit**: large fixture first interactive < 3 s, full < 12 s; OTel `pryzm.loader.tier{1,2,3}` spans visible; UI shows progressive reveal.

---

### S24 — **M12 ALPHA GATE** + alpha demo build (Weeks 47–48, M12)

**Goal**: a flagged `?pryzm2=1` build that opens small / medium / large fixtures end-to-end with all M12 numerics met. **Alpha demo recording cut.** PRYZM 1 unchanged and shipping.

**Deliverables**:
- Final integration pass — all of S01–S23 wired through `apps/editor/src/bootstrap.ts` behind the flag.
- Comprehensive bench run — every NFT target re-measured against the baseline; report committed in `apps/bench/reports/M12-alpha.md`.
- Alpha demo recording — 10-min screencast: open the small fixture, edit a wall, undo, save, reload, open the medium fixture (tier-streamed reveal visible), open the large fixture (5K walls), show CI dashboard, show OTel trace from click to pixel.
- Phase 2 kickoff readiness checklist filled in.

**Exit (M12 ALPHA GATE — full criteria)**:
- All 12 element families parity-tested vs PRYZM 1 (`tests/parity/`).
- Cold load: small < 800 ms / medium < 1.5 s / large < 3 s first interactive.
- Save: < 10 ms event append.
- Idle CPU: < 2% (with full post-FX active).
- Orbit fps: > 55 p95.
- `.pryzm` v1 round-trips losslessly on all three fixtures.
- `@pryzm/headless` runs the small fixture in Node and produces an identical `.pryzm`.
- Bake worker re-bakes single-element edit to ready-streaming chunk in < 1.5 s.
- Zero `(window as any)` in PRYZM 2 packages (lint-enforced; legacy `apps/editor` still has them, will be deleted in S61).
- Zero non-scheduler `requestAnimationFrame` in PRYZM 2 packages.
- Zero THREE imports outside `packages/scene-committer/` and `plugins/*/committer.ts`.
- All OTel spans firing in dev.
- CI: every gate green; bundle < 1.8 MB gzip initial; no regression > 5% on any baseline bench.

**Demo (M12 alpha)**: 10-min recorded screencast (linked above) plus live bench dashboard.

---

## §6 Phase 1 risk register (specific to M1–M12)

> **Velocity-slip cut list.** The M12 alpha gate is governed by `[strategic ADR-018]` — the standing capacity cut list. The phase-specific risks below are *additional* to the cuts already enumerated in `[strategic ADR-018]` §Tier-1, §Tier-2, §Tier-3. If actual velocity at the gate is amber/red, cuts are applied in order from `[strategic ADR-018]` before phase-specific mitigations.

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R1-01 | Wall pattern doesn't multiply cleanly to other elements | Medium | High | S11 is the multiplier-validation sprint; if Door takes > 4 days, halt and refactor producer interface in S12 buffer | S11 |
| R1-02 | `@pryzm/headless` reveals kernel impurity (THREE / DOM / React leak) | Medium | Critical | `pryzm-no-three-in-kernel` lint rule active from S08; Node test runs in CI from S08 onward | S08, S18 |
| R1-03 | Bake worker per-event cost makes self-host pricing unviable | Low | High | Coalescing window in `[strategic ADR-010]` + S21 cost bench; tiered bake fallback documented | S21 |
| R1-04 | Tier-streamed load misses < 3 s on large fixture | Medium | High | S19 chunk format tunable; S23 has 1 sprint of buffer absorbed in 1D for re-tuning | S19, S23 |
| R1-05 | Frame scheduler API insufficient for TRAA/SSGI accumulation | Medium | Medium | S15 is the hardening sprint; idle-continuation budget chosen in code-level ADR `docs/architecture/adr/0006-idle-continuation-budget.md` | S15 |
| R1-06 | IndexedDB transactions stall under burst writes | Low | Medium | S04 single-writer queue; bench in `save-edit.ts` simulates burst | S04 |
| R1-07 | Solo + Agent velocity insufficient (1A overruns) | Medium | High | 4-week extension authorised before entering 1B; do not start 1B with broken 1A | End-1A |
| R1-08 | WebGPU instability blocks bench numbers | Medium | Medium | WebGL2 fallback always present; visual-diff parity gate in S06 | S06, S15 |
| R1-09 | Material/buffer disposal leaks GPU memory | Low | High | S05 `MaterialPool.releaseRef` + end-of-test memory assertion; S15 hardening pass | S05, S15 |
| R1-10 | Schema drift from PRYZM 1 breaks parity tests in S10 | Medium | Medium | S01 fixture extraction from real PRYZM 1 exports; agent re-validates each schema PR | S01, S10 |

---

## §7 Phase 1 kill-switches

A kill-switch halts forward work until the underlying issue is fixed. These are fail-fast to prevent compounding architectural debt.

- **K1-A** — If at end of S06 (M3) the cube demo doesn't pass `idle CPU < 2%` AND `60 fps interactive`, halt. Spend up to 4 weeks tuning rails. Do not begin 1B.
- **K1-B** — If at end of S08 (M4) the wall producer cannot run in Node, halt. The kernel is impure. Refactor before S09.
- **K1-C** — If at end of S11 (M6) any single new element family takes > 4 days of agent+human time, halt. The producer pattern is wrong. Refactor in S12 buffer before continuing.
- **K1-D** — If at end of S21 (M11) bake-worker incremental re-bake exceeds 30 s on production-scale fixture, halt 1D forward work; profile + redesign chunk strategy.
- **K1-E** — If at S24 (M12) cold load on small fixture exceeds 1.5 s, halt entry to Phase 2. Re-bench, profile, fix. Do not start Sub-phase 2A with a missed alpha gate.

---

## §8 M12 alpha gate — full exit criteria (consolidated)

For convenience, all M12 acceptance items in one place:

### Functional
- 12 element families end-to-end (Wall, Slab, Door, Window, Roof, Curtain Wall, Grid, Column, Beam, Stair, Handrail, Ceiling).
- Parity tests vs PRYZM 1 green on `tests/parity/`.
- Selection + picking work across all elements.
- `?pryzm2=1` URL flag swaps stacks; PRYZM 1 unchanged at default URL.

### Performance
- Cold load: small < 800 ms / medium < 1.5 s / large < 3 s first interactive.
- Save: < 10 ms event append.
- Idle CPU: < 2%.
- Orbit fps: > 55 p95.
- Bake incremental: < 1.5 s.
- Bundle: < 1.8 MB gzip initial.

### Architectural
- Zero `(window as any)` in PRYZM 2 packages.
- Zero non-scheduler rAF in PRYZM 2 packages.
- Zero THREE imports outside committers.
- All boundary lint rules active and PR-blocking.
- 100% commands declare `affectedStores`.
- `[strategic ADR-018]` cut-list reviewed at the M12 gate; if amber/red, Tier-1 cuts applied before declaring M12 green.
- `[strategic ADR-020]` property-test suite green across the 12 element families (wall, slab, roof, column, beam, door, window, stair, railing, curtain wall + the 2 added in Phase 1C).
- `[strategic ADR-007]` (OTel + Tempo + Honeycomb) — Tempo prod instance live in EU-W and US-E.
- `[strategic ADR-017]` type-completeness lint PR-blocking from S11; M12 ship-with-product type catalog populated to the Phase 1 milestone count per SPEC-05 §7.

### Persistence + portability
- `.pryzm` v1 round-trips losslessly on all three fixtures.
- `@pryzm/headless` runs small fixture in Node, produces identical `.pryzm`.
- Bake worker producing R2-hosted chunks signed URLs.
- Tier-streamed loader operational.

### Observability
- OTel coverage on hot paths: `pryzm.command.execute`, `pryzm.persistence.append`, `pryzm.scene.commit`, `pryzm.frame.render`, `pryzm.bake.chunk`, `pryzm.loader.tier{1,2,3}`.
- Honeycomb / Tempo dashboard exists for the alpha build.

### Documentation
- `docs/architecture/{schemas,command-bus,frame-scheduler,scene-committer,renderer,persistence,bake-worker,file-format}.md` complete.
- `apps/bench/reports/M12-alpha.md` published with all numbers.
- 10-min alpha demo screencast in `docs/demos/M12-alpha.mp4`.

### Process
- All 12 ADRs status: 11 merged, 1 explicitly deferred.
- Sprint retros archived in `docs/retros/S01–S24/`.
- Next-phase risk register updated.

---

## §9 What Phase 1 explicitly did NOT do

For honesty about scope and to set Phase 2 expectations:

- No multi-user. Sync-server skeleton exists but only single-tab durability proven; CRDT comes in 2D.
- No documentation pipeline. Plan view, section view, sheets, schedules all deferred to Phase 2.
- No AI. The 31-file AI subsystem still lives only in PRYZM 1; migration begins in Phase 3A.
- No IFC/DXF/Rhino. These are Phase 3B plugins.
- No plugin SDK. Layer boundaries are enforced from S01, but the SDK 1.0 lands in Phase 3C.
- No marketplace, no public APIs, no self-host packaging.
- No browser matrix beyond Chromium dev. Firefox + Safari + Edge come in S70 (Phase 3D).
- No accessibility audit, no security pen test, no GA marketing. All Phase 3D.
- The 2,078 `(window as any)` legacy sites are unchanged in `apps/editor` PRYZM 1 code — they get deleted in S61 (Phase 3C). PRYZM 2 packages are clean from day one.

---

## §9.5 SPECs in force during Phase 1

| SPEC | Section relevant here | Sprints that exercise it |
|---|---|---|
| SPEC-01 (geometry kernel) | §3 robustness budget; §6 determinism | S07–S22 |
| SPEC-02 (persistence) | §1–§3 event log + chunks; §5 bake debounce; §6 file-format addendum | S04, S19, S20, S21, S23 |
| SPEC-03 (sync CRDT) | §3 CRDT introduction (deferred to Phase 2D — referenced only) | (referenced only) |
| SPEC-04 (drawing engine) | §1 architecture (deferred to Phase 2A — referenced only) | (referenced only) |
| SPEC-05 (type catalog) | §1 family taxonomy; §2 type/instance; §7 ship-with-product types | S07, S11–S18 |
| SPEC-09 (plugin SDK) | §3 sandbox spike pre-S01 | S01 |
| SPEC-10 (observability) | All — OTel, Tempo, Honeycomb, P8 coverage gate | S01 onwards |
| SPEC-12 (self-host operations) | (referenced only — full spec lands in Phase 3D) | (referenced only) |

This table is the canonical answer to "what spec covers this sprint?" If a sprint's exit criterion conflicts with the cited spec section, the spec wins.

---

## §10 Phase 1 → Phase 2 handoff checklist

Items that must be true on M12 morning before starting S25:

- [ ] All M12 alpha gate criteria (above) are signed off.
- [ ] `apps/bench/reports/M12-alpha.md` reviewed and committed.
- [ ] Sprint S25 plan written; agent issues expanded.
- [ ] One full week of buffer before S25 actually begins (founder rest week — non-negotiable for sustainability).
- [ ] PRYZM 1 customer support queue reviewed; no P0/P1 unresolved.
- [ ] `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` re-read; risk register updated with anything learned in Phase 1.

---

*Last updated: 2026-04-26. Owner: Founder + Architecture lead. Conflicts? `08-VISION.md` overrides. Bench numbers in `08-VISION.md §6` are binding contracts; this Phase exists to prove they're achievable on the spine.*
