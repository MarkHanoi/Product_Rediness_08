# `@pryzm/plugin-window`

PRYZM 2 window element — full vertical slice.  Landed in S11.

## Layout

```
plugins/window/
├── src/
│   ├── store.ts          (S11) WindowStore extends Store<WindowData>
│   ├── errors.ts         (S11) typed errors
│   ├── handlers/         (S11) 5 handlers: CreateWindow, DeleteWindow,
│   │                           MoveWindow, SetWindowType, SetWindowSize
│   ├── intent.ts         (S11) WindowIntentResolver — delegates to wall intent
│   ├── tool.ts           (S11) WindowPlacementTool
│   └── index.ts          barrel
└── __tests__/
    ├── handlers.test.ts  (S11) 10 tests
    ├── store.test.ts     (S11)
    ├── intent.test.ts    (S11) window-on-curved-wall positioning
    └── tool.test.ts      (S11)
```

## Cross-store affinity

`CreateWindow` / `DeleteWindow` declare `affectedStores: ['window', 'wall']`
(same pattern as door).  Wall plugin's `openings[]` is read-only from
within wall handlers.

## Recipe — placing a window

```ts
await bus.executeCommand({
  type: 'window.create',
  payload: {
    hostWallId: 'wall_01',
    anchor: { t: 0.3, bottom: 0.9 },
    width: 1.2,
    height: 1.0,
    windowTypeId: 'wt_fixed',
  },
});
```

## Parity

12 fixtures in `tests/parity/window/` (door/window inline-fixture pattern).
Mullion math ported verbatim from `WindowGeometryBuilder.computeMullions()`.

## Performance

`produce-window` p95 < 50 ms.  See `apps/bench/src/benches/produce-window.bench.ts`.
