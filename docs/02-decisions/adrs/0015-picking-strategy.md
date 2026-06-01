# ADR-0015 — Picking strategy: gpu-pick default, BVH fallback

- **Status**: Accepted
- **Date**: 2026-04-27
- **Sprint**: S16 (PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES, M8)
- **Deciders**: F (architecture), A (Track A — picking), B (Track B — highlight)
- **Spec source**: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S16 D1 (line 600).

## Context

The PRYZM 2 selection layer (S16) must turn a screen-space click into an
`ElementId` in **< 10 ms p95** across all 12 element families (wall, slab,
door, window, roof, curtain-wall, grid, column, beam, stair, handrail,
ceiling). Two viable strategies exist; both ship together so the runtime
can fall back when the primary strategy is unavailable.

### Strategy A — gpu-pick (single-frame pick texture)

Render the scene into a dedicated `THREE.WebGLRenderTarget` with an
override `PickMaterial` that encodes the element's stable `ElementId`
into the pixel's RGB channels (alpha = 255 → "occupied"). Read back the
pixel under the cursor; decode RGBA → `ElementId`.

| Phase | Cost (1080p, 1k elements) |
|---|---|
| Re-render with `pickMaterial` override | ~1 ms (depth-tested, no shading) |
| Sync `readRenderTargetPixels(1×1)` | ~1 ms (driver-dependent) |
| Decode RGBA → ElementId | < 0.05 ms |
| **Total** | **~ 2 ms p50** |

### Strategy B — BVH pick (CPU raycast against acceleration structure)

Wrap each element's `BufferGeometry` with `MeshBVH` from
[`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) (MIT,
0.9.x). Cast a ray from the unprojected screen point against every
element; return the nearest hit. The BVH is built lazily and cached by
the element's `descriptor.hash`; an element only rebuilds its BVH on
geometry change.

| Phase | Cost (1080p, 1k elements, 50k tris/elem warm cache) |
|---|---|
| BVH cache lookup + ray construction | < 0.1 ms |
| BVH-accelerated raycast | ~ 3-8 ms |
| **Total (warm cache)** | **~ 3-8 ms p50** |

Cold-cache build cost: ~ 5 ms / 50k tris (one-time per element; an
ambient `pryzm.picking.bvh.build` span captures this).

## Decision

**`gpu-pick` is the default strategy. `BvhPickStrategy` is the runtime
fallback.** A `PickStrategyResolver` runs at boot; if `gpu-pick`'s
probe (1×1 RGBA8 readback test) succeeds, the resolver returns it,
otherwise it returns `BvhPickStrategy` and emits a
`pryzm.picking.gpu-pick.unavailable` event with the failure reason.

The probe path exists because of **R1C-02** (Linux WebGL2 driver
quirks): some Mesa + Intel UHD combinations refuse `readPixels` from
`RGBA8` render targets when the canvas is offscreen, returning all
zeros silently. The probe catches this at boot rather than letting the
runtime swallow every pick.

## Consequences

### Positive

- Click-to-select latency target (< 10 ms p95) is met on both paths
  with > 50% headroom on the gpu-pick path.
- `BvhPickStrategy` doubles as the **headless picking strategy** —
  `@pryzm/headless` (S18) can drive selection from a Node-only test
  without a GL context.
- BVH lib (`three-mesh-bvh`, MIT) is the same one PRYZM 1 uses in
  `WallEdgeOverlayBuilder` (vendored copy at `vendor/three-mesh-bvh@0.7`),
  so the dependency surface is already vetted.

### Negative

- Two pick paths means two test suites and two OTel span families.
  Mitigated by a shared `PickStrategy` interface and a single
  `PickStrategyResolver` choke point — handlers and tools never see
  the strategy directly.
- gpu-pick re-renders the scene every click. At 1k elements / 1080p,
  this is ~ 1 ms. At 100k elements (Phase 2C), this approaches a frame
  budget — a future sprint may add a *cached* gpu-pick texture,
  refreshed only when the scene's `descriptor.hash` set changes.
- BVH cache memory: ~ 8 bytes / triangle. A 50k-tri building hits
  ~ 400 KB / element × 1k elements = 400 MB worst case. Mitigation:
  the cache evicts on `descriptor.hash` change (so geometry edits
  release stale BVHs), and a future sprint can add an LRU bound.

### Neutral

- `PickResult.faceIndex` is populated by BVH (it falls out of the
  raycast result). gpu-pick can derive it by writing the face index
  into a second MRT slot — implemented when downstream tooling needs it
  (post-S16).
- `pickRect` (box-select skeleton, S16 D4): gpu-pick reads an N×N
  pixel block and decodes the unique IDs; BVH builds a frustum from
  the rect and tests every BVH bounds. Both paths share the same
  `pickRect(screenRect, ctx): readonly PickResult[]` signature.

## OTel surface (S16 D8 contract)

| Span / Event | Strategy | Key attributes |
|---|---|---|
| `pryzm.picking.pick` | both | `strategy`, `screen.x`, `screen.y`, `result.found`, `result.elementKind?`, `duration_ms` |
| `pryzm.picking.pickRect` | both | `strategy`, `rect.x`, `rect.y`, `rect.w`, `rect.h`, `result.count`, `duration_ms` |
| `pryzm.picking.bvh.build` | bvh | `element.id`, `vertices`, `build.duration_ms` |
| `pryzm.picking.gpu-pick.unavailable` (event) | resolver | `reason` |
| `pryzm.picking.bvh.cache.invalidated` (event) | bvh | `element.id`, `prev_hash`, `next_hash` |

## Alternatives considered

- **CPU-only raycast (no BVH)**: O(N · M) where M is tris per element.
  Rejected — fails the < 10 ms gate at > 50 elements.
- **GPU compute pick (compute shader, single MRT pass)**: would unify
  the two paths but raises the WebGPU minimum (S16 must work on
  WebGL2-only deployments).
- **Cached gpu-pick texture (S16 baseline)**: requires invalidation
  bookkeeping — postponed until measured profile shows re-render is
  the bottleneck.

## References

- Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S16 (lines 594-773).
- ADR-0001 — typed-ID brand strategy (`ElementId` brand).
- ADR-0006 — idle-continuation budget (BVH cache invalidation runs in idle).
- ADR-0007 — WebGPU/WebGL2 dual-mode (gpu-pick targets WebGL2 today).
- R1C-02 — Linux WebGL2 driver quirks (`docs/03_PRYZM3/reference/status-detail/01-PROCESS-TRACKER.md` §6.2).
- `three-mesh-bvh` README — https://github.com/gkjohnson/three-mesh-bvh
