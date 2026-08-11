# PRYZM — Architecture

> **Stamp**: 2026-06-01 · **Revised 2026-08-11 (rev 2 — measured)** · **Status**: CANONICAL
> **Authority**: this doc owns the system shape, the boundary lint matrix, the composition root contract, the convergence definition, and the CI gates. **When code disagrees with this doc, the code is canonical** — this doc is the description, not the law; if it drifts from code, this doc is updated.
> **Foundation above**: [STR-01-manifesto.md](./STR-01-manifesto.md) → [STR-02-product-vision.md](./STR-02-product-vision.md) → [STR-03-engineering-vision.md](./STR-03-engineering-vision.md)
> **Per-package detail**: [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md)
> **Contracts**: [../02-decisions/contracts/](../02-decisions/contracts/) — **68** contracts (C01–C68; C61 reserved)

> ### What changed in rev 2, and why
>
> Three corrections and two additions, all measured rather than preferred.
>
> **Corrections.** (1) §1 claimed the layer rule was CI-enforced via `eslint-plugin-boundaries`;
> **it was not** — no `import/resolver` was configured, so boundaries could not resolve
> `@pryzm/*` specifiers, which is how essentially every cross-package import here is written.
> The authority is `tools/ga-gate/check-layer-boundaries.ts`. (2) The layer ORDER was wrong in
> two places, corrected by measured edge direction, not by taste. (3) Every repository count in
> §1.1 had drifted.
>
> **Additions.** §15 describes **the capability control plane** — a cross-cutting architectural
> layer that did not exist in June, and which is now the primary way a user reaches the system.
> §16 describes **the jurisdiction / envelope pipeline**, which sits partly outside the
> eight-layer client model and needed saying so.

---

## §0 — How to read this doc

This doc describes PRYZM's architecture **as it exists in code**, re-measured 2026-08-11. The counts, file paths, and behaviours below are auditable against the repository. When the code changes, this doc must change in the same commit (per [operating-principles O4 + O5](./STR-06-operating-principles.md)).

The doc is intentionally short. Per-package detail lives in [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md); per-decision rationale in [02-decisions/adrs/](../02-decisions/adrs/); per-subsystem rules in [02-decisions/contracts/](../02-decisions/contracts/).

---

## §1 — The layered model

PRYZM organises code into **eight production layers** (L0–L7) plus a transitional legacy zone. Each layer has owner packages, a clear responsibility, and an enforced import allowlist.

**This diagram was re-derived on 2026-08-11 from measured edge direction. Two layers moved; see §1.0 for the measurements that moved them.**

```
┌──────────────────────────────────────────────────────────────────────┐
│  L7.5  src/  (8 files, 0 subdirs)  — TRANSITIONAL                    │
│         monotonically shrinking toward zero                          │
│                                                                       │
│  L7    apps/* (13)               — per-app surfaces (editor,         │
│         marketplace, workers, docs-site…). The editor is a           │
│         COMPOSITION ROOT: it imports plugins in order to register     │
│         them (142 measured edges down, 0 up)                          │
│  L6    plugins/* (48)            — features                           │
│  L5    packages/plugin-sdk/      — curated public SDK facade          │
│  L4    packages/renderer, render-runtime, persistence-client,         │
│         scene-committer                                               │
│  L3    packages/runtime-composer, ui-base, stores, view-state,        │
│         file-format, sync-client                                      │
│  L2    packages/geometry-kernel, ai-host, constraint-solver,          │
│         drawing-primitives, geometry-* (15)                           │
│  L1    packages/command-bus, picking, visibility, snapping,           │
│         renderer-three, spatial-index, frame-scheduler, …             │
│  L0    packages/schemas/         — pure Zod schemas; no I/O,          │
│                                    no THREE, no DOM                   │
│                                                                       │
│  (unlayered) backend packages — api-rbac, rate-limit, webhooks,       │
│         admin-overrides, ai-spend, api-spec, email-transport,         │
│         beta-signup — zero client dependencies; see §1.0              │
└──────────────────────────────────────────────────────────────────────┘
```

The **dependency rule**: a layer may import from any lower layer; never from a higher one. L7.5 is the only zone permitted to import from any other; this is the legacy concession and shrinks toward zero.

### §1.0 — ⚠ Correction, 2026-08-11 (L-809): what enforces the rule, and two orderings that were wrong

**The enforcement claim above used to read "CI-enforced via `eslint-plugin-boundaries`". It was
false.** `eslint.config.js` configured no `import/resolver`, so boundaries could not resolve
`@pryzm/*` specifiers — which is how essentially every cross-package import in this repository is
written — and therefore silently checked nothing for them. The rule was set to `'error'` and
matched almost none of the imports it existed to police. This is the [L-813](../04-reference/ISSUE-LOG.md)
defect class exactly: *a gate whose own arithmetic disproves its verdict*.

**The authority is `tools/ga-gate/check-layer-boundaries.ts`**, which maps `@pryzm/X` → directory
by reading each workspace `package.json`. That is exact and independent of pnpm symlink state —
which is precisely what made resolver-based checking unreliable here, since some `@pryzm/*`
packages are linked into a given package and some are not, so a resolver caught a violation in one
place and silently skipped the identical one next door. It imports the tables from
`eslint.config.js` rather than copying them. `boundaries/element-types` is retained and still
catches relative-path violations, but **it is not the layer gate.**

**Two orderings in the diagram below were corrected by measured edge direction, not by preference:**

- **apps moved from BELOW to ABOVE plugins.** Measured `apps → plugins` **142** imports;
  `plugins → apps` **0**. `apps/editor` imports twenty-odd plugins in order to *register* them —
  that is what a composition root does; it is structural, not debt. Encoding the old order minted
  **151 permanent false violations**.
- **`frame-scheduler` moved L3 → L1.** It imports nothing at all and is consumed by eleven L2
  `geometry-*` packages plus `core-app-model`. A zero-dependency primitive consumed by L2 cannot
  sit above it; the old placement generated ~29 false violations.

**Three things are stated here as NOT-YET-TRUE, so nobody mistakes them for settled invariants:**

- **"plugins may import the SDK facade only" is a GOAL, not an invariant.** Measured: 630 SDK
  imports against **171 direct bypasses** (`renderer-three` ×84, `command-registry` ×29,
  `core-app-model` ×27, `scene-committer` ×19). Tracked on its own shrink-only ratchet rather than
  folded into the layer count, because `plugin → renderer-three` goes *downward*: it is a
  facade-encapsulation breach, not a layer violation, and merging the two numbers would make both
  unreadable.
- **`runtime-composer` is not really L3.** It is the P1 composition root and necessarily imports
  persistence, the renderer, four typology packs, five plugins and `apps/editor`. Either it belongs
  at the top or those registration edges must invert; 16 violations are this one fact.
- **`core-app-model` / `command-registry` sit at L2 while importing L4.** The real debt is that a
  domain model depends on persistence.

**Backend packages have no layer at all** — `admin-overrides`, `ai-spend`, `api-rbac`, `api-spec`,
`rate-limit`, `webhooks`, `email-transport`, `beta-signup` are consumed only by `apps/api-gateway`
and `apps/marketplace-api` and have zero client dependencies. **Open question: does the layer model
extend to the backend, or does the backend need its own?**

### §1.1 — Repository counts (re-measured 2026-08-11)

| Surface | Count | Was (2026-06-01) | Path |
|---|---:|---:|---|
| Packages | **97** | 79 | `packages/*/` |
| Apps | **13** | 13 | `apps/*/` |
| Plugins | **48** | 47 | `plugins/*/` |
| Contracts | **68** | 49 | `docs/02-decisions/contracts/C*.md` (C01–C68; C61 reserved) |
| ADRs | **252** | 108 | `docs/02-decisions/adrs/*.md` |
| Specs | **94** | 56 | `docs/03-execution/specs/*.md` |
| Benchmarks | **68** | 68 | `apps/bench/src/benches/*.bench.ts` |
| CI gates | **32** | 21 | `tools/ga-gate/check-*.ts` |
| `geometry-*` packages | **15** | 13 | `packages/geometry-*/` |
| `src/` files | **8** | 7 | `src/` (no subdirs) |

The deep per-package inventory is in [STR-05-architecture-breakdown.md §4](./STR-05-architecture-breakdown.md).

> **Discipline note.** These are *measurements of a moving tree*. Per C64 §2.13's rule for the
> geodata pipeline — **never transcribe a measured figure forward** — the next reader should
> re-run the count rather than trust this table's age. A transcribed measurement rots; a computed
> reference does not.

---

## §2 — The boundary lint matrix

What each layer is allowed to import. **The enforcing authority is `tools/ga-gate/check-layer-boundaries.ts`**, which resolves `@pryzm/*` by reading workspace manifests (see §1.0 for why the ESLint-resolver route did not work here). The tables themselves still live in `eslint.config.js` and the gate imports them, so there is one source of truth.

> The L9 row below is the **goal**, not today's measurement: 171 direct lower-layer imports bypass the SDK facade and are tracked on their own ratchet (§1.0).

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

These are the binding rules. Each has a CI gate. Violations block merge. Detailed in [engineering-vision §2](./STR-03-engineering-vision.md).

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

## §5 — The CI gates (32 as of 2026-08-11)

Located in `tools/ga-gate/check-*.ts`. Run by `tools/ga-gate/run-all.ts` and blocking on merge to main. The table below is the June-21 core; eleven have been added since, of which the two structurally important ones are:

| Gate | What it checks |
|---|---|
| `check-layer-boundaries.ts` | **The layer rule itself** (§1.0) — resolves `@pryzm/*` via workspace manifests, which the ESLint resolver could not do |
| `check-chat-capability-coverage.ts` | **GA gate 31** — the capability control plane's entire proof surface (§15): coverage ratchet, phantom capabilities, executable probes both ways, source-anchored proofs, route liveness, executed acceptance + adversarial corpora, value-source resolvability, scope honouring, one-dispatch, catalogue existence, resolver case-arm ratchet, property-surface ratchet |

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

## §9 — The 68 contracts (binding rules)

> **Revised 2026-08-11.** The suite has grown C49 → C68 (C61 is a reserved slot). The domain
> table below covers C01–C49; the nineteen added since fall into three clusters:
> **typology + generation** (C50 pipeline, C52 editable building graph, C53 generative layout
> engine), **site + legal** (C55, C57, C58, C60, C62, C63, C64 — see §16), and **platform
> semantics + operations** (C51 apex/app deployment split, C54, C56, C59, C65 element type
> system, C66 concurrency and scale, **C67** the RAC capability control plane, **C68**
> element/attribute chat onboarding — see §15).

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

### §9.1 — The "No Event Drops" guarantee — amended 2026-08-07

Code throughout `packages/core-app-model` (`StoreEventBus.ts`, `BatchCoordinator.ts`)
cites a *"Master Architecture Contract §9 — No Event Drops"* guarantee. This subsection is
that guarantee's canonical home:

> **Every `emit()` on the store event bus eventually reaches all subscribers.** Batching
> may DEFER delivery (`endBatchYielded()` delivers across yields), never drop it.

**Amendment (2026-08-07, L-713 / commit `da4559d8`): the guarantee has exactly TWO
declared exceptions, and may never acquire an undeclared third:**

1. **`discardBatch()`** — the C13 teardown of an open bracket on project switch/load
   (C13 §5.4 lineage).
2. **`StoreEventBus.suppressDuring(reason, fn)`** — a lexical region whose emits are
   dropped, **counted** (`lastSuppression`) and logged; used by `ClearProjectCommand` so
   the outgoing project's teardown events cannot cross into the incoming project.

Both exceptions drop only events that can no longer be resolved (the registry is already
cleared) or that belong to a project being destroyed; both are fenced and accounted.
Binding detail: **C13 §3.12** ("the event channel is project-scoped state").

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

## §15 — The capability control plane (added 2026-08-11)

> Binding contracts: **[C67](../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md)** ·
> **[C68](../02-decisions/contracts/C68-ELEMENT-CHAT-ONBOARDING.md)** ·
> **[ADR-0315](../02-decisions/adrs/ADR-0315-universal-capability-architecture.md)** (extends
> ADR-0313, ADR-0314). Owner code: `packages/ai-host/src/{capabilities,intents}/`, gate 31.

This is a **cross-cutting architectural layer**, not a feature, and it did not exist when this
document was last written. It is the primary way a user now reaches the system, so its shape
belongs here beside the composition root and the element-creation pipeline.

### §15.1 — The invariant

> **The AI layer is never the source of truth for what the editor can do. The editor registers
> capabilities; language resolves against them; the LLM is an escalation mechanism, not the
> command router** (C67 §0).

Two structural consequences follow, and both are merge-blocking:

- **P6 absolutism.** Chat — and any LLM output — mutates only via the command bus. An LLM may
  *propose* a plan; that plan passes the *same* validator every other rung's output passes.
  There is no direct-execute path, ever (C67 §4.1).
- **Purity.** The resolver is a pure L2 module: no DOM, no stores, no network. All context is
  injected through `ResolverContext` (C67 §4.2). This is what lets it be tested at 300+ tests,
  answer instantly, and — critically — answer *before any plugin loads*.

### §15.2 — One semantic front door, four execution classes

Every rung of the ladder produces the same three pure values and nothing else (ADR-0315 D1):

```
SemanticIntent  ∪  ScopeDescriptor  ∪  ValueRefs

utterance
  → tier 0  deterministic grammar             (0 tokens)
  → tier 1  synonyms + bounded typo repair    (0 tokens)
  → local NL semantic parse                   (0 tokens)
  → compound-clause splitter (plans)          (0 tokens)
  → LLM planner                               (last rung; emits the SAME IR)
       │
       ▼
  applySemanticIntent  ← THE one semantic authority
       │
       ├─ EXEC-1 Command        one single or batch verb, proven live
       ├─ EXEC-2 Fan-out        N commands with an HONEST N-undo summary
       ├─ EXEC-3 Plan           ordered steps, ONE Confirm card, stop-on-failure
       └─ EXEC-4 Generation     typed request → the EXISTING generative controllers
       │
       ▼
  runtime.bus.executeCommand  (P6)
```

**No rung dispatches. No rung resolves a catalogue. No rung invents a scope.** That is
precisely what makes adding the LLM *last* safe: it is not trusted, it is *constrained* — it
emits the same IR and is refused by the same code.

Five context services — `ScopeResolver`, `ValueResolvers`, `SiteQuery`, `RoomQuery`,
`FacadeOrientation` — arrive by injection, never by import. **An absent service refuses
honestly** (*"spatial scoping isn't wired into this chat context"*) and never widens the ask to
a scope the user did not name (ADR-0315 D3).

### §15.3 — A capability is metadata

The architectural claim that matters economically: **the target is zero new resolver code.** A
batch-shaped capability is a `CapabilityExecutionSpec` table row; a catalogue family is a
`CatalogueFamilies` row from which the spec *and* the grammar are generated; a property is a
`PropertyVocabulary` row. All three are consumed by ONE generic arm, `applyExecutionSpec`.

The proof is measured, not asserted: `set-door-type` shipped as ~94 lines of metadata with
**zero** changed lines in the resolver, and U7.3 added four properties with zero changed lines
in either the resolver or the spec file (ADR-0315 D4). The number of hand-written `case` arms
is itself a shrink-only ratchet (baseline 27) — *a new capability that needs an arm is a
capability that is not a table row*.

The irregular shapes that stay hand-written are enumerated with reasons in the spec file's own
header: creation, level-query, whole-model reference, coordinate entry, and the
selection-fan-out dimension family.

### §15.4 — Where the proof lives

Gate 31 (`check-chat-capability-coverage.ts`) is the enforcement surface, and its structure is
the interesting part: it does not read declarations, it **executes** them. Probes are run
against all 16 element kinds; declared examples are executed through the real ladder in the
context their acceptance family declares; the adversarial corpus is executed at zero tolerance;
declared spatial scopes are driven through the resolver with an injected stub to prove the
intent actually arrives.

Two independent proofs are required per target, because neither suffices alone: an executed
probe *"would happily certify a resolver that confidently dispatches into a command that
refuses"*, and a source anchor alone proves nothing about the language reaching it (C68 §5.c).

**Route liveness is the check that earns the rest.** `commandProof` files are classified by
execution authority, and **a plugin `produceCommand` DTO store is presumed DEAD until proven
otherwise, because that presumption has been right 13/13 times** (ADR-0315 D5, C68 §5.a,
L-620/L-815).

### §15.5 — What is NOT enforced

Stated here rather than left to inference (C68 §6.3): refusal **quality** — that a refusal
quotes real names, numbers and units — is a review judgement with no gate. The runtime halves
of "one undo entry" and "a truthfully populated report payload" are provable only against a
running editor. Six of the checks are shrink-only ratchets, not zero-tolerance bars. C68 is
therefore **CANONICAL, not ACTIVE**, deliberately.

### §15.6 — The ladder generalises beyond chat

The deterministic-tiers-first shape is not a chat implementation detail; it is how this
architecture spends money. **PDF→BIM runs the same ladder in a different medium** — vector
extraction first, then algorithmic raster computer vision, then AI — which is why the importer
now functions with **no API key at all**. Any future subsystem that reaches for a model should
be asked the same question first: *what is the deterministic tier, and why is it not enough?*

---

## §16 — The jurisdiction / envelope pipeline (added 2026-08-11)

> Binding contracts: **[C57](../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md)** ·
> **[C58](../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)** ·
> **[C60](../02-decisions/contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)** ·
> **[C62](../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)** ·
> **[C63](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)** ·
> **[C64](../02-decisions/contracts/C64-ENVELOPE-COMPILER.md)**; ADR-0276, ADR-0279, ADR-0283,
> ADR-0291, ADR-0293.

This pipeline sits **partly outside the eight-layer client model**, and saying so is the point of
this section. Its stages span a same-origin server proxy (keys never reach the browser, C57
§1.2), pure geometry packages, an editor-side controller, and a curated rule pack that is
*content*, not code.

```
STAGE 0  parcel        cadastre adapter → canonical WGS84 ParcelFeature + provenance   (C57)
STAGE 1  instrument    zone identity: clau / norma zonal / bestemmingsplan             (C64 L1)
STAGE 2  block         parcel dissolve → ring → frontage classification vs road graph
STAGE 3  variables     the minimum authoritative set the article's derivation needs     (C64 L2-4 ❌ unbuilt)
STAGE 4  envelope      deterministic solve — no AI, no ML, byte-identical               (C58 §1.1)
STAGE 5  label         one of six EnvelopeConfidence values, never silently upgraded    (C58 §1.2)
STAGE 6  determination or a TYPED refusal naming what is missing and who owns it        (C64 §five kinds)
```

**Three architectural rules this pipeline contributes to the platform as a whole:**

1. **The envelope is a total function of the whole envelope** (C58 §1.14) — a massing render
   may not be assembled from a subset of constraints. This is what [L-616](../04-reference/ISSUE-LOG.md)
   punished: honest card text above geometry that extruded the full parcel to the cap, because
   an unknown constraint had been composed as an unbounded one.
2. **Confidence, authority and validation are three separate scales** (C62) — a source can be
   high-authority and unvalidated, or validated and low-authority. Collapsing them into one
   "confidence" number is how an estimate gets rendered as a fact.
3. **Determination is gameable by refusing** (C64 §2.12), so refusal correctness is a defect
   class of the same severity as an over-granted envelope — and it has **not yet been measured**
   (asserted only; the audit is commissioned). **NOT-YET-TRUE.**

**The gate that does not exist.** ADR-0279 §6 records the highest blocker in this workstream:
the merge-blocking fidelity-label check that C58 §6 mandates is **unwritten**. Today the *"never
render an estimate as authoritative"* guarantee rides on convention rather than CI — which, per
§1.0's lesson about the boundaries rule, is exactly the condition under which a guarantee
quietly stops being one. **NOT-YET-TRUE.**

**Replication shape.** Onboarding a city is a **data addition at five slots** — parcel
provider + proxy, router predicate, zone-identity provider, curated rule pack, jurisdiction
registration — plus one dispatcher branch (ADR-0279). The rule pack is the entire cost, and that
cost is human-gated legal sourcing, not engineering. Architecturally this is the desirable
property: the *spine is typology- and jurisdiction-agnostic, and specialisation lives only
inside the pack.*

### §16.1 — Where this pipeline meets §15

The two cross-cutting layers meet at the execution gate, and this intersection is the product
thesis stated architecturally:

- The envelope's `maxHeightM` is consumed by `checkMaxHeightGate` (§GEN-MAXHEIGHT-GATE) on all
  three building generation paths. A chat sentence that would generate over the permitted height
  is refused **quoting both numbers** — and the RAC layer *consumes* that gate rather than
  reimplementing it (ADR-0315, RAC U5b.3).
- Site context is what gives spatial language a referent: true north (θ) threads into facade
  orientation so *"all south-facing exterior walls"* resolves to a compass direction rather than
  a screen direction; the parcel ring, setbacks and neighbour heights feed the same
  `SiteQueryService` the chat's scope resolver reads (RAC U2.1/U2.4/U3.2).

A legal constraint, expressed in ordinary language, gating a generative design — with both the
constraint and the refusal traceable to a cited article — is the arrangement no other tool in
this category has, and it is the reason both layers are documented here as *architecture* rather
than as features.

---

## §13 — What this document is NOT

- Not the strategic intent → [STR-01-manifesto.md](./STR-01-manifesto.md), [STR-02-product-vision.md](./STR-02-product-vision.md), [STR-07-positioning.md](./STR-07-positioning.md)
- Not the engineering principles narrative → [STR-03-engineering-vision.md](./STR-03-engineering-vision.md)
- Not the per-file inventory → [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md)
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

For drift, the discipline is: **edit this canonical doc; do not write a `*-AUDIT-YYYY-MM-DD.md` alongside it** (per [C31 §1.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) + [operating-principles O5](./STR-06-operating-principles.md)).

---

*End — PRYZM Architecture, revised 2026-08-11 — CANONICAL.*
