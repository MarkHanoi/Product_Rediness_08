# C59 — Multi-Pane View System (renderer-agnostic view hosting)

> **Stamp**: 2026-07-18 · **Status**: CANONICAL (Phase 1a landed — pure model; Phase 1b IMPLEMENTED — 2D-left/3D-right site authoring, single-Cesium re-target, boundary→3D fix — pending founder live verification; remaining live PaneHost wiring phased). L-412 stays OPEN and the contract stays CANONICAL (not ACTIVE) until the founder confirms Phase 1b live.
> **Scope**: The native, renderer-agnostic multi-pane view system: **panes** (left/right, extensible to N) that can host **any view** (MapLibre 2D site map · Cesium/Forma 3D Site · BIM WebGPU 3D · BIM Canvas2D plan · elevations/sections), and the user's ability to **assign or swap any view into any pane**.
> **Key principles**: P1 (single composition root), P2 (single THREE owner), P3 (single rAF), P4 (no `window as any`), P6 (commands only), P8 (spans on new exported functions).
> **Supersedes**: the narrow "3D Site on the right pane" enabler and the "site-view enabler button" discoverability idea (audit L-412). Absorbs the L-405 view-mode-switcher registry recommendation as its switcher surface.
> **Relates**: C06 (UI shell / view system / z-layering §7), C04 (rendering & scheduling — single rAF), C12/C19/C57/C58 (geospatial / site / parcel / envelope), the SPEC-MULTI-PANE-VIEW-SYSTEM design + phase plan.

---

## §0 — Why this exists (the founder's intent, verbatim)

> "The user should generally be able to swap from one view to another and project whichever view it wants in EITHER left or right split view, NATIVELY — without shortcuts — super robust for the long run — not just for the purpose of bringing the 3D Site to the right only."

Today PRYZM has **three mutually-incompatible view mechanisms** stacked on one `#container`:

1. **`SplitViewManager`** (`apps/editor/src/engine/views/SplitViewManager.ts`) — shrinks `#container` to 60% (LEFT) and mounts its **own fixed** right pane (`#svp-secondary-pane`, `position:fixed; right:0; width:40%`) that renders a **Canvas2D plan** and nothing else (SplitViewManager.ts:350–516, 477, 493–498).
2. **Cesium / Forma 3D Site** (`CesiumViewport`) — hard-targets `#container` as its mount parent (`GISAreaLayout.ts:213,257`), takes over the **whole** container via `setVisible(true)` (raises z-index above the BIM canvas + hides it), and is mutually exclusive with the 2D map.
3. **MapLibre 2D site map** (`SiteBoundaryMap2D`) — a `position:absolute; inset:0` **overlay inside `#container`** (SiteBoundaryMap2D.ts:287–297, 668).

Because each mechanism assumes it owns the whole container (or a hard-coded pane), you cannot natively put an arbitrary view in an arbitrary pane. "3D Site on the right" hard-wired into the SVP pane would be a **shortcut** that deepens the incompatibility. C59 replaces the three ad-hoc owners with **one** abstraction: renderer-agnostic **pane hosts** fed by a **view-type registry**.

---

## §1 — The core abstraction

### §1.1 — Vocabulary (Phase 1a — `apps/editor/src/engine/views/paneViewModel.ts`)

- **`RendererKind`** — `'maplibre' | 'cesium' | 'webgpu-three' | 'canvas2d'`. The backend a view is drawn with.
- **`ViewType`** — `'site-map-2d' | 'site-3d' | 'bim-3d' | 'bim-plan-2d'` (extensible: `elevation`, `section`, `rcp`, `schedule`, `sheet`).
- **`PaneId`** — `'left' | 'right'` today; string-typed so `pane-2`, `pane-3`, … extend to N-up with no type change.
- **`ViewTypeDescriptor`** — `{ viewType, rendererKind, singleton, label }`. `singleton` marks the heavyweight app-wide instances (one Cesium viewer, one WebGPU device).
- **`VIEW_TYPE_REGISTRY`** — the canonical `ViewType → ViewTypeDescriptor` map. The live `PaneHost` consults it to pick a mounter and to enforce the singleton invariant.
- **`PaneLayout`** — `Record<PaneId, ViewType | null>`: which view each pane currently hosts.

### §1.2 — Pure layout algebra (Phase 1a — landed + unit-tested)

- **`assignViewToPane(layout, paneId, viewType)`** — immutable; if `viewType` is a singleton already live in another pane, that pane is **vacated** (the one instance MOVES, never clones).
- **`swapPanes(layout, a, b)`** — swap the two panes' views.
- **`validatePaneLayout(layout)`** — returns conflicts when any singleton `RendererKind` is claimed by more than one pane (the double-mount guard).
- **`panesShowingRenderer(layout, kind)`** / **`resolveHostPane(layout, viewType)`** — GPU accounting + mount-target resolution.

> These are pure (no DOM/Cesium/THREE/I/O), P8 span-exempt, and pinned by `apps/editor/__tests__/PaneViewModel.test.ts`.

### §1.3 — `PaneHost` (phased — live wiring)

A **`PaneHost`** is a DOM pane element + a lifecycle (`mount(viewType)` / `unmount()` / `resize()`) that delegates to a **renderer mounter** resolved from `VIEW_TYPE_REGISTRY`. The invariants the live host MUST honour:

- **P2/P3 & single-instance.** There is exactly **one** Cesium viewer and **one** WebGPU renderer app-wide. A `PaneHost` does NOT construct a second instance — it **re-parents / re-targets** the existing singleton's canvas into the pane element (Cesium: move `#cesium-viewport-container`; WebGPU: the renderer canvas). `validatePaneLayout` MUST be asserted before a (re)mount; a conflicting layout is a programmer error.
- **Single rAF (P3).** No `PaneHost` spins a **continuous** `requestAnimationFrame` loop. All panes subscribe to the ONE frame bus (`runtime-composer` frame scheduler, C04) for ongoing rendering. A Canvas2D pane paints on a `pre-render` tick (as SVP does today); Cesium uses request-render mode driven by the same scheduler. A **one-shot** rAF settle (a single self-cancelling frame to re-frame/reflow after a re-parent or resize — the Cesium reflow primitive Phase 1b reuses) is permitted; a persistent per-pane loop is not (see §2 invariant 2).
- **DOM ownership & z-index (C06 §7).** Pane elements are children of the shell's pane container and carry an explicit z-layer from `zLayers.ts`. Panes **tile** (no overlap); chrome (view-picker, dividers, facts cards) sits above its own pane only.
- **Resize.** Each renderer reflows to its pane element on pane-size change (MapLibre via its `ResizeObserver`; Cesium via `CesiumViewport.reflowContainer()` — added Phase 1a; WebGPU via the OBC world resize; Canvas2D via its `setSize`).
- **Mount target, not `#container`.** The seam that dissolves the three incompatibilities: every renderer is handed its **pane element** to mount into. `CesiumViewport`'s `#container` hard-target and the MapLibre `inset:0` overlay are migrated to pane-scoped mounts.

---

## §2 — Invariants (normative)

1. **One instance per singleton renderer.** At most one pane may host a `cesium` view and at most one may host a `webgpu-three` view at any time. Enforced by `assignViewToPane` and asserted by `validatePaneLayout`. No code path constructs a second Cesium viewer or WebGPU device for a pane.
2. **Single rAF (P3) — no second frame LOOP (not "no rAF at all").** No pane may spin its own **persistent, continuous** animation/render loop; every pane subscribes to the ONE composition-root frame bus for ongoing rendering. This forbids a per-pane render loop — it does **not** forbid a **one-shot** `requestAnimationFrame` settle used during pane reflow (e.g. Cesium's reflow/re-frame primitive, which Phase 1b reuses to re-frame after a re-parent/resize). A single self-cancelling rAF that fires once to settle layout is explicitly allowed; only a self-re-scheduling per-pane loop is a violation.
3. **Command-driven layout (P6).** Pane assignment/swap is a **domain intent**: it flows through a command / view-state store (aligned with C06 §1 `viewRegistry` and the L-405 registry recommendation), not ad-hoc DOM toggles. The pure model in §1.2 is the reducer; the store/command wrapper is phased.
4. **No `window as any` (P4).** Pane/host globals are typed in `src/types/globals.d.ts`.
5. **Perf reality.** The founder's box runs the **WebGL fallback** (not WebGPU). A continuously-rendering Cesium pane alongside a BIM pane is acceptable (it is the SAME single Cesium already used), but two heavyweight GPU surfaces MUST NOT run in two panes simultaneously unless explicitly budgeted (today: `bim-3d` + `site-3d` are different devices and allowed; two `webgpu-three` panes are forbidden — one device).
6. **Renderer-agnostic.** Adding a new view type is a registry entry + a mounter; it MUST NOT require a new pane framework.
7. **Single resolved site-store accessor (P1 composition-root).** All site-state reads (parcel boundary, envelope, site model) MUST resolve the runtime through ONE shared accessor and read the site store from that single resolved runtime — a `runtime ?? window.runtime` resolution, or a single shared `getSiteModelStore()` accessor. Per-call-site direct `runtime.siteModelStore` reads are **forbidden**: a captured-null or stale `runtime` reference silently diverges readers from writers (some call sites trust `siteDispatch`'s module globals / `window.runtime`'s store while a captured-null reader sees an empty store). This is the Phase-1b Bug 2 root cause — a boundary committed into `window.runtime`'s store was invisible to a captured-null-runtime reader ("no parcel boundary yet"). One resolved accessor keeps every reader and writer on the same store instance; it is the P1 single-composition-root rule applied to site state, not merely a bug fix.

---

## §3 — Migration of the three legacy owners

| Legacy owner | Today | Under C59 |
|---|---|---|
| `SplitViewManager` fixed Canvas2D right pane | `#svp-secondary-pane` fixed at 40%, Canvas2D-only | The pane shell **mirrors** SplitViewManager's split geometry (left/divider/right, divider-drag → `controller.resize`) into a renderer-agnostic `PaneHost` (Phase 1b: `SiteAuthoringPaneShell`). `SplitViewManager` is **not** reused for pane geometry — it is hard-wired to a Canvas2D plan surface and cannot host Cesium/MapLibre. Its Canvas2D renderer becomes the `canvas2d` mounter; literal reuse/consolidation of the legacy class is deferred to Phase 4. |
| Cesium `#container` hard-target | `new CesiumViewport(#container)`; `setVisible` owns the whole container | Cesium mounts into / re-parents to the **assigned pane element**; `reflowContainer()` reflows on pane resize. |
| MapLibre `inset:0` overlay | overlay inside `#container` | `site-map-2d` mounter into a **pane element**, not a full-container overlay. |

The migration is **staged** (see §4) so each step is verify-gated and the current flows keep working until the pane host replaces them.

---

## §4 — Phased delivery (verify-gated)

- **Phase 1a — Pure core (LANDED).** `paneViewModel.ts` (vocabulary + layout algebra + singleton invariant) + `PaneViewModel.test.ts` (10 tests). `CesiumViewport.reflowContainer()` primitive added. No behaviour change — proves the abstraction, tsc+test gated.
- **Phase 1b — One non-Canvas2D view hostable in a pane (IMPLEMENTED — awaits founder live confirmation).** A minimal `PaneHost` (`SiteAuthoringPaneShell`) that **mirrors** SplitViewManager's split geometry (left/divider/right, divider-drag → `controller.resize`) while hosting arbitrary renderers, mounting the **3D Site (Cesium)** into either the left or right pane element (re-parenting the single `#cesium-viewport-container`, one-shot reflow via `reflowContainer()`), driven by the pure model. Proves renderer-agnostic hosting end-to-end for ONE hard case (the singleton Cesium). **Built this pass:** 2D-left / 3D-right site authoring, single-Cesium re-target, and the boundary→3D fix (single resolved site-store accessor, §2 invariant 7 — Bug 2). Verify (pending): 2D map LEFT + 3D Site RIGHT during site authoring, envelope live (the original founder scenario) — now via the general host, not a hard-wire. `SplitViewManager` is **not** reused for geometry here; literal consolidation is Phase 4.
- **Phase 2 — Registry-driven switcher (absorbs L-405).** Lift the `mountResultToggleBar` segmented switch onto `VIEW_TYPE_REGISTRY` + a per-pane view-picker; assignment/swap through a view-state command (P6). BIM plan/3D become pane views.
- **Phase 3 — Full swap-any-view-any-pane + N-up.** WebGPU BIM 3D re-targetable into a pane; per-pane camera state (`MultiViewCameraManager`/`ViewCameraStateStore`, L-405); optional 3rd/4th pane; per-pane view persistence.
- **Phase 4 — Consolidation.** Retire the three legacy owners' bespoke container logic once every flow routes through `PaneHost` — including the **literal reuse/retirement of `SplitViewManager`** (whose split geometry Phase 1b only *mirrors*), collapsing the mirrored geometry back onto a single shared implementation.

Each phase is independently shippable and CI-gated (tsc + vitest; the live phases add the founder's browser acceptance — localhost dev is unusable here, so per-phase code-tracing + unit tests gate the merge and the founder confirms live).

---

## §5 — Open items / cross-refs

- **L-405** (unified view-mode switcher) becomes C59 Phase 2's switcher surface (its "correct-fix" registry recommendation IS this contract).
- **C06 §7** governs the pane z-layering; C06 gains a §8 pointer to C59 for the view-hosting model.
- **SPEC-BUILDABLE-ENVELOPE-UX** (L-398/L-402b): the envelope render path is complete; C59 Phase 1b makes it visible during authoring by hosting the 3D Site in a pane rather than gating it behind a full-screen view swap.
- **Contract-17 lineage.** The historical "Contract 17 §4 — split view" (referenced in `SplitViewManager.ts` / `initScene.ts`) is subsumed here; C59 is its canonical successor.
