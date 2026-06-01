# ADR-008 — IFC Scope for v1

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-008 |
| Required by | Sprint S02 (Phase 1A — IFC plan reconfirmed) and S55 (Phase 3B — export plugin land) |
| Owner | Architecture lead |
| Implementation | `plugins/ifc-import/`, `plugins/ifc-export/`, `packages/ifc-mapping/` |
| Spec dependency | `SPEC-05-TYPE-CATALOG.md` §5 (IFC mapping) |

---

## Context

IFC interoperability is a non-negotiable for any BIM product targeting the architecture market (D8). The standard, however, is large: IFC4 has 800+ entity types; IFC4.3 adds civil-infrastructure entities (alignment, roads, rail) that are out of scope for a building-oriented v1.

Two failure modes exist:
1. Promise full IFC4.3 parity → drown in scope, miss GA.
2. Promise nothing → lose every customer with a cross-vendor handoff.

`05-IMPLEMENTATION-PLAN.md §17` proposed "Existing PRYZM corpus." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-008 sharpened to "Read+write Pset round-trip; defer IFC4.3 advanced for post-GA." This ADR ratifies the sharpened position.

---

## Decision

**v1 ships IFC4 read + write with property-set round-trip for the building-element subset. IFC4.3 advanced (alignment, road, rail) is post-GA. IFC2x3 read-only.**

### Supported entities (v1 round-trip)
| PRYZM family | Primary IFC entity | Predefined types |
|---|---|---|
| Wall | `IfcWallStandardCase`, `IfcWall` | STANDARD, SHEAR, ELEMENTED, PARTITIONING |
| Floor / Slab | `IfcSlab`, `IfcSlabStandardCase` | FLOOR, ROOF, BASESLAB, LANDING |
| Roof | `IfcRoof` | FLAT_ROOF, SHED_ROOF, GABLE_ROOF, HIP_ROOF, HIPPED_GABLE_ROOF |
| Column | `IfcColumn`, `IfcColumnStandardCase` | COLUMN, PILASTER, PIERSTEM |
| Beam | `IfcBeam`, `IfcBeamStandardCase` | BEAM, JOIST, LINTEL, T_BEAM |
| Door | `IfcDoor`, `IfcDoorStandardCase` | DOOR, GATE, TRAPDOOR |
| Window | `IfcWindow`, `IfcWindowStandardCase` | WINDOW, SKYLIGHT, LIGHTDOME |
| Stair | `IfcStair`, `IfcStairFlight` | STRAIGHT_RUN_STAIR, TWO_STRAIGHT_RUN_STAIR, SPIRAL_STAIR, … |
| Railing | `IfcRailing` | HANDRAIL, GUARDRAIL, BALUSTRADE |
| Curtain Wall | `IfcCurtainWall` | — |
| Furniture | `IfcFurniture` | CHAIR, TABLE, DESK, BED, SHELF, … |
| Rooms / Spaces | `IfcSpace` | INTERNAL, EXTERNAL |
| Levels | `IfcBuildingStorey` | — |
| Site / Building containers | `IfcSite`, `IfcBuilding` | — |
| Generic catch-all | `IfcBuildingElementProxy` | — |

Anything outside the table imports as `IfcBuildingElementProxy` with original geometry preserved; export of a proxy round-trips back as a proxy.

### Property-set round-trip (the differentiator)
- All `Pset_<Family>Common` properties in the IFC4 standard are mapped per SPEC-05 §5.
- Custom property sets defined in a PRYZM type's `propertySets[]` are exported as named `IfcPropertySet`s under the originating entity.
- Reading: any `IfcPropertySet` not matched to a PRYZM-known schema is preserved on a per-instance bag (`element.parameters._ifcCustom: { psetName, properties[] }`); export round-trips it byte-equivalent on properties (geometry has its own conversion path).
- M36 GA target: ≥ 95% of instance properties round-trip; 100% of geometry round-trips for the entity table above.

### Geometry representations (v1)
- **Read:** SweptSolid, Brep, BoundingBox, MappedRepresentation, GeometricSet (lines), AdvancedSweptSolid (best-effort mesh fallback).
- **Write:** SweptSolid for parametric families (wall, slab, column, beam, door, window); MappedRepresentation for type-instanced families (furniture, fixtures); Brep fallback for booleaned results.
- **Analytic representations:** written for walls and slabs (`'Axis'`, `'FootPrint'`) per SPEC-01 §2.

### Out of v1 scope (post-GA)
- IFC4.3 alignment / IfcAlignment / road / rail.
- IFC structural-analytical model (`IfcStructuralCurveMember`, `IfcStructuralSurfaceMember`, …).
- IFC4 MEP (`IfcPipeSegment`, `IfcDuctSegment`, `IfcCableSegment`, electrical distribution, …) — Phase 3+ marketplace plugins.
- BCF (BIM Collaboration Format) exchange — Phase 3+.
- IFC-SPF compression beyond what the writer naturally produces.

### Validators
- Import validation: `bsdd` schema check + IFC validation report attached to the import event.
- Export validation: `IFC4_ADD2_TC1` validation pass; broken outputs block export and surface a structured error.

### IFC2x3 (read-only)
- Many existing project archives are IFC2x3. v1 reads IFC2x3 and on-the-fly upgrades to its IFC4 in-memory model. It does **not** export IFC2x3.

---

## Consequences

**Positive:**
- Honest scope; no over-promise.
- Property-set round-trip (the area where competitors lose data) is a clear differentiator.
- The entity table covers 100% of typical small-to-medium architectural projects.
- Geometry round-trip discipline (SweptSolid for parametric) keeps re-imports editable.

**Negative:**
- MEP, structural-analytical, civil/infra customers cannot ship on v1 IFC alone.
- IFC4.3 marketing is out of reach until v2.
- The proxy fallback hides scope gaps; mitigated by the import-report UI surfacing what got proxied.

---

## Alternatives considered

### Full IFC4.3 + structural + MEP for v1
- Rejected: ~12 months of additional work; no path to M36 GA.

### Read-only IFC for v1
- Rejected: customers need to hand off to engineers and consultants.

### Outsource to ifcopenshell.wasm exclusively
- Considered. Used internally for parsing where convenient (license-compatible). Not a substitute for our own write path because we need control over the property-set round-trip semantics that competitors lose.

### Per-customer IFC profile negotiation
- Rejected for v1: too much support overhead. Reconsider as an Enterprise add-on post-GA.

---

## Phase rollout
- S02 (Phase 1A) — IFC plan signed off; entity table frozen.
- S35 (Phase 2C) — IFC type mapping in `packages/ifc-mapping/` complete (read direction).
- S55 (Phase 3B) — `plugins/ifc-import/` GA-quality.
- S58 (Phase 3B) — `plugins/ifc-export/` GA-quality; round-trip CI corpus passes.
- S70 (Phase 3D) — third-party validator (Solibri / IFC checker) regression suite green.
- S72 (M36 GA) — published support matrix; deferred items (MEP, IFC4.3, structural-analytical) listed as v2 candidates.
