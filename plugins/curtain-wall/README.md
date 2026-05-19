# `@pryzm/plugin-curtain-wall`

PRYZM 2 curtain-wall plugin — headless half (store + handlers + intent
resolver + committer).  Owns the runtime command surface for the
`CurtainWall` element family per
[`docs/03_PRYZM3/reference/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md`](../../docs/03_PRYZM3/reference/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md)
§S12–S13.

## Surface

| Export                                  | What it is                                          |
| --------------------------------------- | --------------------------------------------------- |
| `CurtainWallStore`                      | `Store<Map<CurtainWallId, CurtainWallData>>`        |
| `buildCurtainWallHandlerSet()`          | Array of all 13 handler instances                   |
| `registerCurtainWallHandlers(bus)`      | Registers all 13 handlers with a `CommandBus`       |
| `CurtainWallIntentResolver`             | Pure DTO + grid math for click → cell / segment     |
| `CurtainWallCommitter`                  | `PrimitiveCommitter<CurtainWallData, THREE.Mesh>`   |
| Typed errors (`./errors`)               | `CurtainWallNotFoundError`, `InvalidGridCoordinateError`, … |

## Handler matrix (S12 ▸ S13)

| # | Type                          | Origin | Notes                                     |
| - | ----------------------------- | ------ | ----------------------------------------- |
| 1  | `curtainwall.create`         | S12   | Caller-supplied id supported              |
| 2  | `curtainwall.delete`         | S12   |                                            |
| 3  | `curtainwall.move`           | S12   | XYZ delta, both endpoints                  |
| 4  | `curtainwall.setGrid`        | S12   | Bay width / bay height                     |
| 5  | `curtainwall.setMullionType` | S12   |                                            |
| 6  | `curtainwall.setTransomType` | S12   | Stub — maps onto `mullionThickness`        |
| 7  | `curtainwall.setPanelType`   | S12   | Up-serts panel by `(row, col)`             |
| 8  | `curtainwall.setOutline`     | S12   | Replaces baseline                          |
| 9  | `curtainwall.resize`         | S12   | Height / length                            |
| 10 | `curtainwall.addPanel`       | S13   | Per-cell add; refuses overlap              |
| 11 | `curtainwall.removePanel`    | S13   | Remove by panel id                         |
| 12 | `curtainwall.swapPanel`      | S13   | In-place kind / material swap              |
| 13 | `curtainwall.rotatePanel`    | S13   | Absolute or delta rotation (0/90/180/270) |

## Intent resolver

Click intent for the curtain-wall tool layer.  Inputs are *grid-local*
points (i.e. already projected onto the wall surface and expressed in
`(along-baseline, height)` metres):

```ts
const r = new CurtainWallIntentResolver(stores.curtainwall);
r.resolvePanelCell(cwId, { x: 2.0, y: 0.75 });
//   → { row: 0, col: 1 }

r.resolveSegmentIntent(cwId, { x: 1.5, y: 0.75 });
//   → { kind: 'mullion', orientation: 'vertical', index: 1 }

r.validateGridCoordinate(cwId, 0, 5);
//   → { ok: false, reason: 'out-of-range' }
```

Default mullion-edge tolerance is 0.04 m (~ 8 px @ 200 px/m).  Override
via `new CurtainWallIntentResolver(walls, { mullionEdgeToleranceM })`.

## Committer perf gate

The S13 perf fix routes every panel/mullion material through
`MaterialPool` with a content-addressed key
(`curtainwall|panel|<kind>|<materialId>|<color>`), so 50 curtain walls
of the same panel-kind mix share one material instance per
`(kind, color)` pair across the whole scene.

The committer exposes stats for the orbit-fps bench gate:

```ts
const c = new CurtainWallCommitter({ materialPool, worldY: () => 0 });
// after some commits…
c.stats; // { rebuilds, materialSwaps, hashSkips, poolHits, poolMisses }
```

`poolHits >> poolMisses` is the invariant that proves the dedup is
firing.  See `apps/bench/src/benches/orbit-fps-cw.bench.ts` (S13-T9).

## Built-in type catalogue

`@pryzm/types-builtin/curtain-wall` ships v1 starter sets
(see SPEC-05 §7.3):

* `BUILTIN_CURTAIN_WALL_TYPES` — 4 system presets (unitised / stick /
  storefront / spider)
* `BUILTIN_CW_PANEL_TYPES` — 5 panel kinds
* `BUILTIN_CW_MULLION_TYPES` — 4 mullion profiles

Bind by setting `CurtainWall.materialId` (system/mullion) or
`CurtainPanel.materialId` (per-cell).

## Tests

```sh
pnpm --filter @pryzm/plugin-curtain-wall test
```

* `__tests__/handlers.test.ts` — S12 baseline (13 cases).
* `__tests__/handlers/{Add,Remove,Swap,Rotate}Panel.test.ts` — S13.
* `__tests__/intent.test.ts` — intent resolver (13 cases).
* `__tests__/curtain-wall.committer.test.ts` — committer round-trip.

Kernel-side parity / robustness:

* `tests/parity/curtain-wall/cw-snapshot.test.ts` — snapshot gate.
* `packages/geometry-kernel/__tests__/curtain-wall.robustness.spec.ts`
  — fixture invariants + pseudo-random property sweep.

Benches:

* `apps/bench/src/benches/produce-curtain-wall.bench.ts`
* `apps/bench/src/benches/orbit-fps-cw.bench.ts`
