# @pryzm/plugin-rooms

S25 deliverable — rooms / spaces.  Mirrors the slab plugin's headless
+ committer split.

## Headless half (`src/`)

* `store.ts` — `RoomStore extends Store<RoomData>` (DTO state).
* `errors.ts` — typed error tree rooted at `RoomSystemError`.
* `intent.ts` — pure helpers (`pickSeedFromClick`, `validateSeed`,
  `recomputeRoomAnalytic`).  No THREE imports.
* `handlers/` — 8 handlers (see `SPEC-06 §4.1`):
  * `room.create`
  * `room.delete`
  * `room.move`            — translate seedPoint by Δ
  * `room.setName`
  * `room.setNumber`
  * `room.setOccupancy`
  * `room.setMaterial`
  * `room.setHeightOffset`
* `tool.ts` — single-click `RoomSeedTool` (one click = one
  `room.create` with the click point as the seed).

## Committer (`src/committer/`)

* `room-committer.ts` — `PrimitiveCommitter<RoomData, THREE.Mesh>`.
  Calls `produceRoom(dto, ctx, worldY)`.  The `ctx.walls` list is
  fed by a `wallsProvider` callback the host wires to the wall
  store at bootstrap time (the committer never holds a reference
  to the wall store directly, preserving the L1 store boundary).
* `geometry-bridge.ts` — descriptor → `THREE.BufferGeometry`.
* `material-bridge.ts` — `MaterialKey` → `THREE.MeshStandardMaterial`.
  Floor-fill uses double-sided unlit-leaning settings so the room
  reads cleanly from above (the camera is overhead in plan view).

## What's NOT in this plugin

* **Wall → room cascade** lives in `plugins/cross/wall-room.ts`
  (S26).  When a wall on a level mutates, the cross-rule re-queues
  every room on that level for boundary recomputation.  We do NOT
  put that in the room handlers because cross-element rules are an
  M9 architectural pattern (K1B-2: each plugin owns its store).
* **Multi-level rooms** — `multiLevelSpan` is `null` in Phase 2A
  v1.  Phase 3A (S49) opens the discriminated union per
  SPEC-06 §4.4.
* **Concave rooms with holes / islands** — Phase 2A v1 produces
  the outer face only.  S49 introduces hole tracking; the producer
  raises `DescriptorInvariantError('island-obstacle-not-supported')`
  per SPEC-01 §3.

## Tests

```sh
npm test --workspace=@pryzm/plugin-rooms
```
