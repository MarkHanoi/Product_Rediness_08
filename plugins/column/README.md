# `@pryzm/plugin-column`

PRYZM 2 structural column element — full vertical slice.  Landed in S12.

## Layout

```
plugins/column/
├── src/
│   ├── store.ts          (S12) ColumnStore extends Store<ColumnData>
│   ├── errors.ts         (S12) typed errors
│   ├── handlers/         (S12) 5 handlers: CreateColumn, DeleteColumn,
│   │                           MoveColumn, SetColumnType, SetColumnHeight
│   ├── intent.ts         (S12) ColumnIntentResolver (snap to grid)
│   ├── tool.ts           (S12) ColumnPlacementTool
│   └── index.ts          barrel
└── __tests__/
    └── handlers.test.ts  (S12) 5 tests
```

## Shared producer infrastructure

Column shares `packages/geometry-kernel/src/producers/_shared/linear-structural.ts`
with beam.  Column and beam differ only in axis orientation (vertical vs
horizontal) and section profile options.

```ts
export const produceColumn: (col: ColumnData, joinData: JoinData, worldY: number) => BufferGeometryDescriptor;
```

Supported shapes: `rectangular`, `circular`, `i-section`.

## Parity

6 fixtures in `tests/parity/column/`.

## Performance

`produce-column` p95 < 50 ms.  See `apps/bench/src/benches/produce-column.bench.ts`.
