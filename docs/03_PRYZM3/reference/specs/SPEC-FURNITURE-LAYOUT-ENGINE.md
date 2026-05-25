# SPEC — Deterministic Furniture Layout Engine (D-FLE) · BIM3.0

| Field | Value |
|---|---|
| Status | **Plan — normative target (not yet implemented).** Deep analysis + design for the automatic room-furnishing engine: beds/bedside tables/wardrobes (bedroom), sofa/coffee-table/TV (living), cabinet run (kitchen), table+chairs (dining), fixtures (bath). The companion to D-TGL (which produces rooms); this furnishes them. |
| Version | 0.1 (2026-05-25) |
| Owner | Computational design / BIM3.0 architecture |
| Governed by | C09 (AI & generative L7.5), C11 (element creation), C15 (hosted), C16 (command authoring), SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (room producer), SPEC-APARTMENT-LAYOUT-GENERATOR (consumer) |
| Hard constraints | **Deterministic** (same rooms → byte-identical furniture), **synchronous in-browser < 1 s for a flat**, **unit-testable / pure core**, **no stochastic placement** (no random jitter, no annealing), reuses existing furniture geometry + the `furniture.create` bus path (no new render path). |

> D-FLE turns **detected rooms** (type + polygon + bounding walls + doors + windows)
> into **placed furniture instances** (type, world position, yaw) via per-room
> *archetype templates* resolved by a deterministic constraint placer (against-wall,
> door-swing clearance, window rules, circulation-keep-clear, collision). The output
> is a flat ordered set of `furniture.create` commands dispatched in one `runBatch`.
> It is the natural Phase-C of the Semantic Design Assistant: **walls → rooms →
> furniture**, all from one program brief, all deterministic and offline-capable.

---

## §1 — Approach & lineage

**Name:** *Deterministic Furniture Layout Engine* (**D-FLE**) — more fully:

> **Archetype-template furnishing with constraint-based against-wall placement and
> clearance/collision resolution over the room's boundary + opening graph.**

**Lineage / basis:**
- **Architectural space-planning heuristics** — furniture archetypes per room type and
  the "anchor against the longest free wall, face the room, keep circulation clear"
  rules every space planner uses (Neufert *Architects' Data*; human dimension /
  clearance tables — Panero & Zelnik *Human Dimension & Interior Space*).
- **Accessibility clearances** — door-swing keep-clear, 0.9 m circulation paths
  (Approved Document M / ADA), reused from the editor's existing `findAccessiblePath`
  (≥0.775 m doors).
- **Constraint placement (deterministic, not stochastic)** — each item is placed by a
  fixed rule (anchor wall → offset by footprint depth → slide to satisfy clearances →
  reject on collision), enumerated over a small fixed set of candidate anchors and
  ranked — the same "fixed enumeration, exact pick" doctrine as D-TGL's Pareto step
  (explicitly **not** simulated annealing / RNG, which interior-AI papers like
  Merrell 2011 use — we keep the deterministic subset).

This is the furniture analogue of D-TGL: templates + constraints + deterministic
selection, producing a semantic + geometric result that is testable and reproducible.

---

## §2 — Phased pipeline (modules, I/O, data contracts)

All pure modules live in **`packages/geometry-furniture/src/layout/` (L2)**, import only
sibling types + `@pryzm/room-topology` types + `@pryzm/schemas` `createId`. **No THREE,
no DOM, no stores, no `plugins/*`** (mirrors `apartmentLayout/executePlan.ts`). Metres,
world XZ. The editor assembles inputs + dispatches (thin L5 executor).

| Phase | Module | Input → Output | Notes |
|---|---|---|---|
| **F1** | `roomInput.ts` (editor-side glue, L5) | `RoomData` + wall/door/window stores → `FurnishRoomInput[]` | assemble polygon + wall segments + openings-with-poses (the gap §B-2) |
| **F2** | `archetypes.ts` | `occupancyType` → `FurnitureArchetype` (ordered item specs + rules) | the design knowledge: what goes in each room |
| **F3** | `footprints.ts` | `FurnitureType` → `Footprint {w,l,h,baseOffset,clearance}` | one canonical dims table (extract from `FurnitureTool.ts:694`) |
| **F4** | `wallAnalysis.ts` | `FurnishRoomInput` → `FreeWallSegment[]` (wall runs minus openings, with inward normal, length, orientation) | "longest free wall", "wall opposite the door" |
| **F5** | `placeSolver.ts` | `FurnishRoomInput` + `FurnitureArchetype` → `PlacedFurniture[]` | the constraint placer (§5) |
| **F6** | `collision.ts` | rectangles → overlap test / circulation-clear test | pure geometry helpers |
| **F7** | `furnishRoom.ts` | `FurnishRoomInput` → `PlacedFurniture[]` (F2→F6 for one room) | per-room entry |
| **F8** | `buildFurnishCommands.ts` | `FurnishRoomInput[]` + `mintId` → `FurnishCommandSet` (`furniture.create` payloads, legacy shape) | the pure emit (mirror `buildLayoutCommands`) |
| **F9** | `apps/editor/.../FurnishExecutor.ts` (L5) | `furniture.furnish-rooms` event → dispatch F8 inside `runBatch` | thin wiring |

### §2.1 — Data contracts

```ts
// F1 — assembled per room (world XZ, metres)
interface OpeningPose { type:'door'|'window'; center:{x;z}; normal:{x;z}; width; wallIndex }
interface FreeWallSegment { a:{x;z}; b:{x;z}; inwardNormal:{x;z}; length; isExterior; openings:OpeningPose[] }
interface FurnishRoomInput {
  roomId; levelId; occupancyType: RoomOccupancyType;
  polygon:{x;z}[]; centroid:{x;z}; boundingBox:{minX;minZ;maxX;maxZ}; areaM2;
  walls: FreeWallSegment[]; doors: OpeningPose[]; windows: OpeningPose[];
  levelElevation; clearHeight;
}
// F2
interface FurnitureItemSpec { furnitureType: FurnitureType; anchor:'wall-longest'|'wall-opposite-door'|'wall-window'|'corner'|'center'|'beside'; facing:'into-room'|'to-wall'; required:boolean; group?:string }
interface FurnitureArchetype { occupancy: RoomOccupancyType; items: FurnitureItemSpec[]; minAreaM2: number }
// F3
interface Footprint { w; l; h; baseOffset; clearFront; clearSides }   // metres
// F5/F8
interface PlacedFurniture { id; furnitureType; position:{x;y;z}; rotationY; footprint:Footprint; hostedSpaceId; furnitureCategory?; kitchenConfig?; wardrobeCabinetConfig? }
interface FurnishCommandSet { commands:{command:'furniture.create'; payload:unknown}[]; levelId; totalElementCount; warnings:string[] }
```

**Contract invariant (every phase):** pure function of inputs; deterministic; arrays
sorted by a stable key; rounded to 1e-6 m at boundaries (D-TGL §6 carries over).

---

## §3 — Room-input assembly (F1) — closing the biggest gap

The single new piece of glue. Per detected room (`RoomStore.getByLevel`), assemble
`FurnishRoomInput` from three stores — research confirmed there is **no existing API
returning a room's openings with world poses**, so F1 builds it:

1. `polygon`, `centroid`, `boundingBox`, `areaM2` ← `RoomData.boundary.polygon` / `computed`.
2. `walls` ← for each `RoomData.boundingWallIds`: `wallStore.getById` → `baseLine` segment;
   `inwardNormal` = `−outwardNormal(wall, centroid)` (`FacadeOrientationMath.outwardNormal`,
   spatial-index); `isExterior` from `facadeOrientationService`/`classifyFacades`.
3. `doors`/`windows` with poses ← `RoomContentsService.getContents(roomId).hosted.{doors,windows}`
   gives ids; for each, fetch from door/window store → `wallId` + `offset`/`anchor.t` +
   `width`; compute `center` + `normal` from the host wall baseLine (the math in
   `RoomRelationshipService._openingGeometry` — **recommend promoting it to a public
   `openingPose(opening, wall)` helper** so F1 reuses it instead of re-deriving).
4. `occupancyType` ← the room's type (see §3.1 dependency).

### §3.1 — Dependency: rooms must be classified
Detected rooms come out `occupancyType:'unclassified'`. D-FLE needs the type to pick an
archetype. Two sources, in order:
- **Preferred:** the D-TGL semantic type, applied post-build. (Today only `room.rename`
  applies the *name*; **occupancy is not yet applied** — see roadmap WS-A2.) When the
  apartment generator built the rooms, carry `LayoutRoom.type` → `room.setOccupancy`.
- **Fallback:** `RoomTypeInferenceEngine.inferType(roomId)` (rule-based, reads existing
  furniture/plumbing/area) — used for hand-drawn rooms or when no semantic type exists.
  *(Note the field-name mismatch: plugin store writes `occupancy`, `RoomData` reads
  `occupancyType` — F1 must read whichever store it queries; reconcile in WS-A2.)*

---

## §4 — Per-room archetypes (F2) — the design knowledge

Each archetype is an **ordered** list (placed in order; later items yield to earlier).
Items reference furniture types from the existing `FurnitureType` union and parametric
configs where available.

| Room (`occupancyType`) | Archetype (ordered) | Key rules |
|---|---|---|
| `bedroom` / `master-bedroom` | **bed** (anchor: wall-opposite-door, headboard to wall) → **2× bedside_table** (group: beside bed, flanking) → **wardrobe** (wall-longest free, ideally near door) → optional **desk+chair** (window wall) | bed centred on its wall; ≥0.7 m walk-around one long side; wardrobe doors need ≥0.9 m clear in front |
| `living-room` | **sofa** (wall-longest facing room) → **coffee_table** (center, 0.4 m from sofa) → optional **tv/console** (wall opposite sofa) → optional **armchair** (corner) → **carpet** (under coffee table) | sofa not blocking the door; 0.45 m sofa-to-coffee gap |
| `kitchen` | **kitchen cabinet run** via `buildDefaultKitchenConfig(layout, front)` — pick `straight`/`l-shape`/`u-shape` by free-wall count/length; anchor along the longest free wall(s) | 1.2 m galley clearance; reuse `KitchenCabinetEngine` geometry; emit `kitchenConfig` |
| `dining-room` / dining zone | **dining_table** (center) → **N× chair** around it (reuse `CreateFurnitureCommand`'s existing `createDiningChairs` precedent) | ≥0.9 m chair pull-out clearance to walls |
| `bathroom` / `ensuite` | **fixtures** (toilet, basin, shower/bath) against walls; `toilet_radiator`, `shower_glass_panel` builders exist | fixtures to walls; door swing clear |
| `entrance-hall` / `corridor` | **none** (or a slim console on a free wall) — circulation must stay clear | keep ≥0.9 m clear path |
| `study` | desk + chair + shelving on free walls | desk faces window if present |

Archetypes are data; adding a room type = adding a row. `minAreaM2` lets the placer
**skip** items that don't fit (a tiny bedroom gets bed + 1 bedside table, no wardrobe).

---

## §5 — Placement solver (F5)

Deterministic, per item, in archetype order:

1. **Resolve anchor → candidate wall(s)** (F4): `wall-longest` = longest `FreeWallSegment`;
   `wall-opposite-door` = bounding wall whose inward normal is most anti-parallel to the
   primary door's normal; `wall-window` = wall carrying a window (prefer S-facing via
   `orientationFromNormal`); `corner`/`center`/`beside` computed from geometry.
2. **Position** = anchor-wall midpoint (or window center) pushed inward by
   `footprint.l/2 + wallThickness/2`; **yaw** from the wall's inward normal
   (`Math.atan2(normal.x, normal.z)`), `facing` flips 180° for `to-wall` backs.
3. **Clearance test** (F6): the item's footprint rectangle + its `clearFront` keep-clear
   zone must (a) lie inside `polygon` (`pointInPolygon` on corners + edge sampling),
   (b) not overlap any door's swing/keep-clear rectangle, (c) not overlap already-placed
   items' footprints, (d) not block the room's circulation spine (entry-door → far side).
4. **Slide / re-anchor**: if rejected, slide along the wall by a fixed step set
   (e.g. ±0.25 m × k) then try the next candidate wall in the fixed order. Deterministic:
   first candidate that passes wins; no random search.
5. **Skip** (record a warning) if no placement passes and the item is non-`required`.
   `required` items that fail downgrade the archetype (e.g. drop the wardrobe) rather
   than overlap.

Groups (e.g. two bedside tables) are placed relative to their leader (the bed): each at
the bed's head corners, mirrored, sharing the bed's yaw.

---

## §6 — Furniture catalogue (F3)

One canonical `Record<FurnitureType, Footprint>` extracted from the duplicated defaults
(`FurnitureTool.ts:694-704` + the carousel registry) — the single source of truth for
placement dimensions + clearances. Parametric items (kitchen/wardrobe runs) derive their
footprint from the resolved config's arm lengths, not a fixed cell.

---

## §7 — Emission (F8) + wiring (F9)

- **F8 (pure)** mirrors `buildLayoutCommands`: pre-mint ids (`createId('furniture')`),
  emit one `furniture.create` **legacy payload** per `PlacedFurniture`:
  `{ id, furnitureType, position{x,y,z}, rotation:<scalar yaw>, levelId, baseOffset,
  width,length,height, material, furnitureCategory?, kitchenConfig?, wardrobeCabinetConfig?,
  metadata:{ hostedSpaceId } }`. **`rotation` MUST be a scalar yaw** (the
  `furniture.create` validator + `§FT-FURNITURE` bridge require it). No batch verb is
  needed — dispatch N `furniture.create` inside one `runBatch` (as doors already are).
- **F9 (editor, L5)** — copy `ApartmentLayoutExecutor`: subscribe `furniture.furnish-rooms`
  → assemble `FurnishRoomInput[]` (F1) → dynamic-import `buildFurnishCommands` → dispatch
  inside `batchCoordinator.runBatch({ levelIds, totalElementCount, skipRedetectRooms:true })`
  (furniture doesn't change room boundaries) → per-command try/catch → toast.
- **Rendering is free:** `furniture.create` → `CommandEventBridge` `furniture.created`
  → `initTools §FT-FURNITURE` → `furnitureStore.add()` → builder → 3D mesh + plan symbol.
- **Room association is automatic:** `RoomContentsService` buckets each item by centroid;
  `hostedSpaceId` also set explicitly.
- **Optional batch verb (later):** a real `furniture.batch.create` (mirroring
  `door.batch.create`) would give one Immer write + cleaner undo; not required for v1.

---

## §8 — Determinism & per-phase test contract

Determinism protections inherit D-TGL §6 (no `Math.random`/`Date.now`/`crypto.randomUUID`;
sorted output; round 1e-6). Global test: `furnishRoom(input)` twice → deep-equal.

- **F2 `archetypes`** — every supported `occupancyType` returns a non-empty ordered list with valid `FurnitureType`s; unknown type → `[]`.
- **F3 `footprints`** — every `FurnitureType` used by any archetype has a footprint; all dims > 0.
- **F4 `wallAnalysis`** — free segments = wall minus openings; lengths > 0; inward normals point into the room (dot with (centroid−mid) > 0); "longest" stable.
- **F5 `placeSolver`** — placed items lie inside the polygon; none overlap each other; none overlap a door swing; bed headboard touches a wall (distance ≈ thickness/2); deterministic.
- **F6 `collision`** — rectangle overlap + point-in-polygon unit-correct on fixtures.
- **F7 `furnishRoom`** — a 3×4 m bedroom → bed + 2 bedside tables (+ wardrobe iff area ≥ min); a 5×4 m living → sofa + coffee table; kitchen → a cabinet run config; deterministic.
- **F8 `buildFurnishCommands`** — one `furniture.create` per placed item; `rotation` scalar; `hostedSpaceId` set; ids unique; mm/units correct.
- **F9 (integration, happy-dom)** — feed D-TGL-built + detected rooms → furnish → assert furniture appears in `furnitureStore` and `RoomContentsService.getContents(room).contained.furniture` lists them; no item's centroid outside its room.

---

## §9 — Reuse map (what NOT to rebuild)

| Need | Use (exists) |
|---|---|
| Furniture geometry | `geometry-furniture` builders (origin-built; positioned by `position`/`rotation`) |
| Kitchen / wardrobe runs | `buildDefaultKitchenConfig` (`KitchenTypes.ts:263`), `buildDefaultWardrobeCabinetConfig`; `KitchenCabinetEngine`/`WardrobeCabinetEngine` |
| Dining chairs around a table | precedent in `CreateFurnitureCommand.createDiningChairs` (`:213`) |
| Create + render furniture | `furniture.create` bus verb → `CommandEventBridge:574` → `initTools §FT-FURNITURE:1699` |
| One-undo dispatch | `batchCoordinator.runBatch` (copy `ApartmentLayoutExecutor`) |
| Room polygon/centroid/bbox/walls | `RoomData` + `RoomPolygonUtils` (`pointInPolygon`, `polygonAABB`) |
| Room doors/windows | `RoomContentsService.getContents().hosted` + opening→wall geometry |
| Against-wall facing / S-windows | `FacadeOrientationMath.outwardNormal`/`orientationFromNormal` |
| Room type (fallback) | `RoomTypeInferenceEngine.inferType` |
| Post-furnish validation | `RoomValidationService`, `RoomQueryService.findAccessiblePath` (Part-M circulation intact) |

---

## §10 — Risks & limitations

1. **Room classification dependency** (§3.1): without occupancy applied, every room is
   `unclassified` → no archetype. WS-A2 (apply D-TGL type via `room.setOccupancy`) is a
   prerequisite for the generator path; inference covers hand-drawn rooms.
2. **Opening-pose gap** (§3): F1 must assemble openings-with-poses; recommend promoting
   `_openingGeometry` to a public helper to avoid duplicating wall-baseline math.
3. **Two furniture models:** emit the **legacy** `furniture.create` payload (the rendered
   path), not the schema `Furniture` model.
4. **Non-rectilinear rooms:** the solver targets axis-aligned/rectilinear rooms (matches
   D-TGL output); angled walls degrade to bounding-box placement.
5. **No stochastic refinement:** layouts are rule-correct and clear, not interior-designer
   bespoke; a later quality pass (multiple candidate arrangements ranked, like D-TGL's
   Pareto step) can improve aesthetics deterministically.
6. **Field-name mismatch** (`occupancy` vs `occupancyType`) must be reconciled (WS-A2).

---

## §11 — Cross-references
SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (rooms producer), SPEC-APARTMENT-LAYOUT-GENERATOR
(consumer + dispatch template `executePlan.ts`/`ApartmentLayoutExecutor.ts`),
C09 §3.4 (generative L7.5), C11 (element creation), C15 (hosted), C16 (command authoring),
Neufert *Architects' Data* / Panero & Zelnik *Human Dimension* (clearances), Approved
Document M (accessibility), RoomGraphService/RoomContentsService/FacadeOrientationMath
(spatial-index, room-topology).
