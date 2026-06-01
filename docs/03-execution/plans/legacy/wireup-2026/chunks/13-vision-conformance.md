# §14  Vision conformance check — every requirement ticked

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1551–1659.

---

## §14 Vision conformance check — every requirement ticked against this plan

This section maps every formal requirement from `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `01-TARGET-ARCHITECTURE.md`, and `10-MASTER-IMPLEMENTATION-PLAN-36M.md` to the phase of this plan that delivers it. Each row is `Source → Requirement → Phase → Bench/CI gate`. **Zero requirements are left without a delivery vehicle.**

### §14.1 The eight architectural principles (Vision §3)

| # | Principle | Delivery in this plan | CI gate |
|---|---|---|---|
| **P1** | Geometry kernel is pure | `packages/geometry-kernel/` already pure (S07–S18). This plan does not regress. White UI never imports `geometry-kernel`. | `eslint-plugin-boundaries` (existing) |
| **P2** | Scene Committer is the only THREE owner | Phase D deletes `src/engine/` (the legacy THREE owners); Phase E deletes per-family fragment builders. After Phase G the only THREE-importing files are `packages/renderer/`, `packages/scene-committer/`, and `plugins/<family>/committer.ts`. | `eslint-plugin-pryzm/no-second-canvas` (Phase H) — `document.createElement('canvas')` allowed only in `Renderer.ts` and `composeRuntime.ts` |
| **P3** | One frame owner | Phase D deletes the 6 `requestAnimationFrame` callers in `src/engine/subsystems/`; Phase B's lint rule blocks new ones. After Phase G the only `rAF` is in `packages/frame-scheduler/`. | `eslint-plugin-pryzm/single-raf` (Phase H) — matches Vision P3 lint rule |
| **P4** | Commands + events are wire format | Phase A wires `PatchEmitter → EventLog → SyncClient → BakeCoordinator` as a single chain. Phase E ensures every legacy `commandManager.execute` is replaced by `runtime.bus.executeCommand`. | `affectedStores` declared on every handler (existing CI gate) |
| **P5** | Layer boundaries enforced mechanically | This plan adds two new layer rules: `no-runtime-package-import` (`src/ui/` → `@pryzm/runtime-composer/types` only) and `no-second-ui` (no imports from `apps/editor/src/projects/`). | new lint rules in Phase H |
| **P6** | No service locators, no `(window as any)` | Phase B eliminates 769 cast sites in `src/ui/`; Phase D eliminates ~250 in `src/engine/`. The "typed `ServiceRegistry` constructed at boot in `apps/editor/src/bootstrap.ts`" specified in P6 ≡ this plan's `PryzmRuntime` from `composeRuntime()`. **Same concept, named differently — reconciled here**: the package is `@pryzm/runtime-composer`, the bootstrap location remains `apps/editor/src/bootstrap.everything.ts` (composer wraps it). The 36-month plan target of 0 cast sites is achieved at end of Phase G (S84). | `eslint-plugin-pryzm/no-window-as-any` (Phase B) — Vision P6 lint rule |
| **P7** | Persistence is append-only events + chunked binary | Phase C deletes `ProjectRepository` (full snapshots) + `SaveOrchestrator` (debounce snapshot) + `ServerSyncQueue` (full-snapshot POST). After Phase C the only writer to project state is `EventLog.append`. | `tests/persistence/no-full-snapshot.test.ts` (existing CI gate, Vision P7) |
| **P8** | Observability is shipped | Every new module in `composeRuntime()` adds OTel spans (`pryzm.runtime.compose`, `pryzm.persistence.openProject`, `pryzm.tools.activate`, `pryzm.bus.executeCommand` already wired). UI panels emit `pryzm.ui.<panel>.mount/update/dispose` via a thin instrumentation hook in `Panel` base class (Phase B). | OTel coverage CI gate (existing) |

**8 / 8 principles delivered.**

### §14.2 The 17 non-functional targets (Vision §6)

| Target | Today | GA target | This plan delivers via | Bench |
|---|---|---|---|---|
| Cold load small | 2.4 s | < 800 ms | composeRuntime() < 50 ms (data half) + renderer parallel init + event-log replay; Phase D | `cold-load-real.bench.ts` (existing) + new `bench/ui/workspace-mount.bench.ts` |
| Cold load medium | 8.7 s | < 1.5 s first interactive | Same path; M-medium fixture in §11.16 budget | `load-medium.bench.ts` + `bench/ui/workspace-mount.bench.ts` |
| Cold load large | OOM | < 3 s first interactive | Tier-streamed loader (`packages/persistence-client/loader.ts` already exists); chunk streaming from bake worker; Phase F | `load-large.bench.ts` |
| Save (single edit) | 380 ms | < 10 ms | `EventLog.append` ≤ 10 ms (existing budget `persistence.save-edit.append.memory`) | `save-edit.bench.ts` (existing) |
| Idle CPU | 18% | < 2% | Single rAF (P3 enforcement) + dirty-flag rendering; Phase D | `idle-cpu.bench.ts` (existing) + new `bench/ui/idle-cpu-workspace.bench.ts` |
| Interactive frame rate | 28 fps | > 55 fps p95 | Renderer + scheduler; Phase D | `orbit-fps-walls.bench.ts` (existing) + new `bench/ui/scrub-fps-large.bench.ts` |
| Concurrent users | 1 reliable | 20 reliable | SyncClient (Yjs CRDT — already in `packages/sync-client/`); Phase A wires it; Phase C surfaces presence | `awareness-throughput.bench.ts` (existing) + `sync-roundtrip.bench.ts` |
| Largest model | ~500 walls | 10K walls / 50 levels | Tier-streamed loader + chunk streaming + bake worker; Phase D + F | `largest-model.bench.ts` (existing) |
| Bundle size raw | 14.2 MB | < 6 MB | Phase G mass deletion (~150K LOC removal); Vite bundle splitting; lazy chunks for AI/IFC/Rhino plugins | bundle-size CI gate (existing) + new `bench/ui/bundle-size-ui.bench.ts` |
| Bundle size gzip | 4.1 MB | < 1.8 MB | Same | same |
| First contentful paint | 1.9 s | < 600 ms | composeRuntime() does NOT block FCP; landing is engine-free (Phase A); `bench/ui/landing-paint.bench.ts` enforces | new `bench/ui/landing-paint.bench.ts` |
| Plugin install → first invoc | n/a | < 2 s | `runtime.plugins.installFromUrl(url)` returns a hot-loaded module (Phase F) | new `bench/ui/plugin-contribution-add.bench.ts` |
| Bake propagation | n/a | < 1.5 s | BakeCoordinator wired in Phase A; bake-worker existing | `bake-incremental.bench.ts` (existing) |
| Sync latency | ~3 s | < 250 ms p95 | SyncClient broadcast in Phase A; presence in Phase C | `sync-roundtrip.bench.ts` (existing) + new `bench/ui/presence-cursor.bench.ts` |
| AI floor-plan import | ~45 s | < 15 s | `runtime.ai.floorPlan.import` (Phase F); CV pipeline existing | `cv-pipeline.bench.ts` + new `bench/ui/floorplan-import-progress.bench.ts` |
| Undo single | 80 ms | < 5 ms | `runtime.undoStack.undo()` reverse-applies Immer patches (existing); Phase D wires hotkey | new `bench/ui/save-undo-hud.bench.ts` |
| OTel trace coverage | ~5% | 100% L0–L7 | UI panel base class adds `pryzm.ui.*` spans in Phase B | OTel coverage CI gate (existing) |

**17 / 17 NFTs delivered.**

### §14.3 The eight layers (Vision §4)

| Layer | This plan's posture | Phase |
|---|---|---|
| **L0 Persistence** | `runtime.persistence.eventLog` + `runtime.persistence.client` replace legacy stack (Phase C). | C |
| **L1 Domain Stores** | `runtime.stores.<key>` exposed; legacy `wallStore` etc. deleted with `src/elements/` (Phase E). | A + E |
| **L2 Command/Event Bus** | `runtime.bus` exposed; legacy `commandManager` deleted with `src/commands/` (Phase E). | A + E |
| **L3 Sync** | `runtime.sync.client` + `runtime.sync.presence` exposed; SyncClient already shipping. | A + C |
| **L4 Geometry Kernel** | `runtime.scene.host` consumes producers from each plugin; kernel never exposed to UI directly (P1). | A + E |
| **L5 Frame Scheduler + Renderer** | `runtime.scene.scheduler` + `runtime.scene.renderer`; legacy renderer deleted (Phase D). | A + D |
| **L6 Plugin Host** | `runtime.plugins` exposed; PluginHost moved out of editor app into `packages/plugin-host/` (Phase F). | A + F |
| **L7 Presentation** | `src/ui/` preserved verbatim (UI is on the L7 boundary; the white UI is the L7 surface). All wireup is L7 → L0–L6 via the `runtime` handle. | B (threading) |
| **L7.5 AI Operations** | `runtime.ai` exposed; `src/ai/` deleted (Phase F + G). | A + F |

**9 / 9 layers (8 + L7.5) delivered. UI layer (L7) is preserved as the operator requires.**

### §14.4 The ten differentiators (Vision §5)

| # | Differentiator | This plan's contribution |
|---|---|---|
| **D1** | Real-time multi-user geometry collab | Phase A wires SyncClient; Phase C surfaces presence cursors via `'overlay.canvas'` contributions in the white UI. |
| **D2** | AI as L7.5 | Phase F wires `runtime.ai`; the white AI panel calls it; AI mutations flow through the same bus as user edits — undo/sync/bake apply uniformly. |
| **D3** | Self-host story | Unaffected by this plan; the deployed bundle is the same image. Sync server, bake worker, AI worker all `docker-compose`-able as today. |
| **D4** | Plugin SDK 1.0 + marketplace | Phase F surfaces `runtime.plugins.installFromUrl`; the white marketplace panel calls it. |
| **D5** | OTel observability | Vision P8; UI base class adds `pryzm.ui.*` spans in Phase B. |
| **D6** | Hot-reload plugin DX (`pryzm dev`) | Phase F's plugin-host supports hot module reload via Vite HMR; new contributions land in the white toolbar without reload. |
| **D7** | Headless `@pryzm/headless` | Unaffected by this plan; kernel + headless package already ship. |
| **D8** | Desktop-CAD documentation pipeline | Phase F surfaces `runtime.viewRegistry` + `runtime.stores.sheet/schedule/titleBlock`; the white sheet editor + schedule panel + plan view paint via these. |
| **D9** | IFC + BCF + ISO 19650 round-trip | Phase F wires `runtime.ifc` + `runtime.bcf`; the white import/export panels + BCF panels call them. |
| **D10** | In-editor parametric component authoring | The component-editor app (`apps/component-editor/`) is unchanged; this plan does not regress it. |

**10 / 10 differentiators preserved or delivered.**

### §14.5 The eight non-goals (Vision §7) — confirm we are not violating any

| # | Non-goal | This plan's posture |
|---|---|---|
| **NG1** | No native desktop app | Confirmed — web-only; preserved. |
| **NG2** | No general 3D modeller | Confirmed — element families only; preserved. |
| **NG3** | No CFD/FEM/energy in editor | Confirmed — out of scope. |
| **NG4** | No native mobile app | Confirmed — out of scope. |
| **NG5** | No SQL query language | Confirmed — `runtime.dataWorkbench` (NL query + spatial query) is the answer. |
| **NG6** | IFC import does not become native format | Confirmed — `runtime.ifc.import` produces a plugin-managed projection; `.pryzm` remains the native format. |
| **NG7** | No Material/Carbon/Fluent design-system parity | **Confirmed and reinforced** — the white UI IS the design system. This plan freezes it. |
| **NG8** | No backwards compat at PRYZM 1 wire format | Confirmed — Phase C migrator is one-way (PRYZM 1 localStorage → PRYZM 2 event log); old format never written again. |

**0 / 8 violated. Plan honors every non-goal.**

### §14.6 Cross-document conflicts (the documents you specifically asked about)

| Conflict | Resolution |
|---|---|
| `09-AS-IS-VS-TO-BE.md` §3 lists `initUI.ts` as DELETED at S62; `src/ui/Layout.ts` is the modern equivalent in main. | **This plan KEEPS `src/ui/Layout.ts`** — it is the white-UI orchestrator, threaded with `runtime` in Phase B. The DELETION clause in §3 row 4 is amended in Phase H D-last (alongside the §3 row "PropertyPanel split into per-plugin contributions" which IS done in Phase E + F). |
| `09-AS-IS-VS-TO-BE.md` L7 row says "Top files: `PropertyPanel.ts` 3,339 LOC … decomposed into per-element vanilla classes (~200–400 LOC each) + a `PanelHost` orchestrator". | **Honored** — Phase F's per-plugin contributions ARE the per-element decomposition. The orchestrator is `runtime.plugins.contributions('inspector.element')` rendered via the existing `PropertyInspector.ts` (the PanelHost). White visual identical; under-the-hood per-plugin. |
| `09-AS-IS-VS-TO-BE.md` §5 cites **2,078** `(window as any)` cast sites; this plan's §2.2 cites **769** in `src/ui/`. | Compatible. 2,078 = 769 (src/ui) + 250 (src/engine — deleted Phase D) + ~1,059 (src/elements + src/commands + src/services + src/core + src/api — deleted Phases C–G as the FILES are deleted). After Phase G, total = 0. |
| `09-AS-IS-VS-TO-BE.md` §7 (OBC) — 91 OBC import sites → ~25 in `plugins/ifc-*`. | **Honored** — Phase F's `runtime.ifc` exposes `plugins/ifc-import` + `ifc-export` + `ifc-inspector`. Phase D deletes the `OBC` references in `src/engine/`; remaining sites are exclusively in the `plugins/ifc-*` packages. |
| `01-TARGET-ARCHITECTURE.md` §7.2 (Scene Committer) requires single THREE owner. | **Honored** — Phase D deletes legacy THREE owners; Phase E deletes per-family fragment builders. |
| `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6.4 (Sub-phase 3D — Hardening + GA, S67–S72) — this is the period the operator is currently in (S72). | **Aligned** — this plan IS the S72-ending hardening plan. Phases A–G compress into S72–S84 (12 sprints), Phase H spans S85–S87, GA gate end of S87. |
| `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §10 ("30-worst-files retirement schedule") — many entries scheduled for S55–S62. | Anything not yet done in main is ABSORBED into this plan's Phase E + G. The retirement schedule is the line-by-line work; this plan is the orchestration. |
| `06-PRYZM-IDENTITY-AND-RECOUNT.md` §2.4 — D11 UI continuity (operator-added). | **Honored** — the central operator constraint of this plan; codified in §1, enforced in §6, gated in Phase H visual-diff CI. |
| `Context.md` Ask 06 — Path A (vanilla TS, no React migration). | **Honored** — `src/ui/` is preserved as vanilla TS verbatim. |

**No unresolved conflict.** Where this plan amends a sister document (e.g. the §3 row 4 deletion of `initUI.ts`/`Layout.ts`, the §3 styles migration), Phase H D-last lands the doc amendments alongside the GA gate.

---

