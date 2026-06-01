# ADR-009 — Producer pure-function signature

* **Status:** Accepted
* **Sprint:** S08 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S08-T1, D2 kickoff)
* **Date:** 2026-04-27
* **Supersedes:** —
* **Superseded by:** —

## Context

`packages/geometry-kernel/` (L4) is the most-tested expression of P1 from
`docs/archive/pryzm3-internal/01-TARGET-ARCHITECTURE.md §0`:

> *Domain is pure.  No `THREE`, no `OBC`, no DOM, no `window` reads.
>  Runs in Node and the browser unchanged.*

`pryzm/no-three-in-kernel` (S07-T3 real-enforce) blocks accidental THREE
imports inside the kernel.  This ADR pins the **producer signature** so
that every element family — wall, slab, roof, door, window, … — has the
same shape, and the K1-B kernel-pivot test (kernel runs in Node
`worker_thread` byte-identical to a browser worker) can be expressed as
a single Vitest matrix instead of one ad-hoc test per element.

The signature is informed by three constraints:

1. **Determinism.**  Identical `(dto, joinData, worldY)` inputs MUST
   produce a byte-identical `BufferGeometryDescriptor` in both Node and
   the browser.  No `Date.now()`, `Math.random()`, `crypto.*`, no closure
   over module-level mutable state.
2. **Pre-resolved DTO.**  Anything the producer would need to *fetch* —
   wall-system-type catalogue, opening positions, level elevation — is
   resolved at handler time and written into the DTO (or the `worldY`
   number, in the level-elevation case).  The producer is **not** an
   IO-bound coroutine; it is a synchronous pure function.
3. **Plain typed-array output.**  The producer emits typed arrays
   (`Float32Array`, `Uint16Array`/`Uint32Array`) plus content-addressed
   `MaterialKey`s and a stable `hash`.  The committer (L3) wraps these
   in `THREE.BufferAttribute`s; the bake service writes them to disk.
   No THREE construction in the kernel.

## Decision

Every L4 producer MUST be a **synchronous pure function** with the shape

```ts
type Producer<TDto extends ElementDto, TJoinData = unknown> = (
  dto: Readonly<TDto>,
  joinData: Readonly<TJoinData>,
  worldY: number,                       // level elevation in world space
) => BufferGeometryDescriptor;
```

For the wall family this concretely means:

```ts
import type { Wall } from '@pryzm/protocol';
import type { JoinData } from '@pryzm/geometry-kernel/types/JoinData';
import type { BufferGeometryDescriptor } from '@pryzm/geometry-kernel/types/BufferGeometryDescriptor';

export type WallProducer = (
  dto: Readonly<Wall>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;
```

The producer's inputs are `Readonly<>` at the type-system level; the
producer MUST NOT mutate them.  All randomness, IO, and time-keeping are
forbidden — `pryzm/no-three-in-kernel` blocks the most common accidental
violations; the additional constraints are enforced by code review and
the `wall-headless-node.test.ts` byte-equality gate (`packages/geometry-
kernel/__tests__/wall-headless-node.test.ts`).

### `BufferGeometryDescriptor`

```ts
export interface BufferGeometryDescriptor {
  readonly position: Float32Array;        // length = 3 * vertexCount
  readonly normal:   Float32Array;        // length = 3 * vertexCount; ≈ unit-length
  readonly uv:       Float32Array;        // length = 2 * vertexCount
  readonly index:    Uint16Array | Uint32Array;
  readonly bounds:   { readonly min: Point3D; readonly max: Point3D };
  readonly groups:   readonly DescriptorGroup[];
  readonly materialKeys: readonly MaterialKey[];
  readonly hash:     string;              // composeWallGeometryHash output
}
```

The `groups[i].materialIndex` is an offset into `materialKeys`; the
committer resolves each `MaterialKey` to a pooled `THREE.Material` via
`MaterialPool` (1A S05).

### `JoinData`

`JoinData` is **pre-resolved** by the wall handler (S07-T8 contract):

```ts
export interface JoinData {
  readonly start?: { readonly miterAngleRad: number; readonly neighbourId: WallId };
  readonly end?:   { readonly miterAngleRad: number; readonly neighbourId: WallId };
}
```

The producer converts `miterAngleRad` to a unit `(nx, nz)` normal in its
own internal helpers (see `packages/geometry-kernel/src/producers/_internal/
resolveMiters.ts`).  The PRYZM 1 `WallJoinResolver` shape (raw `nx, nz`
pair) is **not** the contract — it is an implementation detail of the
PRYZM 1 builder.  Resolving to an angle at handler time keeps the join
representation serialisable, comparable, and free of axis ambiguity.

### `worldY`

The third argument is a single `number`: the world-space Y of the level
floor.  `dto.baseLine[*].y` carries the level elevation per the PRYZM 1
`WALL-AUDIT-2026-M7` convention; the producer ignores `dto.baseLine[*].y`
and uses `worldY + dto.baseOffset` as the geometry base elevation.

## Pivot tests

* **K1-A — kernel pure check (S07 D7):** lint-fixture proves the kernel
  forbids THREE.  Already enforced (`packages/geometry-kernel/__tests__/
  lint-fixture.test.ts`).
* **K1-B — kernel runs in Node (S08 D7):** every wall fixture produces
  byte-identical descriptors in Node `worker_thread` AND the in-process
  producer.  Asserted in `packages/geometry-kernel/__tests__/wall-
  headless-node.test.ts`.

If either gate trips, the K1 pivot from `01-TARGET-ARCHITECTURE.md §0`
is invoked: kernel purity is non-negotiable, the offending change is
reverted before merge.

## Consequences

* **Producer code lifted from PRYZM 1 must drop THREE.**  Where PRYZM 1
  used `THREE.Vector3.subVectors`, the kernel uses
  `vec3.subtract(out, a, b)` from `packages/geometry-kernel/src/math/
  vec3.ts`.  Where PRYZM 1 returned a `THREE.BufferGeometry`, the kernel
  returns a `BufferGeometryDescriptor`.  Math is identical; the type
  layer is the only thing that moves.
* **Joins resolved upstream.**  The wall handler runs the join resolver
  *before* dispatching to the producer; the producer never reads the
  store, never queries neighbours.  Cascade chains (wall A move →
  wall B miter changes) are handled by the L2 cascade engine, not by
  the kernel.
* **Materials stay outside the kernel.**  The producer emits
  `MaterialKey[]` (content-addressed names); only the committer (L3)
  resolves them to `THREE.Material` instances via `MaterialPool`.
* **Bench harness shape is universal.**  The same Vitest bench file
  shape works for every element — `apps/bench/produce-<element>.bench.
  ts`.  The S08 wall bench is the template.
* **CSG (openings) is kernel-side and THREE-free.**  Per the S08
  blocker analysis, the documented fallback to porting `three-bvh-csg`
  is to use `manifold-3d` (WASM, already THREE-free).  S08 ships the
  `manifold-3d` adapter at `packages/geometry-kernel/src/csg/`; the
  three-bvh-csg port is recorded as a deferred follow-up if profiling
  ever shows the WASM bridge is the bottleneck.

## Alternatives considered

1. **Async producer** (returns `Promise<BufferGeometryDescriptor>`).
   Rejected: would require every committer-side caller to be async,
   and the K1-B byte-equality gate becomes much harder to express
   (timing-dependent flakes).  The system-type catalogue concern that
   motivated this is solved by *materialising* layers into the DTO at
   handler time (see `wall.setLayers` ADR-008 wave 2).
2. **Producer takes a context object** instead of three positional
   arguments.  Rejected: the three-arg shape is the smallest contract
   that makes the producer composable in a worker `postMessage` payload
   without losing type information.  The context-object alternative
   accumulates fields over time and erodes the purity gate.
3. **Producer outputs `Float32Array | THREE.BufferAttribute`** to let
   the committer skip a copy.  Rejected: the type would leak THREE into
   the kernel surface even if the runtime branch is THREE-free.  The
   committer constructs `THREE.BufferAttribute` from the raw buffer
   without copying when the buffer is owned by the committer's lifetime
   (the kernel is the producer; the committer owns the descriptor on
   the scenic side).

## See also

* `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md §S08` — full sprint plan.
* `docs/02-decisions/adrs/0005-primitive-committer-interface.md` —
  committer-side counterpart that consumes `BufferGeometryDescriptor`.
* `docs/04-reference/architecture-detail/parity-fixtures.md` — fixture format + capture
  procedure used to enforce K1-B.
