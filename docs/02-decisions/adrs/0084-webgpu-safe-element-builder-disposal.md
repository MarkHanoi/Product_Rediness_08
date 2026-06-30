# ADR-0084 — WebGPU-safe element-builder disposal seam (§I2 generalisation)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-06-30 |
| Tag | §I2 · §FIX-DISPOSE-USEDTIMES-BUILDERS |
| Owner | Render pipeline |
| Closes | Recurring `[DoorBuilder] build error: TypeError: Cannot read properties of undefined (reading 'usedTimes')` during resi builds — element fails to render |
| Extends | The §I2 / §FIX-DISPOSE-USEDTIMES guard already in `RenderPipelineManager._safeDisposeRenderPipeline`; the GLB-exporter shared-resource fix (`28a13dd1` / `d42ddf30`) |
| Constraint reference | C04 §1.1 (P2 — `import * as THREE` only in `packages/renderer-three`); C10 §2 (OTel span scope — handler files only) |

---

## Context

On the WebGPU backend, `material.dispose()` fires `onMaterialDispose`, which walks the
renderer's `NodeManager` and calls `NodeManager.delete(renderObject)` for each render
object that referenced the material. `delete()` reads
`this.get(object).nodeBuilderState.usedTimes`. When that render object's node state was
already torn down — WebGPU device loss + recovery, a live backend swap (ADR-0077), or a
stale render object left over from a previous build slice — `this.get(object)` returns
`undefined` and the read throws:

```
TypeError: Cannot read properties of undefined (reading 'usedTimes')
    at NodeManager.delete (three.webgpu.js)
    at onMaterialDispose
    at Material.dispose
    at <Builder>.dispose
    at <Builder>.rebuild
    at <Builder>._drainBuildQueue
```

This `usedTimes` family was already tamed in two NARROW places — the render-pipeline
dispose (`RenderPipelineManager._safeDisposeRenderPipeline`, §I.2.1, which pre-patches
`pipeline.usedTimes` because there the throwing object IS the pipeline) and the GLB
exporter (which was fixed to never dispose shared resources). But the GENERAL case — any
element fragment builder calling `material.dispose()` / `geometry.dispose()` in its
`rebuild()` teardown — was UNGUARDED. There the throw propagated out of the builder's
`dispose()`, up through `rebuild()` / `_drainBuildQueue()`, and was reported as
`[DoorBuilder] build error: …` so the element silently failed to render during resi-build
churn.

Pre-patching `usedTimes` (the pipeline trick) does NOT work for materials/geometries: the
throwing object is an INTERNAL WebGPU render object owned by the `NodeManager`, not
reachable from the material/geometry handle.

## Decision

Add ONE WebGPU-safe disposal seam in `packages/renderer-three/` (the sole THREE owner)
and route every element-builder teardown through it.

`packages/renderer-three/src/safeDispose.ts` exports:

- `isUsedTimesDisposeError(err)` — the single source of truth for the `usedTimes`
  device-loss predicate (matches on the message text so it survives THREE minor upgrades
  and bundler renaming of `NodeManager`).
- `safeDisposeMaterial(mat)` / `safeDisposeMaterials(mat | mat[])` — call `dispose()`
  inside a `try/catch` that swallows EXCLUSIVELY the `usedTimes` throw; **any other error
  re-throws** so genuine disposal bugs still surface.
- `safeDisposeGeometry(geo)` — same for geometry.
- `safeDisposeObject3D(root, disposeMaterials = true)` — deep-disposes a subtree
  WebGPU-safely; `disposeMaterials=false` preserves the "never dispose shared resources"
  rule (matching the GLB-exporter / curtain-wall shared-material guards).

`RenderPipelineManager._safeDisposeRenderPipeline` now reuses `isUsedTimesDisposeError`
in its catch block (no duplicated logic; the pipeline `usedTimes` pre-patch stays as the
mechanism that CAN reach its throwing object).

Element builders updated to route disposal through the seam:
`DoorBuilder`, `WindowBuilder`, `WallFragmentBuilder`, `SlabFragmentBuilder`,
`CeilingPanelBuilder`, `RoofFragmentBuilder`, `ColumnFragmentBuilder`,
`CurtainWallBuilder` (the last preserves its `sharedGeometry` / `sharedMaterial` guards).

**OTel span (C10 §2):** the span gate (`tools/ga-gate/check-otel-spans.ts`) scopes ONLY
to command-bus handler files in `plugins/*/src/handlers/`. These are hot, per-dispose,
synchronous render-teardown calls; a span per call would be out-of-scope for the gate and
a perf footgun. Consistent with `_safeDisposeRenderPipeline` (also span-free), the helpers
are intentionally span-free.

## Consequences

- The `[DoorBuilder] build error: … usedTimes` throws stop; doors and other elements
  build and render normally through rebuild churn. A stale WebGPU render object can no
  longer abort a `rebuild()`.
- On WebGL the helpers are a transparent pass-through (`material.dispose()` /
  `geometry.dispose()` never touch a `NodeManager`, never throw `usedTimes`) — no
  behaviour change, no GPU leak on the happy path.
- The `usedTimes` predicate now lives in exactly one place, shared by the pipeline guard
  and the builder helpers.
- Unit-tested in `packages/renderer-three/__tests__/safeDispose.test.ts` (14 cases): a
  material/geometry whose node-state is missing disposes without throwing; non-`usedTimes`
  errors still propagate; the happy path disposes exactly once.

## Alternatives considered

- **Try/catch inside each builder.** Rejected — duplicates the predicate across 8
  packages and risks each builder swallowing real errors too broadly.
- **Pre-patch `usedTimes` like the pipeline does.** Impossible for materials/geometries:
  the throwing object is internal to the `NodeManager` and unreachable from the handle.
- **Disable WebGPU node teardown globally.** Rejected — far larger blast radius; would
  mask genuine GPU resource leaks.
