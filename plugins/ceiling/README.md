# `@pryzm/plugin-ceiling`

PRYZM 2 ceiling element — headless half (S14).  Spec:
`docs/archive/pryzm3-internal/reference/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
§S14.

## Layout

```
plugins/ceiling/
├── src/
│   ├── store.ts                 CeilingStore extends Store<CeilingData>
│   ├── errors.ts                CeilingSchemaError, CeilingGeometryError, CeilingNotFoundError
│   ├── intent.ts                validateCeilingBoundary
│   ├── tool.ts                  CeilingPlacementTool — click-loop polygon
│   ├── handlers/                4 handlers (see matrix below)
│   └── committer/               THREE bridge (allowlisted)
└── __tests__/
    └── handlers.test.ts         4 test groups, 8 cases
```

## Handler matrix

| Type                    | Notes                                      |
| ----------------------- | ------------------------------------------ |
| `ceiling.create`        | accepts caller-provided `id`; default 4-pt rect |
| `ceiling.delete`        | rejects unknown id                         |
| `ceiling.setBoundary`   | boundary requires ≥ 3 finite Vec3 points   |
| `ceiling.setHeight`     | rejects `ceilingHeight ≤ thickness`        |

All handlers follow the canonical slab pattern.

## Geometry invariant

`thickness < ceilingHeight` is enforced by both `create` and
`setHeight`; violating updates throw `CeilingGeometryError` and the
store is left unchanged.

## Kernel producer

`packages/geometry-kernel/src/producers/ceiling.ts` —
`produceCeiling(dto, joinData, worldY)`.  A flat slab of `thickness`
mass at altitude `worldY + ceilingHeight - thickness` over an arbitrary
polygonal `boundary`.  Material slots: `face` + `edge`.

## Test surface (S14)

- 8 plugin handler tests
- 18 kernel robustness tests
- 4 parity covering-set fixtures (`tests/parity/ceiling/`)
- Bench skeleton at `apps/bench/src/benches/produce-ceiling.bench.ts`
