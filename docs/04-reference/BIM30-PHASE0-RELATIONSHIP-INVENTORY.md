# BIM 3.0 — Phase 0B: Relationship & Dependency Inventory

> **Status:** MEASURED, read-only. This document enumerates every element→element
> relationship that exists in production so the universal safe-mode contract can state, for
> each one, how *A-changed* determines whether *B* is affected.
>
> **The governing rule this serves:** *any element → any related element must either
> participate in the full safe-mode lifecycle OR explicitly return UNDETERMINED with a typed
> reason.* A relationship absent from this table is a silent hole in the architecture.

---

## §0 — Measurement provenance

| | |
|---|---|
| Date | 2026-08-12 |
| Repo | `c:\Users\LENOVO\OneDrive\Desktop\PRYZM\Product_Rediness_08` |
| Branch | `main` |
| HEAD | `2b6368549d03cb3e476d12dfd8a4d3a8906a6c80` |

Exact commands run:

```bash
git rev-parse HEAD
npx tsx tools/ga-gate/check-graph-write-coverage.ts          # §1 matrix — cited, not re-derived
grep -rn "wallStore\.subscribe\|WallStore\.subscribe" --include=*.ts packages apps plugins
grep -rn "slabStore\.subscribe\|SlabStore\.subscribe"  --include=*.ts packages apps plugins
grep -rn "roomStore\.subscribe\|RoomStore\.subscribe"  --include=*.ts packages apps plugins
grep -rn "bim-level-updated"                           --include=*.ts packages apps plugins
grep -rn "boundingWallIds\|hostRoomId\|coveredRoomIds\|hostSlabId" --include=*.ts packages apps plugins
grep -rn "findRegionAtPoint\|traceRegionAtPoint\|'region'"         --include=*.ts packages apps plugins
find packages apps plugins -name "*Depend*" -not -path "*/node_modules/*"

# R8 authored-state gate — MUST be run from its own directory (relative imports)
cd tools/rac-conformance/certification && npx tsx gates/check-authored-state-protection.ts

# level-elevation strand — the two halves, both re-runnable (§4.2)
grep -rln "levelId\s*[?]\?\s*:" --include=*Store.ts --include=*Types.ts \
     packages/geometry-* packages/core-app-model/src/stores packages/room-topology/src \
  | sed 's|.*/||; s|Store\.ts$||; s|Types\.ts$||' | sort -u          # → 14 families
grep -rn "addEventListener('bim-level-updated'" --include=*.ts packages apps plugins  # → 1
```

All greps exclude `node_modules`, `__tests__`, `*.test.ts`, `*.spec.ts` unless stated.

**What this inventory deliberately does NOT do** (§CONTEXT-DATA-HONESTY): it never infers a
dependency from spatial coincidence or from a type name. A field named `roomId` counts as a
relationship only where code **reads** it; whether anything *reacts* when the referenced
element changes is a separate, separately-measured column.

> ### ⚠ CORRECTION 2026-08-12 (first revision of this document)
>
> The first draft of this file asserted that **`check-authored-state-protection.ts` did not
> exist at HEAD**, citing an `ERR_MODULE_NOT_FOUND`. **That was WRONG, and the error was mine,
> not the tree's.** The gate exists at
> `tools/rac-conformance/certification/gates/check-authored-state-protection.ts` (32,382 bytes,
> in commit `b0ca0c27` alongside `ElementProvenanceIndex.ts` and the `certify.ts`
> registration). I had scanned `tools/ga-gate/*.ts` only and concluded absence from a search
> that could not have found it — a directory-scoped search reported as a tree-wide fact.
>
> **The gate must be run from its own directory**, because its imports resolve relatively:
> ```bash
> cd tools/rac-conformance/certification && npx tsx gates/check-authored-state-protection.ts
> ```
> §6 now cites its **actual measured output**, which is materially richer than the commit
> message I had substituted — in particular it shows `planRegenerationClear` **does refuse**
> (arm c), a fact the commit message alone did not carry and which changes what Phase 1 must
> build. A Phase 0 inventory that reports a gate as missing when it is present is exactly the
> wrong baseline that sends Phase 1 rebuilding what already exists.
>
> **Two further corrections in the same revision**, both from re-reading the code rather than
> re-reasoning about it:
> - **Roof-by-region does NOT use `SlabRegionTracer`** (§5). It uses a *separate* detector,
>   `packages/geometry-roof/src/WallRegionDetector.ts`. My first draft called this "a one-line
>   omission from the same tracer"; it is not. See §5.1.
> - **The level-elevation strand count is now measured, not hand-counted** (§4.2), with the
>   exact command recorded so it is re-runnable and supersedes both the earlier note of 11 and
>   my own first-draft 16.

---

## §1 — Master table

**Sorted so relationships with NO index appear FIRST.** These are the program's work list.

Legend — *index*: a queryable reverse map exists. *reacts*: something re-derives the dependent
when the source changes. *refuse*: the path can return a typed UNDETERMINED rather than a
silent empty/stale answer.

### 1A · NO INDEX — nothing reacts (the work list)

| # | SOURCE → DEPENDENT | index | who reacts | command / observer | can refuse | file:line |
|---|---|---|---|---|---|---|
| 1 | wall → **floor finish** (`boundingWallIds`) | ✗ | **nobody** — field is hardcoded `[]` at creation | neither | ✗ | `packages/command-registry/src/floors/CreateFloorCommand.ts:231` |
| 2 | wall → **ceiling** (`boundingWallIds`) | ✗ | **nobody** — hardcoded `[]` at creation | neither | ✗ | `packages/command-registry/src/ceilings/CreateCeilingCommand.ts:191` |
| 3 | wall → **ceiling geometry** | ✗ | **nobody** — 0 `wallStore.subscribe` in `geometry-slab/src/ceiling/` | neither | ✗ | census: `SlabDependencyTracker.ts:69`, `SlabWallConnectivityService.ts:125` are the only two in the package |
| 4 | wall → **stair** | ✗ | **nobody** — 0 `wallStore.subscribe` in `geometry-stair` | neither | ✗ | census (18 subscribers total; none in `geometry-stair`) |
| 5 | wall → **roof** | ✗ | **nobody** — 0 `wallStore.subscribe` in `geometry-roof` | neither | ✗ | census; `RoofSnapEngine.buildCache` is a *pull* cache (`packages/geometry-roof/src/RoofSnapEngine.ts:83`), not a subscription |
| 6 | wall → **column / beam** | ✗ | **nobody** | neither | ✗ | census; `packages/geometry-column/src/ColumnStore.ts:9` only *mirrors* the WallStore channel shape |
| 7 | wall → **furniture** | ✗ | **nobody** | neither | ✗ | census |
| 8 | wall → **plumbing / lighting** | ✗ | **nobody** | neither | ✗ | census |
| 9 | room → **floor finish boundary** (`hostRoomId`) | ✗ | **nobody re-derives on room change** — boundary resolved ONCE at create | command-time only | ✗ | `packages/command-registry/src/floors/CreateFloorCommand.ts:233` (store) · `:318-346` (resolve, create-time) |
| 10 | room → **ceiling boundary** (`hostRoomId`) | ✗ | same as #9 | command-time only | ✗ | `packages/command-registry/src/ceilings/CreateCeilingCommand.ts:192` · `:236-262` |
| 11 | room → **lighting** (`roomId`) | partial | `LightingStore.getAllForRoom` is a **forward** query; the room→lighting *reaction* does not exist | command-time only | ✗ | `packages/core-app-model/src/stores/LightingStore.ts:52` · writer `packages/command-registry/src/lighting/CreateLightingCommand.ts:85`, `MoveLightingCommand.ts:50` — both resolve at **element** move, never at **room** change |
| 12 | **level elevation → 14 of 15 element families** | ✗ | exactly ONE listener for `bim-level-updated` in the whole tree (Floor) | observer (1) | ✗ | emitter `packages/command-registry/src/levels/UpdateLevelCommand.ts:88,110` · sole listener `packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:45` · census method §4.2 |
| 13 | slab → **stair opening (void)** | ✗ | reconciled only inside stair *commands*; no observer re-carves when the slab later moves | command-time only | ✗ | `packages/command-registry/src/stair/StairSlabOpeningReconciler.ts:176` · called from `CreateStairCommand.ts:484`, `MoveStairCommand.ts:121` |
| 14 | room → **room finishes → floor/ceiling** | ✗ (linear scan) | `RoomFinishSyncService` reacts, but by `getAll().filter(...)` — O(n), no index | observer | ✗ | `packages/core-app-model/src/RoomFinishSyncService.ts:77` · started `apps/editor/src/engine/initBuilders.ts:1036-1041` |
| 15 | **`contains`** (room → contained elements) | ✗ | **NO PRODUCTION WRITER AT ALL** — two readers ask, nobody answers | — | ✗ | gate finding, `contains/writer`; readers `packages/ai-host/src/WorldModelAdapter.ts:152`, `HierarchyTreePanel.ts:541` |
| 16 | **`partOf`** (room → unit) | ✗ | **no live writer** — only the loader reconstructs it; graph and `room.unitId` disagree for the whole session | rebuild only | ✗ | gate finding · rebuild `packages/persistence-client/src/loader/rebuildSemanticGraph.ts:165` |
| 17 | **`hostedBy`** (opening → wall) | ✗ (typed) | **write-only** — written on every opening creation, no typed reader | writer only | ✗ | writer `packages/command-registry/src/walls/CreateWallOpeningCommand.ts:232` · rebuild `rebuildSemanticGraph.ts:122` · reader: NONE |
| 18 | **`sitsOn`** (element → supporting slab) | ✗ (typed) | 18 writers, **ZERO typed readers** — ADR-0320's named defect | writer only | ✗ | writer `packages/command-registry/src/beam/CreateBeamCommand.ts:221` · `initDependencyCascade.ts:59` filters a *scheduler task*, not the graph |

### 1B · INDEX EXISTS — something reacts

| # | SOURCE → DEPENDENT | index | who reacts | command / observer | can refuse | file:line |
|---|---|---|---|---|---|---|
| 19 | wall → **door** | ✓ `wallId → Set<doorId>` + `doorId → wallId` (O(1) both ways) | `DoorDependencyTracker` re-anchors on geometry change; purges on remove | observer (`doorStore.touch`) | ✗ (silently no-ops on empty) | `packages/geometry-door/src/DoorDependencyTracker.ts:32,44,56,99-107` |
| 20 | wall → **window** | ✓ same shape | `WindowDependencyTracker` | observer | ✗ | `packages/geometry-window/src/WindowDependencyTracker.ts:42` |
| 21 | wall → **slab sketch (`HostReferenceEdge`)** | ✓ `wallId → Set<slabId>` | `SlabDependencyTracker`: update → `triggerRebuild`; **remove → `DegradeSlabSketchCommand` (undoable)** | observer → command | ✓ *partially* — `cmd.canExecute()` refuses with a reason | `packages/geometry-slab/src/SlabDependencyTracker.ts:49,69,107,180-187` |
| 22 | wall → **slab connectivity** | ✓ | `SlabWallConnectivityService` | observer | ✗ | `packages/geometry-slab/src/SlabWallConnectivityService.ts:125,150` |
| 23 | wall / curtain-wall / slab → **room topology** | ✓ (per-level dirty) | `RoomTopologyObserver` re-detects rooms | observer → `DetectAllRoomsCommand` | ✗ | `packages/room-topology/src/RoomTopologyObserver.ts:277,299,317` |
| 24 | slab → **floor finish elevation** (`hostSlabId`) | ✓ `getByHostSlab` | `FloorSlabBindingHandler` re-seats FFL; on slab remove **clears `hostSlabId`** | observer | ✗ (unbinds silently) | `packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:43-44,65-90,101-106` |
| 25 | **any element → any graph neighbour** (generic cascade) | ✓ `SemanticGraph` + `_captured` pre-purge map | `DependencyResolver` → `pryzm-dep-cascade` → `initDependencyCascade` | observer, priority-ordered | ✓ **`AffectedSet` = `determined` \| `cannot-determine`** | `packages/core-app-model/src/DependencyResolver.ts:91-93,248,311-338` |
| 26 | element → **views** | ✓ level-keyed dirty sets | `ViewDependencyTracker` marks views dirty, debounced flush | observer | ✗ (has *suppression* + generation hold, not refusal) | `packages/core-app-model/src/views/ViewDependencyTracker.ts:371,569,674,902` |
| 27 | wall ↔ **wall (`joinedTo` junction)** | ✓ retained, re-emitted per flush | `WallMoveConsequencePlanner` reads it | observer | ✗ | writer+delete `apps/editor/src/engine/WallRebuildCoordinator.ts:183` · reader `apps/editor/src/engine/consequence/WallMoveConsequencePlanner.ts:397` |
| 28 | wall → **snap providers** (wall/door/window/join/slab) | ✓ per-provider index | rebuild index on store change | observer | ✗ | `packages/snapping/src/providers/WallSnapProvider.ts:41`, `WallJoinSnapProvider.ts:74`, `DoorSnapProvider.ts:87`, `WindowSnapProvider.ts:80`, `SlabSnapProvider.ts:89` |
| 29 | room ↔ **room (`adjacentTo` / `connectedTo`)** | ✓ graph | `SemanticQueryEngine` | rebuilt each detect cycle | ✗ | writer `packages/command-registry/src/rooms/DetectAllRoomsCommand.ts:208,211` · reader `packages/ai-host/src/SemanticQueryEngine.ts:213,140` |
| 30 | wall → **room (`boundedBy`)** | ✓ graph | `SemanticQueryEngine` | rebuilt each detect cycle | ✗ | writer `DetectAllRoomsCommand.ts:151` · reader `packages/ai-host/src/SemanticQueryEngine.ts:141` |
| 31 | wall → **opening (`hosts`)** | ✓ graph | `SemanticQueryEngine` (2 readers) | writer + rebuild | ✗ | `CreateWallOpeningCommand.ts:232` · `SemanticQueryEngine.ts:142` |
| 32 | beam → **supports** | ✓ graph | `AssignBeamSupportsCommand` reads it back | command | ✓ (command validation) | writer `packages/command-registry/src/beam/AssignBeamSupportsCommand.ts:143` · reader `:128` |
| 33 | apartment params → **room params** | ✓ per-id snapshot diff | `ApartmentParameterPropagator` | observer | ✗ | `packages/stores/src/ApartmentParameterPropagator.ts:99-101` |
| 34 | annotation → **host element** | ✓ | `AnnotationDependencyGraph` | observer | ✗ | `plugins/annotations/src/subsystem/AnnotationDependencyGraph.ts` |
| 35 | stair/lift → **levels** (`connectedByStair`/`ByLift`) | partial (graph) | **3 writers each, 0 readers** — UNCLASSIFIED in C71 §2 | writer only | ✗ | gate UNCLASSIFIED block |

**Totals:** **35 relationships enumerated.** **17 have a real index and a reactor** (§1B rows
19–34, minus #35 which is writer-only). **18 have no index, no reactor, or are write-only**
(§1A rows 1–18, plus #35). The declared vocabulary contributes 26 `RelationshipType` members
(9 REQUIRED / 12 PARKED / 4 UNCLASSIFIED / `joinedTo`); the rest are store-level fields with no
graph representation at all.

---

## §2 — Axis 1: the declared relationship vocabulary

Source of truth: `packages/core-app-model/src/SemanticGraph.ts` (union parsed by the gate),
ADR-0320, C71 §2. **Computed by `tools/ga-gate/check-graph-write-coverage.ts` — output cited
verbatim below, not re-derived.**

Gate headline at HEAD: *26 declared members · 9 REQUIRED located · 4,569 production files
scanned · 1 rebuild implementation · 5 executed controls passed · **5 findings against a named
ledger of 5** (DECLARED-LEVEL, at baseline).*

### 2.1 REQUIRED nine — per-type × per-obligation matrix

`●` = present (site count) · `✗` = ABSENT · delete: `●` type-aware (d1), `○` cascade only (d2, weak)

| family | writer | reader | rebuild | delete | disposition |
|---|---|---|---|---|---|
| `hosts` | ● 1 | ● 2 | ● 1 | ○ 41 | rebuilt |
| `hostedBy` | ● 2 | **✗** | ● 1 | ○ 41 | rebuilt |
| `boundedBy` | ● 2 | ● 1 | ● 1 | ○ 41 | rebuilt |
| `adjacentTo` | ● 5 | ● 3 | ● 2 | ○ 41 | rebuilt |
| `connectedTo` | ● 6 | ● 2 | ● 2 | ○ 41 | rebuilt |
| `sitsOn` | ● 18 | **✗** | ● 2 | ○ 41 | rebuilt |
| `supports` | ● 8 | ● 2 | ● 2 | ○ 41 | rebuilt |
| `contains` | **✗** | ● 2 | ● 1 | ○ 41 | named-unrecon |
| `partOf` | **✗** | **✗** | ● 1 | ○ 41 | rebuilt |
| `joinedTo` | ● 1 | ● 1 | ● | ● 1 | REGENERATED |

Evidence (first site per filled cell, from the gate):

- `hosts` — writer `packages/command-registry/src/walls/CreateWallOpeningCommand.ts:232` · reader `packages/ai-host/src/SemanticQueryEngine.ts:142` · rebuild `packages/persistence-client/src/loader/rebuildSemanticGraph.ts:121`
- `hostedBy` — writer `CreateWallOpeningCommand.ts:232` · reader **none** · rebuild `rebuildSemanticGraph.ts:122`
- `boundedBy` — writer `packages/command-registry/src/rooms/DetectAllRoomsCommand.ts:151` · reader `SemanticQueryEngine.ts:141` · rebuild `rebuildSemanticGraph.ts:134`
- `adjacentTo` — writer `DetectAllRoomsCommand.ts:208` · reader `SemanticQueryEngine.ts:213` · rebuild `rebuildSemanticGraph.ts:152`
- `connectedTo` — writer `DetectAllRoomsCommand.ts:211` · reader `SemanticQueryEngine.ts:140` · rebuild `rebuildSemanticGraph.ts:155`
- `sitsOn` — writer `packages/command-registry/src/beam/CreateBeamCommand.ts:221` · reader **none** · rebuild `rebuildSemanticGraph.ts:174`
- `supports` — writer `packages/command-registry/src/beam/AssignBeamSupportsCommand.ts:143` · reader `AssignBeamSupportsCommand.ts:128` · rebuild `rebuildSemanticGraph.ts:182`
- `contains` — writer **none** · reader `packages/ai-host/src/WorldModelAdapter.ts:152` · rebuild `rebuildSemanticGraph.ts:215`
- `partOf` — writer **none** · reader **none** · rebuild `rebuildSemanticGraph.ts:165`
- `joinedTo` — writer + delete `apps/editor/src/engine/WallRebuildCoordinator.ts:183` · reader `apps/editor/src/engine/consequence/WallMoveConsequencePlanner.ts:397`

`packages/ai-host/src/graph/GraphQueryService.ts:73-84` mentions all ten, but it reads a
**payload string** — an allowlist for a dynamic reader is *not* a typed reader (C71 §1.3), and
the gate deliberately under-counts it.

### 2.2 PARKED twelve (C71 §2.2) — reported, not findings

`unitOf`, `levelOf`, `servesZone`, `precededBy`, `supersedes`, `branchedFrom`,
`causedFailureOf`, `wasMitigatedBy`, `exceededBenchmark`, `replacedBy`, `maintainedBy`,
`decommissionedBefore` — **writer 0 · reader 0** for all twelve. **0 parked families have
acquired a writer.** Parked ≠ gap (C71 §2.3 / §7.b). The ratchet runs one way: a *writer*
against a parked family is writer-first and IS a finding.

### 2.3 UNCLASSIFIED four — in the union, in neither §2.1 nor §2.2

| family | writer | reader | rebuild |
|---|---|---|---|
| `connectedByStair` | 3 | **0** | rebuilt |
| `connectedByLift` | 3 | **0** | named-unrecon |
| `measuredAt` | 1 | 1 | — |
| `decidedBy` | 1 | **0** | — |

Not findings — a gate that invents a classification the contract did not make is inventing
vocabulary. Named here so the C71 §2 gap has a home. **Three of the four are write-only.**

### 2.4 What the gate cannot see (printed every run, so silence is never read as coverage)

- **Computed-type writes — 3 sites invisible to literal scanning:**
  `packages/command-registry/src/walls/DeleteElementCommand.ts:147`,
  `packages/persistence-client/src/loader/rebuildSemanticGraph.ts:106`,
  `apps/editor/src/engine/initUI.ts:1563`.
- **Runtime reachability** — a writer that exists but is never reached counts as PRESENT.
- **Correctness** — a writer emitting the WRONG edge passes every arm.
- **Move-time invalidation (C71 §1.2 semantic 5) — NO ARM. UNPROVEN for every family.**
  *This is the single most important blind spot for Phase 0B: normal editing is mostly moves.*
- **Dynamic dispatch** — `GraphQueryService` reads a payload string; deliberate under-count.

Cascade purge (d2) sites: **41**. Rebuild implementations: **1** (`rebuildSemanticGraph.ts`).

---

## §3 — Axis 2: every dependency index that actually exists

| index | keys on | answers | queryable or reactive | can refuse | file:line |
|---|---|---|---|---|---|
| `SlabDependencyTracker` | `wallId → Set<slabId>` | "which slab sketches reference this wall?" | **reactive only** — `graph` is private, no public getter | ✓ via `DegradeSlabSketchCommand.canExecute()` | `packages/geometry-slab/src/SlabDependencyTracker.ts:49,180-187` |
| `DoorDependencyTracker` | `wallId → Set<doorId>` **and** `doorId → wallId` | "which doors hang on this wall?" | **both** — `getDoorIdsForWall()` is public | ✗ | `packages/geometry-door/src/DoorDependencyTracker.ts:32,44,173` |
| `WindowDependencyTracker` | same shape | "which windows on this wall?" | both | ✗ | `packages/geometry-window/src/WindowDependencyTracker.ts:42` |
| `ViewDependencyTracker` | `levelId → viewIds`, `viewId → dirty elementIds` | "which views must reproject?" | **both** (`markDirty`, `forceReproject`, `markLevelsDirty`) | ✗ — has *suppression* + *generation hold*, which are not refusals | `packages/core-app-model/src/views/ViewDependencyTracker.ts:371,472,569,640` |
| `DependencyResolver.getAffected` | `SemanticGraph` edges + `_captured` pre-purge map | "what does changing/deleting this affect?" | **queryable** (landed 2026-08-12, CONNECT-0 / PR-01) | **✓ — the only true refusal in the tree**: `{status:'cannot-determine', reason}` | `packages/core-app-model/src/DependencyResolver.ts:91-93,311-338` |
| `joinedTo` junction index | `wallId ↔ wallId` | "which walls are joined here?" | reactive; re-emitted per flush | ✗ | `apps/editor/src/engine/WallRebuildCoordinator.ts:183` |
| `SlabWallConnectivityService` | slab ↔ wall | connectivity for slab edges | reactive | ✗ | `packages/geometry-slab/src/SlabWallConnectivityService.ts:125,144,150` |
| `AnnotationDependencyGraph` | annotation → host | "which annotations follow this element?" | both | ✗ | `plugins/annotations/src/subsystem/AnnotationDependencyGraph.ts` |
| `FloorStore.getByHostSlab` | `slabId → floors` | "which finishes sit on this slab?" | **queryable** | ✗ | `packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:65` |
| `LightingStore.getAllForRoom` | `roomId → lights` | "which lights are in this room?" | **queryable, but nothing subscribes** | ✗ | `packages/core-app-model/src/stores/LightingStore.ts:52` |
| `elementSpatialIndex` | element → AABB | spatial neighbours | queryable | ✗ | used by `DependencyResolver.ts:352,360` |

**Nine indexes exist. Exactly ONE can refuse** (`DependencyResolver.getAffected`). Every other
index answers "nothing" and "I don't know" with the same value — the
§CONTEXT-DATA-HONESTY failure shape.

### 3.1 The cascade routing gate — what actually gets routed

`apps/editor/src/engine/initDependencyCascade.ts:59` is the *only* production consumer of
`pryzm-dep-cascade`, and it routes **exactly two relationship types**:

```ts
if (task.relationshipType !== 'sitsOn' && task.relationshipType !== 'supports') continue;
```

- **ROUTED:** `sitsOn` / `supports` (priority 1) — the structural slab↔wall pair.
- **NOT ROUTED, by design:** `hosts`/`hostedBy` (owned by Door/WindowDependencyTracker),
  `boundedBy`/`adjacentTo`/`connectedTo` (owned by `RoomTopologyObserver`) — routing them here
  would double-rebuild (C72 §2.4).
- **NOT ROUTED, and owned by nobody:** priority ≥ 4 — `contains`, `partOf`, `unitOf`,
  `levelOf`, `servesZone`, `connectedByStair`, `connectedByLift`, plus `joinedTo` (priority 5,
  record-only per ADR-0321). See `packages/core-app-model/src/DependencyResolver.ts:97-134`.

**Consequence:** of 26 declared types, **2 drive a cascade rebuild here**, 5 are served by
bespoke trackers, and **19 are record-only**.

---

## §4 — Axis 3: relationships that exist in practice with NO index

*The most valuable section. Every row is a field naming another element's id where nothing
reacts to the referenced element changing.*

### 4.1 Fields that name a dependency nothing honours

| field | declared on | written where | read where | reacts to source change? |
|---|---|---|---|---|
| `boundingWallIds` | `FloorData` | **hardcoded `[]`** `CreateFloorCommand.ts:231` | `RoomWorldModelAdapter.ts:93,201` (rooms only) | **NO — the array is never populated for floors** |
| `boundingWallIds` | `CeilingData` | **hardcoded `[]`** `CreateCeilingCommand.ts:191` | — | **NO** |
| `hostRoomId` | `FloorData` | `CreateFloorCommand.ts:233` | `RoomFinishResolver.ts:91`, `RoomFinishSyncService.ts:77` | **finish colour only** — boundary never re-derived |
| `hostRoomId` | `CeilingData` | `CreateCeilingCommand.ts:192` | `RoomFinishResolver.ts:151` | same |
| `coveredRoomIds` | `FloorData`/`CeilingData` | `CreateFloorCommand.ts:230`, `CreateCeilingCommand.ts:190` | `RoomFinishResolver.ts:91,151` | **NO reactor on room change** |
| `hostSlabId` | `FloorData` | `CreateFloorCommand.ts:232` | `FloorSlabBindingHandler.ts:65,101` | **YES** — the one honoured host field |
| `roomId` | `LightingData` | `CreateLightingCommand.ts:85`, `MoveLightingCommand.ts:50` | `LightingStore.getAllForRoom:52` | **NO** — resolved when the *light* moves, never when the *room* changes |
| `hostId` | `LightingData` (`LightingTypes.ts:235`) | — | — | **NO reader found** |
| `parentId` | `RoofData` (`RoofTypes.ts:91`) | `roofSnapshotUtils.ts:31` | serialisation only | **NO** |
| `parentId` | pool assembly parts | `PoolAssembly.ts:126,153,175` | assembly link | **NO reactor** |
| `parentId` | `FloorData`/`CeilingData` = `levelId` | `CreateFloorCommand.ts:221`, `CreateCeilingCommand.ts:181` | — | **NO** — it aliases `levelId`, and see §4.2 |
| `baseLevelId` / `topLevelId` | `StairData` (`StairTypes.ts:148-149`), `LiftData` (`LiftTypes.ts:54-55`) | `StairTool.ts:262`, `LiftToolPlacement.ts:71` | `StairStore.getByBaseLevelId:154`, `getStairConnectingLevels:162` | **NO** — queryable, but no level-change reactor |
| `hostSlabId` | stair void carve | `StairSlabOpeningReconciler.ts:176` | `CreateStairCommand.ts:484`, `MoveStairCommand.ts:121` | **command-time only** — no observer re-carves when the slab moves |
| `hostId` | slab `HostReferenceEdge` (`SketchTypes.ts:36`) | `SlabPickWallsController.ts:220,269` | `SlabDependencyTracker.ts:88` | **YES** — the best-honoured host field in the tree |

**Count: 14 fields name a dependency. 2 are honoured** (`hostSlabId` on floors,
`hostId` on slab sketch edges). **12 are not.**

### 4.2 The level→elevation strand — MEASURED, method stated

> **Supersedes two earlier figures on the record: the coordinator's note of 11, and this
> document's own first-draft 16.** Both were hand-counts. The number below is produced by two
> commands, recorded here so it is re-runnable and auditable. Measured 2026-08-12 at HEAD
> `2b636854`.
>
> **The two earlier counts were also measuring different things**, which is most of the
> discrepancy: "11" counted *declared element types strand by the level datum*; "16" was my
> loose count of *stores plus families I named by hand*, and it double-counted families
> declared in two packages (e.g. `LightingStore` exists in BOTH
> `packages/core-app-model/src/stores/` and `packages/geometry-lighting/src/`). The command
> below counts **distinct element families whose store/types file declares a `levelId` field**,
> de-duplicated across packages.

**Half A — the emitters and listeners.**

```bash
grep -rn "bim-level-updated" --include=*.ts packages apps plugins   # 6 hits total
grep -rn "addEventListener('bim-level-updated'" --include=*.ts packages apps plugins
```

Six mentions tree-wide, of which exactly **one is a subscription**:

| role | site |
|---|---|
| emitter | `packages/command-registry/src/levels/UpdateLevelCommand.ts:88` |
| emitter | `packages/command-registry/src/levels/UpdateLevelCommand.ts:110` |
| type catalog (not wiring) | `packages/event-bus/src/catalog.ts:59` |
| type catalog (not wiring) | `packages/runtime-composer/src/types.ts:1995` |
| **the ONLY listener** | `packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:45` |

**Half B — the families that carry `levelId` and do not listen.**

```bash
grep -rln "levelId\s*[?]\?\s*:" --include=*Store.ts --include=*Types.ts \
     packages/geometry-* packages/core-app-model/src/stores packages/room-topology/src \
  | sed 's|.*/||; s|Store\.ts$||; s|Types\.ts$||' | sort -u
```

→ 33 files collapsing to **14 distinct families**: Beam, Ceiling, CurtainWall, Floor,
Furniture, Handrail, Lift, Lighting, Plumbing, Roof, Room, RoomBoundingLine, Stair, Wall.

**Plus Slab**, whose `levelId` is declared in its validator rather than a `*Types.ts`
(`packages/geometry-slab/src/SlabValidator.ts:22`) and so is missed by the glob above —
**15 families carrying `levelId` directly.** Door and Window are excluded deliberately: they
derive level from their host wall rather than declaring it, so they strand *transitively*
through Wall, not independently.

**Of those 15, exactly ONE reacts to a level elevation change** — Floor, via the single
listener. **14 do not.**

Change a level's elevation and only floor finishes follow. Everything else keeps its old
world-Y until some unrelated rebuild happens to touch it. `ChatCommandClassification.ts:153`
already records this as blocked on *"level re-stack semantics (what happens to elements on
re-elevated levels)"* — the semantics are undefined, not merely unimplemented, which is why
this is OPEN QUESTION 2 rather than a bug with a known fix.

### 4.3 The `wallStore.subscribe` census (18 sites, exhaustive)

**Real reactors (8):** `DoorDependencyTracker.ts:56`, `DoorTool.ts:124`,
`SlabDependencyTracker.ts:69`, `SlabWallConnectivityService.ts:125`,
`WindowDependencyTracker.ts:42`, `WindowTool.ts:120`, `RoomTopologyObserver.ts:277`,
`WallRebuildCoordinator.ts:471`.

**Snapping index rebuilds (4):** `DoorSnapProvider.ts:87`, `WallJoinSnapProvider.ts:74`,
`WallSnapProvider.ts:41`, `WindowSnapProvider.ts:80`.

**Editor wiring (2):** `initTools.ts:918`, `initWallLevelSubscribers.ts:22`.

**Plan-view dirty flag (1):** `PlanViewCanvasHost.ts:291` (`subscribeDirty`).

**Comments/mirrors, not subscriptions (3):** `DependencyResolver.ts:170`,
`ColumnStore.ts:8/9`, `SlabStore.ts:9-10`.

**Zero subscribers from:** ceiling, floor-tool, stair, roof, column, beam, furniture,
lighting, plumbing, lift, handrail, pool.

---

## §5 — Axis 4: region-based elements

> **CORRECTED in revision 1.** The first draft of this section said roof-by-region "traces the
> same wall loop" via `SlabRegionTracer` and called the missing host references "a one-line
> omission". **Both halves were wrong.** Roof uses a *different* detector entirely. The
> correction changes the Phase 4 estimate for roofs upward, not downward — see §5.1.

There are **TWO independent region tracers** in the tree, not one:

| tracer | package | produces | file |
|---|---|---|---|
| `SlabRegionTracer` | `@pryzm/geometry-slab` (ADR-0263, ADR-0306) | ring **and** — via `traceRegionSketchAtPoint` — a sketch of `HostReferenceEdge`s carrying `hostId` | `packages/geometry-slab/src/SlabRegionTracer.ts:536,730` |
| `WallRegionDetector` | `@pryzm/geometry-roof` | **bare `Pt[]` ring only** — the signature has no id channel at all | `packages/geometry-roof/src/WallRegionDetector.ts:44` |

Callers:

| caller | family | tracer used | retains boundary relationship? | file:line |
|---|---|---|---|---|
| `SlabPlanToolHandler._findRegionAtPoint` | slab (plan) | `SlabRegionTracer` | **YES** — ring **+ `HostReferenceEdge` sketch** | `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:13,389` |
| `SlabTool.findRegionAtPoint` | slab (3D) | `SlabRegionTracer` | **coordinates only** — calls `traceRegionAtPoint`, the bare-ring twin | `packages/geometry-slab/src/SlabTool.ts:34,1416-1424` |
| `RoofTool` (3D) | roof | **`WallRegionDetector`** | **coordinates only** | `packages/geometry-roof/src/RoofTool.ts:7,59,73,276` |
| `RoofPlanToolHandler._commitRegion` | roof (plan) | **`WallRegionDetector`** | **coordinates only** | `apps/editor/src/engine/views/plantools/RoofPlanToolHandler.ts:2,44,200,209` |
| `CreateFloorsByRoomTypeCommand` | floor finish | none — copies room boundary | no; `boundingWallIds: []` | `packages/command-registry/src/floors/CreateFloorsByRoomTypeCommand.ts:188` |
| `CreateCeilingsByRoomCommand` | ceiling | none — copies room boundary | same | `packages/command-registry/src/ceilings/CreateCeilingsByRoomCommand.ts:84` |

**Exactly one of six region paths retains the relationship**, and it is the plan-view slab
path. Its own log line is the honest measurement (`SlabPlanToolHandler.ts:394-404`): it reports
`hostEdges`, `freeEdges`, `curvedFallbacks`, `missingIdFallbacks`, `ambiguousFallbacks`, and
states plainly that *"free edges do NOT follow a wall"*. Attribution can fail three named ways
(`SlabRegionTracer.ts:310` — `'curved' | 'noWallId' | 'ambiguous'`), and a curved wall
**always** degrades to a free edge.

### 5.1 Roof-by-region: NOT a one-line omission (OPEN QUESTION 4, resolved to a scope)

Verified by reading both call paths end to end:

- **`traceRegionSketchAtPoint` — the host-reference-producing entry point — has exactly ONE
  caller in the entire tree**, and it is the slab plan handler:
  `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:13` (import) and `:389` (call).
  Definition at `packages/geometry-slab/src/SlabRegionTracer.ts:730`.
- **Neither roof path imports `SlabRegionTracer` at all.** `RoofTool` constructs its own
  detector (`packages/geometry-roof/src/RoofTool.ts:7,73`) and calls
  `this._regionDetector.detect(point, this.wallStore)` at `:276`. `RoofPlanToolHandler` does
  the same at `:2,44` and `:200`, passing the result straight to `_commit` at `:209` as a bare
  `[number, number][]`.
- **`WallRegionDetector.detect` cannot carry a host reference even in principle**: its
  signature is `detect(hitPoint, wallStore): Pt[] | null`
  (`packages/geometry-roof/src/WallRegionDetector.ts:44`), and its loop walk returns
  `loopIdxs.map(idx => points[idx])` at `:193` — a projection to coordinates that discards
  wall identity before returning. There is no field to fill in.

**Therefore the roof gap is NOT a missing call to an existing function.** Closing it requires
either (a) porting roof onto `SlabRegionTracer` — which is the ADR-0306 "fix once, import
everywhere" precedent and would also inherit the curved-wall pre-trim fixes roof does not
have — or (b) adding an id channel through `WallRegionDetector`'s walk and its two callers.
Both are real work; neither is one line. *(Not fixed here — READ-ONLY.)*

The founder-facing "By Region · Auto-detect from enclosed walls" affordance exists for roofs
(`apps/editor/src/ui/layout/CreatePanelLayout.ts:310`, `elementCreationMatrix.ts:256`), so the
user-visible promise is identical to the slab's while the retained relationship is not. Move a
wall and the roof stays put, silently.

One consolation the detector *does* get right: it logs when it aborts on its loop cap rather
than returning a silent `null` (`WallRegionDetector.ts:28-31,183-189`, L-699) — "no closed
region here" and "I gave up" are not the same value there.

---

## §6 — Axis 5: generators / regenerators

| generator | bus verb or UI controller? | what it clears | protects authored? | file |
|---|---|---|---|---|
| House layout | **UI controller** | level's walls/rooms via §GRAPH-CLEAR-FIRST | **NO — measured destroying an authored room** | `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts` |
| Apartment layout | **UI controller** | same pattern | NO | `apps/editor/src/ui/apartment-layout/ApartmentLayoutExecutor.ts` |
| Office building | **UI controller** | same | NO | `apps/editor/src/ui/office-building/OfficeBuildingExecutor.ts` |
| Residential building | **UI controller** | same | NO | `apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts` |
| Ceiling layout | **UI controller** | ceilings on level | NO | `apps/editor/src/ui/ceiling-layout/CeilingLayoutExecutor.ts` |
| Furnish layout | **UI controller** | furniture on level | NO | `apps/editor/src/ui/furnish-layout/FurnishLayoutExecutor.ts` |
| Lighting layout | **UI controller** | lights on level | NO | `apps/editor/src/ui/lighting-layout/LightingLayoutExecutor.ts` |
| Floor-plan batch | host service | — | NO | `packages/ai-host/src/FloorPlanBatchExecutor.ts` |
| Layout generator | host service | — | NO | `packages/ai-host/src/generative/LayoutGenerator.ts` |

**Every generator is a UI controller. Not one is a bus verb.** The gate confirms at HEAD that
the only generate-shaped verbs are `GENERATE_STAIR_GEOMETRY` and `ai.floorplan.generate`,
*"neither of which regenerates an area"*. This is precisely why nothing can enforce
clear-then-rebuild centrally — there is no central place.

### 6.1 `check-authored-state-protection` — ACTUAL measured output

```bash
cd tools/rac-conformance/certification && npx tsx gates/check-authored-state-protection.ts
```
Result at HEAD `2b636854`: **`[1] DECLARED-LEVEL — 7 finding(s), at or below the declared
level of 7`** (at baseline). Twelve floors pass, including five that are *executed*, not
structural. Verbatim highlights:

**(a) The authority function discriminates — three distinct answers, so each is a decision:**
> element-grain authority → authored=`'refused'` · system-produced=`'allowed'` ·
> no-provenance=`'unknown-authority'` · **distinct kinds=3/3**
>
> `detectionMethod` → origin: `manual-boundary`=**authored** · `point-pick`=**authored** ·
> `auto-topology`=computed · `ai-generated`=inferred · `ifc-import`=observed ·
> absent=`null(not-recorded)`
>
> C75 §2.6 `mayBePresentedAsAuthored` → authored room=**true** · flood-filled room=**false**

**(b) The LIVE clear pattern destroys an authored room — EXECUTED, through the real store and
the real `room.delete` handler on the real bus:**
> LIVE §GRAPH-CLEAR-FIRST over a level holding 1 AUTHORED + 1 generated room →
> seeded=2 · remaining=0 · **the authored room survived = false**

**(c) — the fact the commit message alone did NOT carry, and the most important line in this
section for Phase 1:** the refusable form **already exists and already refuses**:
> `planRegenerationClear` over the SAME set → **refuse=true** · clearable=1 · **PROTECTED=1** ·
> unknown-authority=0
>
> sentence: *"the house layout generator proposed clearing 2 element(s): 1 clearable · 1
> AUTHORED (a human stated them) · 0 of unknown provenance. Clearing cannot proceed unreviewed
> — an authored element removed he…"* (truncated by the gate's own line width)
>
> **(c·control)** the same function over 2 system-produced rooms → refuse=false · clearable=2
> — *"refusal is a decision, not a constant."*

**(d) UNDETERMINED is a reading, not a stub:**
> prior-generation query, no declared run → kind=`'undetermined'`
> reason=`'producer-not-instrumented'` | with a declared run → kind=`'determined'`
> stillPresent=`[r-1]` gone=`[r-99]`

**So the gap is NOT "nothing can refuse".** `planRegenerationClear` refuses correctly, names
the protected element, and carries both counts. The gap is that **the live generator path does
not call it** — arm (b) and arm (c) run over the same set and disagree, because (b) is the
production §GRAPH-CLEAR-FIRST pattern and (c) is the reported form nothing has been wired to
yet. *Phase 1 must wire the existing refusal, not design one.*

### 6.2 What the gate states it CANNOT evaluate (printed every run)

> **SCENARIO COVERAGE: 3 of review §6's 7 verifications are EXECUTED** (authored protected ·
> system-produced clearable · a report naming which and why); **4 are NOT EVALUATED** for want
> of substrate. **This gate does NOT claim the scenario passes.**

| not evaluated | why (gate's own words) | closed by |
|---|---|---|
| authored **wall** byte-intact after regeneration | *"no wall carries provenance — every `origin:` in `packages/schemas/src/elements/Wall.ts` is a geometric Vec3, so an authored wall is INDISTINGUISHABLE from a generated one at HEAD"* | roadmap Phase 8 — a `ValueProvenance` field on element schemas (C75 §3 ratchet) |
| authored **opening** byte-intact · generated opening revalidated | *"doors and windows carry no provenance either, and there is no regeneration pass over openings to run"* | Phase 8 field + a `*.regenerate` verb |
| generated wall **UPDATED** (not merely left alone) | *"there is no regeneration verb to run — the house/apartment generators are UI controllers, not bus verbs, so no command can be dispatched and read back"* | a `*.regenerate` bus verb consuming the ConsequencePlan |
| AI-proposed element still marked INFERRED afterwards | *"no AI-proposed element persists an origin. `ai.floorplan.generate` stamps nothing on what it creates, and R7 already measured that no production call site builds a `CommandExecutionContext` at all"* | Phase 8 field + ADR-0324 envelope wiring |

`RoomBoundary.detectionMethod` is the repo's **only** element-grain provenance signal — which
is exactly why the three executable arms are all about rooms, and why walls, openings and
AI-proposed elements have no subject to test.

The index itself is at `apps/editor/src/engine/provenance/ElementProvenanceIndex.ts`. It
**cannot mint `'authored'` from `metadata.createdBy`** — `systemProvenance`'s type makes that
unrepresentable (per `b0ca0c27`).

One generation-aware guard does exist: `ViewDependencyTracker.beginGenerationHold()` /
`endGenerationHold()` (`packages/core-app-model/src/views/ViewDependencyTracker.ts:521,540`),
and `apps/editor/src/ui/generation/buildingGenerationLifecycle.ts:97` coordinates
`BimManager`, `WallOccupancyStore.canPlace` and `RoomFinishSyncService` across a generation.
It protects *views and placement*, not *authored elements*.

---

## §7 — MOVE-TIME INVALIDATION: no arm, no contract, no measurement

> Promoted to a top-level section in revision 1 at the coordinator's direction. It was a
> bullet in a blind-spot list; **moves are the dominant edit in the product**, so the absence
> deserves to be named as a section, not buried as a caveat. Phase 0 is where an absence gets
> named; Phase 1's contract has to state what move-time invalidation MEANS per relationship.

### 7.1 The absence, stated precisely

`tools/ga-gate/check-graph-write-coverage.ts` prints, on **every** run, under
*"WHAT THIS RUN CANNOT SEE (C71 §6.2 — printed so silence is never read as coverage)"*:

> **move-time invalidation (C71 §1.2 semantic 5) — NO ARM. UNPROVEN for every family.**

This is the gate being honest about its own scope, not a defect in the gate. But it means:

- **All 26 declared relationship types are UNPROVEN under move.** Not "failing" — *unmeasured*.
  The four obligations the matrix in §2.1 does measure are **writer / reader / rebuild /
  delete**. Move is a fifth semantic (C71 §1.2 semantic 5) and has no column.
- The matrix's `rebuilt` / `REGENERATED` dispositions describe what happens on **load** and on
  **delete**, and say nothing about what happens when an element's *geometry changes in place*.
- A relationship can therefore score `●` on all four measured arms and still be completely
  stale after a wall move.

### 7.2 Why this is the highest-leverage gap in Phase 0

Delete is rare and load is idempotent. **Move is constant** — dragging a wall is the core
interaction of the product. Yet:

| what moves | what follows it | what does not |
|---|---|---|
| wall | doors, windows (`DoorDependencyTracker.ts:99`, `WindowDependencyTracker.ts:42`), slab sketches with `hostId` (`SlabDependencyTracker.ts:107`), room topology (`RoomTopologyObserver.ts:277`), snap indexes, `joinedTo` | **ceiling, stair, roof, floor-finish boundary, column, beam, furniture, lighting, plumbing** (§4.3 — zero subscribers) |
| slab | floor-finish elevation (`FloorSlabBindingHandler.ts:65`) | **stair void carve** — reconciled only inside stair commands (`StairSlabOpeningReconciler.ts:176`), never by an observer |
| room | finish colours (`RoomFinishSyncService.ts:77`) | **floor/ceiling boundary** (resolved once at create), **lighting `roomId`** |
| level elevation | floor finishes only | **14 of 15 families** (§4.2) |

The bespoke trackers that *do* handle move are the well-wired minority, and each implements
its own detector — e.g. `DoorDependencyTracker._wallGeometryChanged`
(`packages/geometry-door/src/DoorDependencyTracker.ts:112-120`) compares `height`, `thickness`
and both `baseLine` endpoints. **That predicate is duplicated per family and shared by
nothing**, so "what counts as a move worth reacting to" has no single definition either.

### 7.3 What Phase 1's contract has to decide

1. **Is move a distinct lifecycle semantic, or is it "delete + create"?** The trackers treat it
   as distinct (they `touch()` rather than re-create). The graph has no opinion.
2. **Per relationship type, what does A-moved imply for B?** Four candidate answers, and every
   one of the 26 types needs to be assigned one: *(i)* B's geometry re-derives, *(ii)* B's
   relationship is re-evaluated and may break, *(iii)* B is unaffected by construction,
   *(iv)* **UNDETERMINED with a typed reason.**
3. **What is the shared move predicate?** Until one exists, each family's idea of "changed
   enough to matter" is private and untestable.
4. **What is the gate arm?** The other four obligations each have one. Move needs a subject
   before it can have a ratchet — the same shape as R8's *"4 of 7 verifications have NO
   SUBJECT"* problem in §6.2.

Until (2) is answered for every type, the governing rule — *every relationship either
participates in the full safe-mode lifecycle or returns UNDETERMINED with a typed reason* —
**cannot be satisfied for the most common edit in the product**, because the lifecycle does not
yet have a move phase to participate in.

---

## §8 — The three relationships most likely to cause silent divergence in normal editing

Ranked by (frequency of the triggering edit) × (invisibility of the divergence).

### 1. Level elevation → 14 of 15 element families (§4.2)

Changing a level elevation is a routine, single-click edit. Exactly one listener exists in the
whole tree. Everything except floor finishes keeps its old world-Y until an unrelated rebuild
happens to touch it — so the model is wrong in the Z axis, and *nothing anywhere reports it*.
The semantics are undefined, not merely unimplemented (`ChatCommandClassification.ts:153`), so
there is not even a target behaviour to test against.

- Emitter `packages/command-registry/src/levels/UpdateLevelCommand.ts:88,110`
- Sole listener `packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:45`

### 2. Wall moved → ceiling / stair / roof / floor-finish boundary (§4.1, §4.3)

Moving a wall is *the* most common edit in the product. Doors, windows, slabs-with-sketch and
room topology all follow. Ceiling, stair, roof and the floor-finish boundary do **not** — they
have zero `wallStore.subscribe` sites, and the field that would carry the relationship
(`boundingWallIds`) is **hardcoded `[]` at creation**. The result is a finish or ceiling
floating over open space with a stale polygon, and a roof-by-region surface that no longer
matches the walls it was traced from.

- `packages/command-registry/src/floors/CreateFloorCommand.ts:231`
- `packages/command-registry/src/ceilings/CreateCeilingCommand.ts:191`
- Roof region path retains no host reference, and *structurally cannot*:
  `packages/geometry-roof/src/WallRegionDetector.ts:44,193` (§5.1)

### 3. `sitsOn` — 18 writers, ZERO typed readers (§2.1)

The single most-written REQUIRED family in the graph, across every element kind, and **nothing
typed ever reads it**. `initDependencyCascade.ts:59` appears to consume it but filters a
*scheduler task*, not the graph edge. Structural support is therefore recorded on every
create and consulted by nobody: delete or move the supporting element and the supported one
neither rebuilds nor complains. This is the row ADR-0320 was written about, and it is
ledgered by name in `check-graph-write-coverage` until dependency scheduling reads the edge it
is handed.

*Runner-up, and arguably #1 for data integrity rather than geometry:* the generator clear
pattern (§6) destroys human-authored rooms — but it fires on an explicit "generate" action, so
it is not *normal editing*. It is, however, the only defect on this page that has been
**EXECUTED-PROVEN** rather than measured structurally, and — per §6.1 — the refusal that would
prevent it **already exists and already works**; it is simply not on the live path.

*And the systemic one:* all three above are instances of §7 — move-time invalidation having no
contract, no arm, and no measurement for any family.

---

## §9 — OPEN QUESTIONS

1. **Move-time invalidation has no gate arm at all** — now §7, promoted to its own section.
   The four questions Phase 1 must answer are enumerated at §7.3; the headline is that all 26
   declared types are UNPROVEN for the single most common edit in the product, and there is no
   shared definition of what "moved enough to matter" even means.
2. **What are level re-stack semantics?** Undefined at HEAD
   (`ChatCommandClassification.ts:153`). Until answered, §7 #1 cannot be fixed — only patched
   per-family. Does re-elevating a level move its elements, or does it redefine the datum they
   are measured from?
3. **Should `boundingWallIds` be populated, or deleted?** It is hardcoded `[]` on two element
   types and read for rooms only. A field that names a dependency and is structurally always
   empty is worse than no field — it makes "no bounding walls" and "we never computed them"
   the same value. Populate (and index) or remove under C72 §2.1 wire-or-delete.
4. **RESOLVED TO A SCOPE (revision 1) — roof-by-region is not a one-line fix.** Roof uses a
   *separate* tracer (`packages/geometry-roof/src/WallRegionDetector.ts:44`) whose signature
   returns bare coordinates and discards wall identity at `:193`;
   `traceRegionSketchAtPoint` has exactly one caller tree-wide and it is the slab plan handler
   (§5.1). The remaining question is a **choice**: port roof onto `SlabRegionTracer` (the
   ADR-0306 "fix once, import everywhere" precedent, which would also inherit the curved-wall
   pre-trim fixes roof lacks), or thread an id channel through `WallRegionDetector` and its two
   callers. Which?
5. **`contains` and `partOf` have no live writer.** `contains` has two readers asking a
   question nobody answers — including a dead IFC arm (`IfcImporter.ts:100` declares it;
   `:491` takes the `adjacentTo|boundedBy` ternary at `:490`). Who writes them, and when?
6. **Why can only ONE index refuse?** `DependencyResolver.getAffected` returns
   `determined | cannot-determine`. Every other index (§3) collapses "nothing depends on this"
   into "I have no entry". Should the `AffectedSet` shape be lifted to a shared contract every
   tracker implements?
7. **19 of 26 relationship types are record-only** (§3.1). Is that the intent, or is
   `RELATIONSHIP_PRIORITY` (`DependencyResolver.ts:97-134`) parking families by omission
   rather than by decision? Priority 5 and "PARKED in C71 §2.2" are not the same set —
   `connectedByStair`/`connectedByLift`/`decidedBy`/`measuredAt` are priority-5 *and*
   UNCLASSIFIED.
8. **NARROWED (revision 1) — the refusal exists; the wiring does not.**
   `planRegenerationClear` refuses over an authored element, names it, and carries both counts
   (§6.1 arm c, EXECUTED). The live §GRAPH-CLEAR-FIRST path does not call it (§6.1 arm b).
   So the question is not "should regeneration be refusable" — it demonstrably already can be
   — but: **should regeneration become a bus verb family** (making the existing refusal
   reachable, undoable and gate-able), **or should the seven UI executors each call
   `planRegenerationClear` directly?** The former also unblocks 3 of the 4 NOT-EVALUATED
   verifications in §6.2, which fail for want of a verb to dispatch.
9. **`hostedBy` / `sitsOn` are write-only; `connectedByStair` / `connectedByLift` / `decidedBy`
   are write-only.** Five families are written on every relevant creation and read by nothing.
   Under C72 §2.1 wire-or-delete, each needs a reader or a deletion — which?
10. **41 cascade-purge (d2) sites, 0 type-aware (d1) deletes** for nine of the ten REQUIRED
    families. Is blanket purge-on-delete sufficient, or does the universal contract need
    per-type delete semantics?
