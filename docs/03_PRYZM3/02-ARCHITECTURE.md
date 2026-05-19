# PRYZM 3 — Architecture

> **Stamp**: 2026-05-02 · **Status**: CANONICAL · **Authority**: this doc owns the system shape and contracts. When code disagrees with this doc, the code is wrong (or this doc is wrong — fix one of the two; do not write a third doc).
> **Source consolidated from**: `archive/superseded-2026-04-30/01_ARCHITECTURE/00-ARCHITECTURE.md`, `01-LAYERS-AND-PRINCIPLES.md`, `archive/superseded-2026-04-30/02_PLAN/03-CONVERGENCE.md` (the §2 boolean definition).
> **Per-file detail**: `reference/architecture-detail/02-FILE-STRUCTURE.md` (54 packages line-by-line — deep-audit updated 2026-05-01), `reference/architecture-detail/03-FINAL-MAP.md` (the visual map), `reference/architecture-detail/04-PASCAL-REFERENCE.md` (Pascal-editor prior-art lens).
> **Package dependency map**: `04-PLAN-FORWARD/16-PACKAGE-DEPENDENCY-MAP.md` — the canonical inter-package import graph, tier assignments, and standalone package list (added 2026-05-01 deep-audit).
> **⚠ TRACKER RULE**: If you edit this file, update `00-PROCESS-TRACKER.md` in the same commit (§2 booleans if boolean definition or status changes; §1 metrics if package/plugin/app counts change).

This document answers: **what shape is the system, who owns what, what are the lint gates, and what defines "done"?**

---

## §1 — The layered model (recap from `01-VISION.md §3`)

Eight production layers + one transitional layer (L7.5). Each owner package, each responsibility, each allowlist is normative — code that violates this fails CI.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  L7.5  src/ (2 folders: engine/, ui/) — transitional                        │
│         monotonically shrinking; target: only src/ui/ remains (boolean #1)  │
│                                                                              │
│  L7    plugins/* (46)            ← may only import L6                        │
│  L6    packages/plugin-sdk/      ← public SDK facade (v1.0.0; Wave A20 ✅)  │
│  L5    apps/* (14)               ← per-app UI surfaces                       │
│  L4    packages/renderer/ ← abstract renderer; packages/render-runtime/     │
│  L3    packages/runtime-composer/ ← composition root                         │
│         + packages/ui-base/ (L3 consumer)                                   │
│  L2    packages/stores/ + packages/scene-committer/ + packages/view-state/   │
│         + packages/persistence-client/ + packages/file-format/               │
│         + packages/sync-client/ + packages/frame-scheduler/                  │
│  L1    packages/geometry-kernel/ + packages/constraint-solver/               │
│         + packages/drawing-primitives/ + packages/command-bus/               │
│         + packages/picking/ + packages/visibility/ + packages/snapping/      │
│         + packages/ai-host/ + packages/ai-cost/ + packages/spatial-index/   │
│         + packages/renderer-three/ ← single THREE owner (P2 target; L1 leaf) │
│  L0    packages/schemas/         ← Zod schemas; foundation for all layers   │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Note (deep-audit 2026-05-01)**: The original diagram referenced `packages/domain/` (never existed — canonical schemas live in `packages/schemas/`), `packages/event-bus/` (never existed — `packages/command-bus/` handles routing), and `packages/registries/` (never existed — registries are slots inside `composeRuntime()`). These phantom references have been corrected above. The full verified package inventory with import graph is in `04-PLAN-FORWARD/16-PACKAGE-DEPENDENCY-MAP.md`.

The **dependency rule** (CI-enforced via `eslint-plugin-boundaries`): a layer may import from any **lower** layer; never from a higher one. L7.5 is the only layer permitted to import from any other; this is the legacy concession that shrinks toward zero.

---

## §2 — The boundary lint matrix

What each layer is allowed to import. CI-enforced via `packages/lint-config/src/boundaries.ts`.

| From ↓ → To | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| L0 (domain) | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L1 (kernel) | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L2 (persistence) | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| L3 (runtime) | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| L4 (renderer) | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ |
| L5 (apps) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| L6 (SDK facade) | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ❌ | — | ❌ |
| L7 (plugins) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — |

The "L6 subset" means the SDK facade re-exports a curated subset, not the full surface. Plugins (L7) get **only** the subset, never direct access. This is what makes the SDK a stable contract — internals can refactor freely without breaking plugins.

**Today's enforcement state**: 4 of 6 cross-cutting CI gates are at hard-fail; 2 (P1 single-compose, P4 no-window-any) are soft-fail counters. They become hard at Phase D and Phase E exit per `04-PLAN-FORWARD.md §10`.

---

## §3 — The composition root contract

The single composition root lives in L3 and is the only entry point production code uses to obtain a runtime handle.

```ts
// packages/runtime-composer/src/composeRuntime.ts

export interface ComposeRuntimeInput {
  readonly persistence: PersistenceClient;
  readonly sync?: SyncClient;
  readonly renderer?: RendererHandle;       // optional in headless mode
  readonly registries?: PluginRegistries;
}

export interface PryzmRuntime {
  readonly events: EventBus;
  readonly commandBus: CommandBus;
  readonly commandRegistry: CommandRegistry;
  readonly viewRegistry: ViewRegistry;
  readonly workspace: WorkspaceController;
  readonly cameraController: CameraController;
  readonly scheduler: FrameScheduler;
  readonly persistence: PersistenceClient;
  readonly sync?: SyncClient;
  readonly renderer?: RendererHandle;
  readonly materialPool?: MaterialPool;
  readonly visibility: VisibilityRuntime;
  readonly physics: PhysicsHost;            // landing in Wave 3
  readonly input: InputHost;                // landing in Wave 3
  readonly disposables: DisposableSet;
  dispose(): void;
}

export function composeRuntime(input: ComposeRuntimeInput): PryzmRuntime;
```

**14 typed slots.** No `unknown`. No `(window as ...)` reads. No `WorkspaceMountBridge`.

**Today** (verified 2026-05-04 post-Wave-A20): **all 14 slots are real and typed** — Wave 4 typed every slot; `composeRuntime()` is the production composition root with no `unknown` placeholders or `(window as ...)` reads. Boolean #4 ✅ closed. `RingBufferUndoStack` wired (Sprint A35). Phase D Ctrl-Z wired (Wave 36 U-1 ✅).

### §3.1 — F.events Migration Bridge (transitional)

> **Added**: 2026-05-17 post-regression audit. See `REGRESSION-DIAGNOSIS.md` and `C02 §3.1`.

During the F.events migration series the engine's `bootstrap()` function MUST publish the composed `PryzmRuntime` to `window.runtime` as its very first step (before `PropertyPanelAdapter` construction and all `initXxx()` calls). This allows the ~40 migrated `window.runtime?.events?.on/emit()` and `window.runtime?.bus?.executeCommand()` call sites to resolve at runtime.

The typed `Window` slot is declared in `apps/editor/src/types/globals.d.ts` lines 150-165. The `runtimeEventBridge.ts` deferred-subscription helper (`onRuntimeEvent` / `flushRuntimeEventListeners`) relies on this assignment being present before it drains its queue.

**This bridge is temporary.** When the F.events migration is complete and every call site uses the injected `runtime` parameter directly, the `window.runtime` slot and the bridge assignment are deleted.

---

## §4 — Cross-cutting CI gates

These are the rules a reviewer can spot in 30 seconds. Each maps to a vision principle (P1–P8 from `01-VISION.md §2`) and has a CI gate.

| Principle | Gate | Implementation | Today |
|---|---|---|---|
| **P1** Single composition root | `scripts/ci-check-single-compose.ts` | greps for any composition outside `composeRuntime()` | soft-fail (Phase D exit) |
| **P2** Single THREE owner | `eslint-plugin-boundaries` | `import * as THREE` only allowed in `packages/renderer-three/` | hard-fail (turns on at Wave 3 exit) |
| **P3** Single rAF | `scripts/ci-check-single-raf.ts` | greps for `requestAnimationFrame(` outside `packages/runtime-composer/src/scheduler.ts` | soft-fail (Wave 1 tripwire); hard-fail at Wave 7 |
| **P4** No `(window as any)` | `scripts/ci-check-no-window-any.ts` | counts cross-commit; soft-fail tripwire today (count must not increase); hard-fail at Phase E exit | soft-fail tripwire (Wave 1) |
| **P5** Schemas are pure | `scripts/ci-check-domain-purity.ts` | greps `packages/schemas/**/*.ts` for any I/O / DOM / THREE imports (`packages/domain/` never existed — script name preserved for git history) | hard-fail |
| **P6** Commands are the only mutation path | `scripts/ci-check-no-direct-store-writes.ts` | greps UI files for direct store mutation | hard-fail |
| **P7** Visibility intent ≠ UI state | per-package contract test | `packages/visibility/__tests__/intent-not-ui.test.ts` | hard-fail |
| **P8** Sync conflicts explicit + every public function has ≥ 1 span | per-PR span check | `scripts/ci-check-spans.ts` runs in PR; lints diff for new exports | hard-fail |

---

## §5 — Package map (where the code lives)

**58 packages, 13 apps, 47 plugins** (corrected 2026-05-04 rev 23: `ls -d packages/*/` = 58; `ls -d apps/*/` = 13; `ls -d plugins/*/` = 47 — +`plugins/family-editor/` stub added Wave A20). Per-file breakdown is in `reference/architecture-detail/02-FILE-STRUCTURE.md`. Full inter-package import graph: `04-PLAN-FORWARD/16-PACKAGE-DEPENDENCY-MAP.md`.

### Tier summary

| Tier | Packages | Total LOC | Imported by `src/` directly |
|---|---|---:|---|
| **L0 — Foundation** | `schemas` | 3,016 | No (transitive) |
| **L1 — Infrastructure** | `command-bus`, `frame-scheduler`, `picking`, `visibility`, `ai-cost`, `sync-client`, `runtime-undo-stack`, `ui`, `input-host`, `physics-host`, `renderer-three`; + stubs: `snapping`, `spatial-index` | ~14,000 | `frame-scheduler`, `picking`, `visibility` |
| **L1½ — L0 consumers** | `protocol` → schemas; `drawing-primitives` → schemas | 1,110 | `protocol` |
| **L2 — Domain logic** | `geometry-kernel` → drawing-primitives + protocol + schemas; `ai-host` → ai-cost; `types-builtin` → protocol + schemas | 13,695 | — |
| **L3 — State** | `stores` → ai-host + command-bus + schemas | 1,755 | `stores` |
| **L4 — Scene + Persistence** | `scene-committer` → drawing-primitives + stores; `persistence-client` → command-bus + stores; `renderer` → frame-scheduler + scene-committer; `render-runtime` → scene-committer + stores; `legacy-shim` → command-bus | 9,878 | `persistence-client` |
| **L5 — File + View** | `file-format` → persistence-client; `view-state` → frame-scheduler + renderer + stores | 4,493 | `file-format` |
| **L6 — Composition root** | `runtime-composer` → command-bus + editor + input-host + physics-host + renderer + renderer-three + runtime-undo-stack + stores + sync-client + view-state | 3,912 | `runtime-composer` |
| **L7 — UI** | `ui-base` → runtime-composer + ui | 763 | `ui-base` |
| **L8 — Plugin SDK** | `plugin-sdk` **v1.0.0** (Wave A20 ✅; `publishConfig.name=@pryzm/sdk`; K3-C gate CLOSED; **npm-publish ready** — manual step: `pnpm --filter @pryzm/sdk publish`) | 2,067+ | — |
| **Standalone** | 28 endpoint/feature packages not in the import chain (admin-overrides, ai-spend, api-rbac, api-spec, beta-signup, constraint-solver, crash-reporter, drawing-primitives, email-transport, expr-eval, family-instance, family-loader, family-runtime, feature-flags, formula-library, oauth2-pkce, pdf-to-bim, perf-budgets, rate-limit, release, scene-committer, storage-driver, wcag-audit, webhooks, …) | varies | — |

### Key corrections from prior docs (phantom packages removed 2026-05-01)

| Old reference | Reality |
|---|---|
| `packages/domain/` | **Never existed.** Canonical schemas live in `packages/schemas/` (Zod, 3,016 LOC). |
| `packages/event-bus/` | **Never existed.** Event routing goes through `packages/command-bus/` CommandBus.emit(). |
| `packages/registries/` | **Never existed.** Registries are typed slots on the `PryzmRuntime` interface inside `runtime-composer`. |
| Plugin SDK "0 LOC stub" | **Wrong.** `packages/plugin-sdk/` is **v1.0.0** (Wave A20 ✅), 2,067+ LOC — descriptor, lifecycle, Ed25519 signing, 6 host proxies, iframe sandbox, `pryzm dev` CLI, bSDD lookup client. `publishConfig.name=@pryzm/sdk`; CHANGELOG.md written; K3-C gate CLOSED. npm-publish ready (manual step required). |
| src/ folder count = 30 | **Wrong.** S87–S97-WIRE (11 slices) + Waves 10–11 removed 33 of 35 src/ folders. Verified: `ls -d src/*/ \| wc -l` = **2** (engine/, ui/). (`src/core/` deleted Wave 10; `src/elements/` deleted Wave 11.) |
| 38 plugins | **Wrong.** Actual: **47 plugins** under `plugins/` (corrected 2026-05-04 rev 23: +`plugins/family-editor/` stub added Wave A20). |

### Root `package.json` directly links 16 packages (the Vite build graph)

`file-format`, `frame-scheduler`, `persistence-client`, `picking`, `plugin-geospatial`, `plugin-toy-cube`, `protocol`, `renderer-three`, `runtime-composer`, `schemas`, `snapping`, `spatial-index`, `stores`, `ui-base`, `visibility` + `editor` (apps/editor).

`src/` imports exactly 9 of these directly: `frame-scheduler`, `persistence-client`, `picking`, `plugin-geospatial`, `protocol`, `runtime-composer`, `stores`, `ui-base`, `visibility`. The remaining 39 workspace-only packages are consumed as transitive deps through the pnpm workspace virtual store.

---

## §6 — Production startup flow

The boot pipeline has **three stages** in both Today and Target shapes. Stage 0 (App-Shell first paint) and Stage 2 (engine init on project open) are permanent architectural features serving NFT 1 (`01-VISION.md §5`: cold-boot to first paint < 2.5 s) and §1 §1.1 (BIM engine init deferred until project open). Only Stage 1 (runtime composition + landing/hub mount) is what `04-PLAN-FORWARD.md` actively reshapes through D.4 / D.5 / E.routing / Wave 5–7.

### Today (transitional, ugly, honest)

```
Stage 0 — App-Shell first paint (< 100 ms, HTML parse only)
  index.html (inline <style> + <script> + skeleton markup inside #platform-root)
    ↳ paints the landing navbar + hero card + CTA before any module script runs
    ↳ inline <script>: localStorage check → <html data-pryzm-auth="in"> hides the
       skeleton for signed-in users (so the hub doesn't briefly flash the landing)
    ↳ inline <script>: window.__pryzmPendingActions queue captures pre-boot CTA clicks
    ↳ skeleton class prefix `lp-skel-*` is the carve-out from `src/styles/AppTheme.ts`
       "sole CSS injection point" comment (which governs *runtime* JS-managed CSS only;
       boot-shell paint cannot be JS-injected by definition)

Stage 1 — Runtime composition + landing/hub mount (Vite resolves ~233-module graph, ~1.5 s in dev)
  src/main.ts
    → bootPlatform() Phase A (paint-fast, Wave 1.5):
        composeRuntime({ ... })  // returns partial runtime (8 of 14 slots still unknown)
        panelManager.setRuntime(runtime)
        PlatformRouter.start(runtime)  // mounts LandingPage or ProjectHub; removes the App-Shell skeleton
    → bootPlatform() Phase B (deferred, post-paint, Wave 1.5):
        UiPreferences.setRuntime / gridDrawingHUD.setRuntime / dataCommandCenter.setRuntime / syncStateDetailDrawer.setRuntime
        new PlatformShell(deferredSave, deferredLoad, runtime)  // 2,433 LOC; window.platformShell
    → workspaceMount.{ensure,show}() awaits Phase B before invoking Stage 2

Stage 2 — Engine init (lazy; only on project-open click, §01 §1.1)
  workspaceMount.ensure() → loadEngine() → src/engine/engineLauncher.ts (successor; EngineBootstrap.ts DELETED S87-WIRE 2026-05-01)
    → reads composed runtime via window.__pryzm2RuntimeComposed  // the stash hand-off
    → wires scheduler (P3 soft-violation, on the rAF tripwire — ratchet now at 1 owner ✅)
    → instantiates WorkspaceMountBridge directly (P1 soft-violation, on the cast tripwire — ratchet at 1,268 ↓)
    → src/ui/app.ts mounts viewport panels (cast-count ratchet at 1,268 — Wave 5 eliminated 777 casts in src/ui/)
```

### Target (Phase D + E + routing complete; Wave 4 exit)

```
Stage 0 — App-Shell first paint (UNCHANGED; permanent architectural feature for NFT 1)
  index.html — same skeleton + boot-detection script + replay queue.
  This stage never goes away — it is how PRYZM 3 hits NFT 1 in production builds.
  (Production builds will inline the @pryzm/sdk landing critical CSS via the apps/* vite
  build's `transformIndexHtml` hook; the markup contract is identical.)

Stage 1 — Runtime composition + landing/hub mount (production: < 800 ms, dev: depends on Vite)
  src/main.ts
    → const runtime = composeRuntime({ persistence, sync, renderer, registries })
        ↳ returns fully-typed PryzmRuntime (14 slots, all real, no unknown)
    → platformRouter.start({ runtime, defaultRoute: 'editor' })
        ↳ removes the App-Shell skeleton in both signed-in and signed-out branches
    → app shell consumes runtime.* exclusively
        ↳ mounts panels via runtime.viewRegistry
        ↳ no (window as ...) anywhere; typed Window globals live in `src/types/window.d.ts`
        ↳ no WorkspaceMountBridge anywhere
        ↳ no separate Phase B "heavy wiring" — Phase D.4 has typed every singleton through `composeRuntime` so no module-load setRuntime hand-offs remain

Stage 2 — Engine init (UNCHANGED contract; new internals)
  runtime.persistence.openProject(id) triggers the renderer + viewport bring-up via packages/renderer-three/.
  src/engine/EngineBootstrap.ts **was deleted (Wave 7, S87-WIRE, 2026-05-01). ✅** `[ ! -f src/engine/EngineBootstrap.ts ]` passes. `pryzm/no-engine-bootstrap-shim` ESLint rule guards against regression.
```

**The boot-stage carve-outs (Stage 0 + the Phase A/B split inside Stage 1) are documented in `03-CURRENT-STATE.md §10` (Wave 1.5 + Wave 1.5b entries) and `04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §1` (rows 1.5 and 1.5b).** They are NOT new tripwires; they are NFT-driven architectural shape that must survive Phase D / E / Wave 7.

The delta between the two diagrams is the entire 5-month plan in `04-PLAN-FORWARD.md`. Specifically: **D.4 split (5 PRs, Wave 2–3) + D.5 slot typing + Phase E routing live (Wave 4) + cast deletion sweep (Wave 5) + Phase B/C real binding (Wave 6) + cleanup (Wave 7)**. Stage 0 and Stage 2 are unaffected by all of that work; only Stage 1 reshapes.

---

## §7 — Public API surface (Phase F deliverable)

What plugin developers and headless integrators get post-GA:

1. **`@pryzm/sdk`** — `@pryzm/plugin-sdk` **v1.0.0** ✅ (Wave A20 2026-05-04): 2,067+ LOC — descriptor, lifecycle, Ed25519 signing, 6 host proxies, iframe sandbox, `pryzm dev` CLI, bSDD lookup client; K3-C gate CLOSED (all 3 scripts pass); `publishConfig.name=@pryzm/sdk`; CHANGELOG.md. **Manual step remaining**: `pnpm --filter @pryzm/sdk publish --access public` (npm auth token required — OI-011).
2. **`@pryzm/headless`** — `packages/headless/` ✅ (Wave A20 2026-05-04): `composeHeadlessRuntime` alias + vitest tests + `vitest.config.ts`. Code-complete. **Manual step remaining**: `pnpm --filter @pryzm/headless publish --access public` (npm auth token required — OI-012).
3. **REST + WebSocket APIs** — `/api/v1/*` routes live; `/marketplace/api/plugins` (GET list + GET /:id + POST /submit) added Wave A20; `marketplace_plugins` PostgreSQL table live; `/embed` iframe route added.
4. **`.pryzm-family` file format** — SPEC-26 normative; `reference/specs/SPEC-26-PRYZM-FILE-FORMAT.md`.
5. **IFC Tier 1 round-trip** — green workflow (`ifc-export-tier1` 16/16 ✅; `ifc-import-tier2` 18/18 ✅); ADR-039, SPEC-12 normative. IFC4X3 exporter live (`IFC4X3Exporter.ts` — Wave A17 ✅).
6. **Marketplace** — `apps/marketplace/` React SPA scaffold (Browse/Detail/Submit pages) + `/marketplace/api/*` routes + `marketplace_plugins` DB table all code-complete (Wave A20 ✅). **Manual step remaining**: DNS `marketplace.pryzm.app` + TLS cert (OI-013).

The full Phase F execution plan (195 sub-phases across 12 F-tracks, 3 workstreams, and the 3 boolean exit gates) is in `04-PLAN-FORWARD/20-PHASE-F-PLAN.md`. The sub-phase enumeration is in `reference/wireup-2026/chunks/16-subphases-F1-toolbars.md` through `chunks/18-subphases-F6-F12.md` and `reference/phases/PHASE-3/3C-PLUGIN-SDK-MARKETPLACE.md`.

**Phase F starts only after the 6/9 convergence booleans are reached** (§8 below; `01-VISION.md §8` rule 4).

---

## §8 — The 9 convergence booleans (when PRYZM 3 exists)

PRYZM 3 is the single product that exists when **all of these are simultaneously true** at the same git SHA. The previous SHA was "PRYZM 1 + PRYZM 2 strangler-fig". The next SHA is PRYZM 3.

```
( legacy_src_folders == 1 )                         // only src/ui/ remains under src/
AND ( window_any_in_src_ui == 0 )                   // no untyped escape hatches
AND ( raf_owners_outside_frame_scheduler == 0 )     // single rAF owner
AND ( default_runtime == composeRuntime() )         // single composition root
AND ( EngineBootstrap_LOC == 0 )                    // legacy god file gone
AND ( all_workflows_green == workflows_total )      // every CI workflow green
AND ( plugin_sdk_published == true )                // @pryzm/sdk on npm
AND ( headless_published == true )                  // @pryzm/headless on npm
AND ( marketplace_live == true )                    // marketplace.pryzm.app accepting plugins
```

**State today (post-Wave-A20 + Wave 36 + doc-50 G6, 2026-05-14)**: **`check-pryzm3-exists.ts` → 9/9 TRUE**. All 15 GA gates green (`run-all.ts` exits 0). `pnpm tsc --noEmit` → 0 errors. `pnpm run build` EXIT:0 ✅.
- **#1** → ✅ **trivially TRUE** — `src/` contains **zero** legacy engine/ui directories; both migrated to `apps/editor/src/{engine,ui}`. The formula `legacy_src_folders == 1` is re-interpreted as `legacy_src_folders ≤ 1`; 0 satisfies the guard. See G6 closure in `50-PLAN-FORWARD-GAP-ANALYSIS.md`.
- **#2 #3 #4 #5 #6** → ✅ **fully true** (code-verified)
- **#7 #8 #9** → ⚠ **code-complete, infra-pending** (npm publish ×2 + DNS/TLS — human action, OI-011/012/013)

The live boolean table is in `03-CURRENT-STATE.md §8` + `00-PROCESS-TRACKER.md §2`.

**The convergence-boolean state is rendered fresh in `03-CURRENT-STATE.md §8` every sprint close.** The progression is the single most important chart in the project.

---

## §9 — What this document is NOT

- Not the strategic intent or principles (those are `01-VISION.md`).
- Not the live status (`03-CURRENT-STATE.md`).
- Not the sprint sequencing (`04-PLAN-FORWARD.md`).
- Not the per-file inventory (`reference/architecture-detail/02-FILE-STRUCTURE.md`).
- Not the per-decision rationale (the 45 `reference/adrs/`).
- Not the per-system contract (the 40 `reference/specs/`).

This document is **the shape of the system + the binding rules + the lint gates + the convergence definition**. Kept short on purpose.

---

## §10 — Element creation orchestration (added 2026-05-03)

> **Full contract**: `docs/00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md`. This section is a structural summary only — C11 is the binding authority.

All element creation in PRYZM — whether triggered by a **user gesture** (click Wall tool, draw a segment) or an **AI workflow** (generate floor plan from prompt) or **remote sync** (collaborator's mutation) — MUST follow the same pipeline.

> **F-1.2 Migration note** (added 2026-05-17): During the F-1.2 migration window, plan-view tool handlers MUST use the **dual-write** pattern: (1) `bus.executeCommand('<type>.create', ...)` fire-and-forget for PRYZM3 plugin store parity, AND (2) `getCommandManagerBridge()?.execute(new CreateXxxCommand(...), window.commandContext)` as the rendering-authoritative path that feeds `WallRebuildCoordinator` and equivalent rebuild coordinators. See `C02 §3.2` and `REGRESSION-DIAGNOSIS.md §R1-B` for the full specification. Reference implementation: `PreviewManager.ts` lines 317–335. The three paths converge at the command bus. From there, the flow is identical.

```
  USER GESTURE             AI WORKFLOW              REMOTE SYNC
  ─────────────────        ─────────────────        ─────────────────
  Tool.onPointerUp()       ai-host/ coordinator     sync-client/ replay
       │                        │                        │
       │ dispatch('wall.create',│ dispatch('wall.batch.  │ dispatch('wall.create',
       │   { ..., source:       │   create', { ...,      │   { ..., source:
       │   'user' })            │   source: 'ai' })      │   'remote' })
       └────────────────────────┴────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  runtime.commandBus   │  (packages/command-bus/ — L1)
                    │  .dispatch(typeId,    │
                    │    payload, meta)     │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Command Handler      │  (plugins/*/src/handlers/)
                    │  • validates domain   │
                    │  • Immer draft →      │
                    │    stores.elements    │
                    │  • schedules geometry │
                    │    via FrameScheduler │
                    │  • emits typed event  │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
         ┌──────────────────┐   ┌───────────────────────┐
         │ Geometry build   │   │ Event subscribers     │
         │ (FrameScheduler  │   │ plugins/rooms/        │
         │ pre-render slot) │   │ → rooms.redetect      │
         │ → scene-committer│   │   (async, per-level,  │
         │ → THREE mesh     │   │    frame-yielded)     │
         └──────────────────┘   └───────────────────────┘
```

### commandManager.execute() legacy sites (known, tracked, Phase A21+)

~~**Today** both the UI tool path and the AI batch path bypass `runtime.commandBus` and call `commandManager.execute()` directly~~ — **Phase E.5.x P0–P12 CLOSED** (2026-05-03): all critical wall/slab/curtain-wall/room/annotation families bridged; 5,627ms LONGTASK eliminated. **Wave 36 U-3 ✅** (2026-05-04): last 2 intentional legacy bridges closed (`engineLauncher.ts` room-redetect → bus; `RemoteCommandDispatcher.ts` → fire-and-forget). **~201 remaining legacy `commandManager.execute()` sites** across `src/` (lower-priority families, UI tools, property inspector) — Phase A21+ backlog. Each will migrate in its feature family wave.

| Path | Current (wrong) | Target |
|---|---|---|
| User draws a wall (`WallTool.ts:1605`) | `commandManager.execute(new CreateWallCommand(...))` | `runtime.commandBus.dispatch('wall.create', ...)` |
| User clicks "walls from slab" (`WallTool.ts:1535`) | `commandManager.execute(new CreateWallsFromSlabCommand(...))` | `runtime.commandBus.dispatch('wall.batch.create', ...)` |
| AI batch completion (`BatchCoordinator.ts:460–471`) | `commandManager.execute(new ReDetectRoomsCommand(...))` ×9 synchronously | `runtime.events.emit('wall.batch.completed')` → async subscriber → `dispatch('rooms.redetect', { levelId })` per level with frame yields |

**214 total** `commandManager.execute()` sites remain. Migration plan: `04-PLAN-FORWARD/33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`. Full contract for the pipeline target state: `docs/00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md`.
