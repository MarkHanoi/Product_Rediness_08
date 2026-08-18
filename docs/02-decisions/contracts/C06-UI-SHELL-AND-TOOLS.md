# C06 — UI Shell & Tools

> **Stamp**: 2026-07-07 · **Status**: CANONICAL  
> **Scope**: `PlatformRouter`, panel management, tool registration, keyboard shortcuts, camera integration, the 2D plan-view / section-view rendering pipeline, **and UI layering / overlap (z-index)**.  
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
