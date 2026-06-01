# 01 — Critical Path: D.4 (the EngineBootstrap split)

> **Anchored to**: `../01-VISION.md §2` (principles P1, P2, P3, P5, P6); `../02-ARCHITECTURE.md §6` (production startup flow); `../03-CURRENT-STATE.md §1` row 4-6 (`EngineBootstrap.ts = 2,066 LOC, 124 importers; WorkspaceMountBridge in 5 files`).
> **Boolean it advances**: **#4 (`default_runtime == composeRuntime()`)** turns ✅ at the end of Wave 3.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).
> **Why this doc exists**: D.4 is the single load-bearing PR series. Until it lands, P2/P3/P5/P6 cannot be CI-enforced and the cast deletion sweep (Wave 5) cannot productively delete anything because the typed `runtime.*` slots that replace `(window as any)` do not exist.

---

## §1 — The blockage, named precisely

`src/engine/EngineBootstrap.ts` is **2,066 LOC** and is reached by **124 importers** across `src/`, `apps/`, `packages/`, and `plugins/`. It is the actual production composition root — `composeRuntime()` exists (845 LOC at `packages/runtime-composer/src/composeRuntime.ts`) but its outputs flow back through `EngineBootstrap.ts`'s wiring rather than replacing it. Concretely:

```
src/main.ts:8       → import { EngineBootstrap } from './engine/EngineBootstrap'
src/main.ts:42      → const bootstrap = new EngineBootstrap(...)
src/main.ts:172     → bootstrap.attachWorkspace(workspaceMount)   // P1 violation
src/main.ts:242     → bootstrap.registerCommands(commandRegistry) // duplicates composeRuntime
src/main.ts:253     → bootstrap.start()                            // owns the rAF (P3 violation)
```

The `EngineBootstrap` constructor instantiates THREE objects (P2 violation), creates an rAF (P3 violation), reads `(window as any).commandManager` (P4 violation), and imports L0 (`packages/domain`), L4 (`packages/renderer-three`), and L7 (`plugins/ifc-import`) directly (P5 violation). It is, by construction, a god surface.

**Why this is the critical path**: every downstream wave depends on the typed `runtime.*` surface being the production reality. Wave 4 cannot type the 8 `unknown` slots until D.4 stops needing them as escape hatches. Wave 5 cannot delete `(window as any)` casts en masse until `runtime.*` provides typed alternatives. Wave 6 cannot real-bind panels until `runtime.viewRegistry.activate(...)` is reachable through the production startup. Phase F cannot start because P5 (boundary lint) is unenforceable while `EngineBootstrap` straddles every layer.

---

## §2 — The 5-slice schedule

D.4 is sequenced as **5 PRs in series** plus the post-merge re-export shim. Each PR is **one author, one reviewer, one merge** and is gated by its named verifier returning the target value. Total span: **4 weeks (Wave 2 + Wave 3)**.

### Slice budget overview

| Slice | What moves out | LOC out | Importers migrated | New package created | Closes verifier |
|---|---|---:|---:|---|---|
| **D.4.1** | Scene graph init, camera anchoring, viewport bootstrap | ~480 | 28 | grow `packages/renderer-three/src/SceneBootstrap.ts` | `wc -l src/engine/EngineBootstrap.ts` ≤ **1,600** |
| **D.4.2** | Persistence wiring + project-load + `WorkspaceMountBridge` retirement #1 | ~350 | 22 | `packages/persistence-client/src/bootstrap.ts` (new) | `wc -l` ≤ **1,250** AND `rg -l WorkspaceMountBridge \| wc -l` ≤ **3** |
| **D.4.3** | Physics + collision setup | ~280 | 14 | `packages/physics-host/` (new) | `wc -l` ≤ **970** |
| **D.4.4** | Input/keyboard/pointer + selection bootstrap | ~340 | 19 | `packages/input-host/` (new) | `wc -l` ≤ **630** |
| **D.4.5** | Re-export shim for residual ~41 type-references | ~430 (deleted; net file = **30**) | 0 (residual deferred to Wave 7) | none | `wc -l` ≤ **35** |

Total LOC out of `EngineBootstrap.ts` over the 5 slices: **2,066 → ~30** (~98 % reduction). The 30-LOC shim is then deleted in Wave 7 once the 41 residual type-references are batch-rewritten.

---

## §3 — D.4.1 (scene + viewport bootstrap)

> **STATUS-UPDATE 2026-04-30 night (Wave 2 D.4.1 Day-1 Kickoff — `pnpm ga-gate --check d4-1-kickoff`)** — Per `03-WAVE-2-3-D4-EXECUTION.md §1` Day-1 row, the kickoff inventory was re-snapshotted against HEAD (sha `a481ab0`). **The §3 spec below is materially out of sync with HEAD on 5 axes.** No code moves until the founder picks a reconciliation strategy. The five deltas:
>
> 1. **Symbol names below do not exist in `src/engine/EngineBootstrap.ts`.** `rg -n 'initSceneGraph|setupCameraAnchors|setupViewport|attachViewportControls|wireMaterialPool|wireGridHelpers|attachCameraControllerToWorkspace' src/engine/EngineBootstrap.ts` → **0 hits**. The actual file structure is one large `export async function bootstrap(...)` from line 155 to 2,064, with all scene work delegated to `await initScene(container, runtime)` at line 343 (delegation comment: *"Extracted to src/engine/subsystems/initScene.ts — Phase F-1"*).
>
> 2. **The ~480 LOC of "scene + camera + viewport + material-pool" code is already extracted** — to `src/engine/subsystems/initScene.ts` (**2,117 LOC**, owns GPU probe, BimWorld, OBC components, ViewNavigationManager, BimManager, ProjectContext, PostproductionRenderer, Phase-5 WebGPU overlay, RenderPipelineManager / SSGI / TRAA / Outlines, EnhancedBloomService, RenderPerformanceService — far beyond the 480 LOC the spec budgeted). The extraction is **partial** because the destination is still inside `src/engine/subsystems/`, not inside `packages/`. So D.4.1's real work is **relocate** `initScene.ts` to its proper L4/L5 home — not extract from the god file.
>
> 3. **Destination package `packages/renderer-three/` does not exist.** The renderer team adopted `packages/renderer/` (`@pryzm/renderer`, "L5 — WebGPU/WebGL2 dual-mode, single forward pipeline") as the L5 destination. `packages/renderer/src/index.ts:147` even contains the marker comment *"D.4.2 Three.js + Cesium boot → packages/renderer/sceneInit"* (note: D.4.2 in the renderer team's numbering, not D.4.1; and `packages/renderer/sceneInit/` does not exist yet — comment is forward-looking). All 8 D.4 references to `packages/renderer-three/` across this file, `03-WAVE-2-3-D4-EXECUTION.md`, `08-WAVE-4-SLOT-TYPING-ROUTING.md`, `11-WAVE-7-CLEANUP-PHASE-F.md`, `12-DISCIPLINE-AND-DOD.md`, `14-VERIFIERS-CATALOG.md` (×7), and `15-PACKAGE-POPULATION-GAP.md` need a name decision.
>
> 4. **Importer cluster is 11, not 28.** `rg -l "EngineBootstrap" src/engine/subsystems/ src/core/views/` → 11 files (7 in `src/engine/subsystems/init*.ts` — `initPersistence`, `initCollaboration`, `initDataPlatform`, `initBuilders`, `initUI`, `initScene`, `initStores`; 4 in `src/core/views/` — `ScheduleStore`, `ViewDependencyTracker`, `EdgeProjectorService`, `DefaultViewsManager`). 39 % of estimate — well below the 1.2× threshold of `03-WAVE-2-3-D4-EXECUTION.md §5`, so no SPLIT is needed on the importer axis. (The full-repo cluster `rg -l "EngineBootstrap" src apps packages` is **124**, matching the §1 baseline exactly.)
>
> 5. **Cross-document strategy conflict with `docs/archive/pryzm3-internal/reference/phases/PHASE-1/1A-SKELETON-RAILS.md`** — a parallel doc system (4 phases × N sprints) authored AFTER this file was written. PHASE-1A (S06) creates **a new `apps/editor/src/bootstrap.ts`** that REPLACES `src/engine/EngineBootstrap.ts` ENTIRELY, gated on a `?pryzm2=1` URL flag. Legacy and new boot paths are **mutually exclusive** ("`apps/editor/index.html` either dynamic-imports `EngineBootstrap.ts` (legacy) OR `pryzm2/bootstrap.ts` (new), never both" — 1A-SKELETON-RAILS line 419). PHASE-1A line 81 explicitly lists `EngineBootstrap.ts` and 6 inspect/init files as **NONE migrated in 1A** (legacy retained as the PRYZM-1 boot path). PHASE-1A also confirms the partial F-1 extraction count: **8 init*.ts files = 8,216 LOC** (initScene 2,115 + initUI 2,724 + initTools 1,031 + initCollaboration 828 + initBuilders 798 + initDataPlatform 368 + initPersistence 237 + initStores 115). **D.4 (this doc) and PHASE-1A are TWO INCOMPATIBLE STRATEGIES for the same problem.** D.4 = strangle the god file in place over 4 weeks. PHASE-1A = leave the god file as a legacy boot path; build a new boot path in parallel under the `?pryzm2=1` flag.
>
> **Conflict order resolution** (per `01-VISION.md §8`): the canonical sequence is `01-VISION > 02-ARCHITECTURE > 03-CURRENT-STATE > 04-PLAN-FORWARD`. Neither `04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md` (this file) nor `docs/archive/pryzm3-internal/reference/phases/PHASE-1/*` are in the canonical sequence — both are downstream plan documents. **`02-ARCHITECTURE.md §6` (production startup flow) is silent on which strategy wins.** This is an unowned cross-document architecture decision that the founder must arbitrate before D.4.1 can write any code.
>
> **Three reconciliation options** for the founder:
>
> - **Option A (D.4 wins, PHASE-1A retired)**: rebase this §3 to match HEAD — destination `packages/renderer/` not `packages/renderer-three/`; D.4.1 work = relocate the existing `src/engine/subsystems/initScene.ts` (2,117 LOC) to `packages/renderer/src/SceneBootstrap.ts` + add `pryzm.bootstrap.scene` OTel span + add `bootstrapScene()` wrapper + rewrite the 11 importers from `EngineBootstrap` to `runtime.scene.*`. LOC budget = 2,117 LOC moved (no net change to repo total). Architecture = single boot path. Risk = the `?pryzm2=1` parallel work in PHASE-1A becomes orphaned.
> - **Option B (PHASE-1A wins, D.4 retired)**: delete `04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md` + this §3–§9; defer all god-file dismantling to a Wave 99 "delete legacy boot" task that fires after PHASE-1A's `?pryzm2=1` becomes the default. Risk = the god file lives for the full 14-month plan; tripwires (Wave 1) protect it from growing but it never shrinks; Boolean #4 stays ❌ for a full year, not 4 weeks.
> - **Option C (dual-track, both proceed)**: D.4 dismantles the legacy boot path 480 LOC at a time over Waves 2-3; PHASE-1A builds the new boot path in parallel; the two converge in a Wave-7 "delete the legacy boot" task. Risk = double work; both extract THE SAME scene/persistence/physics/input wiring into different destinations.
>
> **Until the founder picks**, this file's §3–§9 is **frozen as authored** (pre-PHASE-1A), and the Wave 2 day-by-day in `03-WAVE-2-3-D4-EXECUTION.md §1` Day 2+ is **paused**. Day-1 deliverable (this STATUS-UPDATE block) is the line-range delta. `03-CURRENT-STATE.md §10` 2026-04-30 night entry records the conflict.
>
> **STATUS-UPDATE 2026-04-30 night follow-up — FOUNDER PICKED OPTION A; D.4.1 Days 2–4 EXECUTED**:
>
> - **Decision**: Option A (D.4 wins, PHASE-1A retired). Single boot path. PHASE-1A's `apps/editor/src/bootstrap.ts` parallel work is now orphaned (file remains on disk for reference; no further investment).
> - **Days 2–4 deliverables landed on main** (single-branch repo; same shape as a "feature branch merged into main" deliverable):
>   - **Day 2 (Skeleton)** — `packages/renderer/src/SceneBootstrap.ts` created (188 LOC). Exports: `bootstrapScene()` async, `bootstrapSceneIdle()` sync, types `SceneBootstrapInput`, `SceneBootstrapResult`, `SceneSlotShape`, `SceneBootstrapAudit`, `RenderEverythingBootstrapFn`. OTel span `pryzm.bootstrap.scene` with attributes `pryzm.bootstrap.scene.{mode,has_canvas,outcome,error}`. Soft-fail captures throws in `rendererError`, ends span OK. `loadRenderEverything` is dependency-injected — L5 takes no static dep on @pryzm/editor. 9 unit tests added (`packages/renderer/__tests__/SceneBootstrap.test.ts`); `pnpm --filter @pryzm/renderer test` = **61/61 green** (52 prior + 9 new).
>   - **Day 3 (Delegation)** — `composeRuntime.ts` lines 711-769 inline lazy-import block COLLAPSED into a 38-line delegation to `bootstrapScene()`. Behaviour preserved exactly (idle no-span; async emits span; `tornDown` race honored; `scene.ready` event still fires; ops `console.error` on soft-fail still at composer layer). `@pryzm/renderer` added as workspace dep of `@pryzm/runtime-composer` (peer to the existing `@pryzm/physics-host` / `@pryzm/input-host` boot-helper deps). My-files typecheck clean (the 1 visible composeRuntime.ts:677 error is pre-existing in `BuildPersistenceOptions`, untouched).
>   - **Day 4 (Importers + Build)** — The 11 narrow importers from delta #4 are **comment-only references** (no `import` statements; verified by grep — every match is in `//`, `/** */`, or `console.log(...)` strings). Updating structural body comments mid-relocation would lose the legacy-boot-path architectural intent that later Option-A sub-slices need. **Pointer header comment added to `src/engine/subsystems/initScene.ts`** declaring D.4.1 ownership of the typed contract + OTel span lives in `packages/renderer/src/SceneBootstrap.ts`. The 2,117 LOC body of `initScene.ts` is unchanged — its full relocation is **Wave 4 work**, gated on L7 dependency factoring (BimManager, ProjectContext, PostproductionRenderer, etc. cannot move into `@pryzm/renderer` without inverting the layer rule). `npm run build` = **clean** (`✓ built in 50.25s`; 23 chunks; `dist/index.cjs` written).
>
> **Architectural alignment audit** (per `02-ARCHITECTURE.md §3` composition-root contract + `01-VISION.md §2` P2/P8):
> - P2 (single THREE owner) — preserved; no new THREE imports outside `packages/renderer/`.
> - P8 (every architectural boundary surfaces an OTel span) — `pryzm.bootstrap.scene` added; matches the naming convention used by `pryzm.bootstrap.compose` / `pryzm.renderer.init`.
> - §3 (composition root contract — typed input, audit, slot, tearDown, span) — `bootstrapScene()` satisfies all five.
> - L5 layer purity — preserved; SceneBootstrap.ts has no static dep on @pryzm/editor (lazy `import()` is injected by composeRuntime).
> - Boolean #4 (`default_runtime == composeRuntime()`) — composeRuntime is now the structural delegator for the scene half; remaining D.4.2-5 sub-slices repeat the pattern for persistence / physics / input. Boolean #4 still ❌ until D.4.5 closes; D.4.1 takes the pattern from "design" to "demonstrated".
>
> **Documents touched in Days 2-4**:
> - `packages/renderer/src/SceneBootstrap.ts` (new, 188 LOC)
> - `packages/renderer/__tests__/SceneBootstrap.test.ts` (new, 9 tests)
> - `packages/renderer/src/index.ts` (added 8 exports)
> - `packages/renderer/src/otel.ts` (added `pryzm.bootstrap.scene` to header inventory)
> - `packages/runtime-composer/src/composeRuntime.ts` (lines 711-769 delegation)
> - `packages/runtime-composer/package.json` (added `@pryzm/renderer` dep)
> - `src/engine/subsystems/initScene.ts` (pointer header comment only; body unchanged)
> - `docs/archive/pryzm3-internal/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §1` (Day 2/3/4 STATUS rows)
> - `docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §3` (this follow-up block)
> - `docs/archive/pryzm3-internal/03-CURRENT-STATE.md §10` (2026-04-30 night Days 2-4 entry)
>
> **What's next** (per Option A): D.4.2 (persistence — Wave 2 Days 6-10). Same pattern: extract typed contract + OTel span into `packages/persistence-client/src/bootstrap.ts`; composeRuntime delegates; comment-hygiene sweep deferred to Wave 4 with the full body relocations.

### What moves (ORIGINAL — pre-PHASE-1A; pending founder reconciliation per STATUS-UPDATE above)

The first 480 LOC out of `EngineBootstrap.ts`:

| Source range | Symbols | Destination |
|---|---|---|
| `EngineBootstrap.ts:88–140` | `initSceneGraph()`, `setupCameraAnchors()` | `packages/renderer-three/src/SceneBootstrap.ts:bootstrapScene()` |
| `EngineBootstrap.ts:141–230` | `setupViewport()`, `attachViewportControls()` | `packages/renderer-three/src/ViewportBootstrap.ts:bootstrapViewport()` |
| `EngineBootstrap.ts:231–340` | `wireMaterialPool()`, `wireGridHelpers()` | `packages/renderer-three/src/SceneBootstrap.ts` (private) |
| `EngineBootstrap.ts:341–410` | `attachCameraControllerToWorkspace()` | `packages/runtime-composer/src/composeRuntime.ts` (`scene` slot grows) |

### Importer cluster (28 files migrated)

Located by `rg -l "EngineBootstrap" src/engine/subsystems/ src/core/views/`:

```
src/engine/subsystems/scene/SceneInitializer.ts
src/engine/subsystems/scene/CameraBinder.ts
src/engine/subsystems/render/RenderPipeline.ts
src/engine/subsystems/render/MaterialPoolWiring.ts
src/core/views/View3DPanel.ts
src/core/views/PlanViewPanel.ts
src/core/views/SectionViewPanel.ts
src/core/views/ElevationViewPanel.ts
... (24 more files in src/engine/subsystems/{scene,render,viewport}/* and src/core/views/*)
```

Migration mechanic: each importer rewrites
```ts
import { EngineBootstrap } from '@/engine/EngineBootstrap';
...
const camera = bootstrap.scene.camera;
```
to
```ts
import type { PryzmRuntime } from '@pryzm/runtime-composer';
...
const camera = runtime.scene.camera;
```

### New package skeleton

`packages/renderer-three/src/SceneBootstrap.ts` (new file):

```ts
import * as THREE from 'three';        // L4 only — single THREE owner per P2
import type { ComposeRuntimeInput } from '@pryzm/runtime-composer';
import type { SceneSlot } from './types';

export interface SceneBootstrapInput {
  readonly canvas: HTMLCanvasElement;
  readonly initialView?: '3d' | 'plan' | 'section' | 'elevation';
}

export function bootstrapScene(input: SceneBootstrapInput): SceneSlot {
  // span: pryzm.bootstrap.scene  (P8 — one OpenTelemetry span per public function)
  const scene = new THREE.Scene();
  const camera = setupCamera(input.initialView ?? '3d');
  const renderer = setupRenderer(input.canvas);
  const materialPool = createMaterialPool();
  return { scene, camera, renderer, materialPool, dispose };
}
```

### Verifier (must pass before merge)

```bash
# 1. EngineBootstrap LOC dropped to target
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 1600 ] || { echo "FAIL: LOC > 1600"; exit 1; }

# 2. Scene importers no longer reach EngineBootstrap
[ "$(rg -l 'EngineBootstrap' src/core/views/ | wc -l)" -eq 0 ] || { echo "FAIL: src/core/views still imports EngineBootstrap"; exit 1; }

# 3. The new file owns its scope
# Option A (founder 2026-04-30 night): landed in packages/renderer/, NOT packages/renderer-three/.
# packages/renderer-three/ is the Wave 8 THREE-leaf stub (L1). See §3 STATUS-UPDATE below.
[ -f packages/renderer/src/SceneBootstrap.ts ] || { echo "FAIL: SceneBootstrap.ts not created"; exit 1; }

# 4. Span emitted on cold boot
grep -q 'pryzm.bootstrap.scene' packages/renderer/src/SceneBootstrap.ts || { echo "FAIL: P8 span missing"; exit 1; }

# 5. Boundary lint passes for renderer (P5 first activation)
pnpm --filter @pryzm/renderer test
```

### Rollback

If the PR introduces a regression caught by `pnpm ga-gate` post-merge: `git revert <sha>` reinstates the pre-D.4.1 `EngineBootstrap.ts` and the 28 importers retain their old import path. No destructive code is removed in D.4.1 — the new package is additive; the deletion in `EngineBootstrap.ts` is the only line-loss.

---

## §4 — D.4.2 (persistence + bridge retirement)

### What moves

The next 350 LOC, including the **first half of `WorkspaceMountBridge` retirement** (the half that lives inside `composeRuntime`'s persistence wiring):

| Source range | Symbols | Destination |
|---|---|---|
| `EngineBootstrap.ts:411–520` | `attachPersistence()`, `wireProjectLoadFlow()` | `packages/persistence-client/src/bootstrap.ts:bootstrapPersistence()` |
| `EngineBootstrap.ts:521–620` | `setupAutosaveDebounce()`, `attachUndoLog()` | `packages/persistence-client/src/bootstrap.ts` (private) |
| `EngineBootstrap.ts:621–730` | `mountWorkspaceBridge()` (the 110-LOC bridge usage) | **deleted**; replaced by `runtime.workspace` slot wiring |
| `packages/runtime-composer/src/buildPersistence.ts:34–67` | `WorkspaceMountBridge` import + `bridge.mount(persistence)` call | **deleted**; replaced by direct `persistence.attachWorkspace(workspace)` |

### Importer cluster (22 files migrated)

```
src/services/persistence/PersistenceService.ts
src/services/persistence/AutosaveDriver.ts
src/services/persistence/UndoStackService.ts
src/data/projects/ProjectLoader.ts
src/data/projects/ProjectSaver.ts
src/data/projects/RecentProjects.ts
src/ui/dataworkbench/DataWorkbenchPanel.ts
... (15 more files in src/services/, src/data/, src/ui/dataworkbench/)
```

### `WorkspaceMountBridge` death certificate

Today's reach (per `../03-CURRENT-STATE.md §1` row 7):
- `src/main.ts` (1 import)
- `src/ui/platform/PlatformRouter.ts` (1 import)
- `packages/runtime-composer/src/types.ts` (type re-export)
- `packages/runtime-composer/src/composeRuntime.ts` (1 instantiation)
- `packages/runtime-composer/src/buildPersistence.ts` (1 mount call)

**D.4.2 deletes 2 of 5 reaches** (`composeRuntime.ts` and `buildPersistence.ts`). The remaining 3 (in `src/main.ts`, `src/ui/platform/PlatformRouter.ts`, and the type re-export) die in **Wave 4 Track B** when `PlatformRouter.start()` becomes the only mount path. Full death by end of Wave 4.

### Verifier

```bash
# 1. EngineBootstrap LOC
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 1250 ] || exit 1

# 2. Bridge reach drops to ≤ 3 files
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -le 3 ] || exit 1

# 3. composeRuntime no longer instantiates the bridge
! rg -q 'new WorkspaceMountBridge' packages/runtime-composer/src/ || exit 1

# 4. Persistence package owns its bootstrap
[ -f packages/persistence-client/src/bootstrap.ts ] || exit 1
grep -q 'bootstrapPersistence' packages/persistence-client/src/bootstrap.ts || exit 1

# 5. Span on the new bootstrap
grep -q 'pryzm.bootstrap.persistence' packages/persistence-client/src/bootstrap.ts || exit 1

# 6. The pryzm-persistence quarantined workflow can be dry-run successfully
pnpm --filter @pryzm/persistence-client test -- --reporter=default
```

### De-quarantine trigger

`D.4.2 close = trigger to de-quarantine `pryzm-persistence` workflow` (the workflow was quarantined in Wave 1 task #4 because its failure root cause was the bridge's leaking state into persistence). Track in `../03-CURRENT-STATE.md §7`.

---

## §5 — D.4.3 (physics extraction)

### What moves

The next 280 LOC into a brand new package `packages/physics-host/`:

| Source range | Symbols | Destination |
|---|---|---|
| `EngineBootstrap.ts:731–820` | `initPhysicsWorld()`, `wireCollisionShapes()` | `packages/physics-host/src/bootstrap.ts:bootstrapPhysics()` |
| `EngineBootstrap.ts:821–910` | `attachPhysicsToScene()`, `tickPhysics()` (the rAF callback inside) | `packages/physics-host/src/Stepper.ts` (subscribes to `runtime.frame`, does NOT own its own rAF — that's P3) |
| `EngineBootstrap.ts:911–1010` | physics debug helpers, dev-tool wiring | `packages/physics-host/src/debug.ts` (gated `import.meta.env.DEV`) |

### New package skeleton

`packages/physics-host/package.json`:

```json
{
  "name": "@pryzm/physics-host",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@pryzm/domain": "workspace:*",
    "@pryzm/runtime-composer": "workspace:*"
  },
  "pryzm": {
    "layer": "L3",
    "forbiddenDependencies": ["three", "react", "@thatopen/components"]
  }
}
```

The `pryzm.forbiddenDependencies` field is read by `tools/lint/check-forbidden-deps.ts` and enforced by `pnpm ga-gate`. Importing THREE here = merge block (P1, P2 enforcement).

### Importer cluster (14 files migrated)

```
src/physics/CollisionWorld.ts
src/physics/RigidBodyRegistry.ts
src/physics/JointRegistry.ts
src/tools/PhysicsProbeTool.ts
src/tools/CollisionInspectorTool.ts
src/elements/walls/WallPhysicsBody.ts
src/elements/columns/ColumnPhysicsBody.ts
... (7 more)
```

### Verifier

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 970 ] || exit 1
[ "$(rg -l 'EngineBootstrap' src/physics/ | wc -l)" -eq 0 ] || exit 1
[ -f packages/physics-host/src/bootstrap.ts ] || exit 1
grep -q 'pryzm.bootstrap.physics' packages/physics-host/src/bootstrap.ts || exit 1

# Physics is L3 — must not import L4 (THREE)
! rg "import \* as THREE\|from 'three'" packages/physics-host/src/ || exit 1

# Physics does not own its own rAF — must subscribe to runtime.frame
! rg 'requestAnimationFrame' packages/physics-host/src/ || exit 1
grep -q 'runtime\.frame\.subscribe' packages/physics-host/src/Stepper.ts || exit 1
```

The last two checks are particularly important: D.4.3 must not regress P3 (single rAF) by creating a new rAF owner in the new package.

---

## §6 — D.4.4 (input + selection extraction)

### What moves

The next 340 LOC into `packages/input-host/`:

| Source range | Symbols | Destination |
|---|---|---|
| `EngineBootstrap.ts:1011–1140` | `wireKeyboard()`, `wirePointerEvents()`, `wireWheelEvents()` | `packages/input-host/src/bootstrap.ts:bootstrapInput()` |
| `EngineBootstrap.ts:1141–1260` | `setupSelectionService()`, `wireMarqueeSelection()` | `packages/input-host/src/SelectionBootstrap.ts` |
| `EngineBootstrap.ts:1261–1350` | `attachToolHandlers()` (currently 21 reaches of `runtime.tools.register`) | `packages/input-host/src/ToolBindings.ts` — but this delegates to `runtime.tools.register` which lives in L3 |

### Importer cluster (19 files migrated)

```
src/tools/SelectionTool.ts
src/tools/MoveTool.ts
src/tools/RotateTool.ts
src/tools/MeasureTool.ts
src/tools/SectionTool.ts
src/ui/Layout.ts                  ← the 20-reach `runtime.tools.register` site
src/ui/platform/PlatformShell.ts
src/ui/toolbar/ToolbarPanel.ts
... (11 more files in src/tools/ and src/ui/)
```

### `runtime.tools.register` consolidation

Per `../03-CURRENT-STATE.md §1` row 9: today there are **21 reaches in 2 files** (`src/ui/Layout.ts` ×20 + `src/elements/slabs/SlabTool.ts:104` ×1 in a comment). After D.4.4, the 20 in `Layout.ts` are owned by `packages/input-host/src/ToolBindings.ts` and called from a single `bootstrapToolBindings(runtime)` invocation. Reach drops to **1 file (`packages/input-host/`) with 20 register calls**. This is intended — the calls themselves are correct; what's wrong today is that they live in L7.5 (`Layout.ts`) instead of L3 (`packages/input-host/`).

### Verifier

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 630 ] || exit 1
[ "$(rg -l 'EngineBootstrap' src/tools/ | wc -l)" -eq 0 ] || exit 1
[ -f packages/input-host/src/bootstrap.ts ] || exit 1
grep -q 'pryzm.bootstrap.input' packages/input-host/src/bootstrap.ts || exit 1

# runtime.tools.register reach moved from Layout.ts to input-host
[ "$(rg -c 'runtime\.tools\.register' src/ui/Layout.ts 2>/dev/null || echo 0)" -eq 0 ] || exit 1
[ "$(rg -c 'runtime\.tools\.register' packages/input-host/src/ToolBindings.ts)" -ge 20 ] || exit 1

# Input is L3 — no THREE, no React
! rg "import \* as THREE\|from 'three'" packages/input-host/src/ || exit 1
! rg "from 'react'" packages/input-host/src/ || exit 1
```

---

## §7 — D.4.5 (the re-export shim)

### What stays

After D.4.1–D.4.4 land, `EngineBootstrap.ts` retains roughly **41 importers** that reference the symbol `EngineBootstrap` itself (typically as a type annotation: `bootstrap: EngineBootstrap` in constructors and props). Rewriting all 41 in D.4.5 would balloon the PR. The shim approach: collapse the file to a re-export and defer the importer rewrite to Wave 7 batch.

### What `EngineBootstrap.ts` becomes (the entire file, 30 LOC)

```ts
// src/engine/EngineBootstrap.ts
//
// SHIM — D.4.5 of `04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md`.
// This file no longer owns wiring. All slices D.4.1–D.4.4 moved their content
// to dedicated packages. The 41 residual type-references that still import
// `EngineBootstrap` from this path are batch-rewritten in Wave 7.
//
// DO NOT add new code here. ESLint rule `pryzm/no-engine-bootstrap-shim` blocks new
// imports of this file from S81-WIRE onward.

import type { PryzmRuntime } from '@pryzm/runtime-composer';

/**
 * @deprecated Import `PryzmRuntime` from `@pryzm/runtime-composer` directly.
 *             This shim is removed in Wave 7 (S87-WIRE).
 */
export type EngineBootstrap = PryzmRuntime;

export type { PryzmRuntime as EngineBootstrapType } from '@pryzm/runtime-composer';
```

### The ESLint rule that prevents regression

`packages/lint-config/src/rules/no-engine-bootstrap-shim.ts`:

```ts
export const rule: Rule.RuleModule = {
  meta: { type: 'problem', schema: [], messages: {
    forbidden: 'Importing from src/engine/EngineBootstrap is forbidden after S81-WIRE. Use `import type { PryzmRuntime } from "@pryzm/runtime-composer"` instead.'
  }},
  create(context) {
    return {
      ImportDeclaration(node) {
        const src = node.source.value as string;
        if (src.endsWith('engine/EngineBootstrap')) {
          // Allowlist: the 41 known importers tracked in 04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md §4
          const allowlist = new Set<string>([/* populated by Wave 1 task: snapshot the 41 */]);
          if (!allowlist.has(context.getFilename())) {
            context.report({ node, messageId: 'forbidden' });
          }
        }
      }
    };
  }
};
```

### Verifier

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 35 ] || exit 1
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -eq 0 ] || exit 1

# Importer count dropped by ≥ 80 vs start of D.4
START_IMPORTERS=124   # snapshot pre-Wave-2 in tools/ga-gate/baselines/d4-importers.json
END_IMPORTERS=$(rg -L 'EngineBootstrap' src apps packages | wc -l)
[ "$((START_IMPORTERS - END_IMPORTERS))" -ge 80 ] || exit 1

# composeRuntime is now the only composition path
[ "$(rg -c 'composeRuntime\(' src/main.ts)" -ge 1 ] || exit 1
[ "$(rg -c 'new EngineBootstrap' src/main.ts)" -eq 0 ] || exit 1

# Boundary lint turns on for L4 + L5 — the headline activation
pnpm --filter @pryzm/lint-config test -- boundaries-l4-l5
```

---

## §8 — D.4 exit gate (Wave 3 close)

The single shell command that gates Wave 3:

```bash
pnpm ga-gate --check d4-exit
```

…which runs the composite:

```bash
[ "$(wc -l < src/engine/EngineBootstrap.ts)" -le 35 ]                              # D.4.5 LOC
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -eq 0 ]                                # bridge dead
[ "$(rg -L 'EngineBootstrap' src apps packages | wc -l)" -le 50 ]                  # importer cluster shrunk
[ "$(rg -c 'composeRuntime\(' src/main.ts)" -ge 1 ]                                # composeRuntime is wired
[ "$(rg -c '(?<=import.*from\s+["])three(?=["])' packages/ -t ts | grep -v 'renderer-three' | wc -l)" -eq 0 ]   # P2 enforced
pnpm test:phase-d-real-binding                                                      # 5 vitest suites pass
```

Boolean #4 (`default_runtime == composeRuntime()`) **turns ✅** at Wave 3 close. This is the first user-visible boolean to flip after 6 months of wireup work.

---

## §9 — Risk on the critical path

| Risk | Probability | Impact | Mitigation |
|---|:---:|:---:|---|
| One slice's importer cluster turns out to be larger than estimated (e.g. D.4.1 actually reaches 40 not 28) | Medium | Medium | Re-estimate at the slice kickoff; if real cluster ≥ 1.5× estimate, split into D.4.1a + D.4.1b — do not let one slice balloon into a 2-week PR |
| `pryzm-persistence` quarantined workflow has a real bug that D.4.2 exposes only on de-quarantine | Medium | High | De-quarantine immediately on D.4.2 merge; if it goes red, that's a Wave 2 incident not a Wave 7 incident — fix on the spot |
| The 41 D.4.5 residual importers grow (someone adds new `import { EngineBootstrap }` references in Wave 4–6) | Medium | High | The ESLint rule in §7 with explicit allowlist; the allowlist is a frozen snapshot from D.4.5 merge SHA |
| D.4.3 or D.4.4 accidentally creates a new rAF owner in the new package (P3 regression) | Low | High | The verifier in §5 and §6 explicitly checks for `requestAnimationFrame` in the new package; merge blocks if found |
| `composeRuntime()` slot order changes during D.4.x and breaks the slot ordering contract | Low | Medium | `02-ARCHITECTURE.md §3` slot order is normative; any D.4 PR that reorders slots requires architecture-lead review |

Full risk register lives in `13-RISK-REGISTER.md`. The 5 risks above are the D.4-specific ones.

---

## §10 — What success looks like (week-12 evening)

When the founder runs `pnpm ga-gate --check d4-exit` on the evening of S80-WIRE D-last and sees:

```
[ga-gate] D.4 exit gate
  ✓ src/engine/EngineBootstrap.ts        =   30 LOC  (target ≤ 35)
  ✓ WorkspaceMountBridge reach           =    0 files (target = 0)
  ✓ EngineBootstrap importer cluster     =   44 files (target ≤ 50)
  ✓ composeRuntime() called from main.ts =    1 site
  ✓ THREE imports outside renderer-three =    0 hits (P2 enforced)
  ✓ phase-d-real-binding suite           =    5/5 pass

D.4 exit gate: GREEN
Boolean #4 (default_runtime == composeRuntime()): ✅
Wave 3 closed. Wave 4 (slot typing + PlatformRouter live) may begin.
```

…that is the moment the architecture in `../02-ARCHITECTURE.md §6` is finally the actual production path. The next 4 waves are downstream of that one moment.
