# L5 scene-committer — interface + design

> Status: scaffolded at S04 Track B. Full fan-out from store deltas
> lands at S05 alongside the renderer + frame-scheduler integration.
>
> Owner package: `packages/scene-committer/`.
>
> Source spec: `docs/03_PRYZM3/reference/phases/PHASE-1/1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track B (lines 442-469).
> Interface ratification: ADR-005.

## The wall around THREE

PRYZM 2 lets THREE.js touch one — and only one — surface: the L5
scene-committer. Every other layer (L0 persistence, L1 stores, L2
command-bus, L3 sync, L4 kernel + picking) speaks pure DTOs. The lint
rule `pryzm/no-three-outside-committer` is the static enforcer; this
package is the runtime contract.

## Package surface

```
packages/scene-committer/
  src/
    types.ts          ← PrimitiveCommitter, ElementId, MaterialHandle
    SceneRegistry.ts  ← Map<ElementId, Object3D>
    MaterialPool.ts   ← hash → ref-counted Material handle (Disposable)
    CommitterHost.ts  ← register / commit / commitBatch / dispose
    otel.ts           ← pryzm.scene.commit span helper
    index.ts          ← public barrel
  __tests__/
    SceneRegistry.test.ts        ← 6 tests
    MaterialPool.test.ts         ← 8 tests
    cube-committer-e2e.test.ts   ← 3 tests (CommandBus → host → mesh)
```

## `PrimitiveCommitter<TDto, TElement>` — the contract

```ts
interface PrimitiveCommitter<
  TDto = unknown,
  TElement extends THREE.Object3D = THREE.Object3D,
> {
  readonly primitiveType: string;
  onAdd(id: ElementId, dto: TDto): TElement;
  onUpdate(id: ElementId, dto: TDto, obj: TElement): void;
  onRemove(id: ElementId, obj: TElement): void;
  onDispose(): void;
}
```

| Hook | Called when | Must do | Must NOT do |
|---|---|---|---|
| `onAdd` | element appears in store | allocate or pool a `TElement`, return it; the host binds it in the registry | mutate global state; touch other elements |
| `onUpdate` | element mutates | mutate `obj` IN PLACE | replace `obj` with a new instance |
| `onRemove` | element gone | release material handles; detach from any scene-graph parent the committer owns | dispose `obj.geometry` if the geometry is shared across the primitive type |
| `onDispose` | committer torn down (project close, plugin unload) | release every retained handle, dispose every committer-owned geometry | rely on `onRemove` having been called for outstanding elements |

The `primitiveType` field doubles as the dispatch key in
`CommitterHost.register()` and as an OTel attribute on every
`pryzm.scene.commit` span.

### Why `onUpdate` is in-place

The `SceneRegistry` binding (`ElementId → Object3D`) is consumed by the
picking layer (L4) and the renderer (L5). If `onUpdate` returned a new
instance, both layers would have to rebind on every store change — and
selection / outline / hover overlays would have to invalidate every
tick. In-place mutation is the cheapest invariant.

## `SceneRegistry`

A flat `Map<ElementId, Object3D>` with two guard rails:

- `add(id, obj)` throws if `id` is already bound to a *different*
  object (re-binding the same object is idempotent).
- `clear()` drops every binding without disposing — the host calls it
  inside `dispose()` AFTER the per-committer `onDispose()` calls have
  released material/geometry resources.

Iteration order is insertion order (Map semantics). The renderer walks
`registry.values()` to (re)build draw lists; the picker resolves
`mesh.uuid` → `ElementId` by walking `registry.entries()`.

## `MaterialPool`

Content-hash → `MeshXxxMaterial` with reference counting. The caller
chooses what to include in the hash:

```ts
const handle = pool.acquire(
  'wall/standard/concrete-grey/opaque',
  () => new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.92,
    transparent: false,
  }),
);
mesh.material = handle.material;
// later:
handle.release();   // pool.dispose()s the material when refs == 0
```

The handle is a TC39 `Disposable` (`[Symbol.dispose]` calls `release()`),
so committers may use `using`:

```ts
{
  using h = pool.acquire('overlay/dashed', () => new THREE.LineDashedMaterial());
  preview.material = h.material;
  // h released at block exit
}
```

`pool.dispose()` is the bulk-release hatch — it disposes every cached
Material regardless of outstanding refs and locks the pool against
further `acquire()` calls. The `CommitterHost.dispose()` cascades into
it after running every per-committer `onDispose()`.

## `CommitterHost`

The host is the wiring node — register a committer per primitive type,
then push deltas through `commit()` / `commitBatch()`.

```ts
type SceneDelta =
  | { kind: 'add';    primitiveType: string; id: ElementId; dto: unknown }
  | { kind: 'update'; primitiveType: string; id: ElementId; dto: unknown }
  | { kind: 'remove'; primitiveType: string; id: ElementId };
```

Every `commit()` is wrapped in `pryzm.scene.commit` (sibling to
`pryzm.command.execute` and `pryzm.persistence.append`) with attributes
`pryzm.scene.delta_kind`, `pryzm.scene.primitive_type`,
`pryzm.scene.element_id`. Batch variant uses `pryzm.scene.commit.batch`
with `pryzm.scene.batch_size`.

Failure modes that throw synchronously:

- `commit({primitiveType: X, …})` where no committer is registered for
  `X`. (Programming error — wire the committer at startup.)
- `commit({kind: 'update' | 'remove', id})` for an unknown element.
  (Programming error — store/host got out of sync.)

These are intentionally loud — the failure mode in PRYZM 1 was silent
no-op renders, which the schedule of one wrong frame per minute makes
nearly impossible to debug.

## End-to-end smoke test

`__tests__/cube-committer-e2e.test.ts` wires the full loop:

```
CommandBus.executeCommand('cube.move', …)
  → PatchEmitter listener
  → applyPatches → mutate local cube store (L1 stand-in)
  → CommitterHost.commit(SceneDelta)
  → CubeCommitter.{onAdd | onUpdate | onRemove}
  → SceneRegistry binds the THREE.Mesh
  → MaterialPool shares the MeshStandardMaterial across cubes
```

The same pattern is the template for every primitive committer in M1
(Wall, Door, Slab, Light). Plugins implement one `committer.ts`, the
host registers it, the rest of the stack stays unchanged.

## Lint enforcement — `pryzm/no-three-outside-committer`

| Tree | Mode | Rationale |
|---|---|---|
| `packages/scene-committer/**` | allowlisted | the committer surface |
| `packages/renderer/**` | allowlisted | S05 placeholder |
| `plugins/*/committer.ts` and `plugins/*/committer/**` | allowlisted | per-plugin THREE-touching files |
| `**/__tests__/**` | allowlisted | test fixtures |
| `apps/bench/**` | allowlisted | bench harness fixtures |
| `packages/**`, `apps/**`, `plugins/**` (else) | **error** | every other PRYZM 2 module |
| `src/**` (PRYZM 1) | warn | surfaces existing call sites; flips to error at S05 |

Fixtures: `tools/eslint-plugin-pryzm/__tests__/lint-fixtures/three-outside-committer.{good,bad}.ts`
Runner: `tools/scripts/check-lint-fixtures.mjs` (asserts fixture
expectations on every PR).

## Hand-off to S05

- The render-runtime (`packages/render-runtime/`) registers the
  committers at app startup and pumps store deltas into
  `host.commitBatch(…)` from the FrameScheduler tick.
- The renderer (`packages/renderer/`) walks `host.registry.values()`
  to build the per-frame draw lists.
- The picker (L4) resolves THREE intersect hits to `ElementId` via the
  registry.
- The lint rule's legacy `src/` warn flips to error once the
  PRYZM 1 → PRYZM 2 cutover is complete.

## References

- ADR-005 — interface ratification.
- `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` — §S04 Track B (lines 442-469).
- `packages/scene-committer/src/{types,SceneRegistry,MaterialPool,CommitterHost,otel}.ts`.
- `packages/scene-committer/__tests__/cube-committer-e2e.test.ts` — copy-paste committer template.
- ADR-003 (frame-scheduler) — explains the commit pump that S05 wires onto the host.
