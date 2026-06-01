# `@pryzm/plugin-handrail`

PRYZM 2 handrail element — headless half (S14).  Spec:
`docs/archive/pryzm3-internal/reference/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
§S14.

## Layout

```
plugins/handrail/
├── src/
│   ├── store.ts                 HandrailStore extends Store<HandrailData>
│   ├── errors.ts                HandrailSchemaError, HandrailGeometryError, HandrailNotFoundError
│   ├── intent.ts                validateHandrailPath
│   ├── tool.ts                  HandrailPlacementTool — two-click polyline
│   ├── handlers/                6 handlers (see matrix below)
│   └── committer/               THREE bridge (allowlisted)
└── __tests__/
    └── handlers.test.ts         4 test groups, 6 cases
```

## Handler matrix

| Type                   | Notes                                      |
| ---------------------- | ------------------------------------------ |
| `handrail.create`      | accepts caller-provided `id`; default 2-pt path |
| `handrail.delete`      | rejects unknown id                         |
| `handrail.setPath`     | path must be ≥ 2 finite Vec3s, no coincident endpoints |
| `handrail.setShape`    | `round \| square \| flat`                  |
| `handrail.setHost`     | sets `hostId` (stair link); used by cross cascade rule |
| `handrail.recompute`   | cascade-only — accepts `cause` audit string |

All handlers follow the canonical slab pattern (`produceCommand<State>`,
relative-`[id]` patches, returns `{ forward, inverse, nextStates }`).

## Cross-element coupling

`plugins/cross/src/stair-handrail.ts` re-emits `handrail.recompute`
whenever a hosted stair mutates.  See `plugins/stair/README.md`.

## Kernel producer

`packages/geometry-kernel/src/producers/handrail.ts` —
`produceHandrail(dto, joinData, worldY)`.  A single profile
(`{ round, square, flat }`) extruded along the `path` polyline at the
specified `height`.  Material slot: `rail`.

## Test surface (S14)

- 6 plugin handler tests
- 12 kernel robustness tests
- 4 parity covering-set fixtures (`tests/parity/handrail/`)
- Bench skeleton at `apps/bench/src/benches/produce-handrail.bench.ts`
