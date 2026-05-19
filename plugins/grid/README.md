# `@pryzm/plugin-grid`

PRYZM 2 structural grid element — full vertical slice.  Landed in S12.

## Layout

```
plugins/grid/
├── src/
│   ├── store.ts          (S12) GridStore extends Store<GridData>
│   ├── errors.ts         (S12) typed errors
│   ├── handlers/         (S12) 4 handlers: CreateGrid, DeleteGrid,
│   │                           AddGridLine, RemoveGridLine
│   ├── intent.ts         (S12) snap-to-grid integration hook
│   ├── tool.ts           (S12) GridCreationTool
│   └── index.ts          barrel
└── __tests__/
    └── handlers.test.ts  (S12) 4 tests
```

## Snap integration

`plugins/wall/intent.ts` queries `gridStore.getActiveGrid()` for grid
snap candidates.  This is wired via the intent resolver per
`code-level ADR docs/architecture/adr/0013-intent-resolver.md`.

## Producer

`packages/geometry-kernel/src/producers/grid.ts` — pure TS, THREE-free.
Grid axes rendered as thin ribbon meshes (no `LineSegments`).  Linear
and arc grid lines both supported.

## Parity

8 fixtures in `tests/parity/grid/`.

## Performance

`produce-grid` p95 < 50 ms.  See `apps/bench/src/benches/produce-grid.bench.ts`.
