# C59 — Multi-Pane View System (renderer-agnostic view hosting)

> **Stamp**: 2026-07-22 · **Status**: CANONICAL (Phase 1a landed — pure model; Phase 1b IMPLEMENTED — 2D-left/3D-right site authoring, single-Cesium re-target, boundary→3D fix — pending founder live verification; **Phase 2 IMPLEMENTED — registry-driven per-pane view picker + `PaneLayoutStore` command layer + the `canvas2d` plan mounter — pending founder live verification**; Phase 3/4 phased). L-412 stays OPEN and the contract stays CANONICAL (not ACTIVE) until the founder confirms Phases 1b **and 2** live. ⚠ **Phase 2 is built ON TOP of the unverified Phase 1b** (it reuses the same `MultiPaneController` + Cesium re-parent path): if Phase 1b's live re-parent proves wrong, Phase 2's picker inherits that fault — the switcher's decision layer is unit-pinned, its *mounting* is not.
> **2026-07-25 addendum (L-625)**: **§6 added — STANDARDIZED VIEW PROPERTIES + the Sun/Shadow/Wind
> single source of truth.** The founder's "no matter the view, all views should have the SAME
> properties available where meaningful … kill duplicated information — Site Analysis and VIEW
> PROPERTIES repeat Sun/Shadow/Wind". The **pure property registry landed**
> (`viewPropertyModel.ts`, per-view applicability + single-owner) and the **shared-environment
> single source of truth landed + WIRED** (`environmentAnalysisStore.ts`): the View Properties
> panel no longer holds a private copy of Sun/Shadow/Wind/Climate/Population, and the Site Analysis
> sun scrubber publishes into the same store. The active-view dropdown + full/split capability
> matrix already existed (Phase 2 §1.4 picker); §6 records them as the standardization surface.
> **NOT founder-verified live** (localhost is unusable here — unit-pinned + code-traced).
> **2026-07-22 addendum (L-600)**: **§2 invariant 8 + §2.7 added — the SHARED CAMERA POSE.** The
> founder's *"same camera angle in all 3 main 3D views"* is a Phase-3 capability that has **never
> existed** (per-view camera memory is by design; the Cesium↔THREE boundary has never been
> synchronised). The **pure model landed** (`sharedCameraPose.ts`, 31 tests) and is **deliberately
> NOT wired** — it is queued behind Phase 3 for the same reason C60 §8 parks its own Phase 2 there.
> ⚠ **§2.7.7 records an OPEN founder decision** (angle-only vs angle+distance) that this contract
> deliberately does **not** take. Nothing in §2.7 is founder-verified live.
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
- **`ViewType`** — `'site-map-2d' | 'site-3d' | 'bim-3d' | 'bim-plan-2d' | 'bim-elevation-2d' | 'bim-section-2d'` (still extensible: `rcp`, `schedule`, `sheet`).
  - **Phase 2 extension (2026-07-22), recorded here per governance.** The founder asked for *"3D Site view, plan view, and **all the views**"* in the per-pane picker. `bim-elevation-2d` and `bim-section-2d` were added because they are **real surfaces today** — the Canvas2D plan pane already renders `viewType: 'plan' | 'section' | 'elevation'` from `viewDefinitionStore` — so omitting them would have made the "all the views" picker quietly incomplete. They are registered **`paneHostable: false` with a reason** (see below): assigning one directly to a pane needs a per-pane *view-definition id*, which is Phase 3's per-pane view state. Until then the picker lists them, disabled, and says where they DO render ("pick Plan, then choose the elevation in that pane's own view selector"). **`rcp` / `schedule` / `sheet` are deliberately NOT in the registry**: no pane-renderable surface exists for them at all, and listing a view PRYZM cannot draw — even disabled — is vapour, not honesty. They enter the registry when their surface does.
- **`PaneId`** — `'left' | 'right'` today; string-typed so `pane-2`, `pane-3`, … extend to N-up with no type change.
- **`ViewTypeDescriptor`** — `{ viewType, rendererKind, singleton, label, paneHostable, unavailableReason?, glyph? }`. `singleton` marks the heavyweight app-wide instances (one Cesium viewer, one WebGPU device).
  - **`paneHostable`** (Phase 2) — can this view be hosted in a pane **today**? `false` does **not** mean hidden. A non-hostable view still appears in every pane's picker, **disabled, with `unavailableReason` rendered in the row** (not only in a `title=`). A greyed option with no stated reason is a defect under this contract. `paneHostable` is the **static/contract** half of availability; the **runtime** half is `MultiPaneController.registeredKinds()` — a view whose `rendererKind` has no mounter registered in the current workspace is likewise disabled with a wiring reason. Both halves are adjudicated in one place: `describePaneViewOptions()`.
  - Current values: `site-map-2d` ✅ · `site-3d` ✅ · `bim-plan-2d` ✅ (Phase 2 mounter) · `bim-3d` ❌ *(the WebGPU renderer still owns `#container`; re-targeting is Phase 3)* · `bim-elevation-2d` / `bim-section-2d` ❌ *(need per-pane view state — Phase 3)*.
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

### §1.4 — The switcher: view-state store + per-pane picker (Phase 2 — implemented)

The founder's Phase-2 ask, verbatim: *"in each view (either split view or complete) the user should be able to easily, with a dropdown, change to another view — include 3D Site view, plan view, and all the views, and STANDARDISE this."* **Standardised** here has a precise meaning: **one** picker component, mounted on **every** pane, whose content is derived from `VIEW_TYPE_REGISTRY` — never a per-surface list of bespoke buttons (which is exactly what the legacy `mountResultToggleBar` segmented bar is).

- **`PaneLayoutStore`** (`apps/editor/src/engine/views/paneLayoutStore.ts`) — the **view-state store / command layer** invariant 3 requires. It owns the `PaneLayout`, and the ONLY write path is `dispatch(intent)` over the command-named intents `view.pane.assign` · `view.pane.swap` · `view.pane.solo` · `view.pane.restore-split` · `view.pane.set-layout`. Each intent is reduced by the **pure §1.2 algebra**, guarded by `validatePaneLayout` **plus** the availability rules above, then applied to the imperative shell (`MultiPaneController` implements the `PaneLayoutApplier` port), then committed and broadcast to subscribers. A **rejected** intent mutates nothing — no layout change, no renderer touched, no subscriber notified — and returns a human `rejected` reason. If the applier throws (the mount-time singleton assert), the store **rolls back** rather than diverging from what the panes actually show.
- **Callers must not write to `MultiPaneController` directly.** `applyLayout()` on the controller lands a layout on the renderers but leaves the store — and therefore every pane's picker — stale. Even a model-derived default (`siteAuthoringDefaultLayout()`) goes through `store.dispatch({type:'view.pane.set-layout', …})`.
- **`describePaneViewOptions()` / `describePaneLayoutActions()`** (`paneViewOptions.ts`) — **pure** (P8 span-exempt, same rationale as §1.2): given a layout + pane, they describe every registry view as `current` · `available` · `moves-singleton` · `unavailable`, always with a reason for anything that is not plainly available. A `moves-singleton` option is **enabled and labelled with its consequence** ("open in the right pane — there is only one Cesium instance, so it MOVES here and the right pane empties"), because the founder's headline case *is* moving the 3D Site between panes, and the vacating must be stated **before** the click.
- **`mountPaneViewPicker()`** (`PaneViewPicker.ts`) — the DOM chrome. It imports **no renderer** and holds **no layout state**: it renders from the store, dispatches intents, and repaints on the store's notification. It is a child of **its own pane element** and z-layers above that pane's surface only (C06 §7) — it can never overlay its sibling.
- **Full screen is a layout fact, not a second mechanism.** `view.pane.solo` vacates the other pane(s); the shell then collapses the empty pane and the divider so the survivor fills the shell — carrying **its picker** with it. That is how "in each view, split **or complete**, change to another view" holds without a second switcher. `view.pane.restore-split` returns to the remembered split.

---

### §1.5 — The VIEW REGION census, and why "one picker" was not enough (§ONE-REGION-SWITCHER, L-13257)

> ⚠ **Added 2026-09-08 because §1.4 above was satisfied and the founder was still right.** §1.4
> requires *"**one** picker component, mounted on **every** pane"*. That was measured green, by
> `oneViewSwitcher.spec.ts`, for the whole period the founder was photographing the opposite.
> The gap is exact and worth stating rather than smoothing over: **§1.4 counts pickers per
> PANE, and two of the app's five view regions are not panes.**

**The founder's ask, verbatim (2026-09-08, two screenshots):** *"I need the most possible robust
architecture for views … the way the user can change a view should always be robust and the same
— drop down on the middle of the view already implemented but not always implemented — on pryzm
view we still have the legacy style … I want this absolutely standardized."*

#### §1.5.1 — The audit: five hosts, two option tables

| # | Host | Region | Shape | Options from |
|---|---|---|---|---|
| 1 | `PaneViewPicker` | site panes (L/R) | centred pill | `describePaneViewOptions` (registry) |
| 2 | `ViewSwitcherPill` | `#container` | centred pill | `viewPanelOptions()` |
| 3 | `viewSegmentSwitcher` | whole-screen site | segmented bar | `viewPanelOptions()` |
| 4 | `viewSwitcherOnView` | Analysis / Parcel Law | body-level bar | `viewPanelOptions()` |
| 5 | `svp-view-select` | `#svp-secondary-pane` | ⛔ native `<select>` | `viewDefinitionStore` |

Two findings, both structural:

- **⭐ A COUNT INVARIANT CANNOT SEE A FORM DIVERGENCE.** Every region had exactly one control,
  which is what §1.4 and `oneViewSwitcher.spec.ts` ARM K measured — ARM K blesses row 5 **by
  name**. The founder's question was not *how many* but *is it the same one*, and nothing
  measured that axis.
- **⭐ THE TWO OPTION TABLES DISAGREE.** `describePaneViewOptions` derives from
  `VIEW_TYPE_REGISTRY` and therefore models neither **3D Globe** (a Cesium camera altitude,
  §2.9) nor **2D Satellite** (a MapLibre style). `viewPanelOptions()` models both as VARIANTS.
  So the same gesture offered a **different set** depending on the region it was made in.

#### §1.5.2 — The model (normative)

`apps/editor/src/engine/views/viewRegionSwitcher.ts` declares **`VIEW_REGION_REGISTRY`** — the
census of view regions. A **view region** is *a rectangle of screen showing ONE view, which
therefore needs exactly ONE way to change it*. It is deliberately **neither a `PaneId` nor a
`ViewType`**: `PaneId` names a slot in `PaneLayoutStore` (which only the site shell has), and
`ViewType` names what may be shown. The region is the third fact, and it is the one no file
owned — which is how `#svp-secondary-pane` came to be reasoned about in one file and not at all
in three others.

Each row declares `shape` · `anchorSelector` · `offersTheSix` · `offersViewDefinitions` ·
`dispatch` · `limitNote` · `visibleIn`.

1. **`SwitcherShape` has NO `'select'` and NO `'segmented-bar'` member.** A shape that must not
   appear is **unspellable**, not merely discouraged — a future region cannot declare a native
   control and still typecheck.
2. **Every region offers the founder's six.** `offersTheSix` is typed `true`, so a row cannot
   say otherwise. The six are `viewPanelOptions()`, the ONE definition (C06 §13: a panel is a
   HOST; the action is the AUTHORITY).
3. **Placement is MEASURED, never constant.** `resolveSwitcherTopPx(region, obstacles)` is pure
   and decides the top offset from real boxes. A zero-area box is an **absence**, not an
   obstacle at the origin — happy-dom returns all-zero rects, and a fake obstacle producing a
   real displacement is the defect shape, not a test artefact.
4. **A region that shares its phase and dispatches whole-screen MUST print its limit** (STR
   §26.1.1). Derived via `sharesItsPhase()`, **not** a declared flag a row could forget.
   ⭐ This predicate is the one the coverage gate corrected on its **first run**: the naive rule
   ("dispatch is whole-screen ⇒ must warn") fired on `site-whole-screen`, which is *already* the
   whole screen and has no layout to lose — a false warning, i.e. the very defect the adjacent
   rule forbids.
5. **`viewRegionSwitcherCoverage()` checks both directions** and is asserted clean by
   `viewRegionSwitcher.spec.ts`.

#### §1.5.3 — Status, stated honestly

**LANDED:** rows 1, 2 and 5 are one shape. The plan pane carries the shared pill; its
`<select>` is **re-parented into the pill's popup**, never rebuilt (rebuilding would be a
second definition of the view-definition list, arriving inside its own fix). The `#container`
pill is placed clear of `.wmb-toplevel-wrapper` — ⭐ **it was always mounted; it was underneath
the mode bar**, which is why the founder's PRYZM screenshot shows no dropdown and his site
screenshot shows two.

**NOT DONE, and the census now says so:** rows 3 and 4 remain their own shapes.
`viewRegionSwitcherCoverage()` fails if a region regresses, but retiring those two hosts is a
later increment. **Also not done:** a uniform split/single toggle across all four workspaces —
`PaneLayoutStore` (`view.pane.solo`, §1.4) and `SplitViewManager` are still two layout owners,
and the founder's *"split or not split, no matter whether the user is in Site / Author / Inspect
/ Analyse"* is satisfied only on the site shell.

---

## §2 — Invariants (normative)

1. **One instance per singleton renderer.** At most one pane may host a `cesium` view and at most one may host a `webgpu-three` view at any time. Enforced by `assignViewToPane` and asserted by `validatePaneLayout`. No code path constructs a second Cesium viewer or WebGPU device for a pane.
2. **Single rAF (P3) — no second frame LOOP (not "no rAF at all").** No pane may spin its own **persistent, continuous** animation/render loop; every pane subscribes to the ONE composition-root frame bus for ongoing rendering. This forbids a per-pane render loop — it does **not** forbid a **one-shot** `requestAnimationFrame` settle used during pane reflow (e.g. Cesium's reflow/re-frame primitive, which Phase 1b reuses to re-frame after a re-parent/resize). A single self-cancelling rAF that fires once to settle layout is explicitly allowed; only a self-re-scheduling per-pane loop is a violation.
3. **Command-driven layout (P6).** Pane assignment/swap is a **domain intent**: it flows through a command / view-state store (aligned with C06 §1 `viewRegistry` and the L-405 registry recommendation), not ad-hoc DOM toggles. The pure model in §1.2 is the reducer; the store/command wrapper **landed in Phase 2** as `PaneLayoutStore` (§1.4). **Normative consequence:** no UI may call `MultiPaneController.assignView/swap/applyLayout` directly, and no UI may move a view by toggling DOM/visibility. The picker's click handlers dispatch intents and nothing else; a review that finds a `<select>` (or a button) reaching past the store into a mounter, a controller, or a style is looking at a violation of this invariant, not a shortcut.
4. **No `window as any` (P4).** Pane/host globals are typed in `src/types/globals.d.ts`.
5. **Perf reality.** The founder's box runs the **WebGL fallback** (not WebGPU). A continuously-rendering Cesium pane alongside a BIM pane is acceptable (it is the SAME single Cesium already used), but two heavyweight GPU surfaces MUST NOT run in two panes simultaneously unless explicitly budgeted (today: `bim-3d` + `site-3d` are different devices and allowed; two `webgpu-three` panes are forbidden — one device).
6. **Renderer-agnostic.** Adding a new view type is a registry entry + a mounter; it MUST NOT require a new pane framework.
7. **Single INJECTED site-store accessor (P1 composition-root).** All site-state reads (parcel boundary, envelope, site model) MUST resolve the site store through ONE shared accessor, and every reader and writer MUST land on the same store instance. Per-call-site direct `runtime.siteModelStore` reads are **forbidden**: a captured-null or stale `runtime` reference silently diverges readers from writers (some call sites trust `siteDispatch`'s module globals while a captured-null reader sees an empty store). This is the Phase-1b Bug 2 root cause — a boundary committed into one store was invisible to a captured-null-runtime reader ("no parcel boundary yet"). **Terminal ideal (the norm this invariant mandates):** the site subsystem is handed the **real, composition-root-threaded runtime by injection** (`mountGISArea(props, {runtime})` / `setSiteRuntime(runtime)`), and the single shared `getSiteModelStore()` accessor reads from that injected runtime. **Transitional debt (NOT doctrine):** the `runtime ?? window.runtime` window-fallback shipped by the L-412 fix (`5fe0fa07`) is **time-boxed migration debt**, not the ideal pattern. It exists only because `initUI.ts:2820` deliberately passes `createMainLayout(props, null)` (the Phase B.2 / S73-WIRE gate — threading the real runtime there would prematurely activate ~30 half-migrated child paths), so the captured runtime is null and site code reaches for the typed global `window.runtime`. The window reach-through is a **consequence of the deliberate null**, tolerated ONLY until Phase C threads the runtime — and MUST be removed then. Tracked as **L-413**. This is the P1 single-composition-root rule applied to site state; the window fallback is a temporary bridge to it, not a blessed end state.

8. **The shared camera pose is ONE pure value, PROJECTED — never a listener graph** (Phase 3, §2.7). No renderer may write another renderer's camera. The only write path is an intent on the shared-pose reducer, and a renderer applying a projected pose MUST NOT be able to re-emit it (the epoch discipline). θ is applied EXACTLY ONCE, on the BIM side. See §2.7 for the mechanism and why a listener implementation is forbidden.

9. **A REGISTRY-DERIVED SURFACE MAY ONLY OFFER VIEWS. Anything else is modelled BESIDE it, as an action** (§2.9, L-6800..L-6809). A control whose contents are derived from `VIEW_TYPE_REGISTRY` can, by construction, offer nothing that is not a `ViewType` — so the fix for "this derived bar is missing X" is **never** to mint a `ViewType` for X. Camera framings, layout restores and reframes are **actions**; they carry a label, an `enabled`, and a **reason whenever `enabled` is false**, and they return their intents as **DATA** (invariant 3). See §2.9.

10. **THE VIEW REGION HAS EXACTLY ONE OWNER. The workspace mode SIZES it; the split DIVIDES it; no other code writes its box** (§2.10, L-13030, STR §26.1.2). A workspace mode (Analysis / Inspect / Data) and a split are **not siblings competing for the shell** — they are two levels of one hierarchy. The mode decides how much of the shell is view region; the split decides how that region is partitioned into panes; a pane decides which view it hosts. Each level reads the level above and writes only its own. **Normative consequence:** `#container.style.width` (and `maxWidth` / `flexGrow` / `flexBasis`) has exactly ONE writer. A second module writing that box — for any reason, including "restoring" it — is a violation of this invariant, not a workaround for a timing problem, and MUST NOT be repaired with a debounce, a re-assert pass, or a settle guard. See §2.10.


11. **EVERY VIEW REGION CARRIES THE SAME SWITCHER, IN THE SAME SHAPE, OFFERING THE SAME SET** (§1.5, L-13257). A view region is a rectangle showing one view; it is not necessarily a pane, and invariant "one picker per pane" does **not** reach the two regions that are not panes (`#container`, `#svp-secondary-pane`). **Normative consequence:** a region MUST be declared in `VIEW_REGION_REGISTRY`, MUST carry a pill (the `SwitcherShape` type admits no native `<select>` and no segmented bar), MUST offer `viewPanelOptions()` in full, and MUST place that pill by measurement rather than by a constant offset. ⭐ **A count invariant cannot see a form divergence** — this one is checked on shape, set and placement precisely because §1.4's count stayed green while the divergence shipped.

---

## §2.10 — The view region is a HIERARCHY, not a set of siblings (L-13030, STR §26.1.2)

> ⛔ **CORRECTED 2026-09-06, SAME DAY, BY THE LANE THAT IMPLEMENTED IT (`e0edcdd1`). Four of the
> claims below were WRONG. They are kept, struck through in prose, because the WAY they were wrong is
> the reusable lesson: §2.10 was written from a `grep` and a console trace, and a grep cannot see
> what a stylesheet does, cannot tell a VARIABLE named `container` from the ELEMENT `#container`, and
> cannot tell a live collision from dead code.**
>
> **(a) THE CENSUS WAS WRONG IN BOTH DIRECTIONS — one row was a phantom, three were missing.**
> ~~"SIX write sites across FOUR modules"~~ → **SEVEN inline sites across FIVE modules, PLUS a
> stylesheet rule.** The header even contradicted its own table, which enumerated nine.
> - ❌ **`AIAreaLayout.ts` was a FALSE POSITIVE.** Its `container` is
>   `document.getElementById(aiPanelId)` — the **AI chat panel**, never `#container`. The variable
>   has since been renamed `panelEl` so the next census cannot re-mint the row.
> - ⚠ **MISSING: `WorkspaceController.ts` `_applyLayout` (:437-439)** — the fourth owner the prose
>   correctly named but the table omitted.
> - ⚠ **MISSING: `halfCanvasResizer.ts`** `apply()` + `dispose()`.
> - ⚠ **MISSING, AND THE WORST OF ALL: a STYLESHEET rule.** `ui/styles/panels/splitView.ts` carried
>   `#container.svp-active { width:60%; max-width:60%; flex-grow/shrink/basis: !important }`. **The
>   `!important` flex declarations meant NO inline write could ever RELEASE the region while that
>   class was on the node.** A census of `.style.width` assignments is structurally blind to this.
>
> **(b) §2.10.2 NAMED THE WRONG PAIR. The SHAPE was right; the culprits were not.**
> ~~`DataWorkbench`'s `50%` fighting `SplitViewManager`'s `60%`~~ — **that collision is LATENT, never
> live**: `DataWorkbench`'s `'split'` arm is **dead code**, because `WorkspaceController._applyLayout`
> drives the workbench only to `'hidden'` or `'full'`, and nothing anywhere dispatches
> `setMode('split')`.
> ⭐ **The loop the founder actually recorded came from a module §2.10 never mentioned:
> `ui/platform/halfCanvasSplitViewPolicy.ts`**, called from `_applyLayout`. It returns `close` on
> entering a half-canvas mode → `SplitViewManager.deactivate()`, and `reopen` on returning to full →
> `activate()`. That reproduces his block exactly **and in his order**. A second producer of the same
> pair is `svpPlanPaneMounter.mount()`, which does `if (isActive) deactivate(); activate();` to
> rebuild from a known state.
> ⭐⭐ **SO THE ROOT WAS MODE↔SPLIT *COUPLING*, NOT TWO RIVAL WIDTH STRINGS — and that is why the fix
> had to DELETE the policy rather than merely unify the writers.** A single-owner refactor that kept
> `halfCanvasSplitViewPolicy` would have left the oscillation running through a tidier pipe. The
> invariant in §2 clause 10 is still exactly right; the mechanism paragraph was not.
>
> **(c) ⚠ THE MODE'S WRITE NEVER BOUND — AND FIXING IT IS A LIVE BEHAVIOUR CHANGE.** §2.10.1 said the
> mode "also writes `#container`'s box". It *wrote* it; the write was **ignored**. `#container` is
> `flex: 1 1 0`, and a `width` with no `max-width` and no `flex-grow: 0` does nothing under flex
> layout. **So Analysis and Inspect have been rendering a FULL-WIDTH 3D canvas with the panel merely
> covering its right half.** The owner now writes all five properties, so the region genuinely
> narrows. ⭐ **This is the one item here that wants founder eyes**: canvas-anchored chrome reading
> `--shell-canvas-cx` will now centre on the real half-region instead of on the viewport — which is
> correct under §2.10.3 clause 4, and visibly different from what shipped before.
>
> **(d) §2.10.3 CLAUSE 3 CANNOT BE IMPLEMENTED LITERALLY TODAY, and that is not a defect.**
> `.svp-pane` is `position: fixed` at `document.body`, **not** a child of the region — so *"the split
> writes pane boxes INSIDE the region"* is expressed as **arithmetic** (the owner computes the pane's
> `right` offset from the mode's claim), not as nesting. That offset is also what dissolves L-12915:
> the pane now sits *beside* `#anl-surface` instead of behind it, which is why the close/reopen
> policy had no subject left to close. Re-parenting `.svp-pane` into the region is **C59 Phase 4**
> consolidation, not a prerequisite for this invariant.
>
> **(e) ONE RESIDUAL, STATED RATHER THAN HIDDEN.** `#container { transition: width 0.2s }` is kept
> (presentation, not geometry), so each region change animates and the `ResizeObserver` fires several
> times per transition. **That is the "resize ×4" in the founder's trace.** It is BOUNDED per
> transition, so §2.10.4 holds as written; dropping the transition would make it exactly one, and is
> a deliberate non-change.
>
> ⭐ **THE OWNER, AS BUILT:** `apps/editor/src/ui/layout/viewRegionGeometry.ts`. Mode declares a
> **claim** on the shell, split declares a **fraction of the region**, a drag declares an
> **override**; one pure `computeViewRegionBoxes` derives `#container`'s five box properties +
> `display`, `.svp-pane`'s width **and `right` offset**, and `.svp-divider`'s position. ⭐ **It
> contains NO guard, debounce, throttle or `alreadyApplied` latch — termination is a PROPERTY OF THE
> SHAPE:** the boxes are a pure function of the state, so re-applying writes identical strings, which
> move no box, which fire no observer, which start no settle pass. **That is what §2.10.2's
> prohibition was protecting, and it is what a debounce would have counterfeited.**
> Pinned by `apps/editor/src/engine/__tests__/viewRegionGeometry.spec.ts` — **19/19**, carrying the
> §2.10.4 cycle on a real DOM *plus* the four properties a pixel assertion cannot catch: **idempotent,
> terminating (ten re-applies change no property), order-independent (mode-then-split ≡
> split-then-mode), and total on a shell that does not exist yet.**


> **Founder, verbatim (2026-09-06), after testing the deployed build:**
> *"We need to have a sound and really robust system for the split view / and the analysis / inspect
> panels — because **SPLIT VIEW SHOULD ALWAYS SPLIT THE VIEW OF THE SECTION OF THE VIEWS.** So if in
> AUTHOR, then split view will divide the view in 2. But in ANALYSE view, then split view will
> divide **THE LEFT HAND SIDE VIEW** in 2 — and this is not robust at the moment, is mixed up, not
> architecturally sound."*
>
> And, on being shown it again: *"we are in AUTHOR, but the split view keeps intact on the left hand
> side, and when NON-split view the view is already splitted… then I opened the Analysis tab and
> there I managed, by clicking split view again, to set it correctly — many bugs here. But when
> clicking again Author, we see again that the single view doesn't cover the complete screen."*

### §2.10.1 — Why §0's diagnosis was INCOMPLETE, which is why this kept coming back

§0 of this contract names **three** mutually-incompatible mechanisms stacked on one `#container`
(`SplitViewManager`, Cesium, MapLibre) and C59 dissolved them into pane hosts. **That enumeration
missed a fourth owner, and the fourth is the one still breaking.** The **workspace mode** —
Analysis / Inspect / Data — also writes `#container`'s box, and it was never modelled as a view
mechanism at all because it presents as a *panel*, not as a view. So C59 fixed the three it named
and left the unnamed one writing the same property.

**MEASURED 2026-09-06 — `#container.style.width` has SIX write sites across FOUR modules:**

| Module | Sites | Writes |
|---|---|---|
| `SplitViewManager.ts` | `:580`, `:638`, `:1769` | `(1-ratio)*100%` on activate · `''` on deactivate — plus `maxWidth`, `flexGrow:0`, `flexShrink:0`, `flexBasis:auto` |
| `DataWorkbench.ts` | `:918`, `:922`, `:926`, `:930` | `''` (hidden) · `calc(100% - 420px)` (panel) · **`50%` (split)** · `'0'` (full) |
| `svpPlanPaneMounter.ts` | `:102` | `''` |
| `AIAreaLayout.ts` | `:116` | `${w}px` |

⚠ **THE CODE ALREADY CONFESSES THIS, AND ITS CONFESSION UNDERCOUNTS.** Both
`SiteAuthoringPaneShell.ts:410` and `PaneHost.spec.ts:446` carry the comment *"`#container.style.width`
has **three** writers"*. It is four modules and six sites. A comment that names the defect but gets
its size wrong is how a known problem stays open: the number looked survivable.

### §2.10.2 — The failure is an OSCILLATION, not a race, and that distinction decides the fix

Two writers of one property, each of whose write triggers the other's settle pass, is a **feedback
loop**. `DataWorkbench` (split mode) writes `50%`; `SplitViewManager` writes `60%` plus flex
overrides; each write resizes the canvas; each resize runs the placement/settle pass that re-asserts
the other's value.

**Captured in the founder's console — this exact block repeats SIX times consecutively for ZERO user input:**

```
[SplitViewManager] Canvas2D context ready
[SvpPlanToolOverlay] Attached with snap service. viewId: vd-sys-plan-l0
[SplitViewManager] Split view activated (Canvas2D plan mode)
resize — canvas 501x976   (x4)
[SplitViewManager] §VIEW-AUTOFRAME: framed main 3D viewport on split-view entry.
[SvpPlanToolOverlay] Detached
[SplitViewManager] Split view deactivated
resize — canvas 836x976   (x4)
```

Eight canvas resizes and one camera re-frame per cycle. **The founder's three symptoms are three
resting points of this one loop** — "Author still split on the left", "non-split is already split",
"single view doesn't cover the screen" — which is precisely why they were reported as separate bugs
and fixed separately, without converging.

⛔ **THE FORBIDDEN FIXES, stated so a future lane does not spend a week on one.** A debounce, a
throttle, a re-entrancy guard, an `if (already applied) return`, or a harder re-assert pass all make
the oscillation *settle faster* while leaving two modules disagreeing about the value. The loop
returns the first time a transition is slower than the guard window — and it will be, on the
founder's WebGL box, on a Cesium mount, which is async (§1.4). **The repeated
`§PANE-PLACEMENT-AFTER-MODE-SWITCH … putting it back` in the same trace IS a re-assert pass already
doing its job and not helping** (L-13025); adding a second one is the same move again.

### §2.10.3 — The model (normative)

1. **VIEW REGION.** The part of the shell that holds panes. It is **not** the window, and it is not
   `#container` by definition — `#container` is merely what implements it today.
2. **The WORKSPACE MODE sizes the view region, and nothing else.** Author → the region is the whole
   shell. Analysis / Inspect / Data → the panel claims its share and the region is what remains. The
   mode writes the region's box; it never writes a pane, never touches split state, and never
   consults it.
3. **The SPLIT divides the view region — always, and only.** In Author the region splits in two; in
   Analysis the *remaining* region splits in two. The split writes pane boxes **inside** the region,
   as fractions of it. **It never writes the region's own box.** The analysis panel is never one half
   of a split.
4. **A PANE hosts one view** and owns its own chrome (§1.4). Every pane control — the view dropdown,
   the split toggle, the drag handle — is a child of its pane and positioned **relative to that
   pane**, never to the window and never to the canvas (L-13003, L-13027).
5. **Reads go up, writes go down.** Each level may read the level above and write only its own.
   No level re-asserts another level's value.

**These follow from the model and are the observable form of it:**

- Split state is **orthogonal to workspace mode** and survives a mode change. Toggling Analysis does
  not clear, set, or re-enter the split; toggling the split does not resize the panel.
- Changing the workspace mode changes exactly one thing: the region's size. Pane count, pane
  contents, and which view is in which pane are unchanged.
- Every geometry transition is **idempotent and terminating** — applying it twice equals applying it
  once, and applying it once triggers no further application.

### §2.10.4 — The acceptance test (a lane MAY NOT claim §2.10 without it)

From Author, split → **two views**. Switch to Analysis → the panel takes its share and **the split
survives inside the remaining region**, still two views, now narrower. Switch back to Author → the
panel yields and the two views expand to fill the shell. Repeat the cycle three times.

**Pass conditions, all of them:** no pane blanks · no control leaves its pane · the count of views
never changes · the shell is fully covered in every state · and — the one that catches the
oscillation — **each transition produces a BOUNDED number of canvas resizes, and the console shows
no `Split view activated` / `Split view deactivated` pair that the user did not ask for.**

⛔ **NOT LICENSED BY THIS SECTION** — the standing constraints are unchanged: a second Cesium viewer
or a second MapLibre map (§2 invariant 1, §L-412 — one of each, re-targeted); a rival option table
(`viewPanelOptions.ts` stays the one definition, §2 invariant 9); or losing §26.1.1's mutual
exclusion — at most one Cesium-backed view is ACTIVE across the whole region however it is divided.

⭐ **AND THE LEGACY PATH IS REMOVED, NOT RETAINED BESIDE THE NEW ONE.** The founder's instruction
was explicit: *"everything needs to be perfect and don't have legacy code."* A migration that leaves
`DataWorkbench` still writing `#container.style.width` behind a flag has not satisfied this section —
it has added a fifth writer.

### §2.10.5 — BOUNDED IS NOT ENOUGH: a reflow to an UNCHANGED box must do NO WORK (L-13205 / L-13206)

> **Founder, verbatim (2026-09-07), pasting a console trace taken while dragging the split:**
> *"CHECK ALSO FOR ERRORS AND SOLVE THEM - AND DO EVERYTHING SOUND"*

**§2.10.4 asks each transition for a BOUNDED number of canvas resizes, and this path SATISFIED that
letter while violating its point.** The founder's trace shows
`[gis][cesium] resize (external-reflow (multi-pane host)) — canvas NxM` dozens of times across one
divider drag — 701 → 702 → 704 → 709 → 722 → … → 447 → 338 — **with many sizes logged 2× and 4×.**
One settle pass per frame is bounded. It is also useless work, every frame, on the founder's WebGL
box, over a 3-D-tiles city.

**§2.10.4 is therefore AMENDED, not reinterpreted.** Its pass conditions now also require:

> **A geometry transition that measures the SAME box as the last one must produce ZERO renderer
> work: no buffer re-allocation, no forced render, and no console line beyond a count.**

**Why the old shape produced work at all — and why the answer was not "Cesium should guard this".**
Cesium already does. `CesiumWidget.resize()` early-returns without re-allocating when canvas
`clientWidth` / `clientHeight` / `devicePixelRatio` are unchanged. **PRYZM defeated that guard**:
`CesiumViewport.forceResizeAndRender` called `viewer.resize()` (correctly a no-op) and then
`scene.requestRender()` **unconditionally**, plus a scheduled second unconditional
`resize() + requestRender()`. The viewer runs `requestRenderMode: true`, so `requestRender()` is
*precisely* the call that forces Cesium to draw a frame it had already decided it did not need —
**two full frames per reflow request.** The same size repeats because
`SiteAuthoringPaneShell` writes the pane box as a 3-decimal float percentage while `clientWidth` is
an integer: consecutive drag frames genuinely land on the same pixel width.

**And there were TWO writers producing the request, one of them by construction.**
`MultiPaneController.reassertPlacement()` fans out to `PaneHost.reassertPlacement()`, and **every
return path of that method already ends in `this.resize()`** — so `runSettle`'s following
`controller.resize()` reflowed every host a SECOND time, to the same box, on every placement settle.
Reducing the writer is the §2.10-native half of the fix; the equality test is the other half.

#### ⛔ THIS IS NOT ONE OF §2.10.2's FORBIDDEN FIXES, AND THE DISTINCTION IS NORMATIVE

A future lane WILL read the equality test as *"an `if (already applied) return`"* and try to remove
it. Read §2.10.2 precisely before doing so. It forbids **a timer or a latch used to settle a FEEDBACK
LOOP between two rival writers of one property** — such a fix makes the oscillation settle faster
while leaving the two writers disagreeing, so it returns the first time a transition is slower than
the guard window. **That is a different situation from this one in every particular:**

| | §2.10.2's forbidden latch | §2.10.5's equality test |
|---|---|---|
| Writers of the property | TWO, disagreeing | ONE (the split writes pane boxes; the reflow writes nothing) |
| What repeats | an OSCILLATION — each write triggers the other's settle | a request to re-measure a box that did not move |
| The mechanism | a window in time (timer / re-entrancy flag) | a comparison of the MEASURED box, now |
| If a transition is slow | the guard window is missed; the loop returns | nothing changes; slowness is irrelevant |
| Does it delay anything | yes | **no** — a real change is honoured on the very next call |

§2.10.3's own note is the template this follows, verbatim: *"termination is a PROPERTY OF THE SHAPE:
the boxes are a pure function of the state, so re-applying writes identical strings, which move no
box, which fire no observer, which start no settle pass."* **The equality test makes the RENDERER's
reflow a pure function of the measured box, exactly as the pane geometry is already a pure function
of the state.** No timer exists anywhere on this path, and none may be added.

#### Normative clauses

1. **A layout host's reflow request defaults to `if-changed`.** `CesiumViewport.reflowContainer()`
   is the entry point the multi-pane host calls on every settle pass — i.e. once per mousemove of a
   divider drag — and it must skip when the measured box is identical to the last effective reflow.
2. **`force` is an EXPLICIT argument of the callers that changed something the measured box cannot
   report.** Today that is exactly one case: a DOM re-parent into an identically-sized pane. Mount,
   `setVisible(true)` and the warm-hidden path also force, because a 0-size or hidden container must
   be made to paint. **A caller may not force "to be safe" — forcing is a claim about the DOM.**
3. **A skipped reflow is COUNTED, never silent** (§CONTEXT-DATA-HONESTY). The count is printed by the
   next effective reflow, so the console shows one line per genuine size with the number of redundant
   requests attached. *"No reflow happened"* and *"twelve reflows were dropped"* must not print the
   same value — that is how the redundant writer stays visible instead of being papered over.
4. **An unmeasurable box is never "unchanged".** `null` must not compare equal to anything, including
   another `null`. "Cannot tell" and "did not move" are different answers.
5. **A failed reflow forgets the box.** Recording a size the renderer never actually drew at would let
   a later `if-changed` request skip on a lie.
6. **The scheduled second pass is conditional in BOTH modes.** It exists only because a container
   often acquires its real size a frame after `display` flips `none → block`; when the box did not
   move since the first pass measured it, the first pass already drew at that size.

#### The acceptance test

`apps/editor/src/ui/geospatial/__tests__/cesiumReflowNoOp.spec.ts`. It drives
`runReflow` — **the production function, not a re-implementation of it**
(§FAKE-MORE-CAPABLE-THAN-REAL) — through a counting port and asserts **CALL COUNTS**: thirteen
identical requests produce ONE render, ONE log line and ONE scheduled pass; a real size change is
honoured on the very next call with no elapsed time; `force` is never skipped; the second pass does
nothing at an unchanged box and DOES render at a box acquired a frame late. Source-level arms pin
that `forceResizeAndRender` actually routes through the gate, that `reflowContainer()` defaults to
`if-changed`, that a DOM move forces, and that `runSettle` no longer calls `controller.resize()`
after `reassertPlacement()`. **Verified falsifiable:** with `shouldSkip` stubbed to `false` the file
fails 2 of 17.

---

## §2.9 — A derived surface cannot offer a non-view, and that is a FEATURE (L-6800..L-6809)

> **Founder, verbatim (2026-08-22):** *"add in the top panel buttons **3d globe** also."*
> **And (2026-08-21), quoted in the source of the very file that could not deliver it:**
> *"at this stage the user should be able to just go to 3D globe, so a button 3D globe / 3D site in the middle top would be beneficial."*

**Decision recorded in [ADR-0357](../adrs/ADR-0357-the-globe-is-a-camera-framing-not-a-view-type.md).**

### §2.9.1 — The defect shape, because it will recur

`siteViewQuickToggleModel.ts` (the top-centre `▦ 2D Site Map | ◉ 3D Site | ◧ Split` bar) named itself *"the … **3D globe / 3D site** control"* and shipped without a globe. **That was not an oversight.** Two individually-correct commitments forbid each other:

- its segment set is **DERIVED** from `VIEW_TYPE_REGISTRY` (§1.4 — *"never a per-surface list of bespoke buttons"*), so a globe segment requires a globe `ViewType`; and
- **C60 §6.10 forbids that `ViewType`**, because C60 §6.5 says the globe and the 3D Site **are the same viewer at different camera altitudes**.

The derivation could **never** have produced a globe. **The bug was a header promising a capability the derivation structurally excludes** — not a missing `if`. Normative consequence: when a derived surface is asked for something it cannot enumerate, **do not extend the enumeration** — check first whether the thing is a view at all.

### §2.9.2 — MEASURED: the rival ViewType is reachably broken, not merely redundant

Registering `site-globe-3d` as a second `cesium`, `singleton: true` view type:

```
assignViewToPane(EMPTY, RIGHT, 'site-3d')       → {left: null,            right: 'site-3d'}
assignViewToPane(  …  , LEFT,  'site-globe-3d') → {left: 'site-globe-3d', right: 'site-3d'}
validatePaneLayout(…)  → {ok:false, conflicts:[{rendererKind:'cesium', panes:['left','right']}]}
```

`assignViewToPane` vacates a singleton's previous pane only when the view type is **the same**, so two different `cesium` singletons do not vacate each other. The pure algebra yields an invalid layout and only `PaneLayoutStore.guard()` catches it — **as a rejection of the user's click**. In the founder's own default layout (2D map left · 3D Site right) the globe button would have refused **every** press. Pinned as a test in `siteViewQuickToggle.spec.ts`, so the decision is re-provable rather than remembered.

### §2.9.3 — The action shape (normative)

An action beside a derived segment set MUST:

1. **Return its intents as DATA** (invariant 3). A click touches no renderer, no `MultiPaneController` and no DOM style.
2. **Reuse the segment sequencing for its pane half.** "Show me X full screen" already has one implementation (`segmentClickIntents`); a second copy is a second thing that can disagree about how a heavyweight singleton reaches the screen. `globeClickIntents()` delegates and appends its camera intent **last** — framing a pane that is not mounted yet drops the target.
3. **Use a SEPARATE intent namespace per port.** `view.pane.*` goes to `PaneLayoutStore`; `view.site.*` goes to an injected camera port. The pane store holds no camera state and must not grow one.
4. **Carry a reason whenever it is disabled**, and **inherit** the underlying view's reason rather than restating it.
5. ⛔ **Have a route back, and gate the way OUT rather than the way back.** A control that takes the user somewhere it cannot return from is the L-942 shape. When the return entry point is unregistered, the **outbound** click is refused with that reason — refusing on the way out is free; refusing on the way back strands.
6. **Own at most one bit of state, and only as memory of its own command.** The `'site' | 'world'` framing bit is the exact analogue of `PaneLayoutStore._splitMemory`. ⛔ It is **not** read back from the renderer: C60 §1.1 disqualifies camera-altitude sniffing (*"IT FLAPS"*), and an action describes **what the click does**, never where the camera is.

---

## §2.7 — The shared camera pose (L-600) — Phase 3, pure model LANDED, NOT WIRED

> **Founder, verbatim (2026-07-22):** *"I want to keep the view always the same camera angle in
> all the 3 main 3D views — 3D globe, 3D Site, and 3D PRYZM (BIM) — but it doesn't work."*

### §2.7.1 — It has never existed. This is a GAP, not a regression.

Two mechanisms, each correct for what it was built for, each wrong for this:

1. `ViewController._cameraStateStore` (`ViewCameraStateStore`, `ViewController.ts:132`;
   `restore` at `:1180` 3D / `:1479` plan / `:1646` elevation / `:1771` section / `:1848`
   ground; `save` at `:1874` on deactivate) is keyed **by view-definition id**. Every view is
   DESIGNED to return exactly where you left it.
2. The globe and the 3D Site are **Cesium** (`CesiumViewport`) — a different renderer, a
   different camera type, a different coordinate frame (ECEF vs site-local metres). The BIM
   camera store cannot reach across that boundary and never has.

⇒ Nothing broke. There is no synchronisation to repair; there is a capability to add.

### §2.7.2 — Three surfaces, TWO renderers (normative)

The founder names three views. C59 §2 invariant 1 and C60 §6.5 both say the globe and the 3D
Site are **the same Cesium viewer at different camera altitudes**. The shared-pose model
therefore enumerates three *surfaces* (`globe` · `site-3d` · `bim-3d`) because they have
different distance bands and different producers — **not** because a second viewer exists.
Nothing in §2.7 may be read as licence to construct one.

### §2.7.3 — ONE pure pose, PROJECTED (normative)

The shared camera state is a **pure, unit-tested reducer** — the same shape as `paneViewModel`
(§1.2) and C60's `siteEntryModel` — whose projections the renderers consume.
Implementation: `apps/editor/src/engine/views/sharedCameraPose.ts`.

**A listener implementation is forbidden.** "Cesium moves → write BIM; BIM moves → write
Cesium" oscillates, and the oscillation is structural, not a tuning problem. The remedy is
structural: ONE pose in view state, mutated only by an intent
(`view.camera.pose-observed` · `view.camera.set-link-mode` · `view.camera.reset`), projected
outward. **A renderer never writes another renderer.**

**Echo suppression is a monotonic EPOCH**, modelled directly on the discipline that already
solves this exact problem in `CesiumViewport`: `beginProgrammaticFly()` /
`endProgrammaticFly(token)` (§GLOBE-FRAME-NO-JUMP-2), where a token stops a *superseded*
flight's `cancel` clearing the in-flight flag out from under a newer one. Here:

| `appliedEpoch` vs `state.epoch` | verdict | why |
|---|---|---|
| `<` | **stale** | a newer pose superseded it — the `formaFlyToken` case |
| `>` | **future** | an invented token; refused, never trusted |
| `=` and within tolerance | **echo** | the surface is reporting back what we gave it |
| `=` and outside tolerance | **accept** | the user moved the camera |

Acceptance strictly increments the epoch, so a projection at epoch *E* can only produce
observations at `appliedEpoch === E` that are within tolerance ⇒ **an applied pose cannot
re-emit**. That is a property of the shape, pinned by a ping-pong property test, not a tuned
constant.

### §2.7.4 — What is shared is the ANGLE. The TARGET is not. (normative)

The pose carries `headingDeg` + `pitchDeg` + `distanceM` and **no target**. This is what makes
the model frame-independent, and it dissolves two problems that would otherwise be fatal:

- **Pre-site there is no site-local target.** The LTP-ENU frame is established only when a site
  is chosen (C12; C19 §1.3), i.e. *after* C60's `world`/`country` stages. A pose carrying a
  site-local target would be undefined for half the entry flow.
- **Each surface already owns what it looks at** — the globe: C60's entry-stage `focus`; the 3D
  Site: the site; the BIM view: the model. Those stay where they are.

**C60 relationship, decided and recorded here** (C60 §4 is unchanged by this): the entry-stage
camera is a **producer of heading/pitch into** the shared pose and a **consumer of heading/pitch
out of** it. Its **target and altitude band remain owned by C60** (`cameraForState`,
`SITE_ENTRY_ALTITUDE_M`) and are deliberately **outside** the shared pose. The two models
compose; neither duplicates nor overrides the other.

### §2.7.5 — WHICH NORTH: θ is applied EXACTLY ONCE, on the BIM side (normative)

`headingDeg` is measured **clockwise from TRUE north**. True north is the only frame both
renderers can honour: Cesium has no notion of project north, and at globe scale no site exists
so θ is not yet defined.

The BIM authoring frame is de-rotated from true north by θ (`SiteLocation.trueNorth`, radians,
project→true, clockwise — ADR-0070 / ADR-0115). **In Barcelona θ ≈ −45°.** So:

- **Cesium projection: θ is NOT applied.** Cesium's `heading` is already true-north clockwise.
- **BIM projection: θ IS applied, once** — `project bearing = true bearing − θ`. This is the
  identical scalar form `packages/solar-analysis` already uses for the sun azimuth
  (`sunDirectionFromAltAz`: `az − θ`), and the spec pins it against ADR-0115's canonical vector
  transform `trueVectorToProjectNorth`, the same equivalence-pinning discipline as
  `projectNorthSolarEquivalence.test.ts`.

Applying θ on both sides double-rotates; applying it on neither makes the two views disagree by
45° in Barcelona and by **0° everywhere else** — a bug that hides in testing. Hence: **once,
in `projectPoseToBim`, and nowhere else.**

Scene axes are `{ x = East, y = Up, z = South }` — the convention
`packages/solar-analysis/src/solarPosition.ts` states explicitly and
`deriveProjectNorthAngleFromParcel` uses (`north = −z`).

### §2.7.6 — Per-view camera memory is NOT deleted, and the linkage can be OFF (normative)

Plans, sections and elevations genuinely want "return where I left you", and
`ViewCameraStateStore` stays exactly as it is for them. The shared pose applies **only to the
linked 3D surfaces**. `SharedPoseMode` is a **configuration value, not a fork** — the same
discipline as C60 §5's (A)/(B):

- `'angle-only'` — **default.** Heading + pitch shared; each surface keeps its own distance,
  clamped into a declared band.
- `'angle-and-distance'` — distance shared too, **still band-clamped per surface**, and every
  projection returns `clamped` so a clamp is stated rather than silent.
- `'off'` — no linkage; each 3D view keeps its own camera. Switching to `off` moves **no**
  camera.

The linkage must be **inspectable**: `describeSharedPose()` is a pure copy projection (the C60
§3 discipline — what the user reads is a unit test, not a screenshot review), and it states the
bearing, which north it is measured from, whether distance is shared, and that plans/sections/
elevations are excluded. A silent camera coupling is a mystery; a stated one is a feature.

**Distance bands are DECLARED OUTPUTS, never inputs** (`SURFACE_DISTANCE_BAND`) — exactly the
discipline C60 §1.1 states for `SITE_ENTRY_ALTITUDE_M`. They are what a projected distance is
clamped *into*; they are never compared against a live camera distance to infer which surface
you are on. The surface is a fact about the **pane**, not about the camera.

### §2.7.7 — 🔴 OPEN FOUNDER DECISION: angle-only, or angle **and** distance?

The founder's words are *"the same camera **angle**"* — angle, not necessarily distance. The two
readings are **materially different products for the `site-3d` ↔ `bim-3d` pair**, and this
contract does **not** choose:

- **Angle-only:** switching surfaces keeps the bearing and tilt; each view stays framed at a
  distance that suits its own subject. Nothing is ever off-screen.
- **Angle and distance:** the 3D Site and the BIM view become genuinely "one camera looking at
  one thing" — which may be exactly the feeling described — at the cost that a distance chosen
  for one subject can be wrong for the other.

**The globe cannot participate in the second reading unclamped**, in either case: a globe camera
30 m above the pavement and a BIM camera 20 000 km out are both unusable, and the span is five
orders of magnitude. So the globe is band-clamped under both modes, declared.

⇒ **The model implements both and defaults to `'angle-only'`** — the only reading that is safe at
globe scale — and the choice is logged as an open decision on **L-600**. It is a one-field
change, not a rebuild.

### §2.7.8 — Status: PURE MODEL LANDED, NOT WIRED. What Phase 3 must still do.

`sharedCameraPose.ts` imports **no renderer** and is reachable from **no** production path. That
is deliberate and it is the honest sequencing, for the same reason C60 §8 gives for its own
Phase 2: **`bim-3d.paneHostable` is still `false`** (the WebGPU renderer owns `#container`), so
there is no per-pane camera state to hang this on. Wiring it onto the Phase-2 switcher would
build against a surface about to change.

Phase 3 must add, and these are the ONLY renderer changes required:

1. **`CesiumViewport.flyToGeographic()` must accept an optional `headingDeg`.** It currently
   hard-codes `heading: 0` (`CesiumViewport.ts:10830`), so it cannot express a shared bearing at
   all. Additive, one field, defaulting to today's behaviour.
2. **A camera-settled observation hook per surface** that dispatches
   `view.camera.pose-observed` carrying the epoch that surface was last projected at. It must
   fire on *settle*, not per frame — P3 forbids a sync loop or a per-frame poll, and C04's frame
   bus is the only scheduler.

Both are pane-scoped Phase-3 work and neither was done in this pass.

---

## §3 — Migration of the three legacy owners

| Legacy owner | Today | Under C59 |
|---|---|---|
| `SplitViewManager` fixed Canvas2D right pane | `#svp-secondary-pane` fixed at 40%, Canvas2D-only | The pane shell **mirrors** SplitViewManager's split geometry (left/divider/right, divider-drag → `controller.resize`) into a renderer-agnostic `PaneHost` (Phase 1b: `SiteAuthoringPaneShell`). `SplitViewManager` is **not** reused for pane geometry — it is hard-wired to a Canvas2D plan surface and cannot host Cesium/MapLibre. Its Canvas2D renderer becomes the `canvas2d` mounter; literal reuse/consolidation of the legacy class is deferred to Phase 4. **Phase 2 landed that mounter** as `svpPlanPaneMounter.ts`: an ADAPTER that drives the existing `SplitViewManager` (`activate()`), **re-parents its `#svp-secondary-pane` node into the pane element** (the same idiom Phase 1b uses for the single Cesium container), undoes the legacy `#container` shrink + hides the legacy body-level `#svp-divider` while paned, and unmounts by `deactivate()` (whose `_teardownDOM` removes the node wherever it now lives and restores `#container`). No second plan surface is constructed — a fourth view mechanism is the outcome §0 exists to prevent. The legacy class is **not modified** and **not consolidated**; that is still Phase 4. |
| Cesium `#container` hard-target | `new CesiumViewport(#container)`; `setVisible` owns the whole container | Cesium mounts into / re-parents to the **assigned pane element**; `reflowContainer()` reflows on pane resize. |
| MapLibre `inset:0` overlay | overlay inside `#container` | `site-map-2d` mounter into a **pane element**, not a full-container overlay. |

The migration is **staged** (see §4) so each step is verify-gated and the current flows keep working until the pane host replaces them.

---

## §4 — Phased delivery (verify-gated)

- **Phase 1a — Pure core (LANDED).** `paneViewModel.ts` (vocabulary + layout algebra + singleton invariant) + `PaneViewModel.test.ts` (10 tests). `CesiumViewport.reflowContainer()` primitive added. No behaviour change — proves the abstraction, tsc+test gated.
- **Phase 1b — One non-Canvas2D view hostable in a pane (IMPLEMENTED — awaits founder live confirmation).** A minimal `PaneHost` (`SiteAuthoringPaneShell`) that **mirrors** SplitViewManager's split geometry (left/divider/right, divider-drag → `controller.resize`) while hosting arbitrary renderers, mounting the **3D Site (Cesium)** into either the left or right pane element (re-parenting the single `#cesium-viewport-container`, one-shot reflow via `reflowContainer()`), driven by the pure model. Proves renderer-agnostic hosting end-to-end for ONE hard case (the singleton Cesium). **Built this pass:** 2D-left / 3D-right site authoring, single-Cesium re-target, and the boundary→3D fix (single resolved site-store accessor, §2 invariant 7 — Bug 2). Verify (pending): 2D map LEFT + 3D Site RIGHT during site authoring, envelope live (the original founder scenario) — now via the general host, not a hard-wire. `SplitViewManager` is **not** reused for geometry here; literal consolidation is Phase 4.
- **Phase 2 — Registry-driven switcher (absorbs L-405) — IMPLEMENTED (awaits founder live confirmation).** Lift the `mountResultToggleBar` segmented switch onto `VIEW_TYPE_REGISTRY` + a per-pane view-picker; assignment/swap through a view-state command (P6). BIM plan/3D become pane views. **Built this pass:**
  - `paneLayoutStore.ts` — the `PaneViewIntent` command set + `PaneLayoutStore` (reduce → guard → apply → commit → notify; reject/roll-back never mutate). §1.4.
  - `paneViewOptions.ts` — the pure disable-or-**explain** adjudicator (`describePaneViewOptions`, `describePaneLayoutActions`).
  - `PaneViewPicker.ts` — one picker component, mounted on **every** pane by `SiteAuthoringPaneShell`, in the split **and** in full screen; renderer-free, store-driven, pane-scoped chrome.
  - `svpPlanPaneMounter.ts` — the `canvas2d` mounter, so **`bim-plan-2d` is assignable to either pane** alongside `site-3d` (the founder's "3D Site from plan view and vice versa"). §3.
  - Registry: `paneHostable` + `unavailableReason` + `glyph`; `bim-elevation-2d` / `bim-section-2d` added (§1.1).
  - `MultiPaneController.registeredKinds()` (runtime availability) and the site-authoring default now applied **through the store**.
  - **Explicitly NOT done (deferred, honestly surfaced in the picker rather than half-wired):** `bim-3d` in a pane (needs the Phase-3 WebGPU re-target — it still owns `#container`), and directly-assignable elevation/section panes (need Phase-3 per-pane view state). The legacy `mountResultToggleBar` bar is **left in place** for its non-pane duties (photoreal globe fidelity, zoom-to-site, fly-tour); retiring it is Phase 4 consolidation, and removing it in Phase 2 would have deleted controls that have no pane equivalent yet.
  - Verify (pending, founder): open the site split → each pane's dropdown lists every view → put the 3D Site in the LEFT pane (right empties, ONE Cesium) → put Plan in the right pane → take one pane full screen and switch view from there → confirm `3D Model` is greyed **with the Phase-3 reason visible**.
- **Phase 3 — Full swap-any-view-any-pane + N-up + the SHARED CAMERA POSE.** WebGPU BIM 3D re-targetable into a pane (this is what flips `bim-3d.paneHostable`); **per-pane view state + camera state** (`MultiViewCameraManager`/`ViewCameraStateStore`, L-405) — which is what flips `bim-elevation-2d` / `bim-section-2d`; optional 3rd/4th pane; per-pane view persistence.
  - **Landed early, deliberately unwired (L-600, 2026-07-22):** the **pure shared-camera-pose model** (§2.7) — `apps/editor/src/engine/views/sharedCameraPose.ts` + `apps/editor/__tests__/SharedCameraPose.test.ts` (31 tests). It imports no renderer and is reachable from no production path. **It does NOT make the founder's three views move together; nothing in that pass did.** It pins the decision layer (θ applied exactly once; epoch-based echo suppression; declared distance bands; the linkage inspectable and switchable off) so the Phase-3 wiring is a projection rather than a design. The two renderer additions it still needs are listed in §2.7.8, and the angle-only-vs-angle-and-distance product decision is OPEN on the founder (§2.7.7).
- **Phase 4 — Consolidation.** Retire the three legacy owners' bespoke container logic once every flow routes through `PaneHost` — including the **literal reuse/retirement of `SplitViewManager`** (whose split geometry Phase 1b only *mirrors*), collapsing the mirrored geometry back onto a single shared implementation.

Each phase is independently shippable and CI-gated (tsc + vitest; the live phases add the founder's browser acceptance — localhost dev is unusable here, so per-phase code-tracing + unit tests gate the merge and the founder confirms live).

---

## §5 — Open items / cross-refs

- **L-405** (unified view-mode switcher) becomes C59 Phase 2's switcher surface (its "correct-fix" registry recommendation IS this contract). **Status after Phase 2:** the registry-driven per-pane picker exists and is the canonical way to choose a view *for a pane*. L-405's two named gaps are addressed differently than its original framing: (a) the **2D parcel-select map** is now a first-class, always-listed picker entry in either pane (no longer reachable only through the onboarding draw step); (b) the **enhanced-Forma / LOD200 "Context" segment** is NOT wired here — it is a *fidelity mode of the existing `site-3d` view*, not a separate pane view, so it belongs on the 3D-Site pane's own sub-controls, not in the pane registry. L-405 stays OPEN for that sub-control and for the retirement of the legacy segmented bar (Phase 4).
- **Pinned by** `apps/editor/__tests__/PaneViewModel.test.ts` (Phase 1a pure model), `apps/editor/__tests__/PaneViewSwitcher.test.ts` (Phase 2 store + option adjudication), `apps/editor/src/engine/__tests__/PaneHost.spec.ts` (Phase 1b live hosting) and `apps/editor/src/engine/__tests__/PaneViewPicker.spec.ts` (Phase 2 picker DOM, singleton move through the picker, disabled-with-reason, full-screen), and **`apps/editor/__tests__/SharedCameraPose.test.ts` (§2.7, 31 tests — the epoch ping-pong property, the θ equivalence against ADR-0115's `trueVectorToProjectNorth`, the declared distance clamps, and the copy projection)**. Localhost dev is unusable in this repo, so these plus code-tracing gate the merge and the founder confirms live.
- **C06 §7** governs the pane z-layering; C06 gains a §8 pointer to C59 for the view-hosting model.
- **C60 — Site Entry & Jurisdiction Coverage** (L-593, added 2026-07-22) owns the `world → country →
  city → parcel` **globe entry flow**. It is deliberately a SEPARATE contract, not a C59 section:
  C59's question is *which view is hosted in which pane* (failure mode: a double-mounted GPU
  singleton); C60's is *where is the user in the arrival sequence, and can PRYZM answer there*
  (failure mode: a fabricated claim of coverage). C60 **depends on** C59 and adds **no** view
  mechanism — the globe entry is a **camera state of the existing `site-3d` view** (C59 §2.6), moved
  by this contract's `PaneLayoutStore`, and it requests the 3D Site **solo** so no BIM pane stays
  live behind a photoreal globe on the WebGL fallback (§2 invariant 5). **Sequencing:** C60's live
  wiring is queued behind **C59 Phase 3** (per-pane view + camera state) — the entry flow is a
  per-pane camera state, and building it against the Phase-2 switcher would build against a surface
  about to change.
- **SPEC-BUILDABLE-ENVELOPE-UX** (L-398/L-402b): the envelope render path is complete; C59 Phase 1b makes it visible during authoring by hosting the 3D Site in a pane rather than gating it behind a full-screen view swap.
- **Contract-17 lineage.** The historical "Contract 17 §4 — split view" (referenced in `SplitViewManager.ts` / `initScene.ts`) is subsumed here; C59 is its canonical successor.

---

## §6 — Standardized view properties + the analysis-panel de-duplication (L-625)

> **Founder, verbatim (2026-07-25):** *"A strong feature standardization — no matter the view, all
> views should have the same properties available; an active-view dropdown to select from any other
> view; open full-screen or split view for ANY view. Kill duplicated information — right now Site
> Analysis and VIEW PROPERTIES repeat Sun/Shadow/Wind; sometimes the information is even repeated
> across panels."*

The multi-pane switcher (§1.4) answered *which view is in which pane*. L-625 answers the orthogonal
question the founder raised next: *given a view, what PROPERTIES does it expose, and why is the same
information showing up twice?* Four requirements, each mapped to a mechanism below.

### §6.1 — Requirement matrix (what already existed vs. what L-625 added)

| Founder requirement | Mechanism | Status |
|---|---|---|
| **(1) Same properties available, WHERE MEANINGFUL** | `viewPropertyModel.ts` — one property catalogue + per-view applicability | **NEW (L-625)** |
| **(2) Active-view dropdown → switch a pane to ANY other view** | `PaneViewPicker` + `describePaneViewOptions` (§1.4) | Existed (Phase 2) |
| **(3) Full-screen / split for ANY view** | `view.pane.solo` / `view.pane.restore-split` / `swap` + `describePaneLayoutActions` (§1.4) | Existed (Phase 2) |
| **(4) Kill duplicated Sun/Shadow/Wind** | `environmentAnalysisStore.ts` — single source of truth | **NEW (L-625)** |

Requirements (2) and (3) were **already built and unit-pinned** by the Phase-2 picker; L-625 does not
rebuild them, it **records them here as the standardization surface** and adds the two missing halves.

### §6.2 — The property registry (Requirement 1) — `viewPropertyModel.ts`

A **pure** model (no DOM / no renderer / no I/O — P8 span-exempt, same rationale as §1.2/§1.4):

- **`ViewProperty`** — the ONE standardized catalogue: `sun · shadow · wind · climate · population ·
  postProcessing · sunPath · windRose · siteHeatmap · camera`. Adding a property is a single registry
  entry, exactly as adding a view type is (invariant 6, applied to properties).
- **`VIEW_PROPERTY_REGISTRY`** — each property carries `{ appliesTo: ViewType[], sharedEnvironment,
  canonicalOwner }`.
- **`propertiesForView(viewType)`** — the standardized set for a view: every catalogue property that
  is **meaningful** there. "Same properties available **where meaningful**" is this function — not
  "every control on every surface". A flat 2D map lists no sun/shadow/post-proc; a Canvas2D plan lists
  only `camera`; the WebGPU BIM view lists the full environment set + post-processing; the Cesium 3D
  Site adds the analysis layers (`sunPath`/`windRose`/`siteHeatmap`) that only exist there and drops
  `postProcessing` (Cesium owns its own tone-mapping).
- Pinned by `apps/editor/__tests__/ViewPropertyModel.test.ts`.

Surfacing a property where it is **not** meaningful is a defect under this section — the founder asked
for controls that apply, not a uniform wall of dead sliders.

### §6.3 — The Sun/Shadow/Wind single source of truth (Requirement 4) — `environmentAnalysisStore.ts`

The duplication root cause: the **View Properties** panel (`ViewPropertiesSection`) and the **Site
Analysis** panel (`FormaSiteAnalysisControls`) each held a **private copy** of the sun angle/time, the
shadow toggles and the wind vector, and each emitted its own `pryzm-set-*` event. Two mutually-unaware
owners of the same value — the §0 disease, applied to environment state instead of pane layout.

The fix is **structural, not cosmetic** (the C59 house style — cf. §2.7.3's "ONE pose, projected"):
**one** store owns the shared environment; both panels read from, write through, and subscribe to it.

- The properties with `sharedEnvironment: true` are **exactly** `sun · shadow · wind · climate ·
  population` — the founder-named duplicated set (`sharedEnvironmentProperties()`, test-pinned).
- `environmentAnalysisStore` holds that state; its typed setters are the **only** write path. Each
  setter (a) updates state, (b) emits the **same** runtime-bus event the panels emitted before — so
  `RealEnvironmentService` and the Cesium sun wiring are **untouched** (this is a de-dup of OWNERSHIP,
  not a renderer rewrite), (c) persists the overlapping fields via `setSharedPostProcessing` so a panel
  rebuild restores them, (d) notifies subscribers.
- **`ViewPropertiesSection` migrated fully:** its private sun/shadow/wind/climate/population fields are
  deleted; it reads `environmentAnalysisStore.getState()`, writes through the setters, and a leak-safe
  subscription (self-disposes when the panel node is replaced) keeps its sliders in lock-step.
- **`FormaSiteAnalysisControls` is the sun PRODUCER:** its scrubber publishes the scrubbed time-of-day
  into the store (`setSunTime(..., 'site-analysis')`) so the BIM view's sun follows the site scrubber.
  It is **one-directional (produce, no subscribe-writeback)** by design — the Cesium sun scrubber owns
  a full `Date`; letting the store write back into it could feedback-loop with `onFormaSunChange`, so
  the store↔Cesium link stays a producer edge, and the store↔BIM link is bidirectional. The measured
  climate DATASET surfaces (wind rose, temperature card) are **not** shared-environment — they are
  derived site data (`ClimateStore` normals), not user knobs, and remain owned by Site Analysis
  (`canonicalOwner: 'site-analysis'`, `sharedEnvironment: false`).
- Pinned by `apps/editor/__tests__/EnvironmentAnalysisStore.test.ts`.

### §6.4 — Ownership: one canonical author per property (no double authoring)

`canonicalOwner` names the panel that owns the **full** control for a property. The shared-environment
knobs are authored in **View Properties**; the 3D-site analysis layers (`sunPath`/`windRose`/
`siteHeatmap`) in **Site Analysis**. A panel may still SHOW a value it does not own (reading the shared
store), but it never renders a second, independently-mutable authoring surface for it — that is what
"repeated across panels" meant, and `propertiesOwnedBy()` is the machine-checkable answer.

### §6.5 — Deferred / honest gaps

- **The Site Analysis panel's own Sun & shadow scrubber controls are not deleted.** They are genuinely
  a different UI (date + season presets + shadow-study sweep on the Cesium timeline) and remain the
  site-view's sun surface; L-625 makes them SHARE the value (produce into the store) rather than hold a
  divergent copy. Consolidating the two into one control widget is a follow-on, not this pass.
- **Wind/climate/population from Site Analysis are read-only in that panel** (measured data), so there
  is nothing to route into the shared store from there; only the sun is a two-panel user knob. The
  registry records the applicability so a future Site-Analysis wind CONTROL would land on the same
  store with no model change.
- **Live cross-panel sync is proven by unit test** (store notify → subscriber), not by a live founder
  session (localhost unusable). Same gate as every other C59 phase.
