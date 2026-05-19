# `@pryzm/plugin-door`

PRYZM 2 door element — full vertical slice.  Headless half (store +
handlers + producer) landed in S11; scenic half (committer + tool) in
S11.

## Layout

```
plugins/door/
├── src/
│   ├── store.ts          (S11) DoorStore extends Store<DoorData>
│   ├── errors.ts         (S11) typed errors (HostWallNotFoundError, …)
│   ├── handlers/         (S11) 6 handlers: CreateDoor, DeleteDoor,
│   │                           MoveDoor, SetDoorType, SetDoorSwing, SetDoorWidth
│   ├── intent.ts         (S11) DoorIntentResolver — delegates to wall intent
│   ├── tool.ts           (S11) DoorPlacementTool
│   └── index.ts          barrel — exports PluginManifest
└── __tests__/
    ├── handlers.test.ts  (S11) 12 tests — happy-path + error per handler
    ├── store.test.ts     (S11)
    ├── intent.test.ts    (S11) door-on-curved-wall positioning
    └── tool.test.ts      (S11)
```

## Cross-store affinity

`CreateDoor` and `DeleteDoor` declare `affectedStores: ['door', 'wall']`
per `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md`.
Door handlers write into `wall.openings[]` via the declared cross-store
affinity; wall handlers never mutate door state.

## Recipe — placing a door

```ts
import { CommandBus } from '@pryzm/command-bus';
const result = await bus.executeCommand({
  type: 'door.create',
  payload: {
    hostWallId: 'wall_01',
    anchor: { t: 0.5, bottom: 0 },
    width: 0.9,
    height: 2.1,
    doorTypeId: 'dt_interior_flush',
    swing: 'left-in',
  },
});
```

## Parity

15 fixtures in `tests/parity/door/`.  Cross-runtime byte-equality
(Node + browser Worker) enforced by `tests/parity/wall/wall-headless-node.test.ts`
pattern (door producer follows the same ADR-009 pure-function guarantee).

## Performance

`produce-door` p95 < 50 ms.  See `apps/bench/src/benches/produce-door.bench.ts`.
