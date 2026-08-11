# EV-03 — Change impact: end-to-end propagation traces

> **Stamp**: 2026-08-11 · **READ-ONLY evidence appendix** · **Branch**: `main` · **HEAD**: `3e04922d`
> **This file is the agent's only repo write.** No code was edited, no commit made, no `git stash` run.
>
> **Extends, does not duplicate**: [`BIM30-EVOLUTION-AUDIT.md` §5](../BIM30-EVOLUTION-AUDIT.md)
> (change-impact matrix) and its [§17.2 addendum](../BIM30-EVOLUTION-AUDIT.md) (the DOWNGRADE that
> declared the generic cascade dead and propagation bespoke) · [`BIM30-READINESS-REPORT.md` §5](../BIM30-READINESS-REPORT.md)
> (dependency map). Where this appendix disagrees with either, it says so at the line.
>
> **Evidence grades**: **EXECUTED** — a probe/grep/command was run in this session and its output is
> quoted · **BY-READ** — proven by reading source at HEAD (strong for "this code exists and says
> X"; never proof of runtime behaviour) · **UNPROVEN** — no evidence either way.
>
> **Doctrine applied**: *ship the probe before the fix* — four of the findings below are backed by an
> executed probe, not by inference, and the two "REAL BUG" claims were **not** taken on trust from
> the prior deep-dive; they were re-proven by running the code. *Do not re-architect* — every
> proposed fix point below is an argument, a call site, or a guard **inside an existing command or
> store method**. No new engine is proposed anywhere in this document.

---

## 0. Executive summary — what the traces changed

| # | Operation | Prior grade (§5 / §17.2) | This appendix | Movement |
|---|---|---|---|---|
| 1 | Move wall → hosted openings translate? | BY-READ "openings ride the wall record, never executed-proven" | **EXECUTED-PROVEN** — they translate, by parametric offset + a `touch()` re-anchor. Mechanism named at line level. | **UPGRADE** |
| 2 | Shorten wall / lower wall → opening re-clamp? | UNKNOWN → §17.2 "verified absence" | **EXECUTED-PROVEN BUG.** Probe leaves a 0.9 m door at offset 2.0 on a **1.5 m** wall, and a 2.1 m door in a **1.0 m** wall. The correct gate (`clampToWall`) already exists and is simply never called from the wall side. | **CONFIRMED + fix point named** |
| 3 | Move door along wall (ADR-057 perf) | "known perf defect, memory-cited" | **PARTLY REFUTED, then RE-CONFIRMED by a different mechanism.** ADR-057 P1 shipped a real openings-only fast path — but it is **unreachable from the door/window move path**, because `WallStore.updateDoor` emits without `prevState`. EXECUTED both halves. | **NEW ROOT CAUSE** |
| 4 | Delete wall | "cascade-delete exists, orphan-repair branch exists" | Confirmed for door/window stores; **SemanticGraph edges leak** (wall branch never calls the removal helper the other 9 kinds call). | **SHARPENED** |
| 5 | Change room bounding wall | "full redetect" | Confirmed full-level redetect, **plus**: room identity survives only by centroid proximity, and generated levels are suppressed **permanently**. | **WORSE THAN STATED** |
| 6 | Roof footprint change → walls beneath | UNKNOWN | **MEASURED-ABSENT**, both directions. | **RESOLVED (absent)** |
| 7 | `prevState` emitter/subscriber census | asserted, not enumerated | 10 emitters / 23 production subscribers; **5 of 23 actually read `prevState`**. | **NEW** |
| 8 | Suppression census | "300 ms coalesce, suppression-gated by executors" | 7 observer guards, 8 coalescing windows, 7 suppress callers — **one has no `finally` and no backstop**. | **NEW** |

**The single sentence**: propagation in PRYZM is not missing, it is *bespoke and unevenly plumbed* —
and in the two worst cases (§2, §3) **the correct machinery is already written and is simply not
being handed the argument it needs**. That is a formalization job, not an architecture job.

---

## 1. Move wall (`wall.updateBaseline`) — do hosted openings translate?

### 1.1 The hop chain

| Hop | Location | What happens |
|---|---|---|
| H1 | `packages/core-app-model/src/views/PlanElementDragController.ts:631` | Plan-view drag commit → `bus.executeCommand('wall.updateBaseline', { wallId, newBaseLine, prevBaseLine })`. The 3-D gizmo path lands on the same verb. |
| H2 | `plugins/wall/src/handlers/UpdateWallBaseline.ts:72` | Bus type `wall.updateBaseline` → legacy `UpdateWallBaselineCommand`. |
| H3 | `packages/command-registry/src/walls/UpdateWallBaselineCommand.ts:73-88` | `canExecute` — the **only** validation is `WALL_NOT_FOUND` and `len < 0.1 → WALL_TOO_SHORT`. **No opening check whatsoever.** |
| H4 | `UpdateWallBaselineCommand.ts:130-152` (§FT4) | Endpoint-order normalisation: if the incoming baseline's XZ dot product against the stored one is negative, endpoints are swapped **specifically to protect opening offsets**. |
| H5 | `packages/geometry-wall/src/WallStore.ts:444-462` (§WALL-DEEP-2026 B2) | `BaselineReversalError` — a baseline reversal on a wall with `openings.length > 0` is **refused outright** unless the caller migrated every offset and passed `_allowBaseLineReversal`. |
| H6 | `UpdateWallBaselineCommand.ts:196-227` | The `wallStore.update` call is wrapped in `try/catch`. On throw the wall is **left in its pre-drag state**, a toast fires, and the command returns `success:false`. This is §17.2's "a wall move with openings can be refused outright" — confirmed at line. |
| H7 | `WallStore.ts:574` | `this.emit('update', frozenNextState, wall)` — **the one `prevState`-carrying emit in the whole file** (see §7). |
| H8 | `apps/editor/src/engine/WallRebuildCoordinator.ts:396` → `:909` `_scheduleFlush` | Queues the dirty wall; `:917` `const resolvedPrev = prevState ?? existing?.prevState` carries prev across a coalescing window. |
| H9 | `WallRebuildCoordinator.ts:1360` `classifyWallDelta(...)` | Returns `moved-wall` → **deliberately no fast path** (`:1368-1374`): a move changes junction geometry, so the authoritative whole-level `resolveLevel` + `refreshV2Cache` must run. |
| H10 | `WallRebuildCoordinator.ts:1379-1394` (§STEP7) | Diff-based neighbour discovery: `_findAdjacentWallIds(prevState.baseLine, …)` finds the walls that were joined at the **old** position and adds them to the batch. This is the piece that cannot work without `prevState`. |
| H11 | `packages/geometry-door/src/DoorDependencyTracker.ts:96-105` | On wall `'update'`, if `_wallGeometryChanged(prev, wall)` (`:110-120`: height, thickness, or either baseline endpoint), iterate a **snapshot** of the hosted-door bucket and call `doorStore.touch(doorId)`. Mirror at `packages/geometry-window/src/WindowDependencyTracker.ts`. |
| H12 | `packages/geometry-door/src/DoorBuilder.ts:150` | Door store `'update'` → mesh rebuild at the wall's new transform. |
| H13 | `apps/editor/src/engine/initTools.ts:918-922` | `wallStore.subscribe` → on `update`/`remove`, `roomGraphService.invalidate(updatedWall.levelId)`. |
| H14 | `packages/room-topology/src/RoomTopologyObserver.ts:156` | `wallStore.subscribe` → `_scheduleRedetect(wall.levelId, 150 ms)`. |

### 1.2 The answer: YES, and the mechanism is two-part

**Openings translate.** (Grade: **BY-READ** for the mechanism, **EXECUTED** for the store half.)
The propagation is *parametric*, not coordinate-based, and it has two halves that must both hold:

1. **Data half** — an `Opening` stores `offset` (a scalar distance from `baseLine[0]`), not a world
   point. Moving the baseline therefore moves the opening *for free*: no code has to run. This is
   why §5's "openings ride the wall record" was directionally right.
2. **Render half** — the mesh does *not* update for free. `DoorDependencyTracker.ts:96-105`
   re-emits `doorStore.touch(doorId)` so `DoorBuilder` rebuilds at the new transform.

Two guards exist precisely because the parametric model is fragile under endpoint reordering:
`UpdateWallBaselineCommand.ts:130-152` normalises, and `WallStore.ts:444-462` refuses. Both are
correct and both are load-bearing.

**The reachability nuance §5 could not see**: `DoorDependencyTracker.ts:88-95` documents that this
exact cascade once produced an **unbounded loop** ("move a wall that hosts a door → the whole app
freezes", L-250/L-01) because `touch()` re-enters the tracker's own subscriber and mutates the
`Set` being iterated. The fix — iterate a plain-array snapshot — is at `:100`. This is live code
with a scar; treat it as fragile under any future change to `register()`.

> **Correction to a companion census.** A parallel sweep in this session reported
> `DoorDependencyTracker.ts:56` as "declares `prev` but never reads it". That is **wrong**: it reads
> it at `:96` via `_wallGeometryChanged(prev, wall)`. Graded **BY-READ** against the file itself,
> which is the stronger evidence. The corrected census is §7 below.

### 1.3 What is NOT reached on a wall move

- **Schedules.** `SchedulePanel` has no geometry subscription — an open schedule shows stale areas
  (carried from §17.2, **not re-verified here**, grade **UNPROVEN** at HEAD).
- **SemanticGraph.** No edge is rewritten on a move. Wall↔room adjacency edges written at create
  time are not re-derived. (**BY-READ**, §4.3.)
- **Furniture.** No `contains` re-evaluation (§5, EXECUTED by the room trace).
- **Room `boundingWallIds`** on graph-authoritative levels — never (§5, §8).

---

## 2. Change wall height / length — the opening re-clamp bug

### 2.1 The prior report is CONFIRMED, and it is worse than "height only"

The prior deep-dive reported "no opening clamp on lowering" as a REAL BUG. **Confirmed, and
extended: the same hole exists on the LENGTH axis, via a different command.** Both re-proven by
executed probe, not by reading.

**EXECUTED probe** (scratchpad, `tsx`, real `WallStore` + stub `BimManager`; no repo file written):

```
PROBE-3 wall SHORTENED 6.0m -> 1.5m. openings: [{"off":2,"w":0.9}]
PROBE-4 wall height 3.0 ->  1  openings: [{"h":2.1,"sill":0}]
```

Read those two lines carefully:

- **PROBE-3** — the wall is now **1.5 m** long. The door occupies `[2.0, 2.9]`. The opening is
  **entirely off the end of the wall.** No clamp, no rejection, no warning, no event.
- **PROBE-4** — the wall is now **1.0 m** tall. The door is **2.1 m** tall with sill 0. The opening
  exceeds its host by 1.1 m. No clamp, no rejection.

### 2.2 Why — and the exact absence

| Path | File:line | What it does about openings |
|---|---|---|
| Length | `packages/command-registry/src/walls/UpdateWallBaselineCommand.ts:80-86` | `canExecute` checks only `len < 0.1`. Nothing else. |
| Length | `packages/geometry-wall/src/WallStore.ts:419-575` (`_updateImpl`) | Validates baseline structure, reversal, Zod, levelId, rake. `:497-500` **refuses** direct `openings` writes. **Zero length-vs-opening logic.** |
| Height | `packages/command-registry/src/walls/UpdateWallHeightCommand.ts:36-77` | `canExecute` checks only `MIN_HEIGHT` / `MAX_HEIGHT` global constants. |
| Height | `UpdateWallHeightCommand.ts:92-96` | The snapshot **copies `openings` forward verbatim** (`wall.openings.map(o => ({...o}))`) and then sets `height`. The openings are carried, never consulted. |
| Height | `packages/command-registry/src/walls/UpdateWallDimensionsCommand.ts:52-62` | Same shape: `{...currentState, height, thickness}` → `updateWall`. No clamp. |

### 2.3 The gate already exists — it is only wired to the opening side

This is the finding that matters, because it makes the fix small.

`packages/geometry-wall/src/WallOccupancyStore.ts:149-186` — **`clampToWall(wall, dims)`** is a
**pure** function that clamps exactly the four quantities at fault:

```
width  = clamp(width, MIN, wallLength);
offset = clamp(offset, 0, wallLength - width);
height     = clamp(height, MIN, wallHeight);
sillHeight = clamp(sillHeight, 0, wallHeight - height);
```

It handles curved walls (centreline arc, §FEAT-HOSTED-ON-CURVED-WALL), degenerate walls, and
returns a `clamped: boolean` so a caller can report. It is the correct, already-written, already-
tested gate for precisely this defect.

**Its complete production call list (EXECUTED grep):**

| Call site | Direction |
|---|---|
| `packages/geometry-wall/src/WallStore.ts:1098` (`updateWindow`) | opening → wall |
| `packages/command-registry/src/windows/UpdateWindowParameterCommand.ts:137` | opening → wall |

**Two call sites, both on the opening side. Zero on the wall side.** The header comment at
`WallOccupancyStore.ts:120-131` states the asymmetry outright: the guard was added for
"a window/door dimension edit … only the MOVE path validated via `canPlace()`". Nobody closed the
mirror case — **the wall shrinking underneath a stationary opening**.

Note also `WallStore.updateDoor` (`:1194-1232`) has **no** `clampToWall` call at all, unlike
`updateWindow` (`:1098`) — so the door family is unguarded on *both* axes.

### 2.4 Smallest fix point

Two argument-level changes inside existing commands. **No new engine, no new store, no new event.**

1. **Length** — in `UpdateWallBaselineCommand.execute()`, after `effectiveBaseLine` is computed
   (`UpdateWallBaselineCommand.ts:~180`, before the `wallStore.update` call at `:196`), run
   `wallOccupancyStore.clampToWall(candidateWall, opening)` for each `wall.openings[*]` against the
   **new** baseline length and either (a) fold the clamped values into the same update, or (b)
   refuse in `canExecute` with both numbers — *"wall would be 1.5 m; door DO001 needs 2.9 m"* —
   which matches the founder's hard-stopper doctrine (refuse with BOTH numbers).
2. **Height** — same call in `UpdateWallHeightCommand.execute()` at `:98-110`, where `nextState` is
   assembled, and in `UpdateWallDimensionsCommand.ts:57-61`.

`WallOccupancyStore.canPlace` is the *other* existing gate and is the right one for the **refuse**
variant, since it already returns `reason: '… extends beyond wall length N m'`
(`WallOccupancyStore.ts:319`). Either gate is re-run inside an existing command body.

**Recommended order (probe first):** ship a *reporting-only* pass — call `clampToWall`, log
`clamped: true` with the element id and both numbers, change nothing — so the defect's real-world
frequency is measured before any behaviour changes under users' hands.

---

## 3. Move door along wall — occupancy, graph, and ADR-057

### 3.1 The hop chain

| Hop | Location | Notes |
|---|---|---|
| H1 | `packages/input-host/src/HostedElementDragController.ts:199` (3-D) / `packages/core-app-model/src/views/PlanElementDragController.ts:674` (plan) | Both dispatch `door.setOffset` on **drag-end only** — one command per gesture. |
| H2 | `apps/editor/src/engine/initBusHandlers.ts:1734` | `door.setOffset` → `SetDoorOffsetCommand`. |
| H3 | `packages/command-registry/src/doors/SetDoorOffsetCommand.ts:43` | **Occupancy IS re-checked**: `wallOccupancyStore.canPlace(wall, newOffset, door.width, this.doorId)` in `canExecute`. `excludeId` is passed, so the door does not self-conflict. **CONFIRMED at line.** |
| H4 | `SetDoorOffsetCommand.ts:52-54` | `wallStore.updateDoor(id, { offset })` then `doorStore.update(id, { offset })`. |
| H5 | `packages/geometry-wall/src/WallStore.ts:1230` | `this.emit('update', frozen)` — **no `prevState` argument**. This is the defect (§3.3). |
| H6 | `apps/editor/src/engine/initTools.ts:556-564` | `doorStore.subscribe` → `roomGraphService.invalidateForDoor(door.id)` **and** `roomGraphService.invalidate(wall.levelId)`. Room-graph edge invalidation **CONFIRMED live** for door moves. |
| H7 | `packages/spatial-index/src/RoomGraphService.ts:203-221` | `invalidate` sets `dirty = true`; rebuild is lazy on next query (`_buildGraph`). |

**Swing clearance**: still no check. EXECUTED grep — no swing/clearance validator on the move path.
§5's row stands.

### 3.2 ADR-057 P1 SHIPPED — the "rebuilds the whole level" memory is stale as stated

`packages/geometry-wall/src/WallDeltaClassifier.ts` and
`apps/editor/src/engine/WallRebuildCoordinator.ts:1024-1080` (`_flushOpeningsOnly`) implement a real
openings-only fast path: rebuild only the edited wall bodies using the **cached** `JoinData` from
`_prevJoinMap`, skipping `resolveLevel`, `refreshV2Cache` and `computeJunctionInfills`. The
invariance argument is written out and is sound. So the flat claim *"setOffset rebuilds the whole
level"* is **no longer true as a statement about the architecture**.

### 3.3 …but the fast path is UNREACHABLE from the door-move path

**EXECUTED probe 1** — what `WallStore` actually emits when a door offset changes:

```
PROBE-1 updateDoor(offset) events: [{"ev":"update","hasPrev":false}]
PROBE-2 update(baseLine) events:   [{"ev":"update","hasPrev":true}]
```

**EXECUTED probe 2** — feeding both shapes to the real classifier:

```
WITH prevState:                            {"kind":"openings-only","wallIds":["w1"],"levelId":"L1"}
AS EMITTED by updateDoor (no prevState):   {"kind":"whole-level","reason":"no-prevState"}
```

The chain, stated plainly:

1. `WallDeltaClassifier.ts:218-220` — guard 3 is `if (!prevState) return { kind: 'whole-level',
   reason: 'no-prevState' }`.
2. `WallStore.updateDoor` (`:1230`) and `updateWindow` (`:1166`) call `this.emit('update', frozen)`
   — **two arguments, not three.** The `emit` signature (`:1288`) accepts `prevState`; the caller
   simply does not pass it.
3. `WallRebuildCoordinator._scheduleFlush:917` can only inherit a `prevState` from an *earlier*
   pending entry for the same wall in the same coalescing window. A drag-end `setOffset` is a
   single command producing a single event, so there is nothing to inherit.
4. Therefore `classifyWallDelta` at `:1360` returns `whole-level`, `_flushOpeningsOnly` is never
   entered, and the coordinator runs the full `WallJoinResolver.resolveLevel` + `refreshV2Cache` +
   per-wall `buildWall` pass over the entire level.

**So the observable defect the founder reported is REAL and still present at HEAD — but the root
cause is not the one recorded.** It is not "ADR-057 was never implemented"; it is *"ADR-057 was
implemented and then starved of its input by a two-argument emit call."* This is the
[three-invalidation-gates-in-series](../../..) pattern again: an upstream gate silently voiding a
correct downstream fix. The existing tests
(`packages/geometry-wall/__tests__/WallDeltaClassifier.test.ts`) pass because they construct
`prevState` **by hand** — they prove the classifier, never the wiring.

### 3.4 Smallest fix point

**Two arguments.** In `packages/geometry-wall/src/WallStore.ts`:

- `:1230` — `this.emit('update', frozen)` → `this.emit('update', frozen, wall)`
- `:1166` — same, in `updateWindow`

`wall` is already in scope at both sites (it is the pre-mutation record read at `:1198` / `:1092`),
and `frozen` is derived from it, so the pre-state is genuinely available. No signature changes, no
new types. The same two-argument omission also affects `:915` (`addOpening`), `:959`
(`updateOpening`) and `:996` (`removeOpening`) — those three *should* stay whole-level (the
classifier deliberately rejects opening-**set** changes at `:172-181`), so leave them; but they
currently reach that verdict for the *wrong reason* (`no-prevState` rather than
`opening-set-changed`), which makes the perf telemetry misleading.

**Ship the probe first**: an integration test that drives `SetDoorOffsetCommand` through a real
`WallStore` and asserts `classifyWallDelta` returns `openings-only` — i.e. a test at the **seam**,
not at the classifier. It fails today. That test is the deliverable; the two-argument change is the
one-line follow-up.

---

## 4. Delete a wall — deterministic, except for the graph

### 4.1 The hop chain

| Hop | Location | What happens |
|---|---|---|
| H1 | `apps/editor/src/engine/initUI.ts:2449` (also `PropertyPanel.ts:980`) | `bus.executeCommand('element.delete', { elementId, elementType, source })`. |
| H2 | `plugins/view/src/handlers/DeleteElement.ts:29-63` | A **bridge**: `affectedStores: []`, executes the legacy `DeleteElementCommand` via `window.commandManager`, returns `{ forward: [], inverse: [] }` — **the bus produces no patches for a wall delete**; undo lives only on the legacy stack. |
| H3 | `packages/command-registry/src/walls/DeleteElementCommand.ts:145` | `serializeWallSnapshot(wall)`; `:153-167` snapshots neighbour baselines. |
| H4 | `DeleteElementCommand.ts:178-192` | Cascade: for each `wall.childrenIds` → `elementRegistry.unregister`, `bimMgr.unregisterElement`, `doorStore.remove(childId)`, `windowStore.remove(childId)`. |
| H5 | `WallStore.ts:750-771` | `remove()` iterates `childrenIds` → `removeWindow`/`removeDoor` → `removeOpening`; then `:768` `emit('remove', wall, wall)` (prev === current, see §7). |
| H6 | `apps/editor/src/engine/initTools.ts:918-922` | → `roomGraphService.invalidate(levelId)`. |
| H7 | `RoomTopologyObserver.ts:156-174` | On `'remove'`: surrenders graph authority (`:167-171`, GR2) and schedules a redetect. |
| H8 | `packages/core-app-model/src/DependencyResolver.ts:272-277` | `if (event.operation === 'delete') return []` — **zero cascade by design.** |
| H9 (undo) | `DeleteElementCommand.ts:544-647` | Re-adds the wall, then iterates `this.deletedData.openings` to re-register and re-add each door/window. |

### 4.2 What IS deterministic

Doors and windows are removed with their host, twice over (command level H4 **and** store level H5)
— belt and braces. Undo restores them. `WallOccupancyStore` needs no cleanup: it is a **pure query
service** over `wall.openings` with no registration lifecycle (`WallOccupancyStore.ts:21-30`,
EXECUTED grep — no `release`/`unregister` method exists), so there is nothing to orphan there. That
is a genuinely good design property and should be recorded as such rather than "fixed".

### 4.3 What is orphaned or not reached

1. **SemanticGraph edges leak.** `DeleteElementCommand.ts` calls
   `semanticGraphManager.removeAllRelationshipsForElement` at `:361, :395, :403, :424, :440, :457,
   :480, :497, :513` — curtain-wall, furniture, handrail, roof, floor, ceiling, beam, plumbing —
   and **not once inside the wall branch (`:143-208`)**. (EXECUTED grep.) Worse,
   `DependencyResolver.ts:274` justifies its empty delete-cascade with the comment *"SemanticGraph
   relationships … are removed by the Command"* — which is **false for the wall kind specifically**.
   Two mechanisms each assuming the other did it. **Smallest fix point**: one call inside the
   existing wall branch, mirroring `:361`.
2. **`boundingWallIds` dangle.** No code prunes a deleted wall id from `RoomData.boundingWallIds`;
   recovery depends entirely on the debounced redetect at `RoomTopologyObserver.ts:172` — which is
   suppressed outright on graph-authoritative levels (§5, §8). On a generated level the dangling id
   is **permanent**.
3. **Cascade keys on `childrenIds`, undo keys on `openings`.** H4/H5 iterate `childrenIds`; H9
   iterates `openings`. `WallStore._assertOpeningsChildrenInvariant` (`:576+`) enforces that the two
   agree, so this is currently safe — but it is an asymmetry riding on a runtime invariant, worth a
   comment at both sites.
4. **`plugins/wall/src/handlers/DeleteWall.ts:40,60-63`** — a second, thinner `wall.delete` verb
   that does **not** cascade (its own header says so at `:16-17`). EXECUTED grep: no production call
   site, only benches and tests. Not a live hazard; a live trap for a future caller.

---

## 5. Change a room's bounding wall — full re-detect, and identity is not guaranteed

**Incremental? No. Full-level re-detect.** (Grade: **BY-READ** at line level, **EXECUTED** greps.)

`RoomTopologyObserver.ts:156` → `_scheduleRedetect(levelId, 150 ms)` → `_executeRedetect:463` →
`:547` `new ReDetectRoomsCommand(levelId, level.elevation, level.height ?? 3.0)` →
`packages/command-registry/src/rooms/ReDetectRoomsCommand.ts:86-89` → `new
RoomDetectionEngine(wallStore).detectRoomsForLevel(...)` → `mergeWithExisting(detected, existing)`.
**Every room on the level, from scratch, every time.**

Three findings sharper than §5:

1. **Room identity is recovered by centroid proximity, not preserved.**
   `RoomDetectionEngine.ts:491` mints `id: crypto.randomUUID()` for every detected room;
   `mergeWithExisting:842` then writes back `id: match.id, // preserve ID so undo works`, where
   `match` comes from `_findBestCentroidMatch:869` within `CENTROID_MATCH_RADIUS`. **Move a bounding
   wall far enough that the room's centroid shifts past that radius and the room gets a new id** —
   at which point `ReDetectRoomsCommand.ts:105-112` removes the old room and unregisters it from
   `bimManager`, `elementRegistry`, `semanticGraph` and the spatial index. Everything keyed to that
   room id (name, program, finishes, semantic edges) is lost. This is a BIM 3.0-relevant defect: it
   is exactly the "derived tier silently discards authored intent" pattern.
2. **The incremental path exists and is dead.** `plugins/rooms/src/handlers/RecomputeRoomBoundary.ts:42-44,60-64`
   — `room.recomputeBoundary` is an explicit **no-op** (`affectedStores = []`, returns empty
   forward/inverse). Its only synthesiser is `buildWallRoomCascadeRule` in
   `plugins/cross/src/wall-room.ts:117-130`, registered by `registerCrossHandlers`
   (`plugins/cross/src/handlers/index.ts:45`) — and EXECUTED grep finds **only two hits** for that
   symbol: the definition and its re-export. **Nothing calls it.** Textbook
   authored-but-unwired: the verb, the rule and the handler all exist; the registration does not.
3. **Furniture is never re-evaluated.** `RoomContentsService.ts:108` `_containedByCentroid(...)` is
   a **pull-time query**, not a subscription. Nothing re-parents furniture when a room's polygon
   changes. (EXECUTED grep: no furniture subscription anywhere in `packages/room-topology/src`.)

**Wall height is invisible to the redetect trigger.** `_computeWallSig:566-584`, line `:577`,
hashes only `id : baseline x,z > x,z # thickness`. No height. So a pure height edit produces an
identical signature and is gated out at `:255` / can trip the no-progress breaker at `:532`. For
*room boundaries* this is harmless (boundary height comes from `levelHeight`,
`RoomDetectionEngine.ts:473`) — but it means the signature cannot be reused as a general
"did the level change?" oracle, which is what a BIM 3.0 cascade would want.

---

## 6. Roof footprint change → walls beneath: MEASURED-ABSENT, both directions

§5 graded this UNKNOWN. It resolves to **absent**, with the greps to prove it.

- `packages/geometry-roof/src/RoofStore.ts:84-139` emits `add|update|remove` plus
  `bim-roof-added/updated/removed` and a `storeEventBus` event.
- **Every subscriber** (EXECUTED grep on `bim-roof-updated|bim-roof-added`, non-docs):
  `apps/editor/src/engine/initBuilders.ts:582,588,594` (mesh rebuild),
  `apps/editor/src/engine/initScene.ts:2247,2547,3553,3780`, `registerTransformDragHandler.ts:689`,
  `packages/input-host/src/SelectionManager.ts:854,907`,
  `packages/core-app-model/src/rendering/FrustumCullingService.ts:108`,
  `LevelScoped3DCullingService.ts:262`, `apps/editor/src/ui/platform/SaveOrchestrator.ts:64`.
  **Rendering, selection, culling and persistence only. No wall consumer, no room consumer.**
- EXECUTED grep `roof.*wall.*height|trimWallsToRoof|wallsUnderRoof|roofClash|adjustWallHeight`
  (non-docs): hits are all roof **creation** reading wall height —
  `HouseLayoutExecutor.ts:1430,3087`, `CreateRoofCommand.ts:114`, `houseVertical.ts:69`. **No gable
  or raked-wall adjustment. No clash detection.**
- EXECUTED grep `roof` in `plugins/cross/src` → **no matches.** There is no roof cascade rule.
- **Reverse direction also absent**: EXECUTED grep `roof` in `plugins/wall/src` → no matches.
  `packages/geometry-roof/src` reads walls only at authoring time — `RoofSnapEngine.ts:83,126,196`
  (snap cache) and `WallRegionDetector.ts:44` (footprint pick while drawing). Move a wall afterwards
  and the roof footprint is never re-derived.

The known flat-roof/slab clash defect is therefore **structurally unpreventable today**: no
subscriber exists that could detect it.

---

## 7. §STEP7 census — every `prevState` emitter and every subscriber

### 7.1 Emitters (10)

| Store | Listener decl | `emit` | add | update | remove |
|---|---|---|---|---|---|
| `packages/geometry-wall/src/WallStore.ts` | `:21` | `:1288` | **no** (`:325`, `:745`) | **only `:574`**; NOT at `:915`, `:959`, `:996`, `:1028`, `:1166`, `:1230` | `:720` no; `:768` `emit('remove', wall, wall)` — self-snapshot |
| `packages/geometry-slab/src/SlabStore.ts` | `:31` | `:128` | no (`:201`) | yes (`:231`) | no (`:210`) |
| `packages/geometry-column/src/ColumnStore.ts` | `:30-33` | `:115` | no | yes (`:242`) | no |
| `packages/core-app-model/src/stores/ColumnStore.ts` **(duplicate)** | `:29-32` | `:114` | no | yes (`:247`) | no |
| `packages/core-app-model/src/stores/RoomBoundingLineStore.ts` | types `:63-66` | `_notify:141` | no | yes (`:100`) | no |
| `packages/room-topology/src/RoomStore.ts` (type `RoomTypes.ts:324`) | `:324` | `_emit:514` | no | yes (`:285`) | `:323` self-snapshot |
| `packages/geometry-door/src/DoorStore.ts` | `:5` | `notify:215` | no | yes (`:90`, `:128`); `:192` self | no |
| `packages/core-app-model/src/stores/DoorStore.ts` **(duplicate)** | `:5` | `:109` | no | yes (`:44`); `:87` self | no |
| `packages/geometry-window/src/WindowStore.ts` | `:5` | `:190` | no | yes (`:74`, `:105`); `:167` self | no |
| `packages/core-app-model/src/stores/WindowStore.ts` **(duplicate)** | `:5` | `:109` | no | yes (`:44`); `:87` self | no |

**The absences are load-bearing.** Stores with **no** pre-state at all (2-arg listeners): StairStore
(`packages/core-app-model/src/stores/StairTypes.ts:235`, `packages/geometry-stair/src/StairTypes.ts:258`),
HandrailStore (`:19`), FloorStore (`:48`), CurtainWallStore (`:46`), CurtainPanelStore (`:60`),
LiftTypes (`:83`), AnnotationStore (`:68`), plus `packages/stores/src/{LevelStore,RoomStore,ElementStore,SelectionStore,BuildingStore}.ts`,
`core-app-model/src/stores/{CeilingStore,BeamStore,FloorSystemTypeStore}.ts`,
`geometry-slab/src/SlabSystemTypeStore.ts`, `core-app-model/src/hierarchy/HierarchyStore.ts`.
**There is no roof store and no furniture store with a 3-arg listener at all** — which is the
mechanical reason §6 comes out absent.

Three notes that matter for BIM 3.0 planning:
- **Three stores are duplicated** (Column, Door, Window each exist in both `core-app-model/src/stores`
  and a `geometry-*` package). Any cascade wired to one is blind to the other.
- **`emit('remove', wall, wall)`** (`WallStore.ts:768`, `RoomStore.ts:323`) passes the *current*
  record as its own pre-state. It satisfies the type but carries **zero diff information** — a
  subscriber that diffs sees "nothing changed" on a delete.
- **`prevState` is an update-only facility.** No store carries it on `add`, and only self-snapshots
  on `remove`. A generic cascade cannot be built on `prevState` alone for create/delete.

### 7.2 Subscribers (23 production sites) → emitter → what it recomputes

| Subscriber (file:line) | Store | Recomputes | Reads `prevState`? |
|---|---|---|---|
| `apps/editor/src/engine/WallRebuildCoordinator.ts:396` | Wall | queues dirty walls for batched join/mesh rebuild (`_scheduleFlush:909`; prev used `:1380-1387` for adjacent-wall discovery) | **YES** |
| `apps/editor/src/engine/initWallLevelSubscribers.ts:19` | Wall | re-registers openings when `prevState.levelId !== wall.levelId` | **YES** |
| `packages/geometry-window/src/WindowDependencyTracker.ts:42` | Wall | re-anchors hosted windows iff `_wallGeometryChanged(prev, wall)` | **YES** |
| `packages/geometry-door/src/DoorDependencyTracker.ts:56` | Wall | re-anchors hosted doors iff `_wallGeometryChanged(prev, wall)` (`:96`, `:110`) | **YES** (companion census said no — corrected here, §1.2) |
| `packages/geometry-door/src/DoorBuilder.ts:150` | Door | door mesh rebuild; `_isPropertyOnlyChange(prev,next)` (`:205`) picks the cheap path | **YES** |
| `packages/geometry-window/src/WindowBuilder.ts:271` | Window | window mesh rebuild; `_isPropertyOnlyChange` (`:334`, `:510`) | **YES** |
| `packages/geometry-slab/src/SlabDependencyTracker.ts:69` | Wall | marks dependent slabs dirty | no |
| `packages/geometry-slab/src/SlabWallConnectivityService.ts:127` | Wall | recomputes slab↔wall connectivity | no |
| `packages/snapping/src/providers/WallSnapProvider.ts:41` | Wall | invalidates wall snap candidates | no |
| `packages/snapping/src/providers/WallJoinSnapProvider.ts:74` | Wall | invalidates join snap candidates | no |
| `packages/geometry-door/src/DoorTool.ts:124` | Wall | refreshes host-wall placement cache | no |
| `packages/geometry-window/src/WindowTool.ts:120` | Wall | refreshes host-wall placement cache | no |
| `packages/room-topology/src/RoomTopologyObserver.ts:156` | Wall | schedules level room re-detect (150 ms) | no |
| `apps/editor/src/engine/initTools.ts:918` | Wall | `roomGraphService.invalidate(levelId)` on update/remove | no |
| `packages/geometry-door/src/DoorDependencyTracker.ts:50` | Door | maintains door→wall index | no |
| `apps/editor/src/engine/initTools.ts:556` | Door | `roomGraphService.invalidateForDoor` + level invalidate | no |
| `packages/geometry-window/src/WindowDependencyTracker.ts:37` | Window | maintains window→wall index | no |
| `packages/room-topology/src/RoomTopologyObserver.ts:187` | RoomBoundingLine | level room re-detect | no |
| `packages/room-topology/src/RoomTopologyObserver.ts:196` | Slab | level room re-detect | no |
| `packages/room-topology/src/RoomTopologyObserver.ts:205` | Column | level room re-detect | no |
| `packages/room-topology/src/RoomTopologyObserver.ts:178` | CurtainWall | level room re-detect (800 ms) | n/a (no prev) |
| `packages/stores/src/ApartmentParameterPropagator.ts:101` | Room | re-propagates apartment parameters | no (0-arg cb) |
| `apps/editor/src/ui/apartment-layout/nameDetectedRooms.ts:258` | Room | re-runs auto room naming | no (0-arg cb) |

**6 of 23 subscribers read `prevState`.** The other 17 discard it and therefore cannot do
diff-based work — they recompute unconditionally or invalidate wholesale.

**Not store subscribers** (an important correction to §5's dependency map):
- `packages/core-app-model/src/DependencyResolver.ts:197` subscribes to **`storeEventBus`, not to a
  store**. The §STEP7 `prevState` third argument **never reaches it.** §5's line "DependencyResolver
  consumes those events" is true only of the bus-shaped events, and the pre-mutation snapshot
  designed for it is not among them.
- `packages/spatial-index/src/RoomGraphService.ts` contains **no `subscribe(` at all**. Its
  invalidation is entirely by explicit call from exactly **five production sites**
  (`initTools.ts:553, 558, 562, 920, 2398`). Notably there is **no `invalidateForWall`** —
  wall changes reach it only via the level-scoped call at `:920`.

---

## 8. Where propagation is SUPPRESSED

### 8.1 Guards inside `RoomTopologyObserver`

Public API: `pause():288`, `resume():289`, `flushPlacementLevels():291`, `cancelPendingForLevels():302`,
`setPostBatchCooldown():326`, `markGraphAuthoritative()`, `dispose():333`.

Early-return guards (each is a staleness point):

| Line | Condition |
|---|---|
| `:358` | `this.paused \|\| this._disposed` |
| `:363` | `_graphAuthoritativeLevels.has(levelId)` — **see §8.3** |
| `:367` | `batchCoordinator.isBatching` |
| `:380` | `__pryzmBuildingGenActive()` |
| `:385` | curtain-wall placement mode → deferred into `_pendingPlacementLevels` (drained **only** by `flushPlacementLevels()`) |
| `:436` | `_postBatchCooldownUntil > performance.now()` |
| `:241` / `:498` | `window.__wallDragInProgress === true` — **drops every commit mid-drag** |

Execution-chokepoint mirrors at `:476, :485, :500, :514, :515`; no-progress circuit-breaker at
`:529-535` (`NOPROGRESS_MAX = 6` within `NOPROGRESS_WINDOW_MS = 1000`).

### 8.2 Coalescing / debounce windows

| Window | Value | Delays |
|---|---|---|
| `RoomTopologyObserver.ts:36` `DEBOUNCE_MS` | 150 ms | wall/line/slab/column redetect |
| `:37` `CW_DEBOUNCE_MS` | 800 ms | curtain-wall redetect |
| `:47` `SOFT_COALESCE_MS` | 300 ms | post-commit coalesce |
| `:38` `MAX_DEADLINE_MS` / `:39` `MAX_DEBOUNCE_RESETS` | 2000 ms / 12 | force-fire at `:401-408` |
| `:295` | 50 ms | `flushPlacementLevels` |
| `ViewDependencyTracker.ts:73` / `:88` | 300 ms / 48 ms | view re-projection |
| `ViewDependencyTracker.ts:507` | **7 min** | generation hold watchdog |
| `BatchCoordinator.ts:1836-1837` | 1000 ms | post-batch redetect blackout |
| `BatchCoordinator.ts:1862-1871` | 2000 ms | hard-unlock fallback for `setSuppressed(false)` |
| `buildingGenerationLifecycle.ts` | `HOLD_MS 6000`, `INITIAL_GRACE_MS 20000`, `MAX_MS 6 min` | generation lease |
| `WallRebuildCoordinator.ts:~935` (ADR-061) | until drag end | whole-level `_flush` while `__wallDragInProgress` |

### 8.3 Suppress callers — is the un-suppress exception-safe?

| Site | Mechanism | Cleared at | Exception-safe? |
|---|---|---|---|
| `apps/editor/src/engine/initPersistence.ts:362` (`roomTopologyObserver.pause()`) + `:366` (`syncStateEngine.pause()`) | pause | `:372` / `:376` | **NO.** EXECUTED grep for `finally` in that file → **zero matches**. `loader.load(...)` at `:369` sits bare between pause and resume. **If load throws, the observer AND the SyncStateEngine stay paused for the whole session** — no watchdog, no timer backstop. **The single highest-severity suppression finding.** |
| `apps/editor/src/engine/persistence/ProjectLoader.ts:540` (+ `:558`) | pause | `:2072`, `:2093` | YES — `finally` at `:2037` |
| `packages/persistence-client/src/loader/ProjectLoader.ts:279` | pause | `:1349`, `:1361` | YES — `finally` at `:1331` |
| `apps/editor/src/engine/undo/performUndoRedo.ts:357-364` (`_withPausedObservers`) | pause ×2 | `:362-364` | YES — explicit `try/finally`, each resume in its own `try/catch`. **The model implementation; copy this shape.** |
| `apps/editor/src/ui/generation/buildingGenerationLifecycle.ts:101` (`__pryzmBuildingGenActive`) | global flag | `:242` in `release()` | Not a `finally`, but **timer-guaranteed**: cap timer `:183` (6 min) and settle timer `:191` always armed, `release()` idempotent `:217`. Residual: up to **6 minutes** of suppressed redetect if a generation throws. |
| `packages/core-app-model/src/batch/BatchCoordinator.ts:1607` (`viewDependencyTracker.setSuppressed(true)`) | batch suppression | `:1863` (2 s timeout), `:1871` (double microtask), `:2410` (project-switch clear) | YES |
| `apps/editor/src/engine/WallRebuildCoordinator.ts:402` `_pause()` | rebuild pause | `_resume():532`, `_resumeAndFlush():404`, `_resumeAndFlushDeferredDrag():950` | Caller-dependent. Loader/undo callers are `finally`-safe; `registerTransformDragHandler.ts:672` resumes inside a `try{}` — **not verified to be a `finally`** (UNPROVEN). |

### 8.4 The suppression that is never un-suppressed

**`_graphAuthoritativeLevels`** (`RoomTopologyObserver.ts:101`) is set by `markGraphAuthoritative():106`
from `ResidentialBuildingExecutor.ts:3309`, `ApartmentLayoutExecutor.ts:410`,
`OfficeBuildingExecutor.ts:1307`, `HouseLayoutExecutor.ts:1473,1772`, and
`residentialGraphAuthority.ts:55`.

EXECUTED grep: **no `unmarkGraphAuthoritative` exists anywhere in the repo.** The only clear path is
GR2 at `:167-169` — a manual wall **`add` or `remove`** while `!batchCoordinator.isBatching`. A wall
**move/update never clears it.**

**Consequence, stated plainly**: after any building generation, the generated level is
redetect-suppressed. A user who then drags a bounding wall gets **no room re-detection at all** —
room polygons, areas, `boundingWallIds`, and the room graph all silently freeze at their generated
values. Areas shown in schedules are then wrong with no indication. This is precisely the
*failure-and-emptiness-are-the-same-value* hazard: nothing distinguishes "rooms are correct" from
"rooms were never recomputed".

Compounding it: `buildingGenerationLifecycle.ts:275-280` calls
`roomTopologyObserver.scheduleRedetectAllLevels()` inside `release()` — the intended
"one redetect at the end". But that call routes through `_scheduleRedetect`, which returns at `:363`
for every graph-authoritative level. **For a normal generation the end-of-generation sweep is a
no-op by construction** (the observer's own comment at `:236-241` says so).

Also: `ResidentialBuildingExecutor.ts:604` and `OfficeBuildingExecutor.ts:380` call
`beginBuildingGeneration` and **discard the returned handle** — no explicit `end()`. They rely
entirely on the 6 s settle or the 6-minute cap. Only the house path terminates deterministically:
`runHousePostGenChain.ts:303 endBuildingGeneration()` inside a `finally` at `:298`.

---

## 9. Residual bugs found — with the smallest fix point for each

Ordered by (severity × smallness of fix). Every fix point is **inside an existing command, store
method, or registration call**. None proposes a new subsystem.

| # | Bug | Evidence | Smallest fix point |
|---|---|---|---|
| **R-1** | **Wall shortened → hosted openings left outside the wall.** No clamp, no refusal, no event. | **EXECUTED** probe: 0.9 m door at offset 2.0 survives on a 1.5 m wall | Call the existing `wallOccupancyStore.clampToWall` (or refuse via `canPlace`, which already returns "extends beyond wall length N m", `WallOccupancyStore.ts:319`) inside `UpdateWallBaselineCommand.canExecute`/`execute` (`:73-88` / `:~180`). Ship the reporting-only pass first. |
| **R-2** | **Wall height lowered → hosted openings taller than their host.** | **EXECUTED** probe: 2.1 m door in a 1.0 m wall | Same `clampToWall` call inside `UpdateWallHeightCommand.execute` at `:98-110`, and `UpdateWallDimensionsCommand.ts:57-61`. |
| **R-3** | **ADR-057 openings-only fast path is unreachable from door/window moves** — every door drag runs a whole-level `resolveLevel`. | **EXECUTED**: `updateDoor` emits `hasPrev:false`; classifier returns `whole-level / no-prevState` for that exact shape and `openings-only` when `prevState` is supplied | **Two arguments.** `WallStore.ts:1230` → `emit('update', frozen, wall)`; same at `:1166`. `wall` is already in scope. Pin with a seam test that drives `SetDoorOffsetCommand` and asserts `openings-only`. |
| **R-4** | **Graph-authoritative levels never un-suppress**; the end-of-generation sweep is a no-op by construction. Rooms silently freeze after generation. | EXECUTED grep: no `unmark…` exists; `RoomTopologyObserver.ts:363`, `:167-169`, `:236-241` | Add the missing clear to the existing GR2 branch at `:167-169` so a wall **`update`** (not only add/remove) surrenders authority — or have `buildingGenerationLifecycle.ts:275-280` clear the set before its sweep. One condition, one existing branch. |
| **R-5** | **`initPersistence.ts:362` pauses the observer + SyncStateEngine with no `finally` and no backstop.** A load exception deafens both for the session. | EXECUTED grep: zero `finally` in the file | Wrap `:362-376` in `try/finally`, copying `performUndoRedo.ts:357-364` verbatim. |
| **R-6** | **Wall delete leaks SemanticGraph edges** — the wall branch is the only kind that never calls `removeAllRelationshipsForElement`, while `DependencyResolver.ts:274` asserts in a comment that it does. | EXECUTED grep: `:361,395,403,424,440,457,480,497,513` — none in `:143-208` | One call inside the existing wall branch of `DeleteElementCommand.ts:178-208`, mirroring `:361`. Correct the false comment at `DependencyResolver.ts:274` in the same change. |
| **R-7** | **Room identity is lost when a bounding wall moves far enough** — new UUID, old room removed and unregistered from semantic graph + registries. | BY-READ: `RoomDetectionEngine.ts:491`, `:842`, `_findBestCentroidMatch:869`; `ReDetectRoomsCommand.ts:105-112` | Add a **second** match key alongside centroid in `mergeWithExisting:822` — e.g. `boundingWallIds` set-overlap — so identity survives a translation. Existing function, one extra predicate. |
| **R-8** | **Wall→room cascade rule is authored but never registered.** `room.recomputeBoundary` is a no-op; `registerCrossHandlers` has zero callers. | EXECUTED grep: 2 hits (definition + re-export) | Call `registerCrossHandlers` from the editor's plugin registration. **But** the handler it registers is itself a no-op (`RecomputeRoomBoundary.ts:60-64`) — so registering it changes nothing until the handler is implemented. Record it as authored-but-unwired; do **not** register a no-op and claim coverage. |
| **R-9** | **No swing-clearance check** on door move. | EXECUTED grep: no validator on the move path | New predicate inside the existing `SetDoorOffsetCommand.canExecute:39-46`, beside the `canPlace` call. Requires a swing model that does not yet exist — flag as a real gap, not a small fix. |
| **R-10** | **`emit('remove', w, w)` carries zero diff information** (`WallStore.ts:768`, `RoomStore.ts:323`); combined with `DependencyResolver.ts:272-277` returning `[]` on delete, deletes propagate nothing derived. | BY-READ | Not a one-liner; record as the precondition for any future generic cascade: **`prevState` is an update-only facility today.** |
| **R-11** | **`plugins/wall/src/handlers/DeleteWall.ts`** is a non-cascading second delete verb with no production caller. | EXECUTED grep | Leave it; ensure its REFUSE string names `element.delete`, as the other dead verbs do. |
| **R-12** | **Three stores are duplicated** (Column/Door/Window in both `core-app-model/src/stores` and `geometry-*`). Any cascade wired to one is blind to the other. | EXECUTED grep, §7.1 | Out of scope for a fix point; record as a hazard for anyone wiring propagation. |

---

## 10. Not verified

The following are **UNPROVEN** at HEAD and must not be read as either confirmed or refuted.
No claim above depends on them. **(1)** No browser-runtime or E2E execution was performed at all —
every "live" claim in this document is store-level or read-level, and the two `tsx` probes ran
`WallStore` and `WallDeltaClassifier` **in isolation with a stubbed `BimManager` and
`ProjectContext`**, so they prove what those units do, never what the composed runtime does; in
particular R-1/R-2 were proven against `wallStore.update`/`updateWall` directly, and while both
commands were read line-by-line and neither adds a clamp, *no probe drove the bus verbs themselves*.
**(2)** `SchedulePanel` staleness after a geometry change is carried from the prior audit and was
not re-checked here. **(3)** Whether undo of a wall edit also reverses the SemanticGraph edges that
the same command wrote — the `BIM30-READINESS-REPORT.md` §9 question — remains without a probe, and
R-6 makes it *more* likely to be broken, not less. **(4)** `registerTransformDragHandler.ts:672`
was not confirmed to resume the wall-rebuild coordinator from a `finally`. **(5)** Whether
`RoomTopologyObserver.ts:548`'s fire-and-forget `bus.executeCommand('room.update', {})` with an
**empty payload** reaches any real handler, and what it does if it does. **(6)** `PlanarTopologyEngine`,
`RoomBoundaryBuilder`, `RoomRelationshipService`, `TopologySpatialIndex` and `ReDetectRoomsCommand`
beyond `:129` (undo/inverse semantics) were not traced. **(7)** `plugins/roof/src/handlers` contents
were not read — the §6 absence verdict rests on subscriber and cross-rule greps, which is strong for
"nothing listens" and weaker for "no roof handler could ever write a wall". **(8)** No claim here is
about multi-client behaviour; collaboration leg C is absent (C66) and every trace above is
single-client by construction. **(9)** The frequency of R-1/R-2 in real user projects is unmeasured —
which is exactly why the recommended first move on both is a reporting-only probe, not a
behaviour change.
