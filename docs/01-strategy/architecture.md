# PRYZM — Architecture

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Rewrite basis**: full code audit, 2026-06-01.
> **Authority**: this doc owns the system shape, the boundary lint matrix, the composition root contract, the convergence definition, and the CI gates. **When code disagrees with this doc, the code is canonical** — this doc is the description, not the law; if it drifts from code, this doc is updated.
> **Foundation above**: [manifesto.md](./manifesto.md) → [product-vision.md](./product-vision.md) → [engineering-vision.md](./engineering-vision.md)
> **Per-package detail**: [architecture-breakdown.md](./architecture-breakdown.md)
> **Contracts**: [../02-decisions/contracts/](../02-decisions/contracts/) — 49 ratified contracts (C01–C49)

---

## §0 — How to read this doc

This doc describes PRYZM's architecture **as it exists in code at 2026-06-01**. The counts, file paths, and behaviours below are auditable against the repository. When the code changes, this doc must change in the same commit (per [operating-principles O4 + O5](./operating-principles.md)).

The doc is intentionally short. Per-package detail lives in [architecture-breakdown.md](./architecture-breakdown.md); per-decision rationale in [02-decisions/adrs/](../02-decisions/adrs/); per-subsystem rules in [02-decisions/contracts/](../02-decisions/contracts/).

---

## §1 — The layered model

PRYZM organises code into **nine production layers** (L0–L9) plus a transitional legacy zone (L7.5). Each layer has owner packages, a clear responsibility, and an enforced import allowlist.

```
┌──────────────────────────────────────────────────────────────────────┐
│  L7.5  src/  (7 files, 0 subdirs)  — TRANSITIONAL                    │
│         monotonically shrinking; current state = boot-shell.d.ts,    │
│         browser-entry.tsx, browser.css, familyCreatorPlaceholder.ts, │
│         global-window.d.ts, main.ts, three-addons.d.ts               │
│                                                                       │
│  L9    plugins/* (47)            ← may only import L8                │
│  L8    packages/plugin-sdk/      ← public SDK facade (@pryzm/sdk v1) │
│  L7    apps/* (13)               ← per-app UI surfaces                │
│  L6    packages/runtime-composer/, packages/ui-base/                  │
│  L5    packages/file-format/, packages/view-state/                    │
│  L4    packages/renderer/, render-runtime/, scene-committer/,         │
│         persistence-client/, sync-client/                             │
│  L3    packages/stores/                                               │
│  L2    packages/geometry-kernel/, packages/ai-host/,                  │
│         packages/constraint-solver/, packages/types-builtin/          │
│  L1    packages/command-bus/, frame-scheduler/, picking/,             │
│         visibility/, snapping/, spatial-index/, ai-cost/,             │
│         renderer-three/, input-host/, physics-host/,                  │
│         runtime-undo-stack/, drawing-primitives/, protocol/           │
│  L0    packages/schemas/         ← Zod schemas; no I/O, no THREE,    │
│                                    no DOM                             │
└──────────────────────────────────────────────────────────────────────┘
```

The **dependency rule** (CI-enforced via `eslint-plugin-boundaries`): a layer may import from any lower layer; never from a higher one. L7.5 is the only zone permitted to import from any other; this is the legacy concession and shrinks toward zero.

### §1.1 — Repository counts (verified 2026-06-01)

| Surface | Count | Path |
|---|---:|---|
| Packages | **79** | `packages/*/` |
| Apps | **13** | `apps/*/` |
| Plugins | **47** | `plugins/*/` |
| Contracts | **49** | `docs/02-decisions/contracts/C*.md` (C01–C49) |
| ADRs | **108** | `docs/02-decisions/adrs/*.md` |
| Specs | **56** | `docs/03-execution/specs/*.md` |
| Benchmarks | **68** | `apps/bench/src/benches/*.bench.ts` |
| CI gates | **21** | `tools/ga-gate/check-*.ts` |
| `src/` files | **7** | `src/` (no subdirs) |

The deep per-package inventory is in [architecture-breakdown.md §4](./architecture-breakdown.md).

---

## §2 — The boundary lint matrix

What each layer is allowed to import. CI-enforced via `eslint-plugin-boundaries` (configured in `eslint.config.js`).

| From ↓ → To | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| L0 (schemas) | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L1 (infra) | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L2 (domain) | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L3 (stores) | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L4 (scene+persist) | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| L5 (file+view) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| L6 (composer+ui-base) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ |
| L7 (apps) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| L8 (plugin-sdk) | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ❌ | — | ❌ |
| L9 (plugins) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — |

The L8 "subset" means `packages/plugin-sdk/` re-exports a curated subset of lower layers — plugins get the subset, never direct lower-layer access. This is the stable plugin contract: internals refactor freely; the L8 facade does not.

---

## §3 — The composition root contract

**One** entry point produces a runtime handle. Production code uses only this entry point. Implementation: `packages/runtime-composer/src/composeRuntime.ts` returns `Promise<ComposedRuntime>` (where `ComposedRuntime extends PryzmRuntime` adds `sceneReady: Promise<void>`).

The canonical interface (verified 2026-06-01 against `packages/runtime-composer/src/types.ts:3213`) is **~29 named slots + `audit` metadata + 2 phase-specific extensions** organised by addition phase:

### §3.1 — Wave-4 core slots (Slots 1–14 — the original typed surface)

```ts
interface PryzmRuntime {
  readonly audit:           RuntimeAudit;          // stamped on every command

  readonly scene:           SceneSlot;             // 1  — renderer + scheduler + host + materialPool
  readonly stores:          StoresSlot;            // 2  — typed stores umbrella
  readonly bus:             { dispatch, execute,   // 3  — CommandBus + registry + ringBuffer
                              register, registry,
                              ringBuffer,
                              setRingBuffer,
                              clearUndoStacks };
  readonly selection:       SelectionSlot;         // 4a
  readonly hover:           HoverSlot;             // 4b
  readonly projectContext:  ProjectContextSlot;    // 4c
  readonly tools:           ToolsSlot;             // 5  — tool state machine
  readonly picking:         PickingSlot;           // 6
  readonly physicsHost:     PhysicsHostSlot;       // 6b — broad-phase spatial query
  readonly inputHost:       InputHostSlot;         // 6c — pointer + wheel + keyboard
  readonly viewRegistry:    ViewRegistrySlot;      // 7
  readonly persistence:     PersistenceSlot;       // 8
  readonly sync:            SyncSlot;              // 9
  readonly visibility:      VisibilitySlot;        //    — wave-chain evaluator
  readonly ai:              AiSlot;                // 10
  readonly plugins:         PluginsSlot;           // 11 — contribution host
  readonly events:          TypedEventEmitter<RuntimeEvents>; // 12
  readonly toasts:          ToastsSlot;            // 13
  readonly userPreferences: UserPreferencesSlot;   // 14
```

### §3.2 — Phase C–D additions

```ts
  readonly undoStack:        UndoStackSlot;        // drives SaveUndoRedoHUD
  readonly workspace:        WorkspaceSlot;        // landing | hub | workspace surface
  readonly workspaceMode:    WorkspaceModeController; // 3d | plan | section
  readonly cameraController: CameraControllerSlot;
```

### §3.3 — Phase F slots 15–29 (S81 F.12 + Wave 14)

```ts
  readonly ifc:           IfcSlot;            // 15 — import/export/inspector
  readonly rhino:         RhinoSlot;          // 16 — .3dm reader
  readonly bcf:           BcfSlot;            // 17 — BCF 3.0 reader/writer
  readonly pdf:           PdfSlot;            // 18 — importer/exporter
  readonly auth:          AuthSlot;           // 19
  readonly shortcuts:     ShortcutsSlot;      // 20 — global keyboard
  readonly toast:         ToastSlot;          // 21 (canonical Wave-14)
  readonly debug:         DebugSlot;          // 22 — renderer dev overlay
  readonly export:        ExportSlot;         // 23 — ifc | glb | pdf | csv | panorama
  readonly entitlements:  EntitlementsSlot;   // 24 — gate
  readonly cde:           CdeSlot;            // 25 — CDE naming adapter
  readonly geospatial:    GeospatialSlot;     // 26 — projection
  readonly physics:       PhysicsDevSlot;     // 27 — dev-overlay metrics
  readonly structural:    StructuralSlot;     // 28 — analysis
  readonly search:        SearchSlot;         // 29 — full-text
```

### §3.4 — Domain-specific extensions

```ts
  readonly apartmentParameterPropagator: ApartmentParameterPropagator; // D-α-3 P3
  readonly familyRegistryStore:          FamilyRegistryStore;          // P0.3 slice B

  tearDown(): void;       // idempotent disposer in reverse order
}
```

**All slots typed.** No `unknown`. No `(window as ...)` reads. The contract is codified in [C02 — Composition Root & Boot](../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md). The slot count has grown from the original 14 (Wave 4) through Phase F (15–29) and now Phase D-α / P0.3 (apartment propagator + family registry) — the interface is the single source of truth.

The composer entry point:

```ts
export interface ComposeRuntimeInput {
  readonly audit: RuntimeAudit;
  // optional dependencies injected by the host environment
  readonly persistence?: PersistenceClient;
  readonly sync?: SyncClient;
  readonly renderer?: RendererHandle;
  readonly registries?: PluginRegistries;
}

export function composeRuntime(
  input: ComposeRuntimeInput
): Promise<ComposedRuntime>;
```

### §3.1 — Headless mode

`packages/headless/` (v1.0.0-rc.1, npm-publishable) exposes `headlessRuntime({ audit })` which calls `composeRuntime({ canvas: null })`. In headless mode `runtime.renderer === null` and `runtime.scene.canvas === null`; all data-half slots remain present (commands, stores, plugins, persistence, sync, AI, audit). Use cases: CI pipelines, Node.js integrations, IFC export automation.

---

## §4 — The eight architectural principles (P1–P8)

These are the binding rules. Each has a CI gate. Violations block merge. Detailed in [engineering-vision §2](./engineering-vision.md).

| # | Principle | Enforcement | Status |
|---|---|---|---|
| **P1** | Single composition root — production code obtains runtime via `composeRuntime()` only | `scripts/ci-check-single-compose.ts` | Soft-fail tripwire |
| **P2** | Single THREE owner — `import * as THREE` only in `packages/renderer-three/` (specifically `three-re-export.ts`) | `tools/ga-gate/check-three-imports.ts` + `eslint-plugin-boundaries` | Hard-fail ✅ |
| **P3** | Single rAF — `requestAnimationFrame()` called only in `packages/frame-scheduler/src/RafAdapter.ts` | `tools/ga-gate/check-raf-count.ts` | Hard-fail ✅ |
| **P4** | No `(window as any)` outside the allowlisted shim | `eslint-baseline-window-as-any.json` cast counter | Soft-fail tripwire |
| **P5** | Schemas are pure — `packages/schemas/` has zero I/O, zero THREE, zero DOM | `scripts/ci-check-domain-purity.ts` | Hard-fail ✅ |
| **P6** | Commands are the only mutation path — UI dispatches via `commandBus`; no direct store writes | `scripts/ci-check-no-direct-store-writes.ts` | Hard-fail ✅ |
| **P7** | Visibility intent ≠ UI state — `packages/visibility/` is domain, not UI | per-package contract test | Hard-fail ✅ |
| **P8** | Explicit sync conflicts + every public function has ≥ 1 OTel span | `tools/ga-gate/check-otel-spans.ts` | Hard-fail ✅ |

**Today**: 6 of 8 hard-fail. P1 + P4 are soft-fail tripwires (counter must not increase) moving to hard-fail at the relevant phase exits.

---

## §5 — The 21 CI gates

Located in `tools/ga-gate/check-*.ts`. Run by `tools/ga-gate/run-all.ts` and blocking on merge to main.

| Gate | What it checks |
|---|---|
| `check-apps-editor-ghost-dirs.ts` | Stale `apps/editor/src/app*/` dirs absent |
| `check-cast-count.ts` | Cast-count tripwire (no increase) |
| `check-commandmanager-any.ts` | Legacy `commandManager.any` absent |
| `check-ctrl-z-wired.ts` | Ctrl-Z undo path wired |
| `check-custom-event-apps.ts` | CustomEvent usage in apps bounded |
| `check-custom-event-packages.ts` | CustomEvent usage in packages bounded |
| `check-engine-bootstrap-loc.ts` | Bootstrap LOC budget |
| `check-geometry-ceiling.ts` | Ceiling geometry producer present |
| `check-l7-boundary.ts` | L7 (apps) boundary enforcement |
| `check-motion-gate-coverage.ts` | Motion animation coverage |
| `check-no-commandmanager.ts` | Legacy CommandManager absence |
| `check-no-workspacemountbridge.ts` | Deleted WorkspaceMountBridge absence |
| `check-otel-spans.ts` | OTel span audit per public function (P8) |
| `check-per-package-compile.ts` | Per-package isolated typecheck |
| `check-project-isolation.ts` | Project store isolation across switches |
| `check-raf-count.ts` | Single rAF call site (P3) |
| `check-scene-graph.ts` | Scene graph invariants |
| `check-structuredclone-new-commands.ts` | `structuredClone` usage in command snapshots |
| `check-three-imports.ts` | Single THREE owner (P2) |
| `check-window-store-in-packages.ts` | `window.<store>` absent in packages |
| `check-xss-guards.ts` | XSS sanitisation enforced |

The contract suite [C01–C49](../02-decisions/contracts/) introduces additional per-contract gates (e.g. `check-vector-pdf.ts` for C24+C29, `check-payout-formula.ts` for C40); those land per contract implementation.

---

## §6 — The 68 benchmarks (NFTs)

Located in `apps/bench/src/benches/*.bench.ts`. Run by `npx vitest` (Node) against fixture data. Per-bench JSON output; baseline regression gate. Categories:

| Category | Count | Examples |
|---|---:|---|
| Element geometry producers | 12 | `produce-wall.bench.ts`, `produce-door.bench.ts`, … |
| Pipeline gates | ~5 | `cold-boot.bench.ts`, `frame-budget.bench.ts`, `cmd-execute-latency.bench.ts`, … |
| Load perf | 4 | `load-small/medium/large`, `cold-load-real` |
| Interchange | 3 | `ifc-import-tier1`, `ifc-export-tier1`, `bcf-roundtrip` |
| Constraint/snap/pick | 3 | `constraint-solve`, `snap-latency`, `pick-latency` |
| Memory/CPU | ~3 | `memory-ceiling`, `cpu-idle`, … |
| Persistence | ~4 | `save`, `restore`, `undo`, … |
| UI overhead | ~3 | `auth-modal-open`, `tool-activate`, `panel-base-overhead` |
| Other | ~31 | `ai-cost`, `awareness-throughput`, `pdf-to-bim`, `sync-merge`, … |

The "17 headline NFTs" referenced in earlier docs was a curated subset for sprint-close review; the actual benchmark count is **68** and growing.

NFT targets are codified in [C10 — Performance & Observability](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md).

---

## §7 — Production startup flow

PRYZM boots in three stages. Stage 0 (App-Shell first paint) and Stage 2 (engine init on project open) serve NFT 1 (cold-boot to first paint < 2.5 s). Stage 1 is the runtime composition.

### Stage 0 — App-Shell first paint (< 100 ms, HTML parse only)

`index.html` contains inline `<style>` skeleton, inline `<script>` for auth-state detection (`localStorage` check), and `<script>window.__pryzmPendingActions = []</script>` for pre-boot CTA replay. The skeleton paints landing navbar + hero card + CTA before any module script runs. CSS prefix `lp-skel-*` is the carve-out from the AppTheme injection rule.

### Stage 1 — Runtime composition + landing/hub mount (Vite resolves dep graph)

```
src/main.ts
  → bootPlatform() Phase A (paint-fast):
      const runtime = await composeRuntime({ persistence, sync, renderer, registries, audit })
      panelManager.setRuntime(runtime)
      PlatformRouter.start(runtime)
  → bootPlatform() Phase B (deferred, post-paint):
      UiPreferences.setRuntime(runtime)
      gridDrawingHUD.setRuntime(runtime)
      dataCommandCenter.setRuntime(runtime)
      new PlatformShell(deferredSave, deferredLoad, runtime)
  → workspaceMount.{ensure,show}() awaits Phase B before Stage 2
```

### Stage 2 — Engine init (lazy; only on project-open click)

```
workspaceMount.ensure() → loadEngine() → apps/editor/src/engine/engineLauncher.ts
  → reads composed runtime via PryzmRuntime injection
  → wires scheduler (FrameScheduler)
  → instantiates scene-committer + renderer (renderer-three)
  → apps/editor/src/ui/app.ts mounts viewport panels
```

The engine half of L7.5 has migrated to `apps/editor/src/{engine,ui}/` (already done — `src/` root no longer has these subdirs, only the 7 transitional files). The pre-Wave-7 `src/engine/EngineBootstrap.ts` is deleted.

---

## §8 — The convergence definition

PRYZM as a single coherent product exists when these booleans hold at the same git SHA:

```
( legacy_src_files ≤ 7 )                            // src/ shrinks toward 0
AND ( window_any_in_apps ≤ baseline )               // cast tripwire holds
AND ( raf_owners_outside_frame_scheduler == 0 )     // P3
AND ( default_runtime === composeRuntime() )        // P1
AND ( EngineBootstrap_LOC == 0 )                    // legacy god file gone
AND ( all_ga_gate_workflows_green == true )         // 21 CI gates pass
AND ( plugin_sdk_published == true )                // @pryzm/sdk npm
AND ( headless_published == true )                  // @pryzm/headless npm
AND ( marketplace_live == true )                    // marketplace.pryzm.app
```

**Current state (verified 2026-06-01)**:
- legacy src files: 7 (down from 35+)
- raf owners outside frame-scheduler: 0 ✅
- composeRuntime is the default ✅
- EngineBootstrap.ts deleted ✅
- 21 CI gates green ✅
- @pryzm/sdk v1.0.0 in `packages/plugin-sdk/package.json` with publishConfig (pending `pnpm publish`)
- @pryzm/headless v1.0.0-rc.1 ready (pending `pnpm publish`)
- `apps/marketplace/` + `apps/marketplace-web/` shipped; marketplace.pryzm.app DNS pending

The remaining work is operational (npm publish + DNS), not architectural.

---

## §9 — The 49 contracts (binding rules)

Every binding architectural rule lives in a numbered contract. The suite is indexed in [02-decisions/contracts/README.md](../02-decisions/contracts/README.md). Summary by domain:

| Domain | Contracts | Status |
|---|---|---|
| **Core platform** (architecture, composition, schemas, rendering, persistence, UI, plugin SDK, security) | C01–C08 | CANONICAL |
| **Platform extensions** (AI, perf+obs, element creation, geospatial, project lifecycle, legacy elimination) | C09–C14 | CANONICAL |
| **Element semantics** (hosted elements, command authoring, batch catalogue, element preview) | C15–C18 | CANONICAL |
| **Site + climate + privacy + provenance** | C19–C23 | DRAFT 2026-06-01 |
| **Output + interchange** (sheets, IFC, Revit, inspect, data, PDF, drawing-set) | C24–C30 | DRAFT |
| **Documentation authoring protocol** | C31 | DRAFT |
| **Interchange + production** (DXF, Rhino, print, COBie, clash, schedule, cost) | C32–C38 | DRAFT |
| **Commerce** (pricing, marketplace, telemetry, support) | C39–C42 | DRAFT |
| **Accessibility + device** (WCAG, mobile, browser-matrix, i18n) | C43–C46 | DRAFT |
| **Operational** (versioning, backup+DR, multi-region) | C47–C49 | DRAFT |

The CANONICAL suite (C01–C18) is enforced today. The DRAFT suite (C19–C49) is the published implementation roadmap.

---

## §10 — Cross-cutting subsystems (by contract)

Reading the contracts is the way to understand a subsystem. The following table maps every major subsystem to its binding contract + primary owner code:

| Subsystem | Contract | Owner code |
|---|---|---|
| Composition root | [C02](../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md) | `packages/runtime-composer/` |
| Commands + stores | [C03](../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md) | `packages/command-bus/`, `packages/stores/`, `packages/schemas/` |
| Rendering | [C04](../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) | `packages/renderer-three/`, `packages/frame-scheduler/`, `packages/scene-committer/` |
| Persistence + file format | [C05](../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md) | `packages/persistence-client/`, `packages/file-format/` (`.pryzm` ZIP) |
| UI shell + tools | [C06](../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md) | `packages/ui-base/`, `packages/ui/`, `apps/editor/src/ui/` |
| Plugin SDK + marketplace | [C07](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) | `packages/plugin-sdk/` (v1.0.0), `apps/marketplace/`, `apps/marketplace-web/` |
| Collab + security | [C08](../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md) | `packages/sync-client/`, `apps/sync-server/`, server.js auth+OAuth |
| AI host | [C09](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) | `packages/ai-host/` (7 workflows), `packages/visibility/`, `packages/ai-cost/` |
| Perf + observability | [C10](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) | `apps/bench/` (68 benches), OTel via `@opentelemetry/*` |
| Element creation pipeline | [C11](../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md) | command-bus → handlers → stores → scene-committer → renderer-three |
| Geospatial | [C12](../02-decisions/contracts/C12-GEOSPATIAL.md) | `packages/geospatial/` (LTP-ENU, IfcProjectedCRS, proj4), `plugins/geospatial/` (Cesium bridge) |
| Project lifecycle + isolation | [C13](../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | `server/projectStore.js`, `packages/persistence-client/` |
| Legacy elimination | [C14](../02-decisions/contracts/C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md) | The cast tripwire baseline; the L7.5 src/ shrinkage |
| Hosted elements (door/window in wall) | [C15](../02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md) | `packages/geometry-wall/`, `packages/geometry-door/`, `packages/geometry-window/` |
| Command authoring protocol | [C16](../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) | Every `plugins/*/src/handlers/*` |
| Batch creation catalogue | [C17](../02-decisions/contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | `apps/editor/src/ui/CreatePanelLayout.ts` + per-element batch handlers |
| Element preview visual | [C18](../02-decisions/contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) | `packages/core-app-model/src/preview/PreviewStyle.ts` (canonical `#6600FF`) |

---

## §11 — Element creation pipeline

All element creation — whether from a user gesture (click tool, draw segment), an AI workflow (generate floor plan from prompt), or remote sync (collaborator's mutation) — follows the same pipeline. The three paths converge at the command bus; from there the flow is identical.

```
USER GESTURE             AI WORKFLOW              REMOTE SYNC
─────────────────        ─────────────────        ─────────────────
Tool.onPointerUp()       ai-host/ workflow        sync-client/ replay
     │                        │                        │
     │ commandBus.dispatch    │ commandBus.dispatch    │ commandBus.dispatch
     │  ('wall.create',       │  ('wall.batch.         │  ('wall.create',
     │   { …,                 │    create', { …,       │   { …,
     │   source:'user' })     │   source:'ai' })       │   source:'remote' })
     └────────────────────────┴────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  packages/command-bus/│  (L1)
                  │  dispatch(typeId,     │
                  │    payload, meta)     │
                  └───────────┬───────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  Command Handler      │
                  │  plugins/*/handlers/  │
                  │  • validates domain   │
                  │  • Immer draft →      │
                  │    packages/stores/   │
                  │  • schedules geometry │
                  │    via FrameScheduler │
                  │  • emits typed event  │
                  └───────────┬───────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
       ┌──────────────────┐   ┌───────────────────────┐
       │ Geometry build   │   │ Event subscribers     │
       │ FrameScheduler   │   │ e.g. plugins/rooms/   │
       │ pre-render slot  │   │ → rooms.redetect      │
       │ → geometry-      │   │   (async, per-level,  │
       │   kernel produce │   │    frame-yielded)     │
       │ → scene-committer│   └───────────────────────┘
       │ → SceneRegistry  │
       │ → InstancedMesh  │
       └──────────────────┘
```

Full contract: [C11](../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md). The pipeline is identical across all 14 element types (wall, door, window, slab, ceiling, floor, roof, column, beam, stair, handrail, curtain-wall, lighting, plumbing, structural, furniture).

---

## §12 — Public API surface (post-GA)

What plugin developers, headless integrators, and customers consume:

1. **`@pryzm/sdk`** — `packages/plugin-sdk/` v1.0.0; 2067+ LOC; descriptor, lifecycle, Ed25519 signing, 6 host proxies (Command, Store, View, File, AI, Network), iframe sandbox with CSP, `pryzm dev` CLI, bSDD lookup client. `publishConfig.name=@pryzm/sdk`. Manual step: `pnpm --filter @pryzm/plugin-sdk publish --access public`.
2. **`@pryzm/headless`** — `packages/headless/` v1.0.0-rc.1; `composeHeadlessRuntime` alias + vitest tests. Manual step: publish to npm.
3. **REST + WebSocket API** — server.js routes (45+ endpoints across `/api/auth`, `/api/projects`, `/api/ai`, `/api/stripe`, `/marketplace/api`, `/api/v1/families`); Socket.io for real-time.
4. **`.pryzm` file format** — ZIP container; manifest.json + events/*.evt.bin (MessagePack) + chunks/<sha256>.glb (content-addressed); SPEC-26 normative.
5. **`.pryzm-family` file format** — ZIP container; manifest.json + document.json + event-log.ndjson + ifc-mapping.json + signing/{schema-hash,signature}; SPEC-FAMILY-FORMAT normative.
6. **IFC4X3 export** — `plugins/ifc-export/` + `packages/file-format/src/ifc/`; round-trip tested nightly against 10 reference projects.
7. **Marketplace** — `marketplace.pryzm.app` (DNS pending); plugin browse/install/purchase + family browse/download.

---

## §13 — What this document is NOT

- Not the strategic intent → [manifesto.md](./manifesto.md), [product-vision.md](./product-vision.md), [positioning.md](./positioning.md)
- Not the engineering principles narrative → [engineering-vision.md](./engineering-vision.md)
- Not the per-file inventory → [architecture-breakdown.md](./architecture-breakdown.md)
- Not the per-decision rationale → [02-decisions/adrs/](../02-decisions/adrs/) (108 ADRs)
- Not the per-system normative spec → [03-execution/specs/](../03-execution/specs/) (56 specs)
- Not the sprint plan or roadmap → [03-execution/plans/](../03-execution/plans/)
- Not the live status snapshot → [03-execution/status/](../03-execution/status/)
- Not the customer-facing brand surface → [apps/docs-site/](../../apps/docs-site/)

This document is **the shape of the system, the binding rules, the lint gates, and the convergence definition** — kept short on purpose. Per-decision detail belongs in ADRs; per-contract detail belongs in contracts; per-package detail belongs in the breakdown.

---

## §14 — When to update this doc

This doc updates when **the code changes its shape**. Specifically:

- New layer or layer-renumbering → update §1 + §2
- New CI gate added → update §5
- New principle added → update §4 (and engineering-vision §2)
- Convergence boolean added/removed → update §8
- Composition root signature change → update §3
- Repository count drift > 5 % from §1.1 — update §1.1

For drift, the discipline is: **edit this canonical doc; do not write a `*-AUDIT-YYYY-MM-DD.md` alongside it** (per [C31 §1.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) + [operating-principles O5](./operating-principles.md)).

---

*End — PRYZM Architecture, 2026-06-01 — CANONICAL.*
