# C25 — IFC Export (Production-Grade)

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: governs the existing `plugins/ifc-export/` (PRYZM 2 Phase 3-B Sprint S56) plus the gap-fill work to reach production-grade IFC4X3 coverage across all PRYZM element types. Codifies invariants for `IFC4X3Exporter`, the per-entity exporters, the `IFCMetaStore` round-trip, Pset authoring, spatial structure completeness, classification, and COBie.
> **Depends on**: [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md), [C12](C12-GEOSPATIAL.md), [C15](C15-HOSTED-ELEMENT-CONTRACT.md).
> **Downstream**: [C26](C26-REVIT-ROUND-TRIP.md) (IFC4 is the Revit bridge), [C28 §7](C28-DATA-PANEL-AND-AUTOMATION.md) (IFC Pset export from data grid).
> **Key principles**: **P5** (IFC config schema pure), **P8** (every Pset write opens a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §7](../03-execution/plans/master-implementation-plan.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.2](../03-execution/status/prior-art-audit-2026-05-31.md). PRYZM 2 reference: S56 (export), S57 (Tier 2 import + Pset editor).

---

## §1 — Invariants

### §1.1 — IFC4X3 is the target schema

Every export targets **IFC4X3** (the latest official buildingSMART schema), NOT IFC2x3 and NOT IFC4. Every export passes `ifc-validator` in CI; schema errors hard-fail.

**Current state**: `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` already writes IFC4X3 — including respecting schema differences (e.g. `IFCWALL` not `IFCWALLSTANDARDCASE`). Audit confirms.

### §1.2 — Streaming writer for large models

Export MUST stream to a `Writable` (Node) or `Blob` (browser) — no full-document in-memory copies. The NFT target is < 20 s for 10k elements.

### §1.3 — Spatial structure completeness

Every export MUST populate the full IFC spatial hierarchy:

```
IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace (per Room) → IfcZone (per Apartment, grouping its rooms)
```

`IfcSpace` MUST be generated from every Room. `IfcZone` MUST group rooms per apartment with a custom `Pset_ApartmentData` carrying unit number, score breakdown (from cognition-stack objective vector), and gross/net floor area.

**Current state**: `plugins/ifc-export/src/hierarchy.ts` implements IfcProject → IfcBuilding → IfcBuildingStorey. **IfcSite is empty; IfcSpace is absent; IfcZone is absent.** These are the master plan IFC-α-1/α-2/α-3 gap-fill phases.

### §1.4 — IfcSite full attributes

`IfcSite` attributes (`refLatitude`, `refLongitude`, `refElevation`, `LandTitleNumber`, `SiteAddress`) MUST be populated from `SiteModel` when present, and project-origin-promoted otherwise. Cross-link to [C12](C12-GEOSPATIAL.md) for the LTP-ENU coordinate transforms.

### §1.5 — Pset round-trip is preserved

`IFCMetaStore` (`plugins/ifc-export/src/meta-store.ts`) is the side-car GlobalId + custom Pset round-trip mechanism. Import → edit → export MUST preserve GlobalIds + Psets that survived through a Revit-side or third-party IFC editor.

**Current state**: IMPLEMENTED in PRYZM 2 S57. This contract codifies it as binding.

### §1.6 — Every Pset write opens a span

Per P8, every `IfcPropertySet` write emits an OpenTelemetry span. Span name: `pryzm.ifc.exportPset` with attributes `{ entityType, psetName, propertyCount }`.

**Current state**: `plugins/ifc-export/src/otel.ts` exists with P8 spans. Audit confirms.

---

## §2 — Element coverage table

Every PRYZM element type MUST export to a typed IfcEntity with its canonical Pset:

| PRYZM type | IfcEntity | Pset | Status |
|---|---|---|---|
| Wall | `IfcWall` | `Pset_WallCommon` | EXISTS (S56 wall.ts); audit FireRating/AcousticRating coverage |
| Slab / Floor | `IfcSlab` | `Pset_SlabCommon`, `Pset_FlooringCommon` | EXISTS (S56 slab.ts); audit Pset depth |
| Door | `IfcDoor` | `Pset_DoorCommon`; `OperationType` derived from door type | EXISTS (S56 door.ts); audit OperationType derivation |
| Window | `IfcWindow` | `Pset_WindowCommon`; `PartitioningType` derived from system type | EXISTS (S56 window.ts); audit PartitioningType |
| Column | `IfcColumn` | `Pset_ColumnCommon` | EXISTS (S56 column.ts) |
| Beam | `IfcBeam` | `Pset_BeamCommon` | EXISTS (S56 beam.ts) |
| **Space / Room** | `IfcSpace` | `Pset_SpaceCommon` (NetFloorArea, GrossFloorArea, Height, OccupancyType) | **GAP — IFC-α-2** |
| **Zone / Apartment** | `IfcZone` | custom `Pset_ApartmentData` | **GAP — IFC-α-3** |
| Furniture | `IfcFurniture` | `Pset_FurnitureTypeCommon` (NominalLength/Width/Height, Style) | **GAP — IFC-β-1** (50+ furniture types) |
| Plumbing fixture | `IfcSanitaryTerminal` | `Pset_SanitaryTerminalTypeCommon`; PredefinedType (BATH/SINK/SHOWER/TOILET/WASHHANDBASIN) | **GAP — IFC-β-4** |
| Kitchen appliance | `IfcElectricAppliance` | `Pset_ElectricApplianceTypeCommon` | **GAP — IFC-β-5** |
| Light | `IfcLightFixture` | `Pset_LightFixtureTypeCommon` | **GAP — IFC-β** |
| Ceiling | `IfcCovering` (ceiling type) | `Pset_CoveringCommon` | **GAP** |
| Stair | `IfcStair` | `Pset_StairCommon` | **GAP** |
| Roof | `IfcRoof` | `Pset_RoofCommon` | **GAP** |
| Curtain Wall | `IfcCurtainWall` | `Pset_CurtainWallCommon` | **GAP** |
| Dimension / Annotation | `IfcAnnotation` (with `IfcLabel` / `IfcAnnotationFillArea`) | n/a | **GAP — IFC-γ-3** |
| Grid | `IfcGrid` | n/a | **GAP** |

---

## §3 — Pset depth

`Pset_WallCommon` MUST carry: `LoadBearing`, `FireRating`, `AcousticRating`, `SurfaceSpreadOfFlame`, `ThermalTransmittance`, `IsExternal`, `ExtendToStructure`.

`Pset_DoorCommon` MUST carry: `FireRating`, `AcousticRating`, `SecurityRating`, `IsExternal`, `Infiltration`, `SmokeStop`.

`Pset_WindowCommon` MUST carry: `FireRating`, `AcousticRating`, `SecurityRating`, `ThermalTransmittance`, `Infiltration`, `GlazingAreaFraction`.

`Pset_SlabCommon` MUST carry: `LoadBearing`, `FireRating`, `AcousticRating`, `ThermalTransmittance`, `IsExternal`, `Combustible`, `Compartmentation`.

`Pset_SpaceCommon` MUST carry: `Reference`, `NetFloorArea`, `GrossFloorArea`, `GrossVolume`, `Height`, `IsExternal`, `OccupancyType`, `OccupancyNumber`.

`Pset_FurnitureTypeCommon` MUST carry: `Reference`, `Style`, `NominalLength`, `NominalWidth`, `NominalHeight`, `Status`.

**Current state**: `plugins/ifc-export/src/psets.ts` implements core Psets. The depth audit (IFC-γ-1 in master plan) verifies coverage.

---

## §4 — Annotation export

Room labels, dimension strings, north arrow, drawing notes MUST export as `IfcAnnotation` instances with appropriate styling. Cross-link to `plugins/annotations/` and `plugins/dimensions/` for the source data.

**Current state**: NOT implemented. IFC-γ-3 in master plan.

---

## §5 — Classification

Optional Uniclass 2015 classification: `Ss` (Systems) + `Pr` (Products) codes assigned to all element types via `IfcClassificationReference`. Optional OmniClass classification: `Table 23` (Products) codes.

**Current state**: NOT implemented. IFC-δ-1 in master plan.

---

## §6 — COBie export

Optional Facility Management handover: COBie tabs (Type / Component / Space / Zone / System) exported as additional sheets in a companion XLSX file alongside the IFC. NOT inline within the IFC.

**Current state**: NOT implemented. IFC-δ-2 in master plan.

---

## §7 — IfcMapConversion

`IfcMapConversion` MUST be fully populated from `SiteModel` when present per [C12 §3](C12-GEOSPATIAL.md). Fallback: project origin with explicit warning in the export log.

**Current state**: `packages/geospatial/` implements `IfcProjectedCRS` round-trip. Hook into ifc-export's hierarchy.ts.

---

## §8 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| IFC4X3 schema validation | Every export passes `ifc-validator` (web-ifc-validate or buildingSMART validator) | NEW — `tools/ga-gate/check-ifc-validate.ts` |
| Pset coverage | Every element type exports its canonical Pset with min required properties | NEW — `tools/ga-gate/check-ifc-pset-coverage.ts` |
| Spatial structure presence | Every export has IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace | NEW |
| Span per Pset write | P8 — every PSet write emits a span | extend existing P8 span-coverage check |
| IFCMetaStore round-trip | Import → export → re-import preserves GlobalIds + custom Psets | NEW — `tools/ga-gate/check-ifc-round-trip.ts` |

---

## §9 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Export 1k elements | < 2 s | `ifc-export-1k.bench.ts` |
| Export 10k elements | < 20 s | `ifc-export-10k.bench.ts` |
| Round-trip preservation rate | 100% GlobalIds, 100% custom Psets | `ifc-roundtrip.test.ts` |
| Schema validity | 100% schema-valid output | CI gate |

---

## §10 — What this contract governs (existing implementation + gap-fill)

### §10.1 — Existing implementation

| Component | Path | PRYZM 2 ref |
|---|---|---|
| Top-level orchestrator | `plugins/ifc-export/src/orchestrator.ts` | S56 |
| `IFC4X3Exporter` | `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` | S56 |
| 6 element exporters | `plugins/ifc-export/src/exporters/{wall,slab,door,window,column,beam}.ts` | S56 |
| Pset writer | `plugins/ifc-export/src/psets.ts` | S56 |
| GUID generator | `plugins/ifc-export/src/guid.ts` | S56 |
| Hierarchy (IfcProject/Building/Storey) | `plugins/ifc-export/src/hierarchy.ts` | S56 |
| OwnerHistory | `plugins/ifc-export/src/owner-history.ts` | S56 |
| `IFCMetaStore` | `plugins/ifc-export/src/meta-store.ts` | S56 |
| OTel spans | `plugins/ifc-export/src/otel.ts` | S56 |
| Tier 2 import + Pset editor | `plugins/ifc-import/` + `plugins/ifc-inspector/` | S57 |
| Geospatial CRS | `packages/geospatial/` | C12 |

### §10.2 — Gap-fill scope (the actual NEW work, ~14 wk total)

Per master plan [§7.2](../03-execution/plans/master-implementation-plan.md#72--ifc-export-phase-plan), IFC-α-1 through IFC-δ-3 phases. Summary:

- **IFC-α (5.5 wk)**: IfcSite + IfcSpace + IfcZone + IfcBuildingStorey areas + validator CI gate.
- **IFC-β (5 wk)**: Furniture / Window-PartitioningType / Door-OperationType / Plumbing / Appliances exporters.
- **IFC-γ (3.5 wk)**: Pset depth (Wall/Slab/Annotation) + IfcMapConversion full population.
- **IFC-δ (4 wk)**: Uniclass + COBie + performance NFT.

---

## §11 — What is NOT in this contract

- **IFC import** — `plugins/ifc-import/` is governed by its own implementation contract. C25 only covers export.
- **Pset editing UI** — `plugins/ifc-inspector/`. C25 covers the Pset write side; the inspector covers UI.
- **Revit-specific extensions** (phasing, worksets, design options) — [C26](C26-REVIT-ROUND-TRIP.md).
- **BCF (BIM Collaboration Format)** — separate concern; covered elsewhere.
- **PDF / DWG export** — [C24](C24-SHEET-COMPOSITION-ENGINE.md), [C29](C29-PDF-VECTOR-EXPORT.md).
- **Family schemas** — `packages/family-runtime/` + future C-contract on Family Platform.

---

*End — C25 IFC Export (Production-Grade), 2026-05-31.*
