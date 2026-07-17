# ADR-0264 — Open-old-project: ceiling restore mapping + WebGL2 view-unstick (OBC loop hardening)

- **Status:** ACCEPTED (2026-07-01) — IMPLEMENTED.
- **Owner:** persistence load path (`ProjectLoader` / `ImportProjectCommand`) + the OBC
  world/frame loop (`packages/core-app-model/src/BimWorld.ts`).
- **Affects:**
  - `packages/command-registry/src/project/projectLoaderUtils.ts` (NEW pure helper `ceilingRestoreBoundaryFields`)
  - `packages/command-registry/src/index.ts` (export the helper)
  - `packages/command-registry/src/project/ImportProjectCommand.ts` (ceiling restore uses the helper)
  - `apps/editor/src/engine/persistence/ProjectLoader.ts` (streaming ceiling restore uses the helper)
  - `packages/persistence-client/src/loader/ProjectLoader.ts` (ceiling restore uses the helper)
  - `packages/core-app-model/src/BimWorld.ts` (`§WEBGL2-VIEW-UNSTICK` — guard OBC's self-driving rAF loop)
  - `packages/command-registry/__tests__/loadHealDegeneratePolygon.test.ts` (+5 `ceilingRestoreBoundaryFields` tests)
- **References:** `§OPEN-OLD-CEILING-RESTORE`, `§WEBGL2-VIEW-UNSTICK`, ADR-0261 (WebGL2
  render-on-move — the frame-scheduler park/wake mechanism), ADR-0260 / ADR-0084
  (`§LOAD-HEAL-DEGENERATE-POLYGON` — the degenerate-polygon load heal this sits beside),
  C11 (element-creation pipeline), C13 (project lifecycle).

## Context

Opening an OLD saved project (765 elements / 7 levels; renderer on the WebGL2 fallback —
`forceWebGL=true`, `§PERF-WEBGL2-RENDER-ON-MOVE ... ENABLED`) exhibited two symptoms:

- **(A)** Ceilings were not restored; the UI showed "N elements failed — see console"
  (~120 failures on the reported project).
- **(B)** The 3D view was stuck — the camera could not rotate/pan/zoom despite
  render-on-move being "enabled".

### Root cause (A) — ceilings fail restore: flat-vs-nested field read

A persisted ceiling is the full `CeilingData` object. Its
polygon / height / thickness / baseOffset live **nested under `.boundary`**
(`CeilingData.boundary: CeilingBoundary`; see `packages/core-app-model/src/stores/CeilingTypes.ts`).
`ProjectSerializer` writes `deepStrip(ceiling)` — i.e. the nested shape.

Every restore site built the `CreateCeilingCommand` payload from the **flat** fields
(`ceiling.polygon`, `ceiling.height`, `ceiling.thickness`, `ceiling.baseOffset`), which are
`undefined` on a real snapshot. `CreateCeilingCommand.canExecute()` then ran
`validateCeilingPolygon(undefined)` → invalid → the command was rejected and counted as a
**failed element**. Because EVERY ceiling record hit this, all ceilings failed and none were
restored. (The `§LOAD-HEAL-DEGENERATE-POLYGON` drop helper correctly read
`c.polygon ?? c.boundary.polygon`, so it did NOT drop these valid ceilings — they survived the
heal only to fail at the flat read.) Three copies of the restore loop shared the bug:
`apps/editor` `ProjectLoader`, `command-registry` `ImportProjectCommand`, and `persistence-client`
`ProjectLoader`.

### Root cause (B) — stuck camera: a throwing component kills OBC's self-driving rAF loop

OBC's `Components.update` (`@thatopen/components`) is an arrow-property that runs its **own**
`requestAnimationFrame` loop, started by `components.init()` (called in `BimWorld.ts`). Each frame
it iterates every registered component, calls `component.update(delta)`, and **only re-arms
`requestAnimationFrame(this.update)` at the END of the method**. That loop is what ticks
`world.camera.controls.update(delta)` every frame — which is what physically moves the camera AND
what fires the `'update'` / `'rest'` camera-controls events. Those events call
`FrameScheduler.beginMotion()` / `endMotion()`, which wake PRYZM's frame-scheduler (it self-parks
after 30 idle frames per ADR-0206) so `RenderPipelineManager.render()` repaints on the WebGL2
fallback. This loop is INDEPENDENT of PRYZM's scheduler.

If **any** component's `update(delta)` throws — e.g. a renderer/builder touching a half-restored
element after a load that had failures — the exception escapes OBC's `update()` **before** the
re-arm line. The rAF loop dies. Camera-controls stop being ticked (camera frozen) AND no further
`'update'` events fire, so PRYZM's scheduler parks and never repaints. A single throwing frame
permanently freezes the entire viewport. This is the "unguarded exception in the per-frame
render/camera loop" the symptom pointed at — the throw is in OBC's loop, not PRYZM's (PRYZM's
`UnifiedFrameLoop._tick`, `FrameScheduler.tick`, and `RenderPipelineManager.render()` already
isolate per-callback errors).

(A) and (B) are LINKED: a load with element-build failures is a common trigger for a component
`update()` throw, so fixing (A) removes a frequent trigger for (B) — but (B) is hardened
independently so any future throwing component cannot freeze the viewport.

## Decision

1. **`ceilingRestoreBoundaryFields(ceiling)`** — a pure, exported, unit-testable helper in
   `projectLoaderUtils.ts` that reads `polygon`/`height`/`thickness`/`baseOffset` from
   `ceiling.boundary` first, with a flat fallback for any legacy flat-shaped record. All three
   restore loops use it. No OTel span (pure data transform — mirrors `findOpeningElementData` /
   `migrateRoofSnapshotToCommand` in the same file).

2. **`§WEBGL2-VIEW-UNSTICK`** — in `BimWorld.ts`, immediately after `components.init()`, wrap
   `components.update` in a guard that try/catches the original and **always** re-arms the rAF
   loop (logging the first error once, never per-frame). On a clean frame the original re-arms to
   the wrapper (it reads `this.update`, now the wrapper); on a throwing frame the guard re-arms.
   One bad frame is skipped; the camera keeps moving on the next frame. Pure defensive wrapper
   around an existing loop — no span.

## Consequences

- Old projects restore their ceilings; the "N elements failed" banner no longer fires for
  ceilings. New projects are unaffected (they already round-trip the nested shape correctly).
- A throwing OBC component `update()` can no longer freeze the viewport — the camera stays live
  and the WebGL2 render-on-move path keeps repainting.
- The guard is per-frame-granular: a persistently-throwing component logs once and its work is
  skipped every frame, but interaction survives. If a component throws every frame, that is a
  separate bug to fix — the guard makes it visible (one log) instead of a hard freeze.

## Alternatives considered

- **Guard only PRYZM's `UnifiedFrameLoop` / `RenderPipelineManager.render()`** — already done and
  insufficient: the freeze originates in OBC's separate `Components` rAF loop, which PRYZM does
  not drive.
- **Fork/patch `@thatopen/components`** — rejected; the wrapper achieves the same resilience from
  our composition root without vendoring OBC.
- **Fix only the flat-field read (A) and rely on it to prevent (B)** — rejected; (B) must not
  depend on zero build failures ever occurring.
