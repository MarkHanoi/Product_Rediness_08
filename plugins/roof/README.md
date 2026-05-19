# `@pryzm/plugin-roof`

PRYZM 2 roof element — full vertical slice.  Producer ported in S10;
committer + tool + parity in S11.

## Layout

```
plugins/roof/
├── src/
│   ├── store.ts          (S11) RoofStore extends Store<RoofData>
│   ├── errors.ts         (S11) typed errors
│   ├── handlers/         (S11) 10 handlers: CreateRoof, DeleteRoof,
│   │                           SetRoofSlope, SetRoofKind {hip|gable|mansard},
│   │                           AddSkylight, RemoveSkylight, MoveRoof,
│   │                           SetRoofThickness, JoinRoofs, ChangeRoofLevel
│   ├── intent.ts         (S11) RoofIntentResolver
│   ├── tool.ts           (S11) RoofPlacementTool
│   └── index.ts          barrel
└── __tests__/
    ├── handlers.test.ts  (S11) 10 tests — happy-paths
    ├── store.test.ts     (S11)
    ├── intent.test.ts    (S11)
    └── tool.test.ts      (S11)
```

## Producer

`packages/geometry-kernel/src/producers/roof.ts` — pure TS, THREE-free.
Supports `flat`, `gable`, `hip`, `mansard`, `mono` roof kinds.  Ported
from `src/elements/roofs/RoofGeometryBuilder.generate()` (PRYZM 1).

## Parity

20 fixtures in `tests/parity/roof/` across 5 roof kinds × 4 boundary
variants.  Self-snapshot (write on first run, gate on subsequent runs).

## Performance

`produce-roof` p95 < 50 ms.  See `apps/bench/src/benches/produce-roof.bench.ts`.
