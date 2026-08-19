# C06 — UI Shell & Tools

> **Stamp**: 2026-07-07 · **Status**: CANONICAL  
> **Scope**: `PlatformRouter`, panel management, tool registration, keyboard shortcuts, camera integration, the 2D plan-view / section-view rendering pipeline, **UI layering / overlap (z-index)**, and **§9 snapping & reference-datum level scoping** (`packages/snapping/`, added 2026-08-19 by ADR-0335).  
> **Key principles**: P1 (single composition root), P4 (no `window as any`), P6 (commands only).


---

## §0.0 — ⛔ CORRECTION 2026-08-18: TWO NAMED APIs IN THIS CONTRACT DO NOT EXIST

| C06 names | Measured |
|---|---|
| `KeyboardShortcutRegistry` | ❌ **ZERO occurrences repo-wide.** `grep -rIl "KeyboardShortcutRegistry" --include=*.ts --exclude-dir=node_modules packages apps plugins` → nothing. |
| `runtime.tools.register(tool)` | ❌ **NO PRODUCTION REGISTRATION SITE.** `grep -rn "tools\.register(" --include=*.ts --exclude-dir=node_modules packages apps plugins` → **4 matches, all non-executing**: a doc-comment (`packages/geometry-slab/src/SlabTool.ts:76`), two planning comments (`packages/input-host/src/ToolBindings.ts:5,74`), and a **codegen string template** (`packages/plugin-sdk/src/dev/create-command.ts:201`). |

⭐ **The `create-command.ts:201` match is the trap worth naming.** It is a *scaffold emitter* — a
string that a generator writes into new files. A name-shaped grep counts it as evidence the API
exists; it is evidence that **new code will be told to call an API that does not**. This is defect
shape **C — declared but never called**, with an extra hop: the declaration is inside a string.

**Read every `runtime.tools.register` and `KeyboardShortcutRegistry` clause below as NOT-YET-TRUE.**
`packages/input-host/src/ToolBindings.ts` is where the real tool-binding table lives and is the
place to start; its own header (`:5`) describes moving *"the 20 `runtime.tools.register(...)`
calls"* — **a migration whose source side does not exist**, so that note is stale in the same way.

---

## §1 — PlatformRouter

`PlatformRouter` is the single routing surface for the app shell. It owns transitions between:

| Route | Surface | Condition |
|---|---|---|
| `/` | Landing page | Unauthenticated or `?pryzm1=1` |
| `/hub` | Project hub | Authenticated, no open project |
| `/project/:id` | Editor | Authenticated, project open |
| `/browser` | Component browser | `browser.html` entry point |

### §1.1 — Invariants

- `platformRouter.start({ runtime })` MUST be called exactly once after `composeRuntime()`.
- It MUST remove the Stage 0 app-shell skeleton (class `lp-skel-*`) in both signed-in and signed-out code paths.
- **§SKEL-MATCH (2026-05-29).** The Stage 0 skeleton tokens (heading colour, sub-copy colour + size, background gradient, heading text-shadow) in `index.html` MUST match the realised `LandingPage.ts` styles in `apps/editor/src/ui/styles/panels/marketingPages.ts` (the `.lp-hero-*` rules) exactly. Drift produces a visible flash between first paint and JS bundle load — the most common manifestation is a dark-purple sub-copy line on a washed-out background swapping to a white sub-copy on a vibrant gradient. Any edit to one set of rules MUST update the other in lock-step. See `landing-skeleton-vs-real-mismatch` memory note for the exact divergence pattern.
- It MUST replay `window.__pryzmPendingActions` after the shell mounts.
- Routes MUST be driven by `runtime.viewRegistry`. No component MAY call `window.location` directly for in-app navigation.
- The router MUST NOT import any plugin package directly; plugins register into `viewRegistry` via `composeRuntime`.

### §1.2 — Typed window globals

All `window.*` access in `src/ui/` MUST go through typed declarations in `src/types/global-window.d.ts`. **Zero `(window as any)` reaches are permitted in `src/ui/`** (verified at `03-CURRENT-STATE.md §1`: 0 ✅).

---

## §2 — Panel Management

Panels are the dockable UI regions (left panel, right panel, bottom strip, floating overlays). The `panelManager` service:

- Owns the docking layout (`dck-workspace` top-level flex row).
- MUST receive `panelManager.setRuntime(runtime)` during Stage 1 Phase A.
- Panels register themselves via `runtime.viewRegistry.register({ panelId, component, placement })`.
- No panel component MAY reach outside its assigned DOM region; cross-panel communication MUST go through commands or store subscriptions.

### §2.1 — Panel isolation

Panels are rendered inside `React.Suspense` boundaries. A crash in one panel MUST NOT crash the entire shell. Each panel has its own error boundary.

---

## §3 — Camera Contract

The camera is accessible via `PryzmRuntime.cameraController`. The UI MUST use only this handle; it MUST NOT reach into the Three.js camera object directly.

### §3.1 — Camera operations

```ts
interface CameraController {
  fitToElements(ids: ElementId[]): void;
  fitToAll(): void;
  setView(preset: CameraPreset): void;    // 'top' | 'front' | 'iso' | 'perspective'
  orbit(delta: { azimuth: number; elevation: number }): void;
  pan(delta: { x: number; y: number }): void;
  zoom(factor: number): void;
  getState(): CameraState;
  setState(state: CameraState): void;
  onChanged(cb: (state: CameraState) => void): Unsubscribe;
}
```

### §3.2 — Camera constraints

- Zoom MUST be clamped to `[minZoom, maxZoom]` (defaults: 0.01, 1000 metres from scene origin).
- In plan-view mode, the camera MUST lock to an orthographic projection aligned to the active level elevation.
- `fitToElements` MUST complete within 16 ms (synchronous camera state update; no animation by default).

---

## §4 — Tool Registration

Tools are stateful objects that handle mouse/keyboard events and dispatch commands. All tools MUST be registered via `runtime.tools.register(tool)` during Stage 1 or plugin initialisation.

### §4.1 — Tool interface

```ts
interface Tool {
  readonly id:    string;
  readonly label: string;
  readonly icon:  string;
  activate(): void;
  deactivate(): void;
  onPointerDown(event: ToolPointerEvent): void;
  onPointerMove(event: ToolPointerEvent): void;
  onPointerUp(event: ToolPointerEvent): void;
  onKeyDown(event: ToolKeyEvent): void;
}
```

- `activate` / `deactivate` MUST be idempotent.
- Tool events MUST be dispatched as commands via `commandBus.dispatch()`; tools MUST NOT mutate stores directly (P6).
- Only one tool may be active at a time. Activating a new tool MUST call `deactivate()` on the previous one.

### §4.2 — Keyboard shortcuts

Keyboard shortcuts MUST be declared in a tool's descriptor, not hardcoded in event handlers. The `KeyboardShortcutRegistry` resolves conflicts at registration time and logs a warning for duplicates. Default shortcuts:

| Action | Shortcut |
|---|---|
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` |
| Delete | `Delete` / `Backspace` |
| Escape (cancel tool) | `Escape` |
| Select all | `Ctrl/Cmd + A` |

### §4.3 — 3D Transform Gizmo Drag-End Contract (L7.5 transitional)

The 3D viewport gizmo (`TransformControls` from THREE) fires `objectChange` events continuously while the user drags. The **drag-end** event (`mouseUp` / `pointerUp` on the gizmo) MUST atomically commit the element's new position/rotation/scale into the undo history.

**Implementation file:** `apps/editor/src/engine/registerTransformDragHandler.ts`

**Invariant — No silent drag-ends.** Every drag-end MUST either:
1. Execute a typed Update command via `commandManager.execute(new UpdateXxxCommand(...), { source: 'HUMAN_DIRECT' })` capturing the pre-drag `before` state and post-drag `after` state, OR
2. Snap the gizmo back to its pre-drag position (graceful degradation for element types that have no positional Update command yet).

**Element-type dispatch table (complete as of Sprint OI-038/OI-039, 2026-05-16):**

| Element type | Command dispatched on drag-end |
|---|---|
| Wall | `UpdateWallBaselineCommand` (start + end endpoints) |
| Slab | `UpdateSlabPolygonCommand` (translated polygon) |
| Column | `UpdateColumnCommand` (position + rotation) |
| Beam | `UpdateBeamCommand` (start + end points) |
| Floor | `UpdateFloorCommand` (boundary polygon) |
| Ceiling | `UpdateCeilingCommand` (boundary polygon) |
| Curtain wall | `UpdateCurtainWallCommand` (baseLine) |
| Furniture | `UpdateFurnitureParametersCommand` (position + rotation) |
| Door | `SetDoorOffsetCommand` (offset along wall) |
| Window | `SetWindowOffsetCommand` (offset along wall) |
| Stair | ⚠️ snap-back (no positional Update command exists; deferred to Phase E.stair.S) |
| Handrail | ⚠️ snap-back (no positional Update command exists; deferred to Phase E.handrail.S) |

**Pre-drag capture:** `registerTransformDragHandler` records element state at `dragStart` time into a `_preDragState` map keyed by element ID. The `after` payload is read from the relevant `window.xStore` immediately after the drag-end event fires. If `_preDragState` is empty (no recorded `before`), the handler MUST treat this as snap-back to prevent commits with incorrect deltas.

**Undo coverage:** Each committed command goes into `commandManager` (Path A, transitional). The OI-034 Ctrl+Z fallback (see C03 §4.3) ensures `commandManager.undo()` is reached when the PRYZM3 ring-buffer has no matching entry.

---

## §5 — Plan-View & Section-View

### §5.1 — Plan-view rendering

Plan-view (2D cut view) is rendered by a Canvas2D pipeline, not by the THREE viewport. It MUST:
- Subscribe to `ElementStore` at **render** priority via the frame scheduler.
- Draw on an `OffscreenCanvas` worker thread when available.
- Re-render within < 100 ms p95 after any element mutation (NFT 5).

### §5.2 — Section-view / elevation rendering

Section views and elevation views are produced by the drawing engine (`packages/geometry-kernel/src/producers/section-cut.ts`). They MUST:
- Use the same `FrameScheduler` subscription as plan-view.
- Produce SVG-compatible line primitives via `packages/drawing-primitives/`.
- Not require the THREE renderer; they run in headless mode.

---

## §6 — UI Theming

- All visual tokens MUST be CSS custom properties declared in `src/engine/subsystems/styles/` (the former `src/styles/AppTheme.ts` is the single CSS injection point for runtime JS-managed CSS).
- The boot-shell skeleton CSS is inlined in `index.html` (Stage 0) and MUST NOT be injected by JS.
- Dark mode MUST toggle via `<html data-theme="dark|light">`.
- All text-on-background combinations MUST meet WCAG AA contrast (4.5:1 for normal text, 3:1 for large). CI gate: `packages/wcag-audit/`.

---

## §7 — UI Layering & Overlap (z-index)

> **Added 2026-07-07 · L-149 · §FIX-UI-LAYERING-ZINDEX-CONTRACT.**
> Founder report: the always-on GIS launcher rail ("◉ 3D Site / Globe", "▦ Plan +
> Site") rendered BELOW / overlapping other chrome — and, systemically, "the UI
> needs to be aware of each element around — we cannot afford overlaps." Root
> cause (confirmed): there was NO central stacking system — **~325 hardcoded
> `z-index` literals** across `apps/editor/src/ui` (values from `2` to
> `2147483000`) with no ordering discipline.

### §7.1 — The layer scale is the ONLY source of stacking truth

There is exactly ONE ordered z-index scale for the editor UI. It is declared in
**two mirrored forms that MUST stay in lock-step**:

- **TS:** `apps/editor/src/ui/layout/zLayers.ts` — `Z_LAYERS` const map + `zCss()`.
- **CSS:** `apps/editor/src/ui/styles/layout.css` — the `:root { --z-* }` block.

Ascending value = paints on top. Numeric values are calibrated to the app's
pre-existing thousands/hundred-thousands convention so a **phased** migration is
monotonic (a migrated element keeps working against not-yet-migrated neighbours).
**The ORDER is the contract; the exact numbers MAY be re-based once every site is
migrated.**

| Layer (token) | Value | `--z-*` | Role |
|---|---|---|---|
| `canvas` | 0 | `--z-canvas` | 3D canvases (`#container`, WebGPU/WebGL, Cesium globe) |
| `underlay` | 100 | `--z-underlay` | scene / plan-canvas underlays beneath authored geometry |
| `viewportHud` | 900 | `--z-viewport-hud` | canvas-space overlays (snap, structural, ambient indicators) |
| `panel` | 1000 | `--z-panel` | docks, side panels, browsers, inspectors |
| `rail` | 2000 | `--z-rail` | persistent nav / tool rails |
| `toolbar` | 9000 | `--z-toolbar` | top platform toolbar / ribbon / workspace-mode bars |
| `contextualBar` | 9100 | `--z-contextual-bar` | selection-driven contextual edit bars + view toggles |
| `launcher` | 10000 | `--z-launcher` | **always-on floating launchers / rails (GIS + graph pills)** |
| `popover` | 20000 | `--z-popover` | menus, dropdowns, tooltips, mode-pickers |
| `drawer` | 40000 | `--z-drawer` | side drawers (sync-state, data) |
| `modal` | 200000 | `--z-modal` | blocking dialogs (import mode, conflict, IFC overlays) |
| `toast` | 300000 | `--z-toast` | transient notifications |
| `loadingOverlay` | 900000 | `--z-loading-overlay` | engine boot spinner / blocking progress overlays |
| `critical` | 2147483000 | `--z-critical` | last-resort escape hatch (renderer backend toggle, reload notice) |

### §7.2 — No-overlap layout policy

Chrome elements that share a screen REGION MUST declare that region and MUST NOT
occlude peers. A launcher/toolbar/panel MAY sit above the viewport, but two
chrome elements in the SAME region MUST NOT be placed at overlapping coordinates.

- **Region ownership.** The viewport (`#container`) owns the canvas. Persistent
  chrome owns fixed screen edges: top = toolbar, left = nav/tool rails, bottom-left
  corner = the **launcher rail**, right = inspectors. A floating control MUST NOT
  be anchored inside another region's footprint.
- **Launcher rail (bottom-left).** Every always-on floating control in this corner
  forms a single, declared, collision-free vertical column, `position:fixed` at the
  `launcher` layer, stacking upward from just above the bottom-left renderer-backend
  toggle. Each control owns a numbered SLOT via `launcherRailStyle(slot)` in
  `zLayers.ts`: `splitView`=0, `siteView`=1, `planGis`=2, `graph`=3, `livingGraph`=4.
  The Split View toggle (a non-launcher chrome control that shares the corner) is
  folded into this SAME accounting — L-159, §FIX-LAUNCHER-COVERS-SPLITVIEW — so it
  can never be re-occluded by a re-slotted launcher pill. Any new control in this
  corner MUST take the next slot — never a hand-picked `bottom:`/`z-index`.
- **`position:absolute` inside a low-lying container is forbidden for chrome that
  must float above panels.** `#container` does not create a stacking context in
  the BIM view (`z-index:auto`), so an absolutely-positioned child with `z-index`
  competes at the ROOT and is buried by any chrome sibling with a higher value.
  Chrome that must overlay panels MUST be `position:fixed` at the correct layer.

### §7.3 — Migration rule (merge-blocking intent)

- New or edited UI-chrome code MUST NOT introduce a raw `z-index` literal — always
  the token (`Z_LAYERS`/`zCss()` in TS, `var(--z-*)` in CSS).
- Adding a stacking tier means adding a NAMED token to BOTH mirrors, not a literal.
- Until a lint rule lands, reviewers enforce this on any diff touching `src/ui/`.

### §7.4 — Audit & phased migration (the ~325 sites)

The inventory below groups the raw literals by ROLE → target layer. **Phase 1
(DONE, L-149)** migrated the always-on launcher cluster — the reported bug — as
the proof-of-system:

| Element | Was | Now |
|---|---|---|
| `#svp-toggle-button` (Split View) | `fixed`, `z:28`, `bottom:144` | `fixed`, `launcher` (10000), rail slot 0 |
| `#pryzm-site-view-launcher` ("◉ 3D Site / Globe") | `absolute` in `#container`, `z:20` | `fixed`, `launcher` (10000), rail slot 1 |
| `#pryzm-plan-gis-launcher` ("▦ Plan + Site") | `absolute` in `#container`, `z:20` | `fixed`, `launcher`, rail slot 2 |
| `#pryzm-graph-launcher` ("⚛ Graph") | `fixed`, `z:28`, `bottom:64` | `fixed`, `launcher`, rail slot 3 |
| `#pryzm-living-graph-launcher` ("✦ Living Graph") | `fixed`, `z:28`, `bottom:104` | `fixed`, `launcher`, rail slot 4 |

Files touched Phase 1: `apps/editor/src/ui/layout/zLayers.ts` (new SSOT),
`apps/editor/src/ui/styles/layout.css` (`--z-*` mirror),
`apps/editor/src/ui/layout/GISAreaLayout.ts`, `apps/editor/src/ui/graph/index.ts`,
`apps/editor/src/ui/living-graph/index.ts`, `apps/editor/src/engine/initUI.ts`
(Split View toggle folded into the rail — L-159, §FIX-LAUNCHER-COVERS-SPLITVIEW).

**Remaining phases (NOT yet migrated — logged so nothing is silently half-done):**

- **Phase 2 — Overlays/modals/toasts tier** (highest literals, clearest mapping):
  IFC import/export/report overlays (`z:999999`, `initUI.ts`), import-mode dialog
  (`z:200000`), `EngineLoadingOverlay` (`z:99999`), `appToast` (`z:99999`),
  `earlyAccessBanner` (`z:99999`), `RendererSwapOverlay`, `LoadingOverlayView`
  (the ONE loading overlay — batch generation AND 3D-globe/3D-Site activation; C11 §6.6),
  `operationOverlay` → `modal` / `toast` / `loadingOverlay` / `critical`.
- **Phase 3 — Platform shell chrome:** `platformToolbar` (`9000/9900/9101/8900`),
  `contextualEditBar` (`8990/9100`), `leftNavRail` (`9999`), `workspaceModeBar`
  (`200`), `appMenu` (`2000`), `ribbonMenu` (`10`), `ownerSettingsPanel` (`9999`)
  → `toolbar` / `contextualBar` / `rail` / `popover`.
- **Phase 4 — Docks, panels, drawers:** `dockingSystem`, `splitView`, `sheetEditor`
  (16 sites), `dataWorkbench`, `projectHub` (12 sites), `syncStateDrawer`,
  `viewerPanels`, the ViewBrowser/inspector panels → `panel` / `drawer`.
- **Phase 5 — Canvas-space overlays & mode-pickers:** `canvasOverlays`,
  `selectionOverlay`, `SnapIndicatorOverlay`, `StructuralOverlay`,
  `AmbientIndicator`, `drawingHuds`, `toolHud`, the `mode-pickers/*` → `viewportHud`
  / `popover`.
- **Phase 6 — Result-view toggles:** the two `showSiteResultView` bars in
  `GISAreaLayout.ts` (`z:30/31`, floating over the Cesium view) → `contextualBar`
  (kept raw in Phase 1 to preserve their intentional +1 ordering over Cesium `z:15`).
- **Phase 7 — CesiumViewport** (`CESIUM_Z=15`) and the WebGPU overlay (`z:2`) →
  `canvas` band tokens (deferred — those files are outside the L-149 fence).

---

## §8 — Multi-Pane View System (view hosting) → **C59**

The **view-hosting** model — how the editor splits into panes and which view (MapLibre
2D site map · Cesium/Forma 3D Site · BIM WebGPU 3D · BIM Canvas2D plan · elevations)
each pane renders — is governed by **[C59 — Multi-Pane View System](./C59-MULTI-PANE-VIEW-SYSTEM.md)**.

C59 replaces the three historical, mutually-incompatible owners (the `SplitViewManager`
fixed Canvas2D right pane; Cesium hard-targeting `#container`; the MapLibre `inset:0`
overlay) with **renderer-agnostic pane hosts** fed by a **view-type registry**, so the
user can natively assign or swap **any** view into **any** pane (L-412). Normative rules:

- **Pane z-layering** stays governed by C06 §7 (`zLayers.ts` tokens; panes tile, no overlap).
- **Single rAF (P3)** — panes subscribe to the composition-root frame bus; no pane owns a loop.
- **Single instance per singleton renderer** — one Cesium viewer, one WebGPU device; a
  singleton view is MOVED between panes, never cloned (C59 §2).
- **`viewRegistry` alignment (§1)** — the C59 pane view-picker is the registry-driven
  successor to the ad-hoc `mountResultToggleBar` switch (this is the L-405 "correct-fix").

The historical **"Contract 17 §4 — split view"** referenced in
`SplitViewManager.ts` / `initScene.ts` is subsumed by C59 (its canonical successor).

---

## §9 — Snapping & Reference Datums: level scoping

> **NORMATIVE.** Added 2026-08-19 by [ADR-0335](../adrs/ADR-0335-snap-references-are-level-scoped-in-three-tiers.md),
> from [L-1108](../../04-reference/ISSUE-LOG.md). Extends — does not supersede —
> [ADR-0112](../adrs/ADR-0112-cross-level-slab-corner-snap-reference.md) (L-31).
> Owner: `packages/snapping/`.

### §9.1 — The rule

**Every snap candidate declares its LEVEL SCOPE. The `SnapManager` — and nothing else — decides
what to do about it.**

Providers classify. The manager ranks. A provider MUST NOT filter by level on its own account, and
MUST NOT infer a level from a candidate's `point.y`.

> ⛔ **Why inference is forbidden:** a column's TOP vertex on Level 0 sits at y = 3.0; hosted
> openings and wall joins deliberately rewrite Y to the cursor's plane. Elevation is not identity.

### §9.2 — The three scopes

| scope | members | normative behaviour |
|---|---|---|
| **DATUM** (`levelScope: 'datum'`) | `SnapType.GRID` (uniform maths grid), `GRID_LINE`, `GRID_INTERSECTION` (BIM structural datums), the **parcel boundary** and the **buildable-envelope setback line** (§L-432) | **Project-wide BY DESIGN.** MUST be offered on every storey at full priority. MUST NOT be demoted. MUST NOT be filtered by level — not even under the §9.5 opt-out. |
| **ACTIVE** | an element on the storey being drawn on | Full priority. Primary. |
| **OTHER** | an element on a different storey | **MUST be offered, and MUST be subordinate.** Priority demoted by `OTHER_LEVEL_DEMOTION` (1000, wider than the whole 210-point band), so it can never outrank an ACTIVE candidate or a DATUM at any proximity. MUST be tagged `metadata.crossLevel` and MUST be visually distinguished and labelled with its storey. |
| **UNKNOWN** | a candidate with no declared `levelId`, or when no active level is known | **Left alone.** Ranked exactly as before. Declaring `levelId` is what opts a provider in. |

**§9.2.1 — Grids on upper storeys are CORRECT, not a defect.** A structural grid is a project
datum: grid A is grid A on every floor. A report of the form *"ground-floor references appear on
Level 1"* MUST be separated into the grid case (correct) and the element case (the defect) before
anything is changed. Conflating them breaks grids.

**§9.2.2 — Parcel boundary and setback line are available on EVERY storey.** Decided, not
inherited. They constrain an upper-floor overhang exactly as they constrain the ground floor, and
§L-432 added them so compliance-by-construction would hold on the manual authoring path. Removing
them above Level 0 would leave a constraint that reads as enforced and is not.

### §9.3 — Priority order when several candidates are in range

1. **DATUM** and **ACTIVE** candidates compete on `DEFAULT_SNAP_PRIORITIES` + a proximity bonus of
   up to +10, exactly as before this section existed. Grid intersection (200) → grid line (150) →
   endpoint (100) → intersection (90) → midpoint (80) → wall-join (78) → centreline (75) →
   perpendicular (70) → centre (60) → edge (50) → face (45) → nearest (30) → maths grid (10).
2. **OTHER** candidates compete among themselves on the same order, **minus 1000**, so the whole
   group sits strictly below the whole of (1).
3. Within 5 priority points, the nearer candidate wins (unchanged).

The demotion constant MUST remain larger than the widest legitimate spread in (1). Changing
`DEFAULT_SNAP_PRIORITIES` without re-checking that invariant is a breach of this section.

### §9.4 — Provider register (measured 2026-08-19 — re-measure, do not transcribe)

`ls packages/snapping/src/providers/*.ts | wc -l` → **12**.

| provider | scope declared | source of `levelId` |
|---|---|---|
| `WallSnapProvider` | element | `wall.levelId`; a wall×wall intersection across storeys is attributed to neither |
| `WallJoinSnapProvider` | element | `wall.levelId` |
| `CurtainWallSnapProvider` | element | `curtainWall.levelId` |
| `SlabSnapProvider` | element | `slab.levelId` — **also hard-gated** to the active storey per ADR-0112; that gate is retained |
| `ColumnSnapProvider` | element | `column.levelId` |
| `BeamSnapProvider` | element | `beam.levelId` |
| `StairSnapProvider` | element | `stair.levelId` |
| `FurnitureSnapProvider` | element | `furniture.levelId` |
| `DoorSnapProvider` | element | **the HOST WALL's** `levelId` (C15 — a hosted opening has no storey of its own) |
| `WindowSnapProvider` | element | **the HOST WALL's** `levelId` (C15) |
| `GridSnapProvider` | **datum** | n/a |
| `SiteContextSnapProvider` | **datum** | n/a |

Every `levelId` field on the providers' store-shape interfaces is **optional**, so a store that does
not carry one degrades to UNKNOWN (§9.2) rather than mis-scoping.

### §9.5 — The active storey, and the opt-out

- `SnapManager.setActiveLevelAccessor(fn)` takes a **function**, read on every `snap()`, so a level
  switch takes effect on the next pointer-move with no re-registration.
- The default accessor is installed **in the constructor**, not in `createWithDefaults()`. Tools
  that build a manager directly (`new SnapManager()` — `CurtainWallTool` does) MUST be level-aware
  too. **The policy may not depend on which constructor a tool called.**
- `setCrossLevelReferences(false)` drops OTHER candidates outright. It is **off by default** and it
  still MUST NOT drop a DATUM.

### §9.6 — Plan geometry is measured in PLAN

Helpers named `*2D` MUST measure in XZ and MUST report points on the **caller's** plane.

> ⛔ **The defect this rule exists to prevent (L-1108).** `pointToLineDistance2D` projected in XZ,
> then pinned the closest point to `y = 0` and measured in **full 3-D** — returning
> `sqrt(dxz² + point.y²)`. Compared against a snap tolerance clamped to
> `MAX_WORLD_TOLERANCE_M = 1.0 m` (C73 §2), the test `distance <= radius` is **UNSATISFIABLE at any
> storey above ~1 m**. Wall CENTERLINE / EDGE / FACE and curtain-wall CENTERLINE / EDGE therefore
> **did not fire at all** above the ground floor — five families absent, not mis-ranked. On the
> ground floor `point.y = 0` makes the two forms identical, which is why it shipped unnoticed.
>
> **Before asking why a snap is wrong, ask whether its condition can ever be true.**

### §9.7 — Indicators render on the storey being drawn on

`SnapVisualizer` MUST position the indicator from the candidate's own Y. It previously used a
hard-coded `position.y = 0.1` — the world origin plane — for every candidate on every storey, which
is the most literal form of the reported defect. A cross-storey candidate MUST additionally be
visually distinguished and labelled with its storey (§9.2).

### §9.8 — Known gaps (named, so they are not assumed closed)

- **A second snap engine exists for the plan pane — DECIDED 2026-08-19 (SV2): it CONSUMES the
  LevelScope policy; it is NOT retired.** `packages/core-app-model/src/views/PlanSnapEngine.ts`
  (562 lines) contains **zero** occurrences of `level` and **one** of `elevation` — and that one is
  prose in the file header naming the elevation VIEW TYPE, not an elevation value. (This bullet, and
  the identical wording in ADR-0335 and the ISSUE-LOG, previously said "zero occurrences of `level`
  or `elevation`". Off by one, in a comment; the substance holds — **no executable line in the file
  reads a level id or a Y elevation**, and `PlanSnapResult` carries only `worldX`/`worldZ`/`snapType`/
  `sourceId`, so there is nowhere to put one.)

  ⚠ **The clip range stated above was WRONG, and wrong in the direction that HID the defect.** The
  code does not clip to `[levelElevation, levelElevation + farOffset]`. `resolveClipRange()`
  (`EdgeProjectorService.ts:3764–3823`) is a pure RESOLVER that filters nothing; the filtering
  happens downstream over the band `[levelElevation − belowLevelDepth, levelElevation + farOffset + 0.5]`,
  where `belowLevelDepth` defaults to **1.20 m** (`PlanViewManager.ts:685`). **The storey below is
  included BY DESIGN** — `NativeElementMeshExporter.ts:247–253` caps the top at `maxY = level.elevation`
  ("so we never include elements from the floor above") while deliberately reaching down. The stated
  lower bound omitted exactly the inclusion that is the whole problem, which is how "real, but
  undeclared" came to understate it.

  **MEASURED CONSEQUENCE — the ADR-0335 defect is STILL LIVE in the plan pane.** `PlanSnapEngine`
  applies no demotion, no `crossLevel` tag and no visual distinction, so a storey-below `endpoint`
  (priority 200) beats an active-level `perpendicular` (140) or `midpoint` (160) at any distance —
  the "a ground-floor reference wins SILENTLY and unlabelled" behaviour ADR-0335 exists to fix. A
  repo-wide grep finds **zero** `SnapManager` references anywhere under `apps/editor/src/engine/views/`:
  SNAP1's fix reaches the 3-D viewport tools ONLY and does not reach either pane the user draws plans
  in. Both panes are served by `PlanSnapEngine` and nothing else (`PlanViewInteraction.ts:122`, plus
  `SvpPlanToolOverlay.ts:92`).

  **A SECOND defect neither ADR names:** `PlanViewCanvas` respects V/G visibility on its render path
  (`:443`, `:1907`, `:2421`) and `PlanSnapEngine._ensureCache()` has no equivalent — **the plan pane
  snaps to linework the user cannot see.**

  **WHY CONSUME, NOT RETIRE.** Retirement is close to a rewrite and is blocked twice over:
  (a) the two engines have different CANDIDATE DOMAINS — `packages/snapping` providers read the
  STORES, while `PlanSnapEngine` reads projected `TechnicalDrawing` linework, which includes IFC and
  Rhino imports and door/window/roof/stair plan SYMBOLS that have no store representation and would
  become unsnappable; and (b) `@pryzm/snapping → @pryzm/spatial-index → @pryzm/core-app-model` is a
  real dependency chain, so `core-app-model` importing `@pryzm/snapping` would CLOSE A CYCLE — while
  `packages/snapping/package.json` lists `@thatopen/components` under `forbiddenDependencies`, so
  `PlanSnapEngine` cannot move the other way either. Neither engine can currently import the other.

  Unifying the **policy** is cheap and closes the user-visible defect on its own: `classifyCandidateLevel`
  and `OTHER_LEVEL_DEMOTION` are declared pure (`LevelScope.ts:72` — "no THREE, no DOM, no store
  reads") and already exported from the package index. The work is (1) hoist that ~50-line pure module
  to an ancestor both sides can reach (`@pryzm/geometry-kernel`) to dodge the cycle, and (2) stamp a
  `levelId` on `EndpointEntry`/`SegmentEntry` in `_ensureCache()` — a seam that already exists via
  `registerSegmentUUID` (`EdgeProjectorService.ts:3346`) and `lookupElementUUID`. A cheaper stopgap:
  the projection already knows `floorY`, so demoting the `:beyond` layer in `_ensureCache()` would
  fix the storey-below ranking AND the invisible-linework snapping without any per-element lookup.

  ⚠ **Correct the two rival copies of the stale sentence**, in ADR-0335 "Not decided here" and
  `ISSUE-LOG.md`, or this bullet becomes the third disagreeing authority for one fact (C84 EI-1).
- **Level BANDS are not modelled.** OTHER is binary; the floor immediately below is ranked the same
  as one six floors away.
- **The active storey is a single global.** Per-pane active levels (C59; L-1107 — *"the view is
  PLURAL"*) would require the §9.5 accessor to become pane-aware. That accessor is the one seam.

---

## §10 — App PHASE and phase-gated chrome

Added **2026-08-19** (L-1186). Owns the question *"which chrome surfaces exist right
now, and who decides?"* — the phase axis of `apps/editor/src/ui/layout/panelDefaults.ts`
(`§UX1-PANEL-DEFAULTS`) and its DOM applier `phaseChrome.ts` (`§UX1-PHASE-CHROME`).

### §10.1 — The two phases, and what the question actually is

`AppPhase` is `'onboarding-globe' | 'canvas'`. It does **NOT** mean *"what am I
looking at?"* — a user on the canvas who opens PRYZM Earth is still a canvas user
looking at a globe, and mirroring the active view would take away the very pills they
need to come back. It means **"is a GUIDED ONBOARDING SESSION in progress?"**

That is the whole contract. `'canvas'` is the resting state of the application;
`'onboarding-globe'` is the EXCEPTIONAL state, and exceptional states must be
**declared by their owner**, never inherited by silence.

### §10.2 — ⭐ The phase MUST be DERIVED from a declared fact, never REMEMBERED

**MUST**: every state that determines whether chrome exists is declared at the seam
that KNOWS it, before the chrome mounts.
**MUST NOT**: a phase-gated surface may not depend on some later, unrelated
interaction happening to move the phase for it.

**The defect this rule was written from (L-1186).** `currentPhase` initialised to
`'onboarding-globe'`, and at `638cdf33` exactly two production call sites moved it to
`'canvas'`: the guided site-plan landing (`enterCanvasWithSitePlanUnderlay`) and a
click on a BIM view-mode button (`GISAreaLayout.activateView`). Neither is on the path
a user takes to open an existing project. So a hub click, a deep link or a
reopen-after-reload left the phase reading `'onboarding-globe'` for the entire
session, `panelAbsent('launcher-rail')` stayed TRUE, and the founder's floating stack
(Buildable Envelope · Site Analysis · Living Graph · Graph · Plan + Site · PRYZM
Earth), the Split View toggle and the View-Properties launcher were **skip-mounted and
never created at all**.

The founder reported it as *"OFTEN"* missing, and "often" was the diagnosis: the
chrome appeared for a session in which the user later clicked a view-mode button, and
never for one in which they did not.

This is the same defect class as **C85 §10.5** (an invalidation keyed on the wrong
thing, L-1159) and **L-1189** (a hand-written event list with zero emitters): *state
that had to be REMEMBERED by whoever happened to pass through the right code, rather
than DERIVED from the fact that determines it.* It is this repo's signature failure and
it is why this section exists.

### §10.3 — Who declares what (the complete register)

| Fact | Declared by | Verb |
|---|---|---|
| A guided onboarding session STARTS | `OnboardingStepController.start()` | `resetAppPhaseForNewProject()` |
| A guided onboarding session ENDS (**every** exit) | `OnboardingStepController.dispose()` | `setAppPhase('canvas')` |
| A project is OPENED (hub click · deep link · reopen-after-reload · blank create) | `PlatformRouter.launchWorkspace()` | `declarePhaseForProjectOpen({})` |
| That open is the guided flow's CREATE HOP | `PlatformRouter.createAndOpenProject()` | `declarePhaseForProjectOpen({ guidedOnboarding: true })` — a no-op, so the flow keeps the globe |

**MUST**: a new project-entry path joins this table in the same PR that mints it.

**MUST NOT** key the guided-hop discrimination on `isNewProject`. The hub's *"Skip —
blank canvas"* create is also a new project and runs no guided flow; keying on it
strands exactly the users this section exists to protect.

The guided session is **bracketed at both edges** on purpose. Before L-1186 only one of
the flow's four exits declared the end, so a user who skipped the site draw
(`generateAndFinish()`'s `finally`, and the two `createSite` bail-outs) also finished
onboarding with no chrome — the same symptom, reached a different way.

### §10.4 — The module-load default stays `'onboarding-globe'`, and why that is not a contradiction

Defaulting to `'canvas'` would put model chrome over a globe with no model — the
original UX1 report. Defaulting to `'onboarding-globe'` degrades a silent path to
*quiet*, never to *wrong*. §10.2 is what makes that safe: **no path that matters is
silent any more**, so the default is now genuinely unreachable in normal operation
rather than being the value half the application accidentally ran in.

**MUST NOT** treat the default as a substitute for a declaration. A surface that finds
itself relying on it has found a missing row in §10.3.

### §10.5 — Absence has two strengths and they are different words

`phaseChrome.ts` enforces at two levels and every row declares which it gets:
**SKIP-MOUNT** (the owner asks `panelAbsent(id)` before building anything — nothing is
created, subscribed or queried) and **HIDE** (the surface mounts and the controller
sets `display: none`; the pixels are gone, the subscriptions are not).

**MUST NOT** report a HIDE row as if it were skip-mounted. The HIDE rows are a NAMED
GAP (L-1025), not a completed conversion.

Note that SKIP-MOUNT is precisely why L-1186 was invisible rather than ugly: a wrong
phase did not mis-style the rail, it meant the rail had never existed.

### §10.6 — Test obligation

**MUST**: a spec for phase-gated chrome exercises the **DIRECT-OPEN** path by calling
the production declaration, not `setAppPhase`.

Every phase spec before L-1186 began in `'onboarding-globe'` and then called
`setAppPhase('canvas')` by hand — the onboarding path written out. They proved that IF
something declares the canvas the chrome returns, and never asked who declares it on a
direct open. Nothing did, and every assertion was green. A spec that reaches for
`setAppPhase` on this path is **stubbing the thing under test** (C82 §5.4 —
machinery-present ≠ capability-reachable).

`apps/editor/src/ui/__tests__/projectOpenPhase.spec.ts` is the executable form of this
section, including SOURCE-evidence cases (labelled as such) pinning that
`launchWorkspace` still calls the declaration and that the guided session is still
bracketed at both edges.

### §10.7 — Known gaps (named, so they are not assumed closed)

- **No CI gate counts the §10.3 register against the production call sites.** The
  reachability cases in `projectOpenPhase.spec.ts` are string matches against source
  and catch the rename/deletion class only.
- **`'canvas'` is a one-way latch within a session.** §10.3's dispose row makes every
  guided exit declare it, so the latch is no longer how the canvas is reached — but a
  future third phase would need the latch replaced by the full derivation, not another
  exception bolted onto it.
- **The HIDE rows of §10.5 still run their subscriptions while hidden** (L-1025).

---

## §11 — Import underlays are VIEW-SCOPED

> **Added 2026-08-19 · L-1197 · normative.** Founder, production: *"I clicked on Plan
> Site — this is corrupted. It's sort of attached an IMAGE of the plan view, then ALL
> views are corrupted — even my 3D view has this image attached."*

An **import underlay** is the raster plane `FloorPlanUnderlayTool` adds to the shared
THREE scene: a scanned PDF/JPG floor plan, or the machine-generated aerial basemap the
`▦ Plan + Site` launcher (§7, slot `planGis`) composites from ESRI World Imagery. It is
explicitly **not** a BIM element — `isNonBIM: true`, never in an ElementStore, never on
the store event bus (C04 §3.1 Tool Layer). It is therefore **outside** C09 §4.7, which
governs visibility INTENT over BIM elements; do not conflate the two mechanisms.

### §11.1 — Every underlay declares a view scope

`userData.viewScope: 'plan' | 'all'`.

- `'plan'` — renders only in plan-family views (`Top`, `Ceiling`, `ceiling-plan`,
  `Ground Floor`). **A view that cannot be classified is NOT a plan view**: a scoped
  underlay fails CLOSED, so an unknown mode hides it rather than leaking it.
- `'all'` — renders everywhere. This is the DEFAULT for an absent scope, and the default
  is load-bearing: L-258 records the founder's success criterion for the traced site-plan
  flow as *"3D BIM canvas + SPLIT VIEW + the imported plan visible as an underlay in BOTH
  panes"*. Scoping every underlay to plan-only would regress it.

**A machine-generated context raster MUST declare `'plan'`.** It is a plan-drawing
basemap; in a perspective 3-D view a 400 m photographic plane lying through the model is
not context, it is an artefact.

### §11.2 — One authority, many readers

The decision is the pure function `underlayVisibleInViewMode(scope, viewMode)` in
`apps/editor/src/engine/underlayViewScope.ts`. Readers subscribe; nobody re-derives it.

`mesh.visible` for an underlay is **COMPUTED**, never authored directly:

```
mesh.visible  =  userIntent (the Import Manager eye)  AND  scopeAllows(activeViewMode)
```

Binding consequences:

1. A view switch MUST NOT resurrect an import the user hid. The two questions are
   separate and are AND-ed, never collapsed.
2. Persistence MUST save the **user's intent**, not the computed `mesh.visible`. Saving
   the computed value persists "hidden" for any plan-scoped underlay that happened to be
   saved while the user stood in 3-D, and it returns hidden with the eye showing OFF.
3. The scope MUST be stamped **before** `pryzm-floor-plan-underlay-placed` is emitted, on
   both the create path and the per-project restore path, so a scoped underlay never
   renders for a frame in a view that does not own it.

### §11.3 — This is the FOURTH member of one family

`initScene.ts` already gates three THREE 2-D documentation overlays out of the 3-D model
view on the same `view-activated` event — the floor tile hatch (A.21.D34), the room fill
overlay (A.21.D34 recurrence 2) and the parcel boundary fill (A.21.D44). Each was
hand-copied. The import underlay is the fourth and was simply never included.

**New 2-D documentation overlay ⇒ declare its view scope at creation.** The next one MUST
join this authority rather than adding a fifth `view-activated` listener of its own.

### §11.4 — Attribution: an underlay must name its project

`ProjectIsolationAudit` detects a foreign underlay by `userData.projectId`. An underlay
restored for a project MUST stamp it. Before L-1197 the audit's underlay detector keyed on
`name.startsWith('FloorPlanUnderlay')` and `userData.isFloorPlanUnderlay` — **neither of
which any production code has ever set**; the only producers in the repo were the audit's
own tests, which planted them. The surface could not report a leak it was written to catch.
**A detector whose shape is produced only by its own tests is not a detector** (C13).

### §11.5 — Open cells (recorded, not assumed closed)

- **`'plan'` vs `'all'` is the whole vocabulary.** There is no *"this underlay belongs to
  THIS ONE plan view"* — a project with two plan views shows the underlay in both. Per-view
  ownership (a `viewId`) is unbuilt.
- **The Import Manager still presents the machine-generated GIS basemap as a user import**
  — a `PDF/Image` row with a 3-point Reference Scale control that is meaningless for a
  georeferenced raster. It is left in place because that row is also the only off switch;
  splitting "system context layer" from "user import" is a product decision, not a fix.
- **No CI gate counts overlay creators against §11.1.** A new overlay that forgets to
  declare a scope inherits `'all'` and leaks silently, exactly as this one did.

## §12 — Chrome actions are DECLARED once; a panel is a HOST, the action is the AUTHORITY

> **Added 2026-08-19 · L-1187 · normative.** Founder, with an annotated screenshot boxing three
> separate chrome surfaces and arrows from all of them to one panel icon: *"Please make sure all
> the following buttons are in the GIS tab — and the legacy buttons are gone, cleaned."*

The audit that answered him found that the 19 boxed controls were **14 actions under 19 names**,
mounted by **five** independent surfaces that each hand-wrote its own button list and its own
handler. The observable results were: one label (`3D Site`) naming two different things, one of
which was a non-interactive `<span>`; two labels (`3D globe` / `PRYZM Earth`) whose meanings were
**inverted** relative to what a reader would guess; three labels (`Real`, `Massing`,
`Zoom to Site`) each appearing twice against two different state variables; and a whole 305-line
surface (`GISRailPanel.ts`) with **zero importers**, on which the only route to a real capability
had been silently stranded.

This section generalises: it binds every panel, rail, toolbar and floating pill stack in §2 and §7,
not only the GIS panel.

### §12.1 — One declaration per action

Every user-invocable chrome action MUST be declared exactly once, in a registry, with at minimum:
a stable **id**, a **label**, a **group**, the **entry points its dispatch calls**, and the
**retired spellings it absorbs**. Surfaces key off the id; **the label is data, never a literal in
a surface**.

A registry is what makes *"is this button live?"* have **one** answer. Five lists had five answers,
and one of them was "no answer at all, because nothing ever mounted me".

### §12.2 — A surface RENDERS the registry; it does not enumerate

A surface MUST derive its controls from the registry. It MUST NOT accept, or contain, a
hand-written list of ids to render — that list is the same defect one indirection later.

> ⭐ This repo's recurring failure mode is **"an enumerated list that must be REMEMBERED rather than
> DERIVED"**. In one week it produced a viewport freeze (a hand-written event list missing 11
> element families) and a dead pick cache (`bim-railing-*`, zero emitters). A hand-written button
> list in a second panel is the same defect wearing different clothes.

### §12.3 — RE-HOST the dispatch; never copy the handler

Consolidating an action into a new surface MUST re-host the **existing** dispatch — the registered
entry point, the exported function, the bus command. Copying handler logic into the new surface is
forbidden.

This is not style. `GISRailPanel` and `ProjectBrowserPanel` each carried their own copy of the GIS
handlers; they drifted, and one of them ended up unreachable while still looking authoritative to
anyone reading it. **Two copies of a handler is two answers to one question, and nothing decides
which is right.**

### §12.4 — ONE VOCABULARY, enforced (C84 EI-8 / EI-9)

Within a registry: **no two actions may share a label**, and a retired spelling may be absorbed by
**exactly one** surviving action. A retired name that two actions both claim means the
de-duplication is unresolved and MUST NOT be shipped as resolved.

The `absorbs` ledger lives in **code, not in a document**, so that re-minting a retired name fails
a test instead of surviving a review.

### §12.5 — An unresolvable action renders DISABLED, with its reason, and is not clickable

Resolution MUST be able to return "no live dispatch" — `null`, not a silent no-op closure. A
surface that receives it MUST render the control **disabled**, marked, and carrying the stated
reason. It MUST NOT paint it as a live button, and MUST NOT substitute a handler of its own.

> **A dead button that looked alive is its own bug**, and the founder had been clicking them.
> "Nothing happened and I don't know why" and "this isn't available yet, because X" are different
> facts and must not render the same.

Correspondingly, an action declaring **no** entry point MUST carry a stated `unavailableReason`,
and an action that IS live MUST NOT carry one. A permanently-disabled control with no reason is a
tombstone pretending to be a feature.

### §12.6 — Verification is EXECUTABLE, and does not stub the registry

A registry MUST ship with a test that fails the build when:

1. a declared action names an entry point its dispatch **does not call** (the anti-no-op arm — this
   is the arm that reproduces the `GISRailPanel` failure);
2. a dispatch calls an **undeclared** entry point (declaration drifting from handler);
3. two actions share a **label**, or two actions claim the same **retired spelling** (§12.4);
4. an action with no entry points carries **no reason**, or a live action carries one (§12.5);
5. a resolvable action renders **disabled**, or an unresolvable one renders **live** (§12.5);
6. a surface **drops** a declared action (§12.2).

⛔ **A test that stubs the registry proves nothing.** The subject under test is the real registry
and the real renderer; only the *host* (the environment carrying the entry points) may be faked.
The test MUST be **falsified before landing** — break one dispatch and confirm the suite goes red —
because a guard nobody has seen fail is a guard nobody has seen.

Prior art: the Delete census, where a new selectable kind fails the BUILD until Delete handles or
refuses it. Mirror it.

### §12.7 — Retirement is per-control, and (b) blocks

Removing a legacy control requires a **stated verdict**, never a bulk delete:

- **(a) DUPLICATE** — another surviving control dispatches the same action. Safe to delete.
- **(b) SOLE ROUTE** — the only way to reach a live capability. ⛔ Deleting it deletes the feature.
  Its capability MUST land in the new surface **first**, proven, and only then does the old control
  go.
- **(c) ALREADY DEAD** — wired to a no-op or to a surface nothing mounts. Delete it **and log it**.
  ⚠ And check what was stranded on it first: `GISRailPanel` was 100% unreachable, yet it held the
  only caller of `openSiteInspectorPanel` — deleting it silently would have deleted a capability
  that was already invisible.
- **(d) NOT THIS PANEL** — belongs to another surface by function. Say so with the reasoning and
  propose the home; obey the founder's grouping by default, and move it only with a stated case.

**A control that cannot be classified is (b) by default.** Never delete on a guess.

### §12.8 — Open cells (recorded, not assumed closed)

- **Only `window`-registered entry points are resolvable.** An action whose dispatch is a MODULE
  export (`openSiteInspectorPanel`) cannot yet be declared, and remains a hand-written button —
  the exact thing §12.2 forbids. The registry needs a module-backed action kind.
- **No CI gate counts chrome-mounting sites against §12.1.** A sixth surface that hand-writes its
  own list is caught only by review, exactly as the first five were not.
- **The rule is stated repo-wide but applied to GIS only.** The toolbar, the bottom action menu and
  the launcher rail still enumerate. They are in scope for §12; they are not yet in a registry.
