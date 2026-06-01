# `@pryzm/plugin-wall`

PRYZM 2 wall element — full vertical slice.  Headless half landed in
S07; producer in S08; committer + tool + selection-highlight in S09.

## Layout

```
plugins/wall/
├── src/
│   ├── store.ts                 (S07) WallStore extends Store<WallData>
│   ├── system-type-store.ts     (S07) WallSystemTypeStore catalogue
│   ├── errors.ts                (S07) typed errors
│   ├── handlers/                (S07) 5 handlers: Create/Delete/Move/SetDimensions/SetColor
│   ├── tool.ts                  (S09) WallCreationTool — vanilla TS, Straight mode
│   └── committer/               (S09) THREE-touching surface (allowlisted)
│       ├── wall-committer.ts            PrimitiveCommitter<WallData, THREE.Group>
│       ├── selection-highlight.ts       PrimitiveCommitter<SelectionDto, THREE.Object3D>
│       ├── geometry-bridge.ts           BufferGeometryDescriptor → THREE.BufferGeometry
│       ├── material-bridge.ts           MaterialKey → MeshStandardMaterial factory
│       └── index.ts                     barrel
└── __tests__/
    ├── handlers.test.ts          (S07)
    ├── store.test.ts             (S07)
    ├── system-type-store.test.ts (S07)
    ├── baseline-fixtures.test.ts (S07)
    ├── committer.test.ts         (S09 — 6 cases)
    ├── selection-highlight.test.ts (S09 — 2 cases)
    └── tool.test.ts              (S09 — 5 cases)
```

## Recipe — wiring a wall plugin into a runtime

`apps/editor/src/bootstrap.render.data.ts` is the canonical reference
implementation.  The shape that other plugins (door, slab, etc.) will
mirror in 1C is:

```ts
import { CommitterHost, bindStore } from '@pryzm/scene-committer';
import { WallStore } from '@pryzm/plugin-wall/store';
import { WallSystemTypeStore } from '@pryzm/plugin-wall/system-type-store';
import { buildWallHandlerSet } from '@pryzm/plugin-wall/handlers';
import { WallCommitter, WallSelectionHighlightCommitter }
  from '@pryzm/plugin-wall/committer';

// 1. Stores.
const wallStore = new WallStore();
const wallSystemTypes = new WallSystemTypeStore();

// 2. Handlers — registered on the CommandBus.
for (const h of buildWallHandlerSet({ systemTypeStore: wallSystemTypes })) {
  bus.register(h);
}

// 3. Committers — registered on the CommitterHost BEFORE bindStore.
const host = new CommitterHost();
const wallCommitter = new WallCommitter(host.materialPool);
const selCommitter = new WallSelectionHighlightCommitter(wallCommitter);
host.register(wallCommitter);
host.register(selCommitter);

// 4. Bind the store to the host so dirty-diffs flow through the
//    dispatcher into add/update/remove deltas.
bindStore(wallStore, 'wall', host);
bindStore(selectionStore, 'selection', host);
```

## Tool — `WallCreationTool` (Straight mode)

Vanilla TS.  No DOM, no THREE.  Strict-injection: throws on missing
`commandBus` or `screenToWorld`.

```ts
import { WallCreationTool } from '@pryzm/plugin-wall/tool';

const tool = new WallCreationTool({
  commandBus: bus,
  screenToWorld: (ev) => raycaster.pickGround(ev),
  levelId: activeLevel.id,
  systemType: wallSystemTypes.get('wall.std.200'),
});

// IDLE → first click → AWAITING_END → second click → dispatch + IDLE.
canvas.addEventListener('pointerdown', (e) => tool.onPointerDown(e));
canvas.addEventListener('pointermove', (e) => tool.onPointerMove(e));
window.addEventListener('keydown', (e) => tool.onKeyDown(e));
```

## Performance contract

| Path                                  | Budget  | Bench                              |
| ------------------------------------- | ------- | ---------------------------------- |
| Cold load (1-wall fixture, no canvas) | < 800ms | `apps/bench/.../load-small.bench`  |
| First commit (warm)                   | < 5 ms  | (same)                             |
| Per-wall produce + commit (steady)    | inherits S08's < 50 ms p95         |
| Steady-state allocations (100 walls)  | 0 (pool dedupes)                   |

## Architectural invariants

* **THREE imports** — only the files under `src/committer/` may import
  THREE.  The `pryzm/no-three-outside-committer` lint rule enforces
  this; trying to add `import * as THREE from 'three'` to `tool.ts`
  or any handler will fail CI.
* **Geometry-vs-material-vs-visibility split** — the committer compares
  the previous DTO snapshot against the new one and only rebuilds the
  geometry when one of `baseLine, curve, height, thickness, baseOffset,
  layers, openings, systemTypeId` changed.  Material-only patches
  (`materialColor`, `materialId`) skip the GPU-buffer rebuild.
* **Hash-skip** — when the descriptor's `hash` is unchanged across an
  update (no-op patches, pure renames), we drop the buffer upload
  entirely.  Tests assert this via `committer.stats().geometrySkippedByHash`.
* **Material dedupe** — 100 walls with the same `(systemTypeId,
  materialId, materialColor, layerName)` collapse to ONE
  `THREE.MeshStandardMaterial` in the `MaterialPool`.

## Kill-switch K1B-4

PRYZM 2's wall plugin is built side-by-side with PRYZM 1's
`src/elements/walls/**` and `src/commands/walls/**`.  Per
`docs/archive/pryzm3-internal/reference/phases/PHASE-1/1B-Q2-M4-M6-WALL-END-TO-END.md`
§K1B-4, those legacy directories are READ-ONLY for the duration of
1B — every behaviour change lands here.
