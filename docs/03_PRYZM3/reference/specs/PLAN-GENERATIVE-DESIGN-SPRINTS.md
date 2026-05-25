# PLAN — Generative Design: parallel sprints (layout quality · performance · furniture)

| Field | Value |
|---|---|
| Status | **Planning / analysis (no implementation in this doc).** Roadmap for four parallel workstreams off the shipped D-TGL apartment generator. |
| Date | 2026-05-25 |
| Owner | Computational design / BIM3.0 architecture |
| Companion specs | SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (rooms), **SPEC-FURNITURE-LAYOUT-ENGINE** (furniture, new), SPEC-APARTMENT-LAYOUT-GENERATOR (consumer) |
| Source of analysis | three deep code reviews (furniture infra, room-analysis infra, performance) — file refs inline |

> Four workstreams, **parallelisable** because they touch mostly disjoint packages.
> **WS-1 Stabilisation** (current bugs) and **WS-2 Performance** are independent and can
> run immediately. **WS-3 Layout quality (P3c)** and **WS-4 Furniture** both depend on
> rooms being correctly classified (WS-1.B), so that small fix gates the two big sprints.

---

## §0 — Dependency & parallelisation map

```
WS-1 Stabilisation ─┬─ 1.A doors-in-the-build          (independent)        ─┐
                    ├─ 1.B room classification + names  (GATES WS-3, WS-4)   │ run now
                    └─ 1.C wall-joint black geometry    (independent, pre-existing)
WS-2 Performance  ──── 2.A dedupe redetect → 2.B interactive batch → 2.C incremental projection   (independent track, run now)
WS-3 Layout (P3c) ──── needs 1.B ───────────────────────────────────────────  (big sprint)
WS-4 Furniture    ──── needs 1.B (+ optional 1.A doors for circulation checks) (big sprint, own SPEC)
```

Disjoint package ownership keeps them parallel:
- WS-1.A/1.B: `ai-host/apartmentLayout`, `apps/editor/.../apartment-layout`.
- WS-1.C: `geometry-wall` (WallJoinResolver) — **separate team-safe**.
- WS-2: `room-topology`, `core-app-model/views`, `apps/editor/engine`.
- WS-3: `ai-host/apartmentLayout/tgl`.
- WS-4: new `geometry-furniture/layout` + `apps/editor` executor.

---

## §1 — WS-1 · Stabilisation (current observed issues)

### 1.A — "I don't see doors being placed"
**Status of the engine:** door **data** is correct — the engine now reconciles doors so
every room is reachable (`tglWallsAndDoors.test.ts` reachability test passes; the real
`RoomDetectionEngine` integration detects 6/8 rooms with doors connecting them). So the
gap is in the **build/visualisation**, not the layout. Ranked root-cause hypotheses
(needs ONE generator-run console log to confirm — the logs supplied so far are *manual*
wall drawing, not a generator run):

1. **Opening rejected by occupancy/fit.** `wall.createOpening.canExecute`
   (`plugins/wall/src/handlers/CreateWallOpening.ts:56-101`) rejects if the host wall
   isn't in the store, the id duplicates, or `wallOccupancyStore.canPlace` fails (door
   doesn't fit the wall length minus existing openings). A reconciliation door on a
   *short* interior partition (e.g. a bathroom 1.0 m wall) can fail the 0.9 m fit. →
   **Fix:** in the executor, make door/opening failures **loud + counted** (today they're
   swallowed by best-effort `.catch`), and in P4 prefer the *longest* shared wall for the
   reconciliation door (already prefers circulation; add length as the primary key for
   the chosen wall, and shrink the door to fit ≥0.7 m on very short walls).
2. **Opening created but void not visible.** If `wall.createOpening` succeeds but the door
   leaf renders inside an un-voided wall, the door looks "missing". Confirm the C15
   cascade (`opening.elementId === doorId`) actually voids the host (it does in
   `buildLayoutCommands`; verify the wall rebuild cuts the void).
3. **Async-ordering (low probability in the editor).** `CommandBus.executeCommand` is
   `async` (`packages/command-bus/src/CommandBus.ts:251`, `await handler.execute` at :276),
   but the editor's live path is the **synchronous** `CommandManagerImpl` (logs:
   `EXECUTE: CREATE_WALL … elapsed=0.2ms`), and `runBatch` writes store DATA synchronously
   (events buffered) — so the wall→opening→door order within the batch holds. Keep as a
   watch-item; if confirmed, await the dispatches sequentially.

**Deliverables:** loud opening/door telemetry in `ApartmentLayoutExecutor`; P4 door-wall
choice by length; door width auto-shrink to fit; a happy-dom build test asserting
openings+doors survive `buildLayoutCommands` → (mock) opening/door stores.

### 1.B — Rooms without a use-related name (GATES WS-3 & WS-4)
**Two sub-causes:**
1. **Name applies only on the generator path.** `ApartmentLayoutExecutor._nameDetectedRooms`
   matches detected rooms to D-TGL footprints by centroid and dispatches `room.rename`.
   Manually-drawn rooms (the supplied logs) get no name — expected. Confirm the rename
   actually fires on a generator run (telemetry: it logs `named N room(s)`).
2. **Occupancy/type is NOT applied — only the display name.** Research confirms detected
   rooms come out `occupancyType:'unclassified'` (`RoomDetectionEngine.ts:368`), and there
   is **no code applying the D-TGL room TYPE** to the detected room. The plugin store field
   is `occupancy` (`plugins/rooms/src/handlers/SetRoomOccupancy.ts:53`) while `RoomData`
   reads `occupancyType` (`RoomTypes.ts:244`) — a **field-name mismatch** to reconcile.
   → **Fix (the gating one):** in `_nameDetectedRooms`, also dispatch `room.setOccupancy`
   (or the correct verb) with the D-TGL `LayoutRoom.type`, and reconcile the `occupancy`
   vs `occupancyType` field so the type round-trips. This makes rooms *named by use* AND
   gives WS-3/WS-4 the room type they need.
   Fallback for hand-drawn rooms: `RoomTypeInferenceEngine.inferType` (rule-based).

**Deliverables:** type applied post-build (named + typed); field-name reconciliation;
test that a generated 2-bed yields rooms named "Living Room / Master Bedroom / …" with
matching `occupancyType`.

### 1.C — Wall-joint black overlapping geometry (L/T/X) — pre-existing
The dark wedge in the image is the **WallJoinResolver / WallJunctionInfill** producing
overlapping or inverted-normal geometry at junctions (a pre-existing geometry-wall issue,
**not** introduced by the generator — the user confirmed). Likely causes: miter/infill
quads with flipped winding (back-faces read black under the lighting) or z-fighting from
double-covered corner area. **Owner:** `packages/geometry-wall/` (`WallJoinResolver.ts`,
`WallJunctionInfill.ts`, `WallJunctionInfillManager.ts`, `WallFragmentBuilder.ts`).
**Plan:** isolate with a 2-wall L and a 3-wall T fixture; inspect the infill mesh winding
+ normals; dedupe overlapping corner coverage; ensure `toCreasedNormals`/material is
double-side-safe. Tracked as its own task — independent of generative design.

---

## §2 — WS-2 · Performance (the redetect / reprojection storm)

**Root cause (verified):** each manual `wall.create` triggers **two** `REDETECT_ROOMS` +
a full plan re-projection. `RoomTopologyObserver` has two redetect triggers — a direct
150 ms-debounced WallStore subscription (`RoomTopologyObserver.ts:76`) **and** the
immediate `bim-wall-mutation-committed` handler (`:120`/`:127`) — with no re-entrancy
guard, so the WallJoinResolver's per-neighbour `store.update` storm re-arms the timer
("forced fire, resets=12"). Reprojection is a **third**, separate 300 ms debouncer
(`ViewDependencyTracker.ts:47`) that re-walks ALL native groups per flush (cache
hitRate=0% while drawing because re-trimmed neighbours bump their version).
`runBatch` already coalesces all of this (so the **generated-layout build is fast**); only
**non-batched manual editing** pays the storm.

| Step | Fix | Files | Risk | Win |
|---|---|---|---|---|
| **2.A** (quick) | Dedupe wall redetect: drive redetect from the committed event only; add a `_joinsResolving` guard so resolver `update`s don't re-arm the timer | `room-topology/RoomTopologyObserver.ts`, `apps/editor/engine/WallRebuildCoordinator.ts` (expose `isJoinsResolving`) | Low | 2→1 redetect; kills "forced fire" thrash |
| **2.B** (structural) | Interactive coalescing envelope: wrap draw-streaks so redetect + reprojection run ONCE at idle, reusing `BatchCoordinator` suppression with an auto-close idle timer | wall draw tool / dispatch site, `core-app-model/batch/BatchCoordinator.ts` (soft-batch mode) | Med | N×→1× for a drawn run |
| **2.C** (structural) | Unify redetect + reprojection on the FrameScheduler bus (one coalesced, ordered pass) | `RoomTopologyObserver.ts`, `core-app-model/views/ViewDependencyTracker.ts`, `frame-scheduler` | Med | removes uncoordinated timers |
| **2.D** (structural) | Incremental projection: re-export only changed elements + neighbours instead of the whole level | `apps/editor/engine/views/EdgeProjectorService.ts`, `ViewDependencyTracker`, `ViewTechnicalDrawingCache` | High | O(changed) not O(level) — biggest win on large floors |
| **2.E** (small) | Skip idempotent join `store.update`/version-bump when the baseline didn't move | `WallRebuildCoordinator.ts:309`, `geometry-wall/WallStore.ts` | Med | raises cache hit-rate |

**Sequence:** 2.A (immediate, low-risk) → 2.B → (2.C, 2.D, 2.E as a perf hardening sprint).

---

## §3 — WS-3 · Layout quality (P3c adjacency-aware placement)

Today D-TGL squarifies by area; door **reconciliation** guarantees *reachability* but not
the most elegant circulation. P3c makes placement honour the bubble graph.

- **P3c-1 — Slicing-tree placement.** Replace/augment the squarify subdivision with a
  guillotine **slicing tree** keyed to the bubble graph: place the public open zone first,
  carve a corridor band, hang private rooms off the corridor so the *intended* adjacencies
  are realised geometrically (bedrooms strictly off the corridor; ensuite next to master).
  Module: `tgl/sliceTree.ts` feeding `subdivide`. Keeps determinism (fixed split order).
- **P3c-2 — Adjacency-honouring enumeration.** Extend the P8 strategy set with slicing
  orders; score realised-vs-required adjacency (the existing `objectives.adjacency` axis)
  so the Pareto winner maximises honoured bubble edges → fewer reconciliation doors,
  nicer plans.
- **P3c-3 — Proportion guards.** Reject/penalise rooms below min dimension (no 1.2 m-wide
  bedrooms); already partly covered by squarify aspect + `objectives.regularity`.
- **Dependency:** none on other WS (pure `tgl/`); benefits WS-4 (cleaner rooms furnish
  better). **Tests:** every `via:'door'` bubble edge realised on adjacent rooms (not just
  reachable); corridor strictly adjacent to each private room; determinism preserved.

---

## §4 — WS-4 · Furniture layout engine (the big sprint) — see SPEC-FURNITURE-LAYOUT-ENGINE

Full design in **SPEC-FURNITURE-LAYOUT-ENGINE.md** (D-FLE). Summary of the sprint phases
(all reuse existing geometry builders + the `furniture.create` render path — nothing new
to render):

- **F-Sprint-1 — Foundations:** `footprints.ts` (canonical dims table extracted from
  `FurnitureTool.ts:694`), `archetypes.ts` (per-room furniture sets), `collision.ts`
  (rect overlap + point-in-polygon). Pure, unit-tested. *(Parallel-safe; no deps.)*
- **F-Sprint-2 — Room input + wall analysis:** `roomInput.ts` (editor glue assembling
  `FurnishRoomInput` from `RoomData` + wall/door/window stores; promote
  `RoomRelationshipService._openingGeometry` to a public `openingPose` helper),
  `wallAnalysis.ts` (free-wall segments + inward normals via
  `FacadeOrientationMath.outwardNormal`). **Needs WS-1.B** (room type).
- **F-Sprint-3 — Placement solver:** `placeSolver.ts` + `furnishRoom.ts` — against-wall
  anchor, door-swing clearance, window rules, collision, deterministic slide. Bedroom +
  living first (highest value), then kitchen (reuse `buildDefaultKitchenConfig` +
  `KitchenCabinetEngine`), dining (reuse the `createDiningChairs` precedent), bath.
- **F-Sprint-4 — Emission + wiring:** `buildFurnishCommands.ts` (pure, `furniture.create`
  legacy payloads, scalar yaw, `hostedSpaceId`) + `FurnishExecutor` (editor, dispatch in
  `runBatch`, `skipRedetectRooms:true`). Mirror `ApartmentLayoutExecutor` exactly.
- **F-Sprint-5 — Integration + quality:** end-to-end happy-dom test (furnish detected
  rooms → items appear in `furnitureStore`, each inside its room); post-furnish
  `RoomValidationService` + `findAccessiblePath` gate (furniture didn't block circulation);
  optional ranked-arrangement quality pass (deterministic, like D-TGL's Pareto step).

**Reuse map (do NOT rebuild):** geometry builders (origin-built, positioned by
`position`/`rotation`); `buildDefaultKitchenConfig`/`buildDefaultWardrobeCabinetConfig`;
`furniture.create` → `CommandEventBridge:574` → `initTools §FT-FURNITURE:1699`;
`RoomContentsService` (room↔furniture association is automatic by centroid);
`FacadeOrientationMath`; `RoomTypeInferenceEngine` (type fallback). **Emit the LEGACY
`FurnitureData` payload** (the rendered path), not the schema `Furniture` model.

---

## §5 — Recommended execution order

1. **Now, in parallel:** WS-1.A (door telemetry + fit) · WS-1.B (room type+name — *gates
   the big sprints, do early*) · WS-2.A (dedupe redetect — quick perf win) · WS-1.C
   (wall-joint, separate owner).
2. **Then, in parallel:** WS-3 (P3c, nicer layouts) · WS-4 F-Sprint-1/2 (furniture
   foundations + room input) — both unblocked once WS-1.B lands.
3. **Then:** WS-4 F-Sprint-3/4/5 (the furniture placement + wiring + integration) ·
   WS-2.B–E (perf hardening).

**Definition of done per workstream:** pure cores unit-tested + deterministic; editor
wiring mirrors `ApartmentLayoutExecutor` (one `runBatch`, P6 bus-only); contracts/SPECs
updated in place; an end-to-end happy-dom test through the real engine where applicable
(the D-TGL→RoomDetectionEngine pattern).

---

## §6 — Cross-references
SPEC-FURNITURE-LAYOUT-ENGINE (D-FLE), SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (rooms),
SPEC-APARTMENT-LAYOUT-GENERATOR, C09 (AI L7.5), C11 (element creation), C15 (hosted),
C16 (command authoring). Code anchors: `RoomTopologyObserver.ts`, `WallRebuildCoordinator.ts`,
`ViewDependencyTracker.ts`, `EdgeProjectorService.ts`, `RoomContentsService.ts`,
`RoomGraphService.ts` (room min-path), `FacadeOrientationMath.ts`, `geometry-furniture/*`,
`CreateWallOpening.ts`, `apartmentLayout/{executePlan.ts, tgl/*}`.
