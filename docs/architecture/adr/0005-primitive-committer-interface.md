# ADR-005 — PrimitiveCommitter interface

| Field | Value |
|---|---|
| Status | **Accepted** (S04 D7 ratified) |
| Decision owner | F (sign-off) |
| Drafters | Agent A (Track B) |
| Affects layers | L5 (scene-committer, render-runtime, renderer), L7 (plugins) |
| Supersedes | — |
| Related | `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S04 Track B` (lines 442-469); ADR-001 (typed-id brand); ADR-002 (PatchEmitter envelope); ADR-003 (frame-scheduler) |

---

## 1. Context

PRYZM 1 mixed THREE.js into every layer — toolbar buttons mutated
`scene.add(mesh)` directly, store reducers held `Object3D` references,
the geometry kernel imported `MeshStandardMaterial`. The cascading
result was the bug class M1 is built to eliminate
(`08-VISION.md §1`): "any change to the visual primitive forces edits
to the picking layer, the export pipeline, and three different
toolbars."

PRYZM 2 keeps THREE on **one** side of a wall. The wall is an interface
that takes pure DTOs from the L1 store layer and emits / mutates / disposes
THREE objects in the scene. The interface is the single shape
plugins implement to add a new primitive (wall, door, slab, light, …).

The S04 spec (`§S04 Track B`, lines 442-449) ratifies this interface
as ADR-005:

> T6 — `PrimitiveCommitter<TDto, TElement>` interface (ADR-005).
> T7 — SceneRegistry — Map<ElementId, Object3D>.
> T8 — MaterialPool — hash → ref-counted Material handle (Disposable).
> T9 — CubeStore + CubeCommitter end-to-end test.
> T10 — lint rule scaffold `pryzm/no-three-outside-committer`.

## 2. Decision

The committer surface lives in `@pryzm/scene-committer` (L5) and exposes
exactly four moving parts:

```ts
export interface PrimitiveCommitter<
  TDto = unknown,
  TElement extends THREE.Object3D = THREE.Object3D,
> {
  readonly primitiveType: string;

  onAdd(id: ElementId, dto: TDto): TElement;
  onUpdate(id: ElementId, dto: TDto, obj: TElement): void;
  onRemove(id: ElementId, obj: TElement): void;
  onDispose(): void;
}

export class SceneRegistry {           // Map<ElementId, Object3D>
  add(id: ElementId, obj: THREE.Object3D): void;
  get(id: ElementId): THREE.Object3D | undefined;
  remove(id: ElementId): THREE.Object3D | undefined;
  // …entries(), values(), ids(), size(), clear()
}

export class MaterialPool {            // hash → ref-counted Material
  acquire<M extends THREE.Material>(hash: string, factory: () => M): MaterialHandle<M>;
  size(): number;
  refCount(hash: string): number;
  dispose(): void;
}

export class CommitterHost {           // fan-out + OTel + lifecycle
  readonly registry: SceneRegistry;
  readonly materialPool: MaterialPool;
  register(committer: PrimitiveCommitter): void;
  commit(delta: SceneDelta): Promise<THREE.Object3D | undefined>;
  commitBatch(deltas: readonly SceneDelta[]): Promise<void>;
  dispose(): void;
}
```

### Lifecycle invariants

- **Identity stability.** `onUpdate` MUST mutate the supplied `obj` in
  place — it MUST NOT replace it. The `SceneRegistry` binding stays
  stable for the lifetime of the element so picking / selection /
  outline highlights don't have to rebind on every store mutation.
- **THREE flow control.** `SceneRegistry` is the only place an `Object3D`
  is keyed by `ElementId`. The renderer (S05 — `packages/renderer`) and
  the picking layer (L4 — `packages/picking`) read from the registry;
  they never hold their own ID maps.
- **Material lifecycle.** Materials are owned by the `MaterialPool`,
  not by the committer or the Object3D. Committers acquire a
  `MaterialHandle` per-element on `onAdd` and `release()` it on
  `onRemove`. The pool disposes the GPU resource when the last handle
  releases. The handle is a TC39 `Disposable`, so callers may use
  `using` to scope acquisition.
- **Geometry lifecycle.** Geometries are committer-private. A committer
  that allocates one geometry per primitive type (typical) disposes it
  in `onDispose()`; a committer that allocates one per element disposes
  in `onRemove`. The pool / registry never touch geometry.
- **No-throw on stable paths.** `commit({kind:'add',…})` of an unknown
  primitive type AND `commit({kind:'update'|'remove',…})` of an unknown
  element id BOTH throw — these are programming errors and must never
  happen on a healthy store→committer pipeline. Tests exercise both
  failure modes (`__tests__/cube-committer-e2e.test.ts`).

### Boundary enforcement

The lint rule `pryzm/no-three-outside-committer` (S04-T10 scaffold)
hard-fails any direct `import 'three'` outside the allowlist:

- `packages/scene-committer/**`
- `packages/renderer/**` (S05 placeholder)
- `plugins/*/committer.ts` (per-plugin committer file)
- `plugins/*/committer/**` (per-plugin committer module folder)
- `**/__tests__/**` (test fixtures)
- `apps/bench/**` (bench harness fixtures)

Legacy PRYZM 1 (`src/`) is warn-mode at S04; the hard-fail flips at
S05 once every legacy `Object3D` consumer has migrated to the registry.

The boundaries lint already keeps L0–L4 from importing the committer;
this rule is the inverse — it keeps THREE from leaking into anyone else.

## 3. Consequences

### Good

- One file per primitive owns every THREE call. A "make doors render
  shadowed glass" task is a single-file PR in `plugins/door/committer.ts`.
- `MaterialPool` ref-counting reproduces THREE's own internal sharing
  model with deterministic dispose — stamping out the PRYZM 1 leak
  pattern of orphaned materials accumulating until project close.
- `SceneRegistry` is the picking + export root: the GLB exporter walks
  `registry.entries()`, the picker resolves `mesh.uuid` → `ElementId`
  via the same map.
- The cube end-to-end test (`__tests__/cube-committer-e2e.test.ts`) is
  20 lines of wiring and proves the seam is real — copy-paste template
  for every future primitive.
- OTel `pryzm.scene.commit` span on every delta gives us per-element
  visual-pipeline latency measurements without further instrumentation.

### Bad

- Two layers of indirection between "store change" and "GPU draw call"
  (delta → committer → registry → renderer). Cost paid in the commit
  pump latency — measured at S05 against the < 16 ms frame budget.
- `MaterialPool` requires the caller to choose a hash. A committer that
  picks a poor hash (e.g. only color, ignoring transparency) breaks
  visual correctness silently. Mitigated by per-primitive review —
  every committer ships with a "what goes in the hash" comment.
- `onUpdate(_, _, obj)` is a contract that can't be type-checked:
  nothing stops a committer from mutating `obj` *and* throwing it away.
  Lint rule under consideration for S05.

## 4. Alternatives considered

- **Per-store renderers.** Each L1 store ships its own THREE adapter.
  Rejected: forces every store to pull in THREE (boundary violation),
  duplicates the registry / material pool logic per store, and makes
  cross-store rendering (e.g. wall + door interaction) a coordination
  problem with no owner.
- **Reactive `Object3D` proxies.** Wrap each Object3D in a Proxy that
  forwards property writes to the store. Rejected on perf: the proxy
  trap fires on every `mesh.position.set()` call inside the renderer,
  and the cost is invisible in dev (HMR reload makes it look fast) but
  shows up immediately under sustained load.
- **One giant `RendererSystem` (PRYZM 1 shape).** Single class that
  knows about every primitive. Rejected: this is exactly the bug
  class M1 was created to eliminate.

## 5. References

- `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` — §S04 Track B (lines 442-469).
- `packages/scene-committer/src/types.ts` — interface source of truth.
- `packages/scene-committer/src/{SceneRegistry,MaterialPool,CommitterHost}.ts`.
- `packages/scene-committer/__tests__/cube-committer-e2e.test.ts` — copy-paste template.
- `tools/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` — boundary enforcer.
- ADR-001 (ElementId brand strategy), ADR-002 (PatchEmitter envelope), ADR-003 (frame-scheduler).
