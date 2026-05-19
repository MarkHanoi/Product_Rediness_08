# Picking & Selection Architecture

> Phase: 1C · Sprint S16 · ADR: `docs/architecture/adr/0015-picking-strategy.md`

## Overview

Picking translates a 2D screen point into an element identity. PRYZM 2 provides two
strategies behind a common interface, resolved at boot time.

## PickStrategy interface (`@pryzm/picking`)

```ts
interface PickStrategy {
  pick(screenPoint: Vec2, ctx: PickContext): PickResult | null;
  pickRect(screenRect: Rect, ctx: PickContext): readonly PickResult[];
}

interface PickResult {
  readonly elementId:   string;
  readonly elementKind: ElementKind;
  readonly worldPoint:  Vec3;
  readonly distance:    number;
}
```

Both strategies satisfy `< 10 ms p95` single-point latency on a 1000-element scene
(CI gate via `apps/bench/src/benches/picking-latency.bench.ts`).

## GpuPickStrategy

Renders the scene to a 1×1 pixel `RGBA8` render target using element-ID–encoded
materials (`elementId % 0xFFFFFF` packed into RGB). Reads back the pixel synchronously.

**Availability probe** — `GpuPickStrategy.probeAvailability()` renders a known 1×1
pattern and reads it back. Failure indicates a driver quirk (observed on some Linux
WebGL2 drivers — Risk R1C-02). On failure, `PickStrategyResolver` falls back to BVH.

## BvhPickStrategy

Maintains a CPU-side BVH (via `three-mesh-bvh`) per element, keyed by
`descriptor.hash`. Ray-casts from camera through the screen point.

**Cache invalidation** — when `descriptor.hash` changes (geometry edited), the BVH
for that element is rebuilt. The rebuild is lazy (on the next pick call) and traced
via `pryzm.picking.bvh.build` span.

**Secondary use** — BVH cache doubles as a ray-cast foundation for future measurement
tools (laser-pointer, dimension annotations — planned 2A).

## PickStrategyResolver

```ts
const strategy = await PickStrategyResolver.resolve(renderer);
// → GpuPickStrategy  (if probe succeeds)
// → BvhPickStrategy  (fallback)
```

Emits `pryzm.picking.gpu-pick.unavailable` span event on fallback.

## OTel spans

| Span | Key attributes |
|---|---|
| `pryzm.picking.pick` | `strategy`, `screen.{x,y}`, `result.found`, `result.elementKind?`, `duration_ms` |
| `pryzm.picking.pickRect` | `strategy`, `rect.{x,y,w,h}`, `result.count`, `duration_ms` |
| `pryzm.picking.bvh.build` | `element.id`, `vertices`, `build.duration_ms` |

## Performance targets

| Bench | Target | Hard-fail |
|---|---|---|
| `picking-latency.bench.ts` gpu-pick 1k elements | < 10 ms p95 | 12 ms |
| `picking-latency.bench.ts` BVH 1k elements | < 12 ms p95 | 15 ms |
