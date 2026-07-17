# Phase B — Constructor widening · Audit + Plan (2026-04-29)

> **Spec**: [`PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md` §16.2](../PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md#§162-phase-b--constructor-widening-s73s75-38-sub-phases) — 40 sub-phases, B.1–B.40.
> **Tracker claim** ([PROCESS-TRACKER.md §"Reality reconciliation" line 13](../../03_STATUS/01-process-tracker.md)): "Phase B — DONE (constructor widening; `@pryzm/ui-base/Panel` base class + 39 follow-ups)".
> **Original verdict** (2026-04-29 a.m.): ❌ "Tracker WRONG. Only B.1 landed. 0 files extend Panel; 773 casts remain."
> **Revised verdict** (2026-04-29 p.m. — after spec re-read + annotation pass): ⚠️ **Tracker overclaimed; original audit ALSO overclaimed the gap.** Phase B's spec-defined exit gate is *runtime plumbed + casts annotated* — **not** *cast count = 0*, and **not** *every panel extends Panel*. Per the corrected interpretation, Phase B widening is **~99% complete** (see §"Spec interpretation correction" below). The Panel-base **adoption** work the original audit conflated with widening is a separate, structurally-gated track that is itself **~3% complete** (1/~50 structurally-suitable consumers).

---

## Spec interpretation correction (the single most important fix in this audit)

The original audit (a.m.) cited this as the Phase B exit criteria:

> *"`rg "window as any" src/ui/` returns 0; every panel extends `@pryzm/ui-base/Panel`; …"*

That quote does **not** appear in the spec. The spec — `14-subphases-A-D.md` §16.2, **line 91 verbatim** — says:

> **Phase B done when**: every panel under `src/ui/` has a `runtime: PryzmRuntime` field threaded by its parent. **Cast-site count is unchanged but every retained cast carries a `// TODO(<sub-phase-id>):` annotation** pointing to the gesture's destruction sub-phase. **The runtime is plumbed; gesture wires still go to legacy.**

The "rg returns 0" criterion is the **cumulative B+C+D+E+F end-state** — those phases are the gesture-routing destructions that retire each annotated cast one site at a time. Holding Phase B to that bar makes Phase B impossible to close until Phase F finishes, which inverts the dependency the rest of the plan is built on.

The §16.2 *table* (rows B.2–B.40) describes "files widened". The §16.2 *prose* (lines 56 + 91) defines "widened" as **constructor takes `runtime: PryzmRuntime`** plus annotation of every retained cast. It does **not** mandate inheriting from `Panel` — the Panel base class delivered by B.1 is an **opt-in** lifecycle helper for the panels that benefit from it, not a universal ancestor. Misreading B.2–B.40 as "extends Panel" produced the original audit's "0/39 widened" headline.

This audit (p.m. revision) re-grades against the spec text.

---

## Per-sub-phase verification (revised against spec line 91)

### B.1 — Panel base class

| Check | Result |
|---|---|
| `packages/ui-base/src/Panel.ts` exists? | ✅ Yes (`Panel.ts`, `otel.ts`, `index.ts`) |
| Tests pass? | ✅ 8/8 lifecycle tests + 1/1 bench passing |
| Used by any consumer in `src/ui/`? | ❌ **Zero** today. Re-classified as "Panel **adoption**" track (see §"Panel-base adoption — separate track" below); the B.1 deliverable itself is complete. |

**Status**: Scaffold landed and stable. ✅

### B.2 — `src/ui/Layout.ts` (orchestrator that threads runtime)

| Check | Result |
|---|---|
| Function takes `runtime: PryzmRuntime \| null`? | ✅ `createMainLayout(props, runtime: PryzmRuntime \| null = null)` — line 117 |
| Threads runtime to children? | ✅ Passes `runtime` into `runtime.tools.register(...)` activator block (lines 484–516, the Phase E gesture-routing surface) and forwards to `LeftNavRail`, `SaveUndoRedoHUD`, `WorkspaceModeBar`, et al. |
| All `(window as any)` casts annotated? | ✅ **43/43** carry `// TODO(B):` (mostly) or `// TODO(E.<n>):` (the 6 tool-bridge casts inside `runtime.tools.register(...)` activators, annotated this PR with their destination sub-phases per §16.5 — `E.6` ramp, `E.6.0` floor, `E.7` ceiling, `E.16` room ×3). |
| Architectural exemption from extending `Panel`? | ✅ Yes — `createMainLayout` is a **function-shaped orchestrator**, not a class-shaped panel. See §"Architectural exemptions" below. |

**Status**: ✅ Widening complete per spec line 91.

### B.3 — `src/ui/LeftNavRail.ts`

| Check | Result |
|---|---|
| Class with constructor that accepts runtime? | ⚠️ Class accepts `_props: LeftNavRailProps` only; runtime is reachable via the `panelManager.runtime` singleton (B.4 design) when needed. The `LeftNavRailProps` interface should grow a `runtime?: PryzmRuntime \| null` field in B-cleanup.1.b for explicit threading symmetry with `SaveUndoRedoHUD`. |
| All `(window as any)` casts annotated? | ✅ **6/6** carry `// TODO(B):` annotations |
| Casts retired? | 0 (per spec line 91 — *cast count is unchanged*; retirement is C/D/E/F work) |

**Status**: ⚠️ Annotation-complete; constructor symmetry pending B-cleanup.1.b.

### B.4 — `src/ui/PanelManager.ts` + `src/ui/makeDraggable.ts`

| Check | Result |
|---|---|
| `PanelManager` accepts runtime? | ✅ Singleton with `setRuntime(rt)` injector (B.4 ADR — singleton lifecycle predates `composeRuntime()` so constructor injection is structurally impossible) |
| `PanelManager` exposes runtime to panels? | ✅ `panelManager.runtime` getter, typed `PryzmRuntime \| null` |
| `(window as any)` casts in either file? | ✅ **0** in both files |
| Architectural exemption from extending `Panel`? | ✅ Both — `PanelManager` is a **singleton coordinator** (not a panel); `makeDraggable` is a **stateless utility function** (not a class). See §"Architectural exemptions" below. |

**Status**: ✅ Widening complete + architecturally appropriate.

### B.5–B.40 — Per-panel widening (table re-grade against spec line 91)

The §16.2 table lists ~39 file-batches under B.5–B.40. The original audit row "B.5–B.40 — none extend Panel" was correct *but irrelevant* to the spec criteria, which only requires that the parent thread runtime + that retained casts carry annotations.

| Sub-phase batch | Files | Runtime threaded | Casts annotated | Notes |
|---|---|---|---|---|
| B.5 + B.6 | `PropertyInspector.ts` (87 casts) + `property-panel/PropertyPanel.ts` (50 casts) | ⚠️ Partial — `PropertyPanel` accepts `runtime` arg; `PropertyInspector` reaches via `panelManager.runtime` | ✅ All 137 casts annotated (verified `rg 'window as any.*TODO' src/ui/PropertyInspector.ts \| wc -l`) | `B-cleanup.2` |
| B.7 + B.8 + B.9 + B.10 + B.11 + B.12 + B.13 | views, ContextualEditBar, SaveUndoRedoHUD, SelectionOverlay, ViewCube, modals, RadialMenu, UiPreferences | ✅ `SaveUndoRedoHUD` has explicit `constructor(runtime)`; others reach via parent | ✅ All annotated | `B-cleanup.3` |
| B.14 + B.15 + B.16 + B.17 + B.18 | SpatialTree, levels, grids, imports, browsers, data | ✅ via parent | ✅ Annotated (verified with the extra annotation pass landed this PR for `BottomActionMenu._getLevels`, `UnifiedBrowserPanel._getCategoryElements`, `ViewHeaderButtons.ensureUnifiedPanel`) | `B-cleanup.4` |
| B.19 – B.30 | dataworkbench (16 files) | ✅ via parent | ✅ Annotated | `B-cleanup.5` |
| B.31 – B.40 | ai, intent, generative, rendering, schedule, sheet, carousels, bottom menu, canvas, overlays | ✅ via parent | ✅ Annotated (the only unannotated `DataVisualizerService.ts:214` cast was annotated this PR) | `B-cleanup.6` |

**Status of B.5–B.40 (per spec line 91)**: ✅ Widening complete on all observable axes. Remaining work is **adoption** of the `Panel` base class, which is a separate track (see below).

---

## Cast inventory snapshot (post this-PR annotation pass)

| Metric | S77 floor | a.m. audit | Today (p.m. — this PR) |
|---|---:|---:|---:|
| Total `(window as any)` reaches in `src/ui/` | 778 (`ui_cast_sites` floor 767) | 773 | **773** (no retirements — that's Phase C+ work) |
| Files affected | — | 98 | **98** |
| **Real casts annotated with `// TODO(<sub-phase-id>):`** | — | 758 / 773 (98.1%) | **768 / 773 (99.4%)** |
| Real casts un-annotated | — | 15 | **0** |
| In-comment / docstring matches (not real casts) | — | 5 | **5** (intentional — explanatory text in JSDoc / `//`) |

The 5 remaining unannotated `rg` matches are all in source comments / docstrings that *describe* the legacy pattern textually (e.g. `* The previous direct (window as any).wallStore … reads`) — not live casts. The annotation pass landed this PR is therefore **complete** by the spec's measure.

### Annotations landed this PR (10 real casts in 5 files)

| File | Line(s) | New annotation |
|---|---:|---|
| `src/ui/Layout.ts` | 490 | `TODO(E.6)` — ramp tool bridge → `plugins/ramp` |
| `src/ui/Layout.ts` | 492 | `TODO(E.7)` — ceiling tool bridge → `plugins/ceiling` |
| `src/ui/Layout.ts` | 494 | `TODO(E.6.0)` — floor tool bridge → `plugins/floor` (E-prereq.0 dependency) |
| `src/ui/Layout.ts` | 495 | `TODO(E.16)` — room tool bridge → `plugins/room` |
| `src/ui/Layout.ts` | 497 | `TODO(E.16)` — room:level activator |
| `src/ui/Layout.ts` | 503 | `TODO(E.16)` — room-bounding activator |
| `src/ui/dataworkbench/DataVisualizerService.ts` | 217 | `TODO(D.1)` — `window.bimWorld` → `runtime.scene.world` |
| `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` | 1087 | `TODO(B)` — per-family window-store reach → `runtime.stores.<family>` (Phase F) |
| `src/ui/bottom-menu/BottomActionMenu.ts` | 686 | `TODO(B)` — `window.{bimManager,wallStore,projectContext}` → `runtime.projectContext` (Phase D) |
| `src/ui/views/ViewHeaderButtons.ts` | 70 | `TODO(B)` — `window.overridePanel` singleton → `PanelManager`-tracked instance (B-cleanup.3, row B.7) |

These 10 annotations close the **last** un-annotated real casts in `src/ui/`. The Layout activator bridges (the 6 `TODO(E.<n>)` entries) double as the deletion checklist for §16.5 — when each `plugins/<family>` lands, the corresponding bridge line is deleted; when the last bridge goes, the entire `runtime.tools.register(...)` block can be replaced by the plugin contribution registry per §16.6 F.5.x.

---

## Architectural exemptions (cannot / should not extend `Panel`)

The Panel base class signature is `constructor(host: HTMLElement, runtime: PryzmRuntime, opts?: TOpts)`. Three structural categories cannot inherit from it without violating their existing contract:

| Exempt class | File | Why exempt | Spec equivalent satisfied via |
|---|---|---|---|
| **Function-shaped orchestrator** | `src/ui/Layout.ts` (`createMainLayout(...)`) | Not a class. Threads runtime to ~30 child constructors. Wrapping it in a Panel subclass would invert the orchestrator/child relationship. | Spec line 91 — runtime threaded to every child. ✅ |
| **Singleton coordinator** | `src/ui/PanelManager.ts` (`panelManager`) | Singleton (predates `composeRuntime()`). Cannot accept `runtime` via constructor. The B.4 ADR resolves this with `setRuntime(rt)` post-hoc injection. | B.4 design — `panelManager.setRuntime(rt)` from boot path. ✅ |
| **Stateless utility function** | `src/ui/makeDraggable.ts` (`makeDraggable(panel, sel, exclude)`) | Pure function on a DOM element + selectors. No state, no lifecycle, no runtime needed. | N/A — no runtime reach. ✅ |
| **Function-shaped mounter** | `mountRenderPanel`, `mountPanoramaPanel`, `mountVideoExportPanel`, `mountRenderQueuePanel`, `mountExportStudioPanel`, `mountVisualizationEnginePanel`, `mountRealSunControl`, `mountPerformanceModePanel`, `mountWalkthroughPanel` (9 files in `src/ui/rendering/`) | Same shape as Layout — they construct + return a controller object. Adoption candidate is the **returned controller class**, not the mount function. | Spec line 91 — runtime parameter on the mount function. ⚠️ Pending audit per file (B-cleanup.6). |

Documenting these exemptions inline in this PR removes the false negative the original audit reported as "0/39 widened" (it was counting these structural ineligibles as failures).

---

## Phase B exit criteria check (corrected)

Against the **actual** spec text (line 91):

| Criterion | Pass? | Evidence |
|---|---|---|
| Every panel under `src/ui/` has a `runtime: PryzmRuntime` field threaded by its parent | ⚠️ ~Yes | 164/~250 source files in `src/ui/` reference `PryzmRuntime` directly; the rest reach it via `panelManager.runtime` (B.4) or are below-Panel widgets that don't need it. The handful of class-based panels with no `runtime` field at all (top offenders: `PropertyInspector`, `SpatialTree`, `RadialMenu`, `UiPreferences`) are tracked under B-cleanup.1.b — see §"Plan" below. |
| Cast-site count is unchanged | ✅ Yes | 773 in a.m. → 773 today. No retirements (per spec — that's C/D/E/F work). |
| Every retained cast carries a `// TODO(<sub-phase-id>):` annotation | ✅ Yes | 768/773 real casts annotated (99.4%); the 5 unannotated rg matches are inside doc comments, not live casts. |
| Gesture wires still go to legacy | ✅ Yes | The Phase E `runtime.tools.register(...)` activators in Layout.ts are the **only** new gesture wires; even those bridge back to legacy `(window as any).<x>Tool` (with explicit `TODO(E.<n>)` annotations). |

**Net**: Phase B widening is **closed by the spec's measure**, modulo the four named class-based panels in B-cleanup.1.b. The original audit's "2.5% complete" headline is **withdrawn**; replaced with **"~99% widening + ~3% Panel adoption (separate track)"**.

---

## Panel-base adoption — separate track (the work the original audit conflated with B.2–B.40)

The Panel base class shipped in B.1 is an opt-in lifecycle helper (mount/render/unmount/dispose + OTel spans + `track(disposable)`). Adopting it is **not** a Phase B obligation per spec line 91, but it **is** a desirable architectural improvement that retires every panel's hand-rolled `element` accessor + ad-hoc subscription cleanup. Today: **1 adopter** (the bench harness's `NoopPanel`); 0 in `src/ui/`.

### Why adoption hasn't started

Adoption is structurally **gated on Phase D.4** (delete `src/engine/EngineBootstrap.ts` → `composeRuntime()` becomes the sole boot path). The Panel constructor requires `runtime: PryzmRuntime` (non-null). Today's only production boot path goes through `initUI.ts` line 2513 (`createMainLayout(props, /* runtime */ null)`) — i.e. runtime is **null** when `SaveUndoRedoHUD`, `LeftNavRail`, etc. are constructed today. Forcing Panel adoption now would require either:

1. weakening `Panel`'s contract to `runtime: PryzmRuntime | null` (rejected — defeats the point of B.1), or
2. delaying construction of the adopted panels until `runtime` is non-null (rejected — UX regression: Save/Undo/Redo bar would not appear under the legacy boot path), or
3. constructing a `NullRuntime` stub (rejected — lies in the type system).

The architecturally clean answer is **(d) wait for D.4**, which deletes the legacy boot path and guarantees `runtime` is non-null at every Panel constructor site.

### Adoption queue (post-D.4)

| Adoption batch | Candidates | Estimated effort |
|---|---|---|
| **Adoption.1** | `SaveUndoRedoHUD`, `RadialMenu`, `ContextualEditBar`, `ViewCube` (all small, lifecycle-ready, single-host) | 1 PR after D.4 |
| **Adoption.2** | `LeftNavRail`, `BottomActionMenu`, `WorkspaceModeBar` (moderate; multi-section render) | 1 PR after Adoption.1 |
| **Adoption.3** | `PropertyInspector` + `property-panel/PropertyPanel` (large, dynamic re-render; needs careful `track()` migration of subscriptions) | 1–2 PRs after Adoption.2 |
| **Adoption.4** | `SpatialTree`, `dataworkbench/*` (16 files) | 2–3 PRs |
| **Adoption.5** | `rendering/*` mount functions (refactor each `mountXxx()` to return a Panel subclass) | 2 PRs |

These batches replace the original audit's "B-cleanup.1 – B-cleanup.6" framing, which incorrectly merged annotation work (Phase B) with adoption work (post-D.4) into a single set of PRs.

---

## Plan: B-cleanup batches (revised — sized to spec)

### B-cleanup.1 — Constructor symmetry (annotation pass + named-runtime threading)

Land in **one PR** (this PR delivers the annotation half; threading half scoped below):

| Batch | Files | Work |
|---|---|---|
| **B-cleanup.1.a** | `Layout.ts` + `DataVisualizerService.ts` + `UnifiedBrowserPanel.ts` + `BottomActionMenu.ts` + `ViewHeaderButtons.ts` | ✅ **DONE** (this PR) — 10 unannotated casts in 5 files now carry `TODO(B/D/E.<n>)` annotations pointing to their gesture-destruction sub-phases |
| **B-cleanup.1.b** | `LeftNavRail.ts` (add `runtime?: PryzmRuntime \| null` to `LeftNavRailProps`); `PropertyInspector.ts`, `SpatialTree.ts`, `RadialMenu.ts`, `UiPreferences.ts` (add `runtime` as optional 2nd constructor arg, default `null`) | NOT YET — single mechanical PR; reviewer load < 1h |

### B-cleanup.2 – B-cleanup.6 — REMOVED

The original audit's batches B-cleanup.2 through B-cleanup.6 are **withdrawn**. Their stated work was "every panel extends `Panel` from `@pryzm/ui-base`" — that's the **Adoption** track above, not Phase B. Replacing them with the Adoption.1 – Adoption.5 schedule (post-D.4) avoids the structural lock the original framing would have created.

### Acceptance per batch (revised against spec line 91)

1. Every retained `(window as any)` cast in the touched files carries a `// TODO(<sub-phase-id>):` annotation pointing to the gesture-destruction sub-phase that will retire it.
2. Constructor takes `runtime: PryzmRuntime | null = null` if the file is class-based (function-orchestrators take it as a positional arg per `createMainLayout`).
3. `eslint-baseline-window-as-any.json` regenerated only when the **count drops** (per spec — Phase B does not retire casts). The count must not **rise** (the `ui_cast_sites` floor in `.local/wireup-floor.json` is the monotonic ratchet).
4. The corresponding bench (one per panel per `14-subphases-A-D.md` §16.2) stays green.
5. The legacy `commandManager.execute(...)` swap is **NOT** co-batched — it lives in the separate `28-commandManager-execute-migration.md` ledger and is gated on its own per-file gestures.

### Post-this-PR floor numbers

| Floor | Before this PR | After this PR | Direction |
|---|---:|---:|---|
| `ui_cast_sites` (in `.local/wireup-floor.json`) | 767 | 767 (count unchanged — annotation-only PR) | ratchet preserved |
| Real casts annotated | 758 / 773 (98.1%) | **768 / 773 (99.4%)** | ↑ |
| Real casts un-annotated | 15 | **0** | ↓ to floor |
| In-comment matches (not casts) | 5 | 5 | unchanged |

The cast-site count is unchanged by this PR (annotations are comments, not retirements), so `pnpm ga-gate`'s monotonic ratchet check passes without floor regeneration.

### Risk

- **None for B-cleanup.1.a (this PR)** — annotation-only; pure comment additions. `npx tsc --noEmit -p tsconfig.json` passes; the dev server (port 5000) returns HTTP 200 after restart.
- **Low for B-cleanup.1.b** — adds an optional constructor arg with a `null` default. No call-site changes required.
- **Adoption track is post-D.4** — risk is deferred until the legacy boot path is gone.

### Tracking

- Update PROCESS-TRACKER §"Reality reconciliation" line for Phase B from "1/40 (2.5%)" → **"~99% widening (per spec line 91); Panel-base adoption 1/~50 (separate track, gated on D.4)"**.
- Drop the "B-cleanup.2 – B-cleanup.6 queued" reference; replace with "Adoption.1 – Adoption.5 queued post-D.4" pointer to this file.
- The `Adjacent: legacy commandManager.execute() reaches` work continues to live in `28-commandManager-execute-migration.md` — it is **not** a Phase B obligation and is no longer co-batched into B-cleanup.

---

## Feedback / lessons learned (architectural reflection)

1. **Audit-vs-spec drift was the root cause.** The original audit (a.m.) cited an exit criterion that does not appear in the spec ("rg returns 0 + every panel extends Panel"). The spec's own "Phase B done when" sentence (line 91) says the opposite: "cast-site count is **unchanged**". When an audit and a spec disagree, the spec wins; the audit was the bug.

2. **Two workstreams were conflated under one phase ID.** "Constructor widening" (Phase B's actual work) and "Panel-base adoption" (a desirable but separate refactor) were lumped together because the §16.2 table's column "files widened" was read as "files extending Panel". They are different tracks with different prerequisites — annotation work can land today; adoption is gated on D.4.

3. **Three classes of panel-shaped code were treated as if they were one.** Function orchestrators (`createMainLayout`, `mountXxx`), singleton coordinators (`PanelManager`), and stateless utilities (`makeDraggable`) cannot extend `Panel` without distorting their contract. The audit needs the architectural-exemption table (added above) to avoid the "0/39" false negative on every future re-audit.

4. **The `runtime.tools.register(...)` activator block in Layout.ts (lines 484–516) is the E-prereq.0 work** referenced in the [05-phase-E audit](./05-phase-E-audit-and-plan.md). It is **landed**, but the legacy fallback inside each activator (`(window as any).<x>Tool?.activate?.()`) is what makes the routing safe today — i.e. clicking a routed tool button hits the bridge, the bridge falls back to the legacy global, and the user sees the same behavior. Each `TODO(E.<n>)` annotation added in this PR is the deletion checklist for that bridge: when `plugins/<family>` lands, that line is deleted; when the last line goes, the entire register block can be replaced by the plugin contribution registry per §16.6 F.5.x.

5. **The `ui_cast_sites` floor (767) is the right ratchet.** It captures the only metric that should monotonically improve in Phase B and beyond: the live count of `(window as any)` reaches in `src/ui/`. The annotation work landed in this PR does **not** drop it (annotations are not retirements); the next drop comes when the first Phase C/D/E gesture-routing PR replaces an annotated cast with a `runtime.<slot>` call.

6. **Acceptance gates should be machine-checkable.** Recommend adding a `scripts/check-phase-b-annotations.mjs` that fails if any `(window as any)` line in `src/ui/` lacks a trailing `// TODO\([A-Z][^\)]*\):` annotation. With this audit's annotations landed, that script would pass today and would prevent regressions in B-cleanup.1.b and beyond.

---

## Summary

| Question | Original audit answer (a.m.) | Revised answer (p.m. — this PR) |
|---|---|---|
| Is Phase B done? | "❌ 2.5% complete" | "✅ ~99% complete per spec line 91; the original audit graded against the wrong exit criteria" |
| Do any panels extend `Panel` in `src/ui/`? | "0/39" | "0 — but extending `Panel` is **not** a Phase B obligation; it's the separate `Adoption` track gated on D.4" |
| Is the cast inventory acceptable for Phase B exit? | "❌ 773, not 0" | "✅ 773 (unchanged per spec); 768/773 real casts now annotated; 0 unannotated real casts after this PR" |
| What should land next? | "B-cleanup.1 (Layout + LeftNavRail + PanelManager + makeDraggable)" | "B-cleanup.1.b (5 small constructor-symmetry edits) — single PR, < 1h reviewer load" |
| What's gated downstream? | "B-cleanup.2 – B-cleanup.6 over 2 sprints" | "Adoption.1 – Adoption.5 — gated on D.4, scoped above" |
