# `@pryzm/plugin-beam`

PRYZM 2 structural beam element — full vertical slice.  Landed in S12.

## Layout

```
plugins/beam/
├── src/
│   ├── store.ts          (S12) BeamStore extends Store<BeamData>
│   ├── errors.ts         (S12) typed errors
│   ├── handlers/         (S12) 5 handlers: CreateBeam, DeleteBeam,
│   │                           MoveBeam, SetBeamType, SetBeamSection
│   ├── intent.ts         (S12) BeamIntentResolver (snap to columns/grid)
│   ├── tool.ts           (S12) BeamPlacementTool
│   └── index.ts          barrel
└── __tests__/
    └── handlers.test.ts  (S12) 5 tests
```

## Shared producer infrastructure

Beam shares `packages/geometry-kernel/src/producers/_shared/linear-structural.ts`
with column.  Beam extrudes a profile along an *arbitrary horizontal
baseline*; column extrudes along the vertical axis.

```ts
export const produceBeam: (beam: BeamData, joinData: JoinData, worldY: number) => BufferGeometryDescriptor;
```

Supported shapes: `rectangular`, `i-section`, `t-section`.

## Cross-element dedup

`MaterialPool.deduplicateAcrossElementTypes()` ensures that a beam and a
column using the same steel specification share one `THREE.Material`
instance in the scene (validated in `tests/integration/all-12-elements.test.ts`).

## Parity

6 fixtures in `tests/parity/beam/`.

## Performance

`produce-beam` p95 < 50 ms.  See `apps/bench/src/benches/produce-beam.bench.ts`.
