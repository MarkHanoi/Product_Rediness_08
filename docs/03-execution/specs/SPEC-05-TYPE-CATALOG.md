# SPEC-05 — Element Type Catalog & Material Library

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B5` |
| Phases | 1B (wall types ship with kernel), 1C (per-family types), 2A (level-bound types), 3A (Component Editor for new types), 3B (IFC type mapping) |
| Required ADRs | ADR-017 (type catalog scope) |
| Replaces | The thin 271-line `02-decisions/contracts/17-ELEMENT-TYPES-AND-MATERIALS-CONTRACT.md` |

> A "wall type" is what carries layer composition, fire rating, U-value, schedule grouping, and IFC mapping. Without a real type catalog, schedules are wrong, IFC export is wrong, and D10 (Family Editor) is impossible. This spec defines the model — system families vs loadable families, type vs instance parameters, parameter inheritance, IFC mapping, and the ship-with-product catalog.

---

## §1 The two-axis model

### §1.1 Family / Type / Instance
- **Family**: a kind of element with a shared parameter schema and behaviour. *Examples:* `Basic Wall`, `Curtain Wall`, `Door`, `Single-Flush Door`, `Floor`.
- **Type**: a named configuration of a family. *Examples:* "Generic 200 mm Wall", "Exterior CMU + Brick + Insulation 350 mm".
- **Instance**: a placed element in a project, referencing a type.

```
Family (schema + behaviour)
  └─ Type (named configuration; values for type parameters)
       └─ Instance (placed; values for instance parameters)
```

### §1.2 System family vs loadable family
- **System family**: defined in code; not user-creatable. *Examples:* `Wall`, `Floor`, `Roof`, `Ceiling`, `Stair`, `Railing`, `Curtain Wall`, `Curtain Grid`. Ships with PRYZM.
- **Loadable family**: user-authorable in the Component Editor (Phase 3A). *Examples:* `Door`, `Window`, `Furniture`, `Casework`, `Plumbing Fixture`, `Lighting Fixture`, `Generic Model`.

---

## §2 Parameters

### §2.1 Parameter location
- **Type parameter**: changing it affects every instance of that type. *Examples:* layer composition of a wall type, frame depth of a window type.
- **Instance parameter**: per-instance override. *Examples:* wall length, window sill height, door handing.

A family's schema declares each parameter as `type` or `instance`.

### §2.2 Parameter schema (Zod)

```ts
// packages/types-schema/src/wall.ts
const WallTypeSchema = z.object({
  id: TypeIdSchema,
  family: z.literal('Wall'),
  name: z.string().min(1).max(120),
  category: z.enum(['Architectural', 'Structural']),
  layers: z.array(WallLayerSchema).min(1).max(20),
  fireRating: z.enum(['none','30min','60min','90min','120min','180min','240min']),
  acousticSTC: z.number().int().min(0).max(80).optional(),
  uValueWm2K: z.number().positive().optional(),
  ifcMapping: IfcMappingSchema,
  scheduleCategory: z.string(),       // grouping label for schedules
  graphics: TypeGraphicsSchema,        // default cut style, hatch, color
});

const WallInstanceSchema = z.object({
  id: ElementIdSchema,
  typeId: TypeIdSchema,
  baseLevelId: LevelIdSchema,
  baseOffset: z.number(),
  topReference: TopReferenceSchema,    // 'level' | 'unconnected' | … (see §6)
  centerline: PolylineSchema,
  parameters: z.record(z.unknown()),   // instance parameter overrides
});
```

### §2.3 Parameter inheritance
- An instance reads a parameter as: `instance.parameters[k] ?? type[k] ?? family.defaults[k]`.
- Setting an instance parameter that equals the type value is a no-op (kept clean).
- "Reset to type" clears the instance override.

---

## §3 Layer composition (walls, floors, roofs)

### §3.1 Wall layer

```ts
const WallLayerSchema = z.object({
  function: z.enum([
    'structure',
    'substrate',
    'thermal-insulation',
    'air-barrier',
    'finish-1',     // exterior
    'finish-2',     // interior
    'membrane',
  ]),
  thicknessMm: z.number().positive(),
  materialId: MaterialIdSchema,
  wraps: z.enum(['none', 'inserts', 'ends', 'both']),
  isCore: z.boolean(),    // exactly one core layer per wall type
  // Visual
  graphics: LayerGraphicsSchema,    // hatch + color override
});
```

Constraint: exactly one layer in a wall type has `isCore: true`. The core defines the centerline reference and the analytic-display split (SPEC-01 §2).

### §3.2 Floor / roof layer
Same shape, with `function ∈ {structure, deck, insulation, finish, membrane, vapour-barrier}`.

### §3.3 Layer rendering
- In 3D: each layer is a separate sub-mesh with its material; toggleable per detail level.
- In plan: layers are drawn as parallel lines at the layer boundaries with hatches in cut-poche (SPEC-04 §2.3).
- In section: same as plan but shows full layer stack along the cut.

---

## §4 Material library

### §4.1 Material schema

```ts
const MaterialSchema = z.object({
  id: MaterialIdSchema,
  name: z.string(),
  category: z.enum(['concrete','masonry','metal','wood','plastic','glass','insulation','membrane','finish','custom']),
  appearance: {
    diffuse: RGB,
    metallic: z.number().min(0).max(1),
    roughness: z.number().min(0).max(1),
    normalMapUrl: z.string().url().optional(),
    diffuseMapUrl: z.string().url().optional(),
  },
  thermal: {
    conductivityWmK: z.number().positive().optional(),
    densityKgM3: z.number().positive().optional(),
    specificHeatJkgK: z.number().positive().optional(),
  },
  acoustic: {
    absorptionCoefficient: z.number().min(0).max(1).optional(),
  },
  cost: {
    perUnit: z.enum(['m2','m3','linear-m','each']).optional(),
    valueUSD: z.number().nonnegative().optional(),
  },
  hatch: HatchStyleSchema,
  ifcMapping: IfcMaterialMappingSchema,
});
```

### §4.2 Storage
- Materials ship in `packages/material-library/`; loaded at boot.
- Project-local materials live in the L1 store `materialStore`.
- Materials persist via the event log like any other L1 entity.
- Material library export: `.pryzm-materials.json`.

### §4.3 Material inheritance from layers (the gap closure)
- A wall layer references a material by `materialId`.
- The material's `appearance` is read by the WebGPU resolver to set per-layer PBR parameters.
- The material's `hatch` is read by the drawing engine for cut-poche.
- The material's `thermal` is read by the schedules subsystem for U-value computation.
- Single source of truth; no duplication in the wall type.

---

## §5 IFC mapping

### §5.1 Type-level mapping

```ts
const IfcMappingSchema = z.object({
  ifcEntity: z.enum([
    'IfcWallStandardCase','IfcWall',
    'IfcSlab','IfcSlabStandardCase',
    'IfcRoof',
    'IfcColumn','IfcColumnStandardCase',
    'IfcBeam','IfcBeamStandardCase',
    'IfcDoor','IfcDoorStandardCase',
    'IfcWindow','IfcWindowStandardCase',
    'IfcStair','IfcStairFlight',
    'IfcRailing',
    'IfcCurtainWall',
    'IfcFurniture',
    'IfcBuildingElementProxy',
  ]),
  predefinedType: z.string().optional(),    // e.g. 'STANDARD','SHEAR','ELEMENTED' for IfcWall
  propertySets: z.array(IfcPropertySetMappingSchema),
});
```

### §5.2 Property-set mapping
- A material's properties auto-populate `Pset_MaterialCommon`.
- A wall type's `fireRating` populates `Pset_WallCommon.FireRating`.
- A door's `fireRating`, `isExternal`, `acousticRating` populate `Pset_DoorCommon`.
- Custom property sets per type via `propertySets[]`.

### §5.3 Round-trip
- Exporting an instance preserves type identity in `IfcRelDefinesByType`.
- Importing IFC reconstructs types from `IfcTypeObject`; if no PRYZM type matches, a "Generic <X>" type is created on-the-fly.
- M36 GA target: 95% of instance properties round-trip; 100% of geometry round-trips.

---

## §6 Top reference & level association

### §6.1 Wall top reference
```ts
const TopReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('level'), levelId: LevelIdSchema, offset: z.number() }),
  z.object({ kind: z.literal('unconnected'), height: z.number().positive() }),
  z.object({ kind: z.literal('attached'), elementId: ElementIdSchema }),    // attached to slab/roof
]);
```

### §6.2 Behaviour
- `level`: top elevation = level.elevation + offset. Level changes propagate.
- `unconnected`: top elevation = base + height. Insensitive to level changes.
- `attached`: top is computed from the host element's bottom surface; reattaches automatically as the host changes.

---

## §7 The ship-with-product catalog (M36 GA)

### §7.1 Wall types (12)
- Generic 100, 150, 200, 250, 300 mm.
- Exterior brick + insulation + CMU + drywall (350 mm).
- Interior partition (single-stud, 100 mm).
- Interior partition (double-stud, acoustic, 200 mm).
- Curtain wall (light, 50 mm mullion).
- Curtain wall (heavy, 80 mm mullion).
- Stud wall (timber, 90 mm).
- Stud wall (metal, 100 mm).

### §7.2 Floor / roof types (8)
- Generic 200, 300, 400 mm slab.
- Concrete on metal deck (300 mm composite).
- Wood frame floor (250 mm joist).
- Cold flat roof (insulated 350 mm).
- Warm pitched roof (timber rafter, 200 mm + insulation).
- Green roof.

### §7.3 Door types (8)
- Single flush 800 / 900 / 1000 mm.
- Double flush 1500 / 1800 mm.
- Sliding 1000 / 1200 mm.
- Pocket 900 mm.

### §7.4 Window types (8)
- Casement single 600 / 900 / 1200 mm.
- Casement double 1800 mm.
- Sliding 1500 / 1800 mm.
- Awning 1000 mm.
- Fixed picture 2400 mm.

### §7.5 Material library (40)
Concrete (3 strengths), masonry (brick × 3 colours, CMU × 2), wood (oak, pine, cedar, plywood), metal (steel × 2, aluminium, copper), glass (clear × 3, low-e × 2, frosted), insulation (batt, rigid, spray), membrane (vapour, air-barrier), finish (paint × 6 colours, render, gypsum, ceramic tile, vinyl, carpet).

### §7.6 What's not in v1
- Curtain wall mullion families with custom profiles (post-GA — needs constraint solver).
- MEP families (pipe, duct, conduit) — Phase 3+.
- Site / planting families — Phase 3+.
- Furniture beyond a 12-piece starter set — relies on marketplace.

---

## §8 The Component Editor (Phase 3A — D10)

### §8.1 Scope
A web-native editor for **loadable families**: doors, windows, furniture, casework, lighting, plumbing, generic models.

### §8.2 Capabilities
- 2D parametric profile sketcher with the constraint solver (SPEC-01 §4).
- 3D extrude / sweep / loft / revolve.
- Reference planes and parameter binding.
- Visibility per detail level (Coarse / Medium / Fine).
- Family parameter declaration (type vs instance, name, units, default).
- Material slots.
- Save as `.pryzm-family` (a sub-format of `.pryzm`).

### §8.3 What it is not in v1
- No structural-analytical model authoring.
- No scripted families (no Python / JS in family definitions).
- No nested families beyond depth 2.

---

## §9 OpenTelemetry instrumentation
- `types.resolve` — input `(elementId)`; output `(typeId, durationMs)`.
- `types.material.lookup` — input `(materialId)`; output `(durationMs, cacheHit)`.
- `types.layer.compose` — input `(typeId, layerCount)`; output `(durationMs)`.
- `types.ifc.export-mapping` — input `(typeId)`; output `(durationMs)`.

---

## §10 Cross-references
- Layer placement: `08-VISION §4` (L1 stores).
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.12`.
- Phase deliverables: `phases/PHASE-1B` (wall types), `phases/PHASE-1C` (per-family types), `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §2 (3A — Component Editor).
- ADR: `adrs/ADR-017-type-catalog-scope.md`.
- IFC interop: SPEC-04 §3.4 (DXF) and Phase 3B (IFC export plugin).
