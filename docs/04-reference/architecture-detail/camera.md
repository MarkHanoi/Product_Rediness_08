# Camera Architecture

> Phase: 1C · Sprint S17 · Related: `docs/04-reference/architecture-detail/view-state.md`, ADR-016

## Overview

Camera state in PRYZM 2 separates *definition* (what the camera should look at — stored in
`ViewDefinition.camera`) from *animation* (how it gets there — driven by `ViewController`).
The `CameraController` in `@pryzm/renderer` owns the live Three.js camera object.

## Components

### CameraDescriptor (`@pryzm/view-state`)

Plain-data record describing a desired camera pose:

```ts
interface CameraDescriptor {
  position: Vec3;   // world-space eye position
  target:   Vec3;   // world-space look-at point
  up:       Vec3;   // up vector (usually {x:0, y:1, z:0})
  fovDeg:   number; // vertical field-of-view in degrees (perspective only)
}
```

`Vec3` is `{x, y, z}` — no Three.js dependency so this is safe in headless.

### CameraController (`@pryzm/renderer`)

Wraps the live `THREE.PerspectiveCamera` / `THREE.OrthographicCamera`. Key API:

```ts
interface CameraController {
  snapshot(): CameraPose;           // returns THREE.Vector3 clones of current pose
  applyPose(pose: CameraPose): void; // sets camera position/target/up immediately
}
```

`CameraPose` uses `THREE.Vector3` (not plain `Vec3`) for use in the render loop.

### ViewController (`@pryzm/view-state`)

Bridges the pure `ViewDefinition` world to the renderer's `CameraController`:

1. On `switchTo(viewId)`:
   - Reads `ViewRegistry` for the target definition.
   - Calls `scheduler.beginMotion()` to suppress `IdleAccumulator`.
   - Registers a `'pre-render'` tick listener.
2. Each tick:
   - Lerps position/target/up using **cubic in-out easing**.
   - Calls `CameraController.applyPose(interpolatedPose)`.
   - Calls `scheduler.markDirty('view-switch')` to force a render.
3. When `elapsed >= transitionDurationMs` (default 400 ms):
   - Disposes the tick listener.
   - Updates `ActiveViewStore`.
   - Calls `scheduler.endMotion()`.
   - Resolves the returned `Promise<void>`.

## Scratch vectors

To avoid per-frame GC pressure, `ViewController` pre-allocates three `THREE.Vector3`
scratch vectors (`scratchPos`, `scratchTgt`, `scratchUp`) that are re-used in `lerpVectors`
each tick. These are local to the `switchTo` closure — concurrent calls each get their own
scratch set.

## Easing

```ts
function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

Produces smooth acceleration and deceleration. `t` is clamped to `[0, 1]` via
`Math.min(1, elapsed / duration)`.

## IdleAccumulator interplay (ADR-014)

`beginMotion()` puts the `FrameScheduler` into motion mode, which:
- Prevents the `IdleAccumulator` from counting TRAA / SSGI convergence frames.
- Ensures every tick renders a full frame (no budget-based frame skipping).

`endMotion()` re-enables idle-continuation, which starts the TRAA / SSGI convergence
sequence from the newly arrived view pose.

## Performance target

| Metric | Target | Hard-fail |
|---|---|---|
| `view-switch.bench.ts` p95 | < 200 ms | 250 ms |

The bench measures `ViewController.switchTo()` end-to-end with a mock scheduler that
fires a single synthetic tick. The bottleneck is typically `CameraController.applyPose`
triggering a Three.js matrix update + `markDirty` scheduling a render.
