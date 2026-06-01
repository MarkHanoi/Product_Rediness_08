# `@pryzm/plugin-stair`

PRYZM 2 stair element — headless half (S14).  Source-of-truth spec:
`docs/archive/pryzm3-internal/reference/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
§S14.

## Layout

```
plugins/stair/
├── src/
│   ├── store.ts                 StairStore extends Store<StairData>
│   ├── errors.ts                StairSchemaError, StairGeometryError, StairNotFoundError
│   ├── intent.ts                validateStairDims + isFiniteVec3
│   ├── tool.ts                  StairPlacementTool — single-click placement
│   ├── handlers/                9 handlers (see matrix below)
│   │   ├── CreateStair.ts
│   │   ├── DeleteStair.ts
│   │   ├── MoveStair.ts
│   │   ├── RotateStair.ts
│   │   ├── SetStairShape.ts
│   │   ├── SetTreadCount.ts
│   │   ├── SetRiserHeight.ts
│   │   ├── SetWidth.ts
│   │   ├── SetStairType.ts
│   │   └── index.ts             buildStairHandlerSet + STAIR_HANDLER_TYPES
│   └── committer/               THREE-touching surface (allowlisted)
│       ├── stair-committer.ts
│       ├── geometry-bridge.ts
│       ├── material-bridge.ts
│       └── index.ts
└── __tests__/
    ├── handlers.test.ts          11 tests — registration + per-handler smoke
    └── intent.test.ts            3 tests — validateStairDims branches
```

## Handler matrix

| Type                  | Inverse via | Notes                                  |
| --------------------- | ----------- | -------------------------------------- |
| `stair.create`        | delete      | accepts caller-provided `id`           |
| `stair.delete`        | restore     | rejects unknown id                     |
| `stair.move`          | reverse Δ   | translates `origin` only               |
| `stair.rotate`        | -θ          | rotation about Y, radians              |
| `stair.setShape`      | restore     | `straight \| l-shape \| u-shape \| spiral` |
| `stair.setTreadCount` | restore     | rejects `< 2`                          |
| `stair.setRiserHeight`| restore     | rejects ≤ 0 / non-finite               |
| `stair.setWidth`      | restore     | rejects ≤ 0 / non-finite               |
| `stair.setType`       | restore     | swaps `materialId` only                |

All handlers follow the canonical S07 slab pattern: `produceCommand<State>`
yields `[next, forward, inverse]`; the `HandlerResult` is
`{ forward, inverse, nextStates: { stair: next } }`.  No `events`
array — committers subscribe to the `PatchEmitter`.

## Cross-element coupling

Mutating commands in `{ move, setShape, setTreadCount, setRiserHeight,
setWidth, rotate }` trigger the
`plugins/cross/src/stair-handrail.ts` cascade rule, which re-emits
`handrail.recompute` for every handrail whose `hostId === stairId`.
`stair.setType` and `stair.delete` deliberately do NOT cascade
(material swap and removal are handled by the renderer / cleanup
pass respectively).  See ADR-0012.

## Kernel producer

`packages/geometry-kernel/src/producers/stair.ts` —
`produceStair(dto, joinData, worldY)`.  Multi-flight assembly:
each tread is a thin horizontal box, each riser a thin vertical box.
Material slots: `tread` + `riser`.  Two-flight shapes (`l-shape`,
`u-shape`) split `numRisers` in half with a landing tread.  `spiral`
falls back to `straight` for v1 (carried into S15+).

## Test surface (S14)

- 11 plugin handler tests + 3 intent tests
- 54 kernel robustness tests
- 6 parity covering-set fixtures (`tests/parity/stair/`)
- Bench skeleton at `apps/bench/src/benches/produce-stair.bench.ts`
