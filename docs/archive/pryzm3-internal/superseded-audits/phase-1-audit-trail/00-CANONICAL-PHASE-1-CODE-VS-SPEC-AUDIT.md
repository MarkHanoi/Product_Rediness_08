# PHASE 1 — CODE-VS-SPEC AUDIT (1A · 1B · 1C · 1D)

> **Date**: 2026-04-28
> **Auditor**: post-Replit-import code review (no doc-trust; every claim cited against the actual file/line in the repo).
> **Scope**: Phase 1 (Sub-phases 1A, 1B, 1C, 1D — milestones M1 → M12) of the new
> PRYZM 2 architecture, as defined by `docs/00_NEW_ARCHITECTURE/phases/PHASE-1*.md`.
> **Method**: Walked the actual file tree under `packages/`, `plugins/`, `apps/`,
> `tools/`, and `tests/`. Read implementation source, ESLint plugin source,
> bench reports, ADRs, and live test runs (`apps/headless` vitest run executed
> during the audit). Did **not** read the existing audit/PROCESS-TRACKER documents
> as evidence — they are written by the same authors that wrote the code, so
> they are corroborating only.
> **Companion docs that already exist** (NOT consumed as evidence):
> `audits/PHASE-1-FULL-AUDIT.md`, `audits/PHASE-1-RE-AUDIT-2026-04-27.md`,
> `audits/CRITICAL-REVIEW-2026-04-27.md`, `audits/PHASE-1-COMPLETION-PLAN.md`.

---

## §0 Executive Verdict

| Sub-phase | Code reality | Spec compliance | Net grade |
|---|---|---|---|
| **1A — Skeleton & rails (M1–M3)** | Substantially complete and well above spec quality on schemas, command bus, frame scheduler, persistence, scene committer, custom ESLint rules, layer-boundary matrix, headless determinism. | **A** — fully meets exit criteria with 1 unproven gate (bundle-size), 1 hidden allowlist concern (`view-state` THREE), and 1 broken CI runner (`npm` vs `pnpm`). | **A−** |
| **1B — Wall end-to-end (M4–M6)** | Wall plugin is a reference family: 16 handlers (well above the 14 in ADR-008), pure producer, dedicated committer module, snapshot-locked + Node-vs-browser parity tests. Visual-diff corpus exists but is shallow. | **A−** — exit criteria met with only the 24-scene corpus uncertain. | **A−** |
| **1C — 12 element families (M7–M9)** | All 12 element families present; per-handler counts match every ADR triage; pure producers exist for all 12 (curtain wall is correctly split into `producers/curtainwall.ts` + `_internal/curtain-wall/` per ADR-011); per-element parity benches are green. | **A** — the strongest sub-phase by code-density-vs-spec ratio. | **A** |
| **1D — Bake / pryzm-zip / alpha (M10–M12)** | `.pryzm` v1 packer, file-format migrations, tier-streamed loader (Tier1/Tier2/Tier3), bake worker (BullMQ optional + in-memory queue), sync-server (WebSocket + Postgres event log + soft locks + sweeper), headless CLI, view-state controller. M12 alpha report carries 4 explicit DEFERREDs (bundle-size, Honeycomb, demo recording, founder rest). | **B+** — code lands; several promised gates measure orchestration only or are explicitly deferred to deploy time. | **B+** |
| **Phase 1 overall** | Approximately 95 % of the documented Phase-1 surface is actually implemented and compiles; ≈ 80 % is end-to-end provable from the repo alone today. | The team has built a credible, ADR-backed BIM platform skeleton with rails, kernels, persistence, sync, and an alpha file-format. | **A−** |

The gap between "code exists" and "Phase 1 *closes*" is small but real. **It is
governed by 8 specific items**, enumerated in §3 and §4 below.

---

## §1 What was actually built (code-grounded inventory)

### §1.1 Layer L0 / L1 — Schemas, Protocol, Persistence, Stores

| Item promised | Built? | Evidence |
|---|---|---|
| 20+ Zod element schemas | ✅ | `packages/schemas/src/elements/` ships 20 files: `Wall`, `Slab`, `Door`, `Window`, `Roof`, `CurtainWall`, `Grid`, `Column`, `Beam`, `Stair`, `Handrail`, `Ceiling`, `Room`, `Furniture`, `Annotation`, `Dimension`, `Sheet`, `Schedule`, `View`, `Project`, `Structural`, `Lighting`, `Plumbing`. |
| Branded typed-IDs (ADR-0001) | ✅ | `packages/schemas/src/factory/createId.ts` uses `ulid` (real npm package, not `crypto.randomUUID()`) and brands per `IdFor<T>`. The shape `wall_<26-char Crockford-base32>` is enforced at runtime. |
| Public `@pryzm/protocol` barrel | ✅ | `packages/protocol/src/index.ts` re-exports all 24 element schemas + every ID brand. L1 stores import from `@pryzm/protocol`, never from `@pryzm/schemas` directly. |
| Stores package with patch-driven `Store<T>` | ✅ | `packages/stores/src/Store.ts` + concrete stores: `CubeStore`, `SelectionStore`, `AnnotationStore`, `DimensionStore`, `ScheduleStore`, `ProjectListStore`, `SheetStore`, `TitleBlockStore`, `PerViewOverridesStore`, `ActiveViewStore`, `ActiveSheetStore`, `ActiveScheduleStore`, `AiApprovalQueueStore`. `attachStores` provides the single PatchEmitter→stores wiring. |
| Persistence: `EventLog`, chunks, codecs, backends | ✅ | `packages/persistence-client/src/`: `EventLog.ts`, `chunks/{ChunkReader,ChunkStore,ChunkWriter,HydrateFromChunk}.ts`, `codecs/{Json,Msgpack,MsgpackAliased}Codec.ts`, `backends/{IndexedDb,InMemory}Backend.ts`. Draco + Meshopt compression with graceful fallback (`chunks/ChunkWriter.ts` dynamic-imports `'../codec/draco.js'` and `'../codec/meshopt.js'`, swallows missing-WASM in a `try/catch`). |
| Tier-streamed loader (ADR-0020) | ✅ | `packages/persistence-client/src/loader/{Tier1Manifest,Tier2Visible,Tier3Background,TierStreamedLoader,HistoryStreamer}.ts`. 28 loader tests (`__tests__/loader/`). |
| `.pryzm` v1 file format (ADR-0018) | ✅ | `packages/file-format/src/{pack,unpack,canonical-json,zip-deterministic}.ts` + JSZip + msgpack manifest. `__tests__/{roundtrip,migrations,signature,family-round-trip}.test.ts`. |

### §1.2 Layer L2 — Command bus

| Item promised | Built? | Evidence |
|---|---|---|
| `CommandBus`, `CommandHandler<T, TStores>` | ✅ | `packages/command-bus/src/{CommandBus,types,produceCommand,PatchEmitter,UndoStack,cascade,otel}.ts` + 5 test files. |
| Immer patches enabled once | ✅ | `packages/command-bus/src/index.ts` calls `enablePatches()` once at module load (per S02-T3 spec contract). |
| Cross-element cascade rule registry (ADR-0012) | ✅ | `cascade.ts` exports `CascadeRunner` + depth guard `MAX_CASCADE_DEPTH` + `CascadeDepthExceededError`. |
| Bounded undo stack | ✅ | `UndoStack.ts`. |
| `affectedStores` declared per handler | ✅ (enforced) | ESLint `pryzm/affected-stores-required` is **`error`** in root `eslint.config.js` line ~245. |

### §1.3 Layer L4 — Geometry kernel (the rails contract)

| Item promised | Built? | Evidence |
|---|---|---|
| Pure producers `(dto, …) → BufferGeometryDescriptor` (ADR-0009) | ✅ | `packages/geometry-kernel/src/producers/`: `wall.ts`, `slab.ts`, `door.ts`, `window.ts`, `roof.ts`, `curtainwall.ts`, `grid.ts`, `column.ts`, `beam.ts`, `stair.ts`, `handrail.ts`, `ceiling.ts`, `room.ts`, `furniture.ts`, `dimension.ts`, `lighting.ts`, `plumbing.ts`, `structural.ts`, plus shared primitives (`extrude`, `revolve`, `loft`, `sweep`, `boolean`). `_internal/` holds per-element subfolders for sub-routines (e.g. `_internal/curtain-wall/composeCurtainWallGeometryHash.ts`). |
| Zero THREE in kernel | ✅ | `rg "from 'three'" packages/geometry-kernel/src/` returns **0 hits**. ESLint `pryzm/no-three-in-kernel` is `error`. |
| Headless Node runner | ✅ | `packages/geometry-kernel/src/runners/headless-runner.ts` exposes `runProducerInNode(dto, ...) → ...` via Node `worker_thread`. The K1-B parity test (`tests/parity/wall/wall-headless-node.test.ts`) byte-equates in-process vs Node-worker output across 30 wall fixtures. |
| Snapshot fixtures | ✅ | `packages/geometry-kernel/__fixtures__/` + `tests/parity/{wall,slab,door,window,roof,curtain-wall,grid,column,beam,stair,handrail,ceiling}/` with snapshot files. |

### §1.4 Layer L5 — Scheduler · Committer · Renderer · View-State · Picking

| Item promised | Built? | Evidence |
|---|---|---|
| `FrameScheduler` with single rAF site | ✅ | `packages/frame-scheduler/src/{FrameScheduler,IdleContinuation,RafAdapter,WorkerPool,otel}.ts`. `RafAdapter.ts` is the **only** call site of `requestAnimationFrame()` in PRYZM 2 code — verified by `rg "requestAnimationFrame\(" packages/ plugins/ apps/` (only `packages/legacy-shim/src/raf.bad.ts` shows up, and that file is a lint fixture by convention). |
| `SceneCommitter` + `MaterialPool` (ADR-0005) | ✅ | `packages/scene-committer/src/{CommitterHost,dispatcher,MaterialPool,SceneRegistry,dimensions,otel,types}.ts`. `MaterialPool.ts` implements ref-counted handles with `Symbol.dispose` (TC39 Disposable) per the ADR. |
| Renderer + camera + passes | ✅ | `packages/renderer/src/{Renderer,CameraController,IdleAccumulator,passes/}` — passes include `ClearPass`, `MeshPass`, plus stretch passes `Bloom`, `SSGI`, `TRAA` (the latter three carry their own ADR-0014 idle-budget). |
| `view-state` (ADR-0016) | ✅ | `packages/view-state/src/{ViewDefinition,ViewRegistry,ViewController,defaults,multi-view-layout,view-sync,otel}.ts` + sub-path exports for `Annotation` and `View` schemas. |
| Picking (ADR-0015) | ✅ | `packages/picking/src/{PickStrategyResolver,bvh-pick,gpu-pick,otel,types}.ts`. |

### §1.5 Plugins — element families (Phase 1B/1C contract)

Verified via `find plugins/<x>/src/handlers -name '*.ts'`:

| Plugin | Handlers | Store | Committer | Producer | ADR triage |
|---|---:|:---:|---|---|---|
| wall | **16** | ✓ | `committer/{wall-committer,geometry-bridge,material-bridge,selection-highlight}.ts` | `wall.ts` | ADR-0008 (ratchet 5→14, current 16) |
| slab | **9** | ✓ | `committer/{slab-committer,geometry-bridge,material-bridge,selection-highlight}.ts` | `slab.ts` | ADR-0010 (target 9) ✓ |
| door | **7** | ✓ | dedicated `door-committer.ts` | `door.ts` | ADR-0026 |
| window | **6** | ✓ | `geometry-bridge.ts` | `window.ts` | ADR-0026 |
| roof | **12** | ✓ | `geometry-bridge.ts` | `roof.ts` | ADR-0026 |
| curtain-wall | **14** | ✓ | dedicated `curtain-wall-committer.ts` + `geometry-bridge.ts` + `material-bridge.ts` | `curtainwall.ts` + `_internal/curtain-wall/` (3-way producer split per ADR-0011) | ADR-0011 (15→9 in spec; 14 implemented — see §3.5) |
| grid | **5** | ✓ | `geometry-bridge.ts` | `grid.ts` | ADR-0026 |
| column | **6** | ✓ | dedicated `column-committer.ts` | `column.ts` | ADR-0026 |
| beam | **6** | ✓ | dedicated `beam-committer.ts` | `beam.ts` | ADR-0026 |
| stair | **10** | ✓ | `geometry-bridge.ts` | `stair.ts` | ADR-0026 |
| handrail | **7** | ✓ | `geometry-bridge.ts` | `handrail.ts` | ADR-0026 |
| ceiling | **5** | ✓ | dedicated `ceiling-committer.ts` | `ceiling.ts` | ADR-0026 |

**Total: 103 handlers across 12 element families**, each store-bound and committer-bound. Every plugin folder has `__tests__/`, `tool.ts`, `intent.ts`, `errors.ts`, and an `index.ts` barrel.

### §1.6 Apps

| App | Built? | Evidence |
|---|---|---|
| `apps/editor` (the URL-flag boot) | ✅ | `bootstrap.ts`, `bootstrap.data.ts`, `bootstrap.render.ts`, `bootstrap.render.data.ts`, **`bootstrap.everything.ts`** (the all-plugins one-line registry per `audits/PHASE-1-COMPLETION-PLAN.md` §W-1C-1), `PluginRegistry.ts`, `index.ts`, `main.ts`, `router.ts`, `projects/`, `toolbar/`. |
| `apps/headless` | ✅ + tested | `apps/headless/src/{cli,index}.ts` + `commands/{newProject,addWall,addSlab,exportPryzm}.ts`. `__tests__/{cli-parsers,headless-node,headless-s18,skeleton,strict-mode}.test.ts`. **Live test run during this audit: 5 files / 23 tests passed in 5.05 s.** Notably `skeleton.test.ts > "starts a runtime in Node — no DOM / no rAF / no THREE references"` is GREEN. |
| `apps/bench` | ✅ | 35 bench files / 98 individual benches; baselines committed under `apps/bench/reports/` (M6, S08, S09, S10, M9, M12, plus per-element `produce-*-baseline.md`). Scripts: `check-bundle-size.mjs`, `check-regression.mjs`, `run-baseline.mjs`, `visual-diff.mjs`. |
| `apps/bake-worker` | ✅ | `src/{queue/{createQueue,InMemoryBakeQueue,types},jobs/{RebakeChunkJob,RebakeFamilyInstanceJob},coalescing,cost,session,otel}.ts` + `index.ts`. BullMQ is loaded via dynamic import (`createQueue.ts`); falls back to in-memory queue when bullmq is missing. |
| `apps/sync-server` | ✅ | Express + `ws` (NOT socket.io) WebSocket on port 4000. `eventLog/{InMemoryEventLog,PgEventLog,createEventLog}.ts`. `PgEventLog` uses Postgres BIGSERIAL + advisory lock + `UNIQUE (project_id, event_id)`. Soft-lock store + sweeper for collaborative editing. 10 test files. |
| `apps/component-editor` | ✅ | family-editor surface; ships `viewTabStore`, `solidStore`, `sketchDocStore`, `selectionStore`, `referencePlaneStore`, `constraintStore` — all explicitly documented as "no THREE, no DOM, no rAF, no `(window as any)`". |

### §1.7 Tooling — custom ESLint plugin (Phase 1A's binding rails)

| Rule | File | Wired in `eslint.config.js`? | Severity |
|---|---|---|---|
| `pryzm/affected-stores-required` | `tools/eslint-plugin-pryzm/src/rules/affected-stores-required.js` | ✅ | **error** |
| `pryzm/no-raf` | `…/no-raf.js` | ✅ | **error** in PRYZM 2; `warn` in `src/` |
| `pryzm/no-three-outside-committer` | `…/no-three-outside-committer.js` | ✅ | **error** in PRYZM 2; `warn` in `src/` |
| `pryzm/no-three-in-kernel` | `…/no-three-in-kernel.js` | ✅ | **error** |
| `pryzm/store-single-channel` (S05+) | `…/pryzm-store-single-channel.js` | ✅ | **error** |
| `eslint-plugin-boundaries` L0→L7 matrix | `eslint.config.js` lines 12–135 | ✅ | **error** (`boundaries/element-types`) |
| `no-restricted-imports` (OBC, Express) | `eslint.config.js` lines ~270–298 | ✅ | **error** |

### §1.8 ADRs

29 ADRs land under `docs/architecture/adr/`, all numbered + Accepted: `0001-typed-id-brand-strategy`, `0002-command-handler-signature`, `0003-frame-scheduler-priority-vs-deadline`, `0004-messagepack-codec-choice`, `0005-primitive-committer-interface`, `0006-idle-continuation-budget`, `0007-webgpu-webgl2-dual-mode`, `0008-wall-handler-triage`, `0009-producer-pure-function-signature`, `0010-slab-handler-triage`, `0011-curtain-wall-triage-and-producer-split`, `0012-cross-element-cascade-rule-registration`, `0013-intent-resolver`, `0014-traa-ssgi-idle-budget` (+ S49 refresh), `0015-picking-strategy`, `0016-view-state-command-driven`, `0017-headless-package-surface`, `0018-pryzm-zip-format-v1`, `0019-sync-server-linearisation`, `0020-tier-streamed-loader`, `0021-plugin-descriptor-bootstrap-everything`, `0022-room-boundary-detection`, `0023-plan-view-canvas2d-renderer`, `0024-plan-view-annotation-pipeline`, `0025-plan-view-svp-parity-contract-44`, `0026-second-tier-elements-triage`, `0027-furniture-multi-representation`, `0028-plan-view-canvas-architecture`, `0029-vector-primitives-and-backends`. The required Phase-1 set (≥ 19, per spec line ~700) is exceeded.

---

## §2 Things done at 100 / 100 (worth preserving as house style)

These are not just "complete" — they are **architecturally exemplary** and should serve as templates for Phase 2.

1. **`createId()` factory in `packages/schemas/src/factory/createId.ts`.** Real `ulid`, brand-only TS narrowing, runtime guard via `isValidUlid`, deterministic-seed parameter for tests, type-safe `IdFor<T>`. **Zero raw `crypto.randomUUID()` in PRYZM 2 code.** Picture-perfect realisation of ADR-0001.

2. **`MaterialPool` in `packages/scene-committer/src/MaterialPool.ts`.** Caller-provided hash, ref-counted Disposable handles, `Symbol.dispose` integration. The doc comment is the kind of self-explanatory architectural prose that makes the codebase teachable.

3. **`packages/geometry-kernel/` purity.** Zero THREE imports across **all** producers and shared primitives. The 30-fixture wall snapshot test + the in-process-vs-Node-worker byte-parity test (`tests/parity/wall/wall-headless-node.test.ts`) is the strongest determinism gate I have seen in any of the audited codebases.

4. **`packages/command-bus/src/index.ts` `enablePatches()` discipline.** One call, one place, one comment explaining why. This is exactly what S02-T3 asked for.

5. **`tools/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` allowlist matching.** Path normalisation handles both `plugins/<x>/committer.ts` (single-file) and `plugins/<x>/committer/**` (module-folder), under both `plugins/<x>/` and `plugins/<x>/src/`. The legacy `src/` warn-only mode coexists with hard-fail PRYZM-2 enforcement in a single rule.

6. **`packages/persistence-client/src/chunks/ChunkWriter.ts` graceful WASM fallback.** Dynamic-imports Draco/Meshopt encoders; `try/catch { /* uncompressed fallback */ }` keeps the chunk pipeline operable when WASM is missing. This is the right shape for a deploy environment that may or may not bundle the WASM blobs.

7. **`apps/sync-server/src/eventLog/PgEventLog.ts`.** BIGSERIAL + advisory lock + `UNIQUE(project_id, event_id)` for server-side dedup. The schema is created idempotently on first append. The "alternative considered" comment showing why per-project SERIAL was rejected makes the trade-off self-documenting.

8. **`apps/headless/__tests__/skeleton.test.ts > "no DOM / no rAF / no THREE references"`.** This single passing test is the most important architectural fact in the repo — it proves the L0→L4 stack runs in pure Node, which is the foundation for the bake worker, deterministic CI, AI agent reasoning, and headless export.

9. **The L0→L7 layer matrix in `eslint.config.js`.** Hand-coded `allowedDependencies` array, type tags `L0-persistence` … `L7-app`, kernel forbidden from importing stores, view-state in L5 (correctly above kernel). Reading the file teaches the architecture.

10. **`apps/bench/src/benches/`.** 35 bench files + per-element produce-*.bench.ts + `cmd-execute-latency.bench.ts` + `idle-cpu.bench.ts` + `pack-unpack.bench.ts` + `sync-roundtrip.bench.ts` + `view-switch.bench.ts` + `m24-gate.bench.ts`. Baselines on disk, regression checker, dashboard generator. This is real performance engineering.

11. **`bootstrap.everything.ts` + `PluginRegistry.ts`** (per ADR-0021). One `ALL_PLUGINS` array; adding a 13th element family is one line. **This is the true Phase-1 close**: the editor wires every L4 plugin via registry instead of hand-coded `if (wall) ... if (slab) ...`.

12. **Per-package `vitest.config.ts` + `__tests__/`.** Every PRYZM 2 package, plugin, and app has its own test surface. The 14 sprint-validation workflows in `.replit` configuration demonstrate this is meant to be exercised, not just present.

---

## §3 Gaps · risks · unclear / incomplete / wrong implementations

### §3.1 CRITICAL — CI runs the wrong package manager

**Where:** `.github/workflows/ci.yml` line 41:

```yaml
- name: Install (npm workspaces)
  run: npm ci --workspaces --include-workspace-root
```

**Problem:** the workspace uses **pnpm**. `pnpm-workspace.yaml` exists. Many workspace packages declare `"@pryzm/foo": "workspace:*"` in their `package.json` — `npm ci` can not resolve the `workspace:*` protocol and will **error out at install time**. The Replit dev environment installs successfully precisely because the dev container uses `pnpm install` (per import progress notes). **A clean clone of the repo into GitHub Actions cannot pass CI today.**

**Severity:** Phase-1 exit criterion 1A-§4.2 says "CI green on a clean clone in < 5 min wall-clock." The CI job is plumbed but mis-configured.

**Fix size:** ~5 lines: switch the install step to `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`, and update `cache: 'pnpm'`. Mirror the change in every other workflow file.

### §3.2 HIGH — `view-state` imports THREE but is **not** in the `no-three-outside-committer` allowlist

**Where:** `packages/view-state/src/ViewController.ts:20` — `import * as THREE from 'three';`. Meanwhile `tools/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js`'s `ALLOW_FRAGMENTS` constant lists only `packages/scene-committer/`, `packages/renderer/`, and `apps/bench/`. View-state is not an allowed THREE consumer per that rule's source.

**Why it slips through:** the root `eslint.config.js` carries an override block where `pryzm/no-three-outside-committer` becomes `'warn'` for `view-state` (visible in the multi-occurrence grep result). So lint passes — but the rule was meant to be hard-fail across PRYZM 2 (S05-T10 spec line 547).

**Risk:** view-state is L5; the architectural intent (per ADR-0005) is that **only committers and renderer** speak THREE. View-state should call **into** the camera controller via DTOs, not import THREE itself. Allowing this exception bypasses the layer contract and sets precedent that any L5 module may carve out a THREE allowlist.

**Recommended action:** either (a) refactor `ViewController.ts` to delegate THREE math to `CameraController`/`Renderer`, removing the import; or (b) explicitly add `packages/view-state/` to `ALLOW_FRAGMENTS` and document the rationale in ADR-0016. Option (a) is cleaner; option (b) is honest.

### §3.3 HIGH — bundle-size CI gate is unproven

**Where:** spec exit criterion S06-T10 ("`< 1.8 MB gzip` for the `?pryzm2=1` entry chunk; hard-fails CI above"). Script is wired (`apps/bench/scripts/check-bundle-size.mjs`) but the M12-alpha bench report explicitly marks this gate **DEFERRED** to "the next production `vite build` against the alpha-demo URL." There is no recorded bundle-size measurement anywhere in `apps/bench/reports/`.

**Risk:** the codebase has accumulated **22 packages** + **31 plugins** (see §3.5) — far more than Phase 1 strictly required. Without an actual bundle-size run, the entry chunk could be well above 1.8 MB and nobody would know.

**Recommended action:** add a `pnpm vite build` step in CI that emits a stamped bundle and runs `check-bundle-size.mjs`. This must be done before claiming Phase 1 closes.

### §3.4 HIGH — Cold-load benches measure orchestration only, not real chunks

**Where:** `apps/bench/reports/M12-alpha.md` footnote ¹: *"The S23 loader benches measure **orchestration only** — `onChunkReady` is a no-op and bytes are synthesised … End-to-end first-interactive on real chunks is bounded separately by `pack-unpack.bench.ts` (decode timing) and `bake-incremental.bench.ts`."*

**Numbers in the report:**
* Cold-load small (preview): 0.24 ms p95 — synthetic
* Cold-load medium: 1.8 ms parse, 11 ms produce — synthetic
* Cold-load large (5K walls × 20 levels): 0.36 ms p95 — synthetic

**Problem:** the binding spec target is "first interactive < 800 ms / 1.5 s / 3 s on real chunks." The M12 report's argument is that pack-unpack p95 (21 ms) + bake-incremental p95 (9.9 ms) gives "combined budget headroom well under" the targets. This is plausible but it is **not** a measured end-to-end cold load.

**Risk:** the first time a real customer opens a real .pryzm of 5K walls × 20 levels, the actual time-to-interactive could be dominated by IndexedDB reads, codec construction, GPU upload, and committer batching — none of which are individually measured against the cold-load envelope.

**Recommended action:** add a single integration bench that boots the editor, opens a packed real fixture, and stops the clock at "first frame with mesh visible." Until that exists, the cold-load gates carry an asterisk.

### §3.5 MEDIUM — Curtain-wall handler count is 14, not the 9 in ADR-0011

**Where:** `plugins/curtain-wall/src/handlers/` contains 14 `.ts` files. ADR-0011 §"Decision A" mandates 9 handlers (the table in the ADR enumerates 9 numbered rows: `create`, `delete`, `move`, `setGrid`, plus 5 more).

**Risk:** the discrepancy has two possible interpretations:
* **(a)** the team added 5 more handlers post-ADR (legitimate scope grow) but never updated ADR-0011 — the ADR is now lying about the surface.
* **(b)** the team failed to triage — three handlers should have been collapsed and were not.

The wall plugin shows the same pattern: ADR-0008 said 14 after wave 3, but `plugins/wall/src/handlers/` has 16. Walls, slabs, columns, beams, stairs, and ceilings all match their triage counts; only wall (+2) and curtain-wall (+5) overshoot.

**Recommended action:** publish ADR-0008 / ADR-0011 amendments listing the additional handlers and their justifications, OR triage them out per the original decision. Either is fine; the current state where code disagrees with ADR is not.

### §3.6 MEDIUM — Scope creep: 22 packages + 31 plugins where Phase 1 needed ≈ 13 + 12

**Phase 1 required packages (per `08-VISION.md §4` and the four phase docs):**
schemas, protocol, command-bus, persistence-client, frame-scheduler, scene-committer, renderer, stores, file-format, geometry-kernel, view-state, picking, plus the eslint-plugin-pryzm tool. That is **13**.

**Actually present** (`ls packages/`): `ai-cost`, `ai-host`, `beta-signup`, `command-bus`, `constraint-solver`, `crash-reporter`, `drawing-primitives`, `email-transport`, `expr-eval`, `family-instance`, `family-loader`, `family-runtime`, `feature-flags`, `file-format`, `frame-scheduler`, `geometry-kernel`, `legacy-shim`, `pdf-to-bim`, `persistence-client`, `picking`, `protocol`, `render-runtime`, `renderer`, `scene-committer`, `schemas`, `storage-driver`, `stores`, `sync-client`, `types-builtin`, `ui`, `view-state`, `visibility`. That is **32**.

**Phase 1 required plugins:** the 12 element families. **Actually present**: those 12 + `ai-floorplan`, `ai-generative`, `ai-query`, `ai-rules`, `ai-voice`, `annotations`, `bcf`, `cross`, `dimensions`, `furniture`, `ifc-export`, `ifc-import`, `ifc-inspector`, `lighting`, `multiplayer`, `plan-view`, `plumbing`, `rhino-import`, `rooms`, `schedules`, `section-view`, `selection`, `sheets`, `structural`, `toy-cube`, `view`, `wall` (and others) = **31** plugins.

**Risk:** Phase 1's intent was to ship the rails *narrow and deep*. Carrying 19 extra packages and 19 extra plugins through Phase 1 means:
* the L0→L7 boundary lint matrix has to handle them all, and any uncovered package quietly becomes "default-disallow" (silent break);
* the bundle-size gate (§3.3) measures a much heavier tree;
* AI hosts, IFC, BCF, plan-view, rhino-import, multiplayer were Phase 2 / Phase 3 scope.

**Recommended action:** classify each extra package/plugin as one of (a) "actually needed for Phase 1 close, missed by spec", (b) "Phase 2/3 work landed early — leave parked, do not gate on", (c) "trim before Phase 1 close." Document under `audits/PHASE-1-COMPLETION-PLAN.md` so future contributors know which is which.

### §3.7 MEDIUM — Bake-worker R2 storage is wired in storage-driver but not in bake-worker itself

**Where:** `packages/storage-driver/src/R2StorageDriver.ts` exists. `apps/bake-worker/src/` contains zero references to `R2StorageDriver`, `aws-sdk`, or `R2Storage`. The M12 alpha report acknowledges: *"Bake worker producing R2-hosted chunks with signed URLs — **PASS-stub** … R2 driver wired behind R2_* env (deferred to deploy build)."*

**Risk:** the spec exit criterion calls for "Bake worker producing R2-hosted chunks with signed URLs." Today the bake worker can only write chunks to `InMemoryStorageDriver`. A real deploy will require wiring `createStorageDriver({ r2: process.env })` into `apps/bake-worker/src/index.ts`, surfacing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` env vars, and proving the round trip end-to-end.

**Recommended action:** add a `BAKE_STORAGE=r2` switch in `apps/bake-worker/src/index.ts` and a smoke test that uploads + downloads one chunk against an R2 stub container. Until then, the gate is "logic-ready, deploy-pending."

### §3.8 MEDIUM — sync-server auth is `clientId/userId` from query string

**Where:** `apps/sync-server/src/index.ts` doc-comment: *"WS `/sync` — `clientId` and `userId` are read from query string for v0 (full JWT auth in Phase 3C)."*

**Risk:** the M12 spec says "alpha"; trustless `userId` from the query string is fine for an internal alpha but **must not** survive into a beta or paid trial — a malicious client can push events as anyone. Phase-1's contract did not require JWT (Phase 3C does), so this is on-spec, but **the deployment URL must be access-controlled out-of-band** (private origin, mTLS proxy, IP allow-list, etc.). The current Replit deploy configuration does not enforce that.

### §3.9 LOW — `pryzm.boot` root OTel span is "PARTIAL"

**Where:** M12 alpha report row 17 in §5.

**Risk:** every other OTel span listed in the report (`command.execute`, `persistence.append`, `scene.commit`, `frame.render`, `bake.chunk`, `bake.enqueue`, `bake.r2.{put,get}`, `sync.append`, `sync.broadcast`, `sync.sequence`, `loader.tier{1,2,3}`, `loader.history`, `loader.evict`) is wired. Only `pryzm.boot` lacks a real implementation. Without a root span the "single wall-edit OTel trace spans all layers" gate is technically green-via-sibling-spans (per ADR-0020) but **doesn't render as one collapsible trace in Honeycomb** — it shows up as N parallel spans.

**Recommended action:** add a single `tracer.startActiveSpan('pryzm.boot', ...)` wrapping `bootstrap.everything()` and finishing on first paint. ~10 lines.

### §3.10 LOW — `headless` CLI is in-memory persistence only

**Where:** `apps/headless/src/index.ts` doc-comment: *"The runtime is created fresh for each invocation. Persistence is in-memory only until a file-system backend lands in S19+."*

**Risk:** the CLI today can `new-project`, `add-wall`, `add-slab`, `export-pryzm` — all in-memory. To be a useful tool for AI agents and CI, it needs `--project-path /path/to/project.pryzm` to load + save. The L0 file-system backend is not present. The S19 budget for it has presumably slipped into Phase 2.

**Recommended action:** add `packages/persistence-client/src/backends/FileSystemBackend.ts` (parallel to `IndexedDbBackend.ts`) and surface `--project-path` in the CLI. ~150 lines.

### §3.11 LOW — Visual-diff corpus depth uncertain

**Where:** `tests/visual-diff/` contains only `plan-view/`. Phase 1B/S08 spec called for a 24-scene visual-diff corpus.

**Risk:** the M12 report does not cite scene count. Per-mode (WebGPU vs WebGL2) parity is harder to enforce when the corpus is shallow. Visual regressions in 3D scenes (the wall + slab + door demos) may slip through if only plan-view is screened.

**Recommended action:** enumerate the visual-diff scenes that DO exist and measure against the 24-scene target.

### §3.12 LOW — All bench/audit timestamps are 2026-04-27 / 2026-04-28

Every report under `apps/bench/reports/` carries a Captured-on date of 2026-04-27 (one day before this audit). That is fine if interpreted as "Phase 1 close was a single multi-day push" but it does mean **there is no longitudinal performance history** — the codebase cannot answer "did orbit fps regress over the last 12 sprints?" because there is no S04, S07, S11, … set of historical data points. Future regressions have no baseline to compare against beyond the single committed file.

**Recommended action:** at minimum, archive each milestone's bench output under `apps/bench/reports/history/<sha>-<date>.json` going forward.

---

## §4 Items deferred / partial / not done — bound list

(Lifted directly from M12-alpha §8 and corroborated against code.)

| # | Item | Type | Where it lives today | Resolution path |
|---|---|---|---|---|
| D-1 | Bundle-size CI gate against `< 1.8 MB gzip` | Code wired, not measured | `apps/bench/scripts/check-bundle-size.mjs` | §3.3 |
| D-2 | Honeycomb / Tempo dashboard | Wiring complete, no live backend | `apps/editor/src/otel-config.ts` | Deploy-time |
| D-3 | M12 alpha demo screencast | Script committed, no recording | `docs/demos/M12-alpha.script.md` | Manual |
| D-4 | Phase-2 risk register + S25 sprint plan + founder rest week | Process | n/a | Human team |
| D-5 | R2 storage driver actually wired into bake-worker | §3.7 | `apps/bake-worker/src/index.ts` | §3.7 |
| D-6 | JWT auth on sync-server | §3.8 | Phase 3C | §3.8 |
| D-7 | `pryzm.boot` root span | §3.9 | `apps/editor/src/bootstrap.everything.ts` | §3.9 |
| D-8 | Filesystem persistence backend for headless | §3.10 | S19+ | §3.10 |
| D-9 | Visual-diff corpus depth | §3.11 | `tests/visual-diff/` | §3.11 |
| D-10 | Sprint retros S01–S24 as standalone files | Process | `PROCESS-TRACKER` only | Founder rest week |
| D-11 | `npm` → `pnpm` in CI | §3.1 | `.github/workflows/ci.yml` | §3.1 |
| D-12 | View-state THREE leak | §3.2 | `packages/view-state/src/ViewController.ts` | §3.2 |
| D-13 | Curtain-wall handler count vs ADR-0011 | §3.5 | `plugins/curtain-wall/src/handlers/` | §3.5 |
| D-14 | Wall handler count vs ADR-0008 (+2) | §3.5 | `plugins/wall/src/handlers/` | §3.5 |
| D-15 | Cold-load real-fixture end-to-end bench | §3.4 | `apps/bench/src/benches/` | §3.4 |
| D-16 | Scope-creep classification of extra packages/plugins | §3.6 | `audits/PHASE-1-COMPLETION-PLAN.md` | §3.6 |

**Total open items: 16.** Of those, **3 are CRITICAL/HIGH that block "Phase 1 closes"** (§3.1 CI, §3.2 view-state, §3.3 bundle gate), **5 are MEDIUM and can ship around**, **8 are LOW or process-only**.

---

## §5 Risks not surfaced by the team's own reports

These are issues I derived from the code that the existing audit / completion-plan documents do not flag.

### §5.1 Two `bootstrap*.ts` files diverge silently

`apps/editor/src/` ships **five** bootstrap files: `bootstrap.ts`, `bootstrap.data.ts`, `bootstrap.render.ts`, `bootstrap.render.data.ts`, `bootstrap.everything.ts`. The S05/S06 spec called for `bootstrap.data.ts` + `bootstrap.render.ts`; the W-1C-1 plan added `bootstrap.everything.ts`. The fifth file (`bootstrap.render.data.ts`) is undocumented. There is no compile-time check that these stay coherent (e.g. no contract test like "`bootstrap.everything()` invokes `bootstrap.data()` then `bootstrap.render()`"). If two of them drift, only the integration test catches it.

**Recommendation:** consolidate to two files (`bootstrap.data`, `bootstrap.render`) + the everything aggregator, OR add a `bootstrap-shape.test.ts` that exercises every bootstrap function.

### §5.2 `legacy-shim` package presence

`packages/legacy-shim/` exists with `raf.bad.ts` (a `requestAnimationFrame` site). It is presumably for the PRYZM 1 sunset but is not documented in any phase doc. Its scope (what may import from it, what it must not depend on) is undefined. This is a quiet trapdoor.

### §5.3 Two `apps` could collide on port 5000

`apps/editor` runs on port 5000 (Replit dev). `apps/sync-server` runs on port 4000. `apps/bake-worker` defaults to port 4001. Right now the workflows only start `Start application` (`npm run dev` → port 5000); the sync server and bake worker are never exercised together at dev time. Cross-process testing only happens inside sync-server's own `__tests__/`. There is no `pnpm dev:all` target.

### §5.4 The 14 vitest workflows in `.replit` config carry one failing target

`audit-log-middleware` workflow (per the system snapshot) is in failed state. The other 13 are running / finished. Without inspecting why `audit-log-middleware` failed, it is technically correct to say "Phase 1 has a red workflow."

### §5.5 `tests/parity/` directories exist but their assertion strength varies

`tests/parity/wall/` has a real Node-vs-browser byte-parity test (✓). `tests/parity/{slab,door,window,…}/` directories exist but I did not verify each one carries an equivalent strong test. The M12 report claims "parity tests vs PRYZM 1 — PASS" but the actual assertion shape per element family is not enumerated.

**Recommendation:** for each of the 12 elements, confirm the parity test asserts against a `tests/fixtures/pryzm-1-snapshots/<element>/` snapshot, not against itself. (The fixture directory exists for all 12.)

---

## §6 Sub-phase-by-sub-phase scorecard

### 1A — Skeleton & rails (S01–S06, M1–M3)

| Spec exit criterion | Code status |
|---|---|
| `?pryzm2=1` URL flag swaps stacks | ✅ `apps/editor/src/index.ts` flag entry |
| Cube demo orbit 60 fps, idle 0 fps | ✅ `idle-cpu.bench.ts` p95 = 0.001 ms / probe |
| Undo/redo via patches | ✅ `UndoStack.ts` + cascade tests |
| WebGPU + WebGL2 visual-diff parity < 2 px | ⚠ visual-diff harness exists; 2-px gate not measured at S06 (real-enforce S08) |
| Bundle < 1.8 MB gzip entry chunk | ❌ §3.3 — not measured |
| 4 custom ESLint rules active + PR-blocking | ✅ + `pryzm/store-single-channel` (5 total) |
| OTel coverage (`command.execute`, `persistence.append`, `scene.commit`, `frame.tick`, `frame.render`) | ✅ |
| Per-package READMEs + arch docs | ✅ enumerated in M12 §6 |
| PRYZM 1 still ships unchanged | ✅ default URL still PRYZM 1 |
| rAF / `(window as any)` count snapshot in `src/` unchanged | ✅ `tools/scripts/check-raf-count.mjs` runs in CI |

**Sub-phase verdict: A−** (one HIGH unmet: bundle gate).

### 1B — Wall end-to-end (S07–S12, M4–M6)

| Spec exit criterion | Code status |
|---|---|
| Wall plugin: 16 handlers (spec ratchet 5→14) | ✅+ |
| `produceWall` pure, ADR-0009 frozen signature | ✅ |
| Wall snapshot fixtures + headless-Node parity | ✅ K1-B byte parity ✓ |
| Wall committer: dedicated `wall-committer.ts` + bridges | ✅ |
| Wall benches: produce-wall p95 ≤ 2 ms, cmd-execute p95 ≤ 1 ms | ✅ p95 = 1.538 ms / 0.91 ms |
| 24-scene visual-diff corpus | ❓ §3.11 (corpus depth not enumerated; only `tests/visual-diff/plan-view/` present) |
| Curtain-wall ADR-0011 published + 9 handlers + producer split | ✅ ADR exists; ✅ producer split; ⚠ 14 handlers ≠ 9 (§3.5) |

**Sub-phase verdict: A−.**

### 1C — 12 element families (S13–S18, M7–M9)

| Spec exit criterion | Code status |
|---|---|
| 12 element families plug-and-play via `PluginRegistry.ts` + `bootstrap.everything.ts` | ✅ |
| Each family has store + handlers + committer + producer + tests | ✅ × 12 |
| Per-element parity benches | ✅ `produce-{wall,slab,door,window,roof,curtain-wall,grid,column,beam,stair,handrail,ceiling}-baseline.md` |
| Selection + picking across all 12 | ✅ `plugins/selection/`, `packages/picking/` |
| `view-state` + `ViewController` (ADR-0016) | ✅ — but §3.2 caveat |
| Headless CLI `new-project`, `add-wall`, `add-slab`, `export-pryzm` | ✅ + 23 tests passing |

**Sub-phase verdict: A.** Strongest sub-phase.

### 1D — Bake / pryzm-zip / alpha (S19–S24, M10–M12)

| Spec exit criterion | Code status |
|---|---|
| `.pryzm` v1 round-trips losslessly (small, medium, large) | ✅ `roundtrip.test.ts` + `pack-unpack.bench.ts` p95 = 9.2 ms / 21.0 ms |
| Tier-streamed loader (Tier1, Tier2, Tier3) | ✅ 28 loader tests |
| Migration framework v0→v1 with clear error | ✅ `migrations.test.ts` |
| Bake worker producing R2-hosted chunks | ⚠ §3.7 (storage-driver wired, bake-worker uses InMemory only) |
| Sync server: WebSocket + Postgres + soft locks | ✅ — but §3.8 trust-model |
| Multi-tab sync (LWW) — sync roundtrip < 250 ms p95 | ✅ p95 = 4.6 ms |
| 3 CDE legacy commands folded into sync protocol | ✅ per ADR-0019 |
| Cold-load: small <800 ms, medium <1.5 s, large <3 s | ⚠ §3.4 (synthetic only; pack-unpack + bake-incremental triangulation) |
| `pryzm.boot` root OTel span | ⚠ §3.9 (PARTIAL) |
| Honeycomb/Tempo dashboard live | ❌ deploy-time |
| 10-min alpha demo recording | ❌ deploy-time |
| Phase-1 retro published | ✅ `docs/retros/PHASE-1-CLOSE.md` per M12 |

**Sub-phase verdict: B+.** All deferreds documented; no surprises.

---

## §7 Recommendations (ranked by impact / effort)

| Rank | Action | Impact | Effort |
|---|---|---|---|
| 1 | Fix CI to use pnpm (§3.1) | HIGH (unblocks GH Actions) | XS (10 min) |
| 2 | Resolve view-state THREE leak (§3.2) | HIGH (architectural integrity) | S (1 h refactor or 5 min ADR amendment) |
| 3 | Run `vite build` + bundle-size check, commit the result (§3.3) | HIGH (closes spec gate) | S (1 h) |
| 4 | Add real-fixture cold-load bench (§3.4) | MEDIUM (kills the asterisk) | M (4 h) |
| 5 | Reconcile wall + curtain-wall handler counts vs ADR-0008 / ADR-0011 (§3.5) | MEDIUM (truth-in-architecture) | XS (publish ADR amendment) |
| 6 | Classify scope-creep packages/plugins as keep / park / trim (§3.6) | MEDIUM (Phase 2 sanity) | S (2 h doc) |
| 7 | Wire R2 driver into bake-worker behind env switch (§3.7) | MEDIUM (deploy readiness) | S (2 h) |
| 8 | Add `pryzm.boot` root span (§3.9) | LOW (telemetry quality) | XS (15 min) |
| 9 | Add filesystem persistence backend for headless (§3.10) | LOW (CLI usefulness) | M (3 h) |
| 10 | Enumerate / extend visual-diff corpus (§3.11) | LOW | M |
| 11 | Address `audit-log-middleware` failing workflow (§5.4) | LOW (CI noise) | XS investigation, then S fix |
| 12 | Confirm each `tests/parity/<element>/` asserts against PRYZM-1 fixture (§5.5) | LOW (parity claim integrity) | M (12 × 30 min) |

---

## §8 Summary

The Phase 1 codebase is **substantially complete and architecturally sound**.
The L0→L7 layer matrix, the kernel-purity gate, the headless determinism test,
the ULID brand factory, the MaterialPool, the per-plugin committer + producer
shape, the chunked tier-streamed loader, the deterministic ZIP packer, the
Postgres event log with advisory locks — these are all built to a level you
would want to keep.

The blockers to "**Phase 1 actually closes**" are tactical, not structural:

* **3 HIGHs**: fix CI (npm→pnpm); resolve the view-state THREE allowlist drift; measure the bundle.
* **5 MEDIUMs**: cold-load real-fixture bench; ADR↔code handler-count reconciliation; classify scope-creep; wire R2 into bake; enumerate parity test strength.
* **8 LOWs / process**: telemetry root span, headless FS backend, visual-diff corpus, sprint retros, demo recording, etc.

None of these require re-architecting. All of them can be closed in a focused
1–2 week push without disturbing the substantial-quality work already in.

— end —
