# SPIKE — Balcony feature for generated apartments / houses (2026-06-23)

**Status:** Spike (investigation + staged design). No production code changed.
**Author:** research agent. **Scope:** balconies on LIVING and DINING rooms of
generated apartments/houses.

> TL;DR — A balcony does **not** need a new schema element. It is a *composition*
> of three primitives that already exist and are already dispatched by both
> generators: a cantilevered **slab** (`CreateSlabCommand`), a **handrail/guard**
> on the 3 outer edges (`CreateHandrailCommand` — already used for stairwell-void
> guards), and a **glazed door/opening** to the room (the same
> `wall.createOpening` + door/window path the engine already runs). The engine
> already knows which rooms are living/dining, and already computes the exact
> per-room external-wall segment geometry (the window-emission `ExternalWallSegment`).
> `RoomType` already includes `'balcony'` and `programRules` already has a full
> `balcony` rule. The smallest first slice is a **post-pass in `HouseLayoutExecutor`**
> that, for each living/dining room with an external wall, drops one cantilever
> slab + 3-edge guard + a sliding-door opening — no engine or schema change at all.

---

## (A) Existing-primitives inventory

### A.1 Handrail / guardrail — FULLY BUILT (tool, command, schema, kernel producer)

- **Schema (`HandrailData`)** — `packages/core-app-model/src/stores/HandrailTypes.ts:21`
  (`interface HandrailData extends CoreElement`). Store at
  `packages/core-app-model/src/stores/HandrailStore.ts:56`.
- **Command** — `packages/command-registry/src/handrails/CreateHandrailCommand.ts:5`.
  Payload: `{ id, start:{x,z}, end:{x,z}, height, thickness, levelId?, baseOffset?,
  fillType?, railProfile?, railDiameter?, postSpacing?, materialColor? }`
  (`CreateHandrailCommand.ts:13-28`). `canExecute` enforces length ≥ 0.1 m and
  height 0.3–2.5 m (`:38-42`). IFC predefined-type is `GUARDRAIL` when
  `fillType ∈ {glass,panel}`, else `HANDRAIL` (`:57`). Also `Update`/`Delete`
  variants in the same folder.
- **Tool** — `packages/geometry-stair/src/HandrailTool.ts:11` (two-click polyline,
  ghost preview). Dispatches `CreateHandrailCommand` at `:143-159`.
- **Kernel producer** — `packages/geometry-kernel/src/producers/handrail.ts`
  (`produceHandrail(dto, joinData, worldY)`; profile extruded along the path;
  material slot `rail` — per `plugins/handrail/README.md:43-46`).
- **Plugin bus handlers** — `plugins/handrail/src/handlers/` (`handrail.create`,
  `.delete`, `.setPath`, `.setShape`, `.setHost`, `.recompute`; see
  `plugins/handrail/README.md:22-34`).
- **Stair railing** — `packages/geometry-stair/src/StairRailingBuilder.ts` and
  `plugins/stair/src/handlers/CreateStairRailing.ts` (a separate stair-bound rail).

**Already used in a generator the balcony can copy verbatim:** the stairwell-void
guard rails 3 of a void's 4 edges (leaving the step-off side open) using
`CreateHandrailCommand` — `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:2660-2678`
(`_railVoidGuardrail`). A balcony guard is the *same* shape: rail the 3 outer
edges, leave the room-facing edge open.

### A.2 Slab (cantilever floor) — FULLY BUILT, polygon-capable

- **Command** — `packages/command-registry/src/slabs/CreateSlabCommand.ts:30`.
  Payload (`CreateSlabPayload`, `:6-29`): `{ id, ifcGuid?, width, depth, thickness,
  position:{x,y,z}, levelId, polygon?:{x,y}[], holes?, sketch? }`. `position.y`
  is stored as 0; world Y is resolved from `level.elevation` at projection
  (`:117-119`). A `polygon` (WORLD-XZ as `{x: world.x, y: world.z}`) makes it an
  arbitrary footprint — exactly what a cantilever rectangle needs.
- **Already dispatched by both generators**:
  - House structural slab: `HouseLayoutExecutor.ts:2362` (`new CreateSlabCommand({…
    polygon: poly.map(p => ({x: p.x, y: p.z}))…})`); thickness const
    `DEFAULT_SLAB_THICKNESS_M = 0.2` (`:98`).
  - Residential floor slab: `ResidentialBuildingExecutor.ts:583`.
- Slab geometry/ceiling/floor builders live under `packages/geometry-slab/src/`
  (`SlabFragmentBuilder.ts`, `floor/`, `ceiling/`).

### A.3 Door / opening to the room — FULLY BUILT (the engine's window/door path)

- The engine turns layout output into commands in
  `packages/ai-host/src/workflows/apartmentLayout/executePlan.ts` —
  `buildLayoutCommands` (`:480+`) produces a `LayoutCommandSet`
  (`:483-540`) with `wall.createOpening` per door/window and `door.batch.create` /
  `window.batch.create`. The "glazed sliding door to the balcony" is just a
  wide, low-sill opening — the living room **already** emits a full-height glazed
  patio/sliding opening (`windowEmission/types.ts:35-46` "living = full-height
  glazed SLIDING/PATIO door, sill 10 mm"; `emitWindows.ts:635` §WINDOW-LIVING-PATIO).
  So the *opening* primitive a balcony needs is already produced for living/dining
  external walls today — the balcony slab just lands on the far side of it.

### A.4 `balcony` is already a first-class RoomType + program rule

- **RoomType union** includes `'balcony'` — `packages/ai-host/src/workflows/apartmentLayout/types.ts:23,29`.
- **Full program rule** — `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts:699-714`:
  `type:'balcony', privacy:'public', frontage:'none', minAreaM2:2.0,
  minShortSideM:1.4, needsWindow:false, accessFrom:['living','dining','kitchen','master','bedroom'],
  maxDoors:1, adjacencyPreference:{living:1.0, master:0.8, bedroom:0.8, dining:0.7,
  kitchen:0.4}`. Door width: `programRules.ts:1030` (`balcony: MIN_DOOR_WIDTH_GENERAL_M`).
  The validators already **skip** a balcony for frontage/lighting (frontage 'none',
  comment `programRules.ts:697-698`).

**Conclusion:** every primitive exists. There is **no missing element** — only a
*composition + emission* gap. Nothing is rendered today because no generator emits
the balcony slab/guard, and the engine never mints a balcony room.

---

## (B) Where living/dining + façade geometry is available

### B.1 Room type is known throughout the engine

- `LayoutRoom` (`types.ts:32-58`) carries `type: RoomType`, `name`, `area`,
  `centroid?`, `polygon?` (plan mm), `occupancy?`. Living/dining are
  `type === 'living'` / `'dining'`.
- In `wallsAndDoors.ts` / `emitGeometry.ts`, the semantic graph nodes carry the
  space type and `attrs.isExternal` per wall.

### B.2 The per-room external-wall segment — the SAME data a balcony needs

- `emitGeometry.ts:100-104` builds `externalWalls = Set(allWallNodes.filter(n =>
  n.attrs.isExternal === true))` and `frontsFacade` = the spaces bounding them
  (via `BOUNDS` edges).
- `emitGeometry.ts:175-188` builds **`externalWallsBySpace: Map<spaceGuid,
  ExternalWallSegment[]>`** — for each room, the list of external wall segments it
  fronts.
- **`ExternalWallSegment`** — `windowEmission/types.ts:157-165`:
  `{ start: Vec2mm, end: Vec2mm, wallIndex }` (plan mm). This is precisely the
  façade edge a balcony cantilevers off: `start`→`end` gives the wall line and
  length; the outward normal (perpendicular, pointing away from the room
  centroid) gives the cantilever direction.
- Window emission per room: `emitGeometry.ts:279+` builds
  `windows: LayoutWindow[]` (`types.ts:80-89`: `{wallRef, offset, width, height,
  sillHeight, roomType?}`) via `emitWindowsForRoom` (`windowEmission/emitWindows.ts`).
  The balcony's door/opening can reuse the very window/opening the living room
  already gets on that wall (turn the living patio opening into the balcony access),
  or emit a dedicated sliding-door opening at the same `wallRef`.

### B.3 The engine result the executors consume

- `LayoutOption` (`types.ts:94-130`): `rooms`, `walls`, `doors`, `windows?`,
  `boundaries?`, `perimeterWindowRooms?`. A balcony could be surfaced either as a
  new `LayoutOption.balconies?` array (engine-decided) **or** discovered
  executor-side from `rooms` + the shell polygon (no engine change — see the
  smallest slice).

---

## (C) House vs residential building executors + where a balcony hooks in

### C.1 HouseLayoutExecutor

- `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts` runs per storey:
  builds shell walls, runs the pure engine, then dispatches in order (comment
  `:1162-1169`): **walls → slabs → stairs (punch slab void) → roof**; openings
  ride a later pass. It already calls `CreateSlabCommand` (`:2362`) and
  `CreateHandrailCommand` (`:2664`).
- The shell polygon (`shell.perimeter`) and per-room polygons are available
  (`set.roomCommands` carry room polygons in metres, executor comment `:44`).
- **Hook point:** a new `_createBalconies(cm, storey, rooms, shellPolyWorld)`
  post-pass, called **after** the slab + openings pass (so the access opening
  already exists on the façade wall, and the storey slab is down). It mirrors
  `_railVoidGuardrail` (`:2660`) for the guard and `_createSlab` (`~:2355`) for
  the floor.

### C.2 ResidentialBuildingExecutor

- `apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts` builds
  the building shell + per-floor slab (`:583`) and runs the **same**
  `buildLayoutCommands` per apartment (`:270`). Balconies here are per-apartment;
  the executor already iterates apartments, so the same balcony post-pass slots in
  after each apartment build. **Caveat:** stacked apartments → stacked balconies;
  balcony depth must not overhang the plot/parcel — defer to a later slice (start
  house-only).

---

## (D) Proposed design + staged plan

### D.1 Data model decision — **composition, not a new schema element**

A balcony = (1) one cantilever **slab** with a small footprint polygon offset
outward from the façade wall, (2) a **handrail** with `fillType:'glass'|'panel'`
(→ IFC `GUARDRAIL`) on the 3 outer edges, (3) the **glazed access opening** to the
room (reuse/emit a sliding-door opening on the façade wall). Optionally mint a
`balcony` **room** so it appears in schedules and the graph (the RoomType + rule
already exist). This keeps **P5 schema purity** intact (no new schema), and reuses
three command verbs already on the bus. (If product later wants a single
selectable "Balcony" element with its own properties panel, promote it to a
composite element then — but not for the spike's first slice.)

### D.2 Geometry (per balcony)

Given a façade `ExternalWallSegment` (`start`,`end` plan mm) of a living/dining
room and the room centroid:
- `dir = normalize(end - start)`; `outward = perpendicular(dir)` chosen so it
  points **away** from the room centroid (use the shell polygon / centroid test
  already present at `HouseLayoutExecutor.ts:505-512` `inPoly`).
- Balcony **width** = clamp(segment length, BALCONY_MIN_WIDTH≈2.5 m, segment
  length) centred on the access opening; **depth** = `BALCONY_DEPTH ≈ 1.4 m`
  cantilever (rule `minShortSideM:1.4`, `programRules.ts:703`).
- Slab footprint polygon (WORLD-XZ): the 4 corners = the two wall-face points ±
  `outward*depth`. `thickness = DEFAULT_SLAB_THICKNESS_M` (0.2 m); place on the
  storey level so Y resolves from `level.elevation`.
- Guard: 3 edges (the outer U — the two side edges + the far edge), leaving the
  wall-facing edge open; `height ≈ 1.1 m`, `fillType:'glass'`, `railProfile:
  'rectangular'`. Reuse `_railVoidGuardrail`'s 3-of-4 logic (`:2660`) but pick the
  OPEN edge as the one **nearest** the façade wall (not the step-off heuristic).

### D.3 Where the engine decides placement (later slice)

Engine-side (preferred long-term): in `emitGeometry.ts`, for each
`living`/`dining` space with `externalWallsBySpace` non-empty and a façade segment
≥ `BALCONY_MIN_FRONTAGE` (≈ 2.5 m), emit a `LayoutBalcony` onto a new
`LayoutOption.balconies?` array `{ roomName, wallRef, offset, width, depth }`.
Gate on `programRules` `balcony.minAreaM2` and existing window/door occupancy on
that wall (`OccupiedSpan`, `windowEmission/types.ts:172-178`) so the balcony lines
up with the patio opening. Then `buildLayoutCommands` (`executePlan.ts:480`) grows
a `balconyCommands` field that the executors dispatch.

### D.4 The smallest first slice (renders a visible balcony — **house only,
executor-only, zero engine/schema change**)

1. Add `_createBalconies(cm, storey, …)` to `HouseLayoutExecutor`, called after
   the slab + openings pass (after `:2362`/openings).
2. From the engine output already in hand, find rooms with `type ∈ {living,
   dining}` that touch the shell perimeter; pick their longest external wall
   segment (derive from the room polygon ∩ shell polygon, or read
   `set.roomCommands` polygons + `shell.perimeter`).
3. Compute the cantilever rectangle (D.2) and dispatch:
   - one `CreateSlabCommand` (polygon footprint, thickness 0.2 m) — copy
     `:2362` call shape.
   - three `CreateHandrailCommand` (glass guard, 1.1 m) — copy `:2664` call
     shape; leave the wall-facing edge open.
   - (opening) ensure a sliding/French opening exists on that wall — the living
     room already emits a patio opening (`emitWindows.ts:635`); for the first
     slice it's acceptable to land the balcony on the existing opening and skip
     emitting a new door.
4. Source tag the commands (e.g. `HOUSE_PIPELINE_BALCONY`) like the existing
   `HOUSE_PIPELINE_SLAB` / `HOUSE_PIPELINE_VOID_GUARD` tags, and run inside the
   same batch so it is one undo.

This yields a visible cantilever floor + glass guard off the living/dining room
with no schema work, no engine work, and no new bus verb — purely reusing
`CreateSlabCommand` + `CreateHandrailCommand` already proven in this executor.

### D.5 Follow-on slices

- S2: mint a `balcony` room (RoomType exists) so it appears in schedules/graph.
- S3: emit a **dedicated** glazed sliding door opening on the façade wall (not
  just reuse the patio window) — extend the door path in `executePlan.ts`.
- S4: move placement into the engine (`emitGeometry.ts` →
  `LayoutOption.balconies` → `buildLayoutCommands.balconyCommands`) so the
  residential-building path and AI/D-TGL path get balconies for free.
- S5: residential-building / stacked-balcony + parcel-overhang guard.
- S6: optional single composite "Balcony" element + properties panel + manual tool.

---

## Risks + open questions

1. **Structural slab direction / cantilever.** `CreateSlabCommand` stores
   `position.y = 0` and resolves world Y from `level.elevation` at projection
   (`CreateSlabCommand.ts:117-119`). A balcony floor must sit at the **room floor
   level**, flush with (or just below) the interior slab top — confirm the
   cantilever slab's top aligns with the finished floor, and that it does **not**
   collide with the façade wall body (offset the inner edge to the wall's outer
   face, not its centreline). The outward-normal sign must be derived per room
   (centroid test) — getting it backwards puts the balcony *inside* the building.
2. **Door vs sliding door to balcony.** First slice reuses the living patio
   opening; that opening's sill (10 mm, `windowEmission/types.ts:35-41`) reads as a
   glazed wall, which is right for a balcony, but it is classified as a *window*,
   not a door (no threshold semantics). A proper balcony wants a **door** element
   (egress, IFC `IfcDoor`) — slice S3. Watch `programRules` `balcony.maxDoors:1`
   and `MIN_DOOR_WIDTH_GENERAL_M` (`:1030`).
3. **P5 — schema purity.** The composition approach adds **no** schema, so P5 is
   untouched. If S6 promotes a composite Balcony element, the new schema must stay
   pure (no THREE/DOM/I-O) in `packages/schemas/`.
4. **P2 — THREE ownership.** No new THREE usage: the executor dispatches commands
   only (the handrail/slab kernel producers in `geometry-kernel`/`geometry-slab`
   already own their geometry; `import * as THREE` stays inside
   `renderer-three`). The spike must NOT add THREE to the executor.
5. **P6/P8 — command path + spans.** All emission goes through `CommandManager`
   commands (P6 ✓). If a new bus verb (`balcony.batch.create`) is introduced in a
   later slice, every new exported function needs ≥1 OpenTelemetry span (P8).
6. **Engine vs executor split.** Executor-side placement (first slice) duplicates
   geometry logic that the engine could own; acceptable for a spike, but S4 should
   migrate it to `emitGeometry.ts` to keep one source of truth and to give the
   residential + AI/D-TGL paths balconies without re-implementation.
7. **Open question — which rooms by default.** Brief says living + dining; the
   `balcony` rule's `adjacencyPreference` also rates master/bedroom highly. Start
   living/dining only; gate the rest behind a flag.
8. **Open question — frontage/overhang.** Minimum façade frontage (~2.5 m) and, for
   residential, plot/parcel overhang limits (the balcony must not cross the parcel
   boundary — site data exists via C19 SiteModelStore). Defer to S5.
