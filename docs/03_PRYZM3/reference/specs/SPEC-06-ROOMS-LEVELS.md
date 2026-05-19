# SPEC-06 — Rooms, Levels, Elevations & Spatial Hierarchy

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B6` |
| Phases | 2A (rooms v1, single-level), 2B (room schedules in plan view), 3A (multi-level rooms, sloped levels, discipline associations) |

> Without rich rooms / levels / elevations, schedules are incorrect and IFC export is incorrect. This spec defines the spatial-hierarchy model: project → site → building → level → room → element, with discipline-scoped level associations and split-level / sloped-level support.

---

## §1 The hierarchy

```
Project
└─ Site (1..n)
   └─ Building (1..n)
      └─ LevelGroup (per discipline: Architectural / Structural / MEP)
         └─ Level (1..n)
            └─ Room (1..n)
               └─ Element instances (Wall, Floor, Door, Window, …)
```

Most projects have one site, one building, one level group per discipline, several levels, several rooms per level. The hierarchy is **rich but optional** — a quick sketch project may skip Site/Building entirely (a default singleton is created).

---

## §2 Levels

### §2.1 Level schema

```ts
const LevelSchema = z.object({
  id: LevelIdSchema,
  name: z.string().min(1),                // "Ground", "Level 1", "Roof"
  buildingId: BuildingIdSchema,
  groupId: LevelGroupIdSchema,            // discipline scope
  geometry: LevelGeometrySchema,          // see §2.2
  scope: z.enum(['planView','floorOnly','reference']),
  storyHeight: z.number().nullable(),     // calculated; null if no level above
  ifcStorey: z.boolean(),                 // does this level export as IfcBuildingStorey?
});
```

### §2.2 Level geometry (closes B6 gap "split / sloped levels")

```ts
const LevelGeometrySchema = z.discriminatedUnion('kind', [
  // Flat — single elevation across the entire level
  z.object({ kind: z.literal('flat'), elevation: z.number() }),

  // Split — multiple flat regions at different elevations
  z.object({
    kind: z.literal('split'),
    regions: z.array(z.object({
      polygon: PolygonSchema,
      elevation: z.number(),
    })).min(2),
    transitions: z.array(z.object({       // ramps/stairs between regions
      fromRegionIndex: z.number().int(),
      toRegionIndex: z.number().int(),
      elementId: ElementIdSchema,         // ramp / stair element
    })),
  }),

  // Sloped — terrain-following or single inclined plane
  z.object({
    kind: z.literal('sloped'),
    plane: PlaneEquationSchema,            // ax + by + cz + d = 0
    domain: PolygonSchema,                  // 2D extent
  }),

  // Mesh — arbitrary surface (terrain)
  z.object({
    kind: z.literal('mesh'),
    meshRef: ChunkRefSchema,                // baked terrain mesh
  }),
]);
```

### §2.3 World elevation lookup
The kernel exposes:
```ts
function getWorldElevation(levelId: LevelId, x: number, y: number, baseOffset: number): number;
```
- For `flat`: returns `level.geometry.elevation + baseOffset`.
- For `split`: locates `(x,y)` in the regions; returns the matching region's elevation + offset.
- For `sloped` / `mesh`: solves the plane equation or samples the mesh.

This is the single API that every element-position computation goes through. No direct `level.elevation` access.

### §2.4 Level changes
- A flat level changing elevation re-computes every element's worldY through the rebuild cascade.
- A split-level region change re-computes only elements within that region.
- A sloped-level plane change re-computes elements bound to that level.

---

## §3 Discipline-scoped level groups (closes B6 gap "no level associations per discipline")

### §3.1 Why
Architectural levels (finish floor) and structural levels (top of slab) are different elevations. MEP often has its own levels for service zones. A single global Z is wrong for any non-trivial building.

### §3.2 Model
- `LevelGroup { id, discipline: 'Architectural'|'Structural'|'MEP'|'Site' }`.
- Each level belongs to exactly one group.
- An element belongs to a level in the group matching its discipline:
  - Walls (architectural) → Architectural level.
  - Concrete slabs (structural) → Structural level.
  - Pipes / ducts → MEP level.
- Default group if discipline omitted: Architectural.

### §3.3 Group alignment
- Groups can be **aligned**: e.g. "Architectural Level 1 and Structural Level 1 are at the same physical elevation, but exported separately."
- Alignment is per-pair, optional, used by the schedule subsystem and IFC export to consolidate.

---

## §4 Rooms

### §4.1 Room schema

```ts
const RoomSchema = z.object({
  id: RoomIdSchema,
  name: z.string(),
  number: z.string(),                      // "G.01", "1.04A"
  levelId: LevelIdSchema,                  // for single-level rooms
  multiLevel: MultiLevelSpanSchema | null, // see §4.4
  boundary: RoomBoundarySchema,
  height: z.number().positive(),           // from level base; meaningful only if not multi-level
  occupancy: z.string().optional(),        // "Office", "Storage", "Atrium"
  area: z.number(),                         // computed; not stored
  volume: z.number(),                       // computed; not stored
});
```

### §4.2 Room boundary (closes B6 gap "room-bounding semantics")

```ts
const RoomBoundarySchema = z.discriminatedUnion('mode', [
  // Auto-bounded by walls
  z.object({
    mode: z.literal('wallBound'),
    seedPoint: Point2Schema,                // user-clicked point inside the room
    boundingElementIds: z.array(ElementIdSchema).optional(),  // computed; cached
  }),
  // Sketched boundary (drawn polyline regardless of walls)
  z.object({
    mode: z.literal('sketched'),
    polygon: PolygonSchema,
  }),
]);
```

### §4.3 Wall-bounding rules
- For each wall, the side facing the room is determined by ray-casting from the seed point.
- The room boundary is the closed loop of inward-facing wall surfaces.
- Doors and windows do not break the boundary (they're hosted inserts).
- A wall opening WITHOUT a door (a pure void) DOES break the boundary; the loop continues through the next bounding wall.
- Algorithm runs on every wall update affecting the room's neighbourhood (cached via spatial index).

### §4.4 Multi-level rooms (closes B6 gap "multi-level rooms deferred to Phase 3")

```ts
const MultiLevelSpanSchema = z.object({
  baseLevelId: LevelIdSchema,
  topReference: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('level'), levelId: LevelIdSchema, offset: z.number() }),
    z.object({ kind: z.literal('absolute'), elevation: z.number() }),
  ]),
  perLevelBoundary: z.record(LevelIdSchema, RoomBoundarySchema).optional(),
});
```

- Phase 2A v1: `multiLevel: null` only (single-level rooms).
- Phase 3A v2: full multi-level rooms with optional per-level boundary differences (atrium with cantilever).

### §4.5 Schedules
The schedule subsystem reads `room.area`, `room.volume`, `room.occupancy` directly. With incorrect rooms, schedules are incorrect — which is exactly why this spec exists before Phase 2C.

---

## §5 Elevations (the view kind, not the Z value)

This spec covers spatial hierarchy. The **elevation view** kind is owned by SPEC-04. They share the level model: an elevation view binds to a building face and a level range; section markers bind to levels.

---

## §6 Site & building

### §6.1 Site
```ts
const SiteSchema = z.object({
  id: SiteIdSchema,
  name: z.string(),
  geo: { latitude: z.number(), longitude: z.number(), elevation: z.number() }.optional(),
  trueNorth: z.number(),                   // azimuth in radians from project north
  terrain: LevelGeometrySchema.optional(), // a 'mesh' Level for site terrain
});
```
Geographic context: when present, Cesium can stream basemap (lazy-loaded per Phase 3D bundle plan).

### §6.2 Building
```ts
const BuildingSchema = z.object({
  id: BuildingIdSchema,
  name: z.string(),
  siteId: SiteIdSchema,
  origin: { x: z.number(), y: z.number(), z: z.number() },  // building origin in site coords
  rotation: z.number(),                     // rotation about z relative to site
});
```
Multiple buildings per site (campus). Each building has its own LevelGroups.

---

## §7 Level-bound vs level-spanning elements

| Element type | Default binding |
|---|---|
| Wall | base level + top reference (level / unconnected / attached) |
| Floor / Slab | single level |
| Roof | single level |
| Ceiling | single level |
| Column | base level + top reference |
| Beam | single level |
| Door / Window | hosted (inherits wall's level) |
| Stair / Railing | spans levels (start + end) |
| Curtain Wall | base level + top reference |
| Furniture | single level |
| Pipe / Duct (MEP) | single MEP level (or runs between) |

Stairs and curtain walls are first-class level-spanning elements; the kernel handles their geometry across discipline-scoped level boundaries.

---

## §8 Phase rollout

| Sprint | Deliverable |
|---|---|
| S25 (Phase 2A) | LevelGroup model, flat levels, single-level rooms, wall-bounding algorithm. Site/Building optional. |
| S26 (Phase 2A) | Split-level support, level-change cascade. |
| S27 (Phase 2A) | Sketched-boundary rooms; room schedules driven by `room.area`. |
| S29 (Phase 2B) | Plan-view room rendering (poche fill, tag, area annotation). |
| S37 (Phase 2C) | Schedule subsystem reads room data; SUM/COUNT formulas. |
| S49 (Phase 3A) | Multi-level rooms; sloped levels; mesh terrain; discipline-scoped IFC export per LevelGroup. |
| S55 (Phase 3B) | Per-discipline level alignment in IFC export. |

---

## §9 OpenTelemetry instrumentation
- `spatial.level.elevation-lookup` — input `(levelId, x, y)`; output `(elevation, durationMs)`.
- `spatial.room.recompute-boundary` — input `(roomId, neighbourhoodElementCount)`; output `(boundingElementIds, durationMs)`.
- `spatial.room.area` — input `(roomId)`; output `(area, durationMs)`.

---

## §10 Cross-references
- Layer placement: `08-VISION §4` (L1 stores; spatial projection at L3 for queries).
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.1` (BimManager → L3 projection), §3.12 (related: type catalog).
- Type catalog: SPEC-05 (Top reference + level binding semantics).
- Phase deliverables: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`, `phases/PHASE-3-COMPLETION-GA-M25-M36.md`.
- IFC mapping: SPEC-05 §5 (each LevelGroup maps to its own IfcBuildingStorey set).
