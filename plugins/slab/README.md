# `@pryzm/plugin-slab`

PRYZM 2 slab / floor element — full vertical slice.  Landed in S12.

## Layout

```
plugins/slab/
├── src/
│   ├── store.ts          (S12) SlabStore extends Store<SlabData>
│   ├── errors.ts         (S12) typed errors
│   ├── handlers/         (S12) 8 handlers: CreateSlab, DeleteSlab, MoveSlab,
│   │                           SetSlabType, AddSlabOpening, RemoveSlabOpening,
│   │                           SetSlabSlope, SetSlabThickness
│   ├── intent.ts         (S12) SlabIntentResolver
│   ├── tool.ts           (S12) SlabPlacementTool
│   └── index.ts          barrel
└── __tests__/
    └── handlers.test.ts  (S12) 8 tests
```

## Cross-store affinity

`CreateSlab` declares `affectedStores: ['slab', 'level']`.  Cross-element
coupling with wall is handled through the cascade rule defined in
`plugins/cross/slab-wall.ts` per
`code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`.

## Producer

`packages/geometry-kernel/src/producers/slab.ts` — pure TS, THREE-free.
Earcut triangulation; 3 material slots (top, bottom, side).  Supports
holes (shaft openings).

```ts
export const produceSlab: (slab: SlabData, joinData: JoinData, worldY: number) => BufferGeometryDescriptor;
```

## Parity

18 fixtures in `tests/parity/slab/`.

## Performance

`produce-slab` p95 < 50 ms.  See `apps/bench/src/benches/produce-slab.bench.ts`.
