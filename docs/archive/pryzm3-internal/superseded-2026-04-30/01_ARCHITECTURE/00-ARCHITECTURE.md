# PRYZM 3 — Canonical Architecture

> **Date**: 2026-04-30
> **Status**: CANONICAL — supersedes ad-hoc references
> **Source**: distilled from `01-LAYERS-AND-PRINCIPLES.md`, `02-FILE-STRUCTURE.md`, `03-FINAL-MAP.md`, `04-PASCAL-REFERENCE.md`, plus `00_VISION/02-VISION.md`, the 45 ADRs, and the 40 SPECs
> **Discipline**: when architecture drifts, **edit this file and the supporting docs**. Do not write a new `*-ARCHITECTURE-2026-MM-DD.md`.

This is the unified canonical architecture for PRYZM 3. Strategic intent is in `00_VISION/`. Execution sequencing is in `02_PLAN/`. Live status is in `03_STATUS/`. This document answers: **"What shape is the system, who owns what, and what are the lint gates that prevent regression?"**

---

## §0 — Reading order

If you have **5 minutes**: read §1 (the layers) and §3 (composition root contract).
If you have **20 minutes**: read §1 → §3 → §4 (cross-cutting wiring rules).
If you have **2 hours**: read this whole doc + `02-FILE-STRUCTURE.md` + `03-FINAL-MAP.md`.
If you have **2 days**: also read the 8 supporting wireup chunks under `wireup-S72/chunks/02-runtime-architecture.md` and `21-architecture-to-ui-coverage-matrix.md`.

---

## §1 — The 8 layers (L0 → L7.5)

| Layer | Owner | Responsibility | Allowed imports |
|---|---|---|---|
| **L0 — Domain** | `packages/domain` | Pure value types: Wall, Element, Family, Sketch, Constraint. No I/O, no THREE, no DOM. | std lib only |
| **L1 — Kernel** | `packages/geometry-kernel`, `packages/constraint-solver` | Pure compute: BREP ops, planegcs, IFC schema validators | L0 |
| **L2 — Persistence** | `packages/persistence-client`, `packages/sync-client` | File format, undo log, optimistic CRDT | L0, L1 |
| **L3 — Runtime services** | `packages/runtime-composer`, `packages/event-bus`, `packages/command-bus`, `packages/visibility` | Composition, scheduling, event routing, visibility intent. **`composeRuntime()` lives here.** | L0–L2 |
| **L4 — Renderer** | `packages/renderer-three` (the one THREE owner) | Scene graph, material pool, camera controllers. **The only place `import * as THREE` is allowed.** | L0–L3 |
| **L5 — UI plugins** | `apps/component-editor`, `apps/sheets`, `apps/family-editor`, etc. | Per-app UI surfaces. May read from L0–L4, may not import each other. | L0–L4 |
| **L6 — Plugin SDK** | `packages/plugin-sdk` (Phase F) | Public, versioned API for third-party plugins | L0–L4 (subset) |
| **L7 — Plugins** | `plugins/*` (BCF, IFC export/import, Rhino import, etc.) | Vendor-or-community-authored extensions | L6 only (no direct L0–L4 access except via L6 facade) |
| **L7.5 — Runtime UI shell** | `src/ui/`, `src/main.ts`, `src/EngineBootstrap.ts` (transitional) | The white-box production app shell | All layers — but this is the only layer allowed to be a "god" surface, and it is monotonically shrinking |

**Lint gate** (`packages/lint-config/src/boundaries.ts`): each layer has an allowlist of import sources. CI fails the build if any package imports outside its allowlist.

**Current violation count** (2026-04-30): unmeasured. Adding measurement to `02_PLAN/00-IMPLEMENTATION-PLAN.md §6` as a Phase D exit gate.

---

## §2 — The 8 principles (P1 → P8)

These are the binding architectural commitments. From `00_VISION/02-VISION.md §3`, restated here as the canonical lint targets:

1. **P1 — Single composition root**. There is one `composeRuntime()` and one `PryzmRuntime` handle. Production startup path uses it; no parallel composition. *(Currently violated: `EngineBootstrap.ts` is a parallel composition root. See `03_STATUS/00-CURRENT-STATE-AUDIT.md §5`.)*
2. **P2 — Single THREE owner**. Only `packages/renderer-three/` may `import * as THREE`. Lint-enforced via boundaries config.
3. **P3 — Single rAF**. Only `packages/runtime-composer/src/scheduler.ts` calls `requestAnimationFrame`. All other animations subscribe to the frame bus.
4. **P4 — No `(window as any)`**. The escape hatch is forbidden. *(Currently violated: 773 occurrences in src/ui/, 5 in composeRuntime.ts.)*
5. **P5 — Domain is pure**. L0 has zero I/O imports. CI-checked via `packages/lint-config/src/no-side-effects-in-domain.ts`.
6. **P6 — Commands are the only state mutation path**. UI dispatches commands; commands flow through `commandBus` → handlers → store. No direct store writes from UI.
7. **P7 — Visibility intent ≠ UI state**. The visibility-intent system (`packages/visibility/`) is a first-class domain concept, not a UI-only concern. Plugins and AI can express intent without owning UI.
8. **P8 — Sync conflicts are explicit**. CRDT merges that lose information surface as user-resolvable conflicts, never silently picked.

The full discussion (with the 10 differentiators D1–D10 and the 17 NFTs) lives in `00_VISION/02-VISION.md §3–§7`. **This is not restated here.** Single source of truth.

---

## §3 — The composition root contract (`composeRuntime()`)

Signature (canonical):

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
  readonly disposables: DisposableSet;
  dispose(): void;
}

export function composeRuntime(input: ComposeRuntimeInput): PryzmRuntime;
```

**14 slots. Today:**
- ~6 are real and typed.
- ~8 are `unknown`-typed placeholders or fall through to `(window as ...)` reads.
- Reality details in `03_STATUS/00-CURRENT-STATE-AUDIT.md §3`.

**Phase D exit gate** (per `02_PLAN/00-IMPLEMENTATION-PLAN.md §6`): all 14 slots typed, no `unknown`, no `(window as ...)` reads inside `composeRuntime.ts`, and `src/EngineBootstrap.ts` < 200 LOC.

---

## §4 — Cross-cutting wiring rules

These are rules a reviewer can spot in 30 seconds. Each has a CI gate.

| Rule | Owner module | CI gate |
|---|---|---|
| One rAF (P3) | `packages/runtime-composer/src/scheduler.ts` | `scripts/ci-check-single-raf.ts` (greps repo for `requestAnimationFrame`) |
| One THREE owner (P2) | `packages/renderer-three/` | Lint boundaries config |
| Commands are the only mutation path (P6) | `packages/command-bus/` | `scripts/ci-check-no-direct-store-writes.ts` |
| Domain is pure (P5) | `packages/domain/` | `scripts/ci-check-domain-purity.ts` |
| No `(window as any)` (P4) | enforced repo-wide | `scripts/ci-check-no-window-any.ts` (currently a soft-fail counter, becomes hard-fail at Phase E exit) |
| Single composition root (P1) | `packages/runtime-composer/` | `scripts/ci-check-single-compose.ts` (Phase D exit gate; not yet enforcing) |

**Status of CI gates**: 4/6 enforcing as hard-fail. 2/6 are soft-fail counters that report drift but don't break the build. The two soft gates become hard at Phase D exit (single-compose) and Phase E exit (no-window-any).

---

## §5 — Package map (the file structure shape)

49 packages, 12 apps, 38 plugins. The full per-file breakdown is in `02-FILE-STRUCTURE.md`. **Do not duplicate that table here.** Quick navigation:

- **Pure-domain layers** (L0–L2): `packages/domain/`, `packages/geometry-kernel/`, `packages/constraint-solver/`, `packages/persistence-client/`, `packages/sync-client/`. Total ~12k LOC. Stable.
- **Runtime services layer** (L3): `packages/runtime-composer/`, `packages/event-bus/`, `packages/command-bus/`, `packages/visibility/`, `packages/registries/`. Total ~6k LOC. **`composeRuntime.ts` (845 LOC) is the largest file here and the most-changing.**
- **Renderer layer** (L4): `packages/renderer-three/`. ~4k LOC. The only place THREE is allowed.
- **Apps layer** (L5): 12 vite-built apps under `apps/`. Each has its own bundle. UI surfaces are independent.
- **Plugin SDK** (L6): `packages/plugin-sdk/`. **Phase F deliverable.** Today: 0 LOC of public API surface. Stub package only.
- **Plugins** (L7): 38 under `plugins/`. Most are vendor pre-work; the BCF, IFC export/import, IFC inspector, and Rhino import plugins are the only ones that build green today.

**Transitional layer** (L7.5): `src/`. The legacy white-box monolith. **Monotonically shrinking** as Phase D pulls wiring out into `composeRuntime()` and Phase E pulls UI bindings out into `apps/*`. Today: `src/EngineBootstrap.ts` is 2,063 LOC. Phase D exit target: <200 LOC.

---

## §6 — Composition root flow (the diagram in words)

Production startup path **today** (transitional, ugly, honest):

```
src/main.ts
  → src/EngineBootstrap.ts (2,063 LOC; the actual god surface)
      → composeRuntime({ persistence, sync, renderer, registries })  // returns partial runtime
      → uses runtime.events, runtime.commandBus, runtime.commandRegistry  // the real slots
      → also reads (window as any).commandManager  // the stub fallback path
      → also instantiates WorkspaceMountBridge directly  // P1 violation, see audit §4
      → also wires its own scheduler  // P3 violation pending Phase D.9
  → src/ui/app.ts mounts panels (96 files contain `(window as any)`)
```

Production startup path **at Phase D exit** (the spec):

```
src/main.ts
  → composeRuntime({ persistence, sync, renderer, registries })
      → returns fully-typed PryzmRuntime
  → app shell (apps/shell/src/main.ts) consumes runtime
      → mounts panels via runtime.viewRegistry
      → no (window as ...) anywhere
      → no WorkspaceMountBridge anywhere
      → src/EngineBootstrap.ts deleted
```

The delta between the two diagrams is **Phase D.4 (delete bridge), D.5 (full slot typing), D.8–D.14 (move wiring out of EngineBootstrap)**. ~9 sub-phases. Time estimate at current pace: **3–4 sprints.**

---

## §7 — Public API surface (Phase F deliverable)

The user-facing public surface after GA:

1. **`@pryzm/sdk`** — npm package, the L6 facade. Today: 0 LOC of stable API. Phase F.10–F.40 land this.
2. **`@pryzm/headless`** — npm package, runtime without UI. Today: stub. Phase F.45 publishes.
3. **REST + WebSocket APIs** — `/api/v1/*` and `/ws/v1/*`. Today: stub server. Phase F.55 lands.
4. **`.pryzm-family` file format** — Phase 3B sprint S55–S59. SPEC-26 normative.
5. **IFC Tier 1 round-trip** — Phase 3B sprint S55–S58. ADR-039, SPEC-12 normative.
6. **Marketplace** — `marketplace.pryzm.app`. Phase F.80 deliverable. Today: domain registered, no surface.

The full Phase F sub-phase list (195 items) is in `wireup-S72/chunks/16-subphases-F1-toolbars.md` through `chunks/18-subphases-F6-F12.md` and the dedicated phase plan `phases/PHASE-3/3C-PLUGIN-SDK-MARKETPLACE.md`.

---

## §8 — Boundary lint matrix

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

---

## §9 — What this document is NOT

- **Not a sprint plan.** That's `02_PLAN/00-IMPLEMENTATION-PLAN.md`.
- **Not the live status.** That's `03_STATUS/00-CURRENT-STATE-AUDIT.md` + `03_STATUS/01-PROCESS-TRACKER.md`.
- **Not the file inventory.** That's `02-FILE-STRUCTURE.md` (per-file breakdown of all 49 packages).
- **Not the per-package spec.** That's `specs/SPEC-01.md` through `specs/SPEC-48.md`.
- **Not the per-decision rationale.** That's `adrs/ADR-001.md` through `adrs/ADR-044.md`.

This document is the **shape of the system + the binding rules + the lint gates**. Kept short on purpose.

---

## §10 — Cross-references

- **For why this shape**: `00_VISION/02-VISION.md` (the strategic anchor)
- **For who PRYZM is and why now**: `00_VISION/01-IDENTITY.md`
- **For what's broken vs what's working**: `00_VISION/03-AS-IS-VS-TO-BE.md`
- **For per-file breakdown**: `01_ARCHITECTURE/02-FILE-STRUCTURE.md`
- **For the historical full-architecture map**: `01_ARCHITECTURE/03-FINAL-MAP.md`
- **For the Pascal-editor reference (the prior-art lens)**: `01_ARCHITECTURE/04-PASCAL-REFERENCE.md`
- **For execution sequencing**: `02_PLAN/00-IMPLEMENTATION-PLAN.md`
- **For live status**: `03_STATUS/00-CURRENT-STATE-AUDIT.md`
