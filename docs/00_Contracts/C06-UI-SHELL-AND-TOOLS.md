# C06 — UI Shell & Tools

> **Stamp**: 2026-05-16 · **Status**: CANONICAL  
> **Scope**: `PlatformRouter`, panel management, tool registration, keyboard shortcuts, camera integration, and the 2D plan-view / section-view rendering pipeline.  
> **Key principles**: P1 (single composition root), P4 (no `window as any`), P6 (commands only).

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
