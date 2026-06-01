# C26 — Revit Round-Trip

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: bi-directional translation between PRYZM `.pryzm` and Autodesk Revit `.rvt` / `.rfa` via IFC4 as canonical interchange, with an optional external Python adapter for Revit-API-specific extensions (phasing / worksets / design options) that standard IFC export misses.
> **Depends on**: [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC must be production-grade — Revit round-trip is unblocked only at IFC-α end), [C24](C24-SHEET-COMPOSITION-ENGINE.md) (sheet translation), [C15](C15-HOSTED-ELEMENT-CONTRACT.md) (hosted-elements semantic == Revit's hosted-elements).
> **Downstream**: market positioning vs Revit; consultant hand-off workflows.
> **Key principles**: **P5** (Revit mapping schemas pure), **P8** (every round-trip operation carries a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §9](../03-execution/plans/master-implementation-plan.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.3](../03-execution/status/prior-art-audit-2026-05-31.md). **Verdict: GENUINELY NEW.** No Revit code in the monorepo. IFC4 IS the bridge.

---

## §1 — Strategy

### §1.1 — IFC4 as canonical bridge

The Revit round-trip uses **IFC4 (production-grade per [C25](C25-IFC-EXPORT-PRODUCTION.md))** as the canonical interchange. This avoids in-monorepo dependency on Revit's COM API (Windows-only, Autodesk licensing).

- **PRYZM → Revit**: export IFC4 → import in Revit via Revit's own IFC importer (ISO 16739 compliant).
- **Revit → PRYZM**: export IFC from Revit → import via PRYZM's existing `plugins/ifc-import/` (after [C25](C25-IFC-EXPORT-PRODUCTION.md) IFC-α phase closes the structural gaps).

The "native" Revit experience is achieved through **high-fidelity IFC**, not direct `.rvt` parsing.

### §1.2 — Optional Python adapter

For Revit-API-specific extensions (phasing, worksets, design options, view templates, schedule formulas) that standard IFC export misses, an **external Python adapter** lives outside the monorepo. It is a Revit add-in that converts `.rvt` → PRYZM-optimised IFC4 and vice versa. Version-pinned to Revit 2024 / 2025 / 2026.

Released as a separate marketplace plugin. **Out of monorepo scope**. C26 documents the contract surface only; the adapter implementation is owned externally.

### §1.3 — No direct .rvt parsing in PRYZM monorepo

There is **no** code path inside the PRYZM monorepo that parses `.rvt` or `.rfa` binary files. Any such code is a contract violation. The only Revit-related artefact inside the monorepo is the schema package below.

---

## §2 — Schema (in `packages/schemas/src/revit/`)

All Revit mapping schemas are pure Zod (P5) with zero I/O, zero THREE, zero DOM. They live in `packages/schemas/src/revit/` and are consumed by the optional external Python adapter (via JSON export) AND by the editor's import / export UI for diff visualization.

| Schema | Owns |
|---|---|
| `RevitFamilyMapping` | Maps Revit System Family + Category → PRYZM element type. One row per Revit family. |
| `RevitParameterMapping` | Maps Revit Type Parameter / Instance Parameter → PRYZM Data Graph parameter (BIM 2.0). |
| `RevitLevelMapping` | Maps Revit `Level` → PRYZM `Level` (1:1). |
| `RevitViewMapping` | Maps Revit view types (FloorPlan / 3D / Section / Elevation / Detail) → PRYZM view types. |
| `RevitSheetMapping` | Maps Revit `Sheet` + viewports + title block → PRYZM `Sheet` (cross-link to [C24](C24-SHEET-COMPOSITION-ENGINE.md)). |
| `RevitPhaseMapping` | Maps Revit Phases (New Construction / Existing / Demolished) → PRYZM construction-phase parameter. |
| `RevitWorksetMapping` | Maps Revit Worksets (collaboration units) → PRYZM permission scopes. |

---

## §3 — Family translation table

Revit System Families → PRYZM element types. ~12 rows minimum:

| Revit family | Revit category | PRYZM type | Parameter mapping |
|---|---|---|---|
| Basic Wall | Walls | `wall` | width → thickness; height → height; structural usage → loadBearing |
| Floor | Floors | `floor` / `slab` | thickness; structural; load-bearing |
| Roof | Roofs | `roof` | thickness; pitch; structural |
| Stair | Stairs | `stair` | tread/riser/landing dimensions |
| Railing | Railings | `handrail` | height; material; balusters |
| Curtain Wall | Walls (curtain wall type) | `curtain-wall` | grid pattern; mullion type; panel system |
| Door | Doors | `door` | width × height; type (single/double/sliding); host-wall reference |
| Window | Windows | `window` | width × height; PartitioningType; sill height; host-wall reference |
| Column | Structural Columns | `column` | profile (rect/circular/I); height; material |
| Beam | Structural Framing | `beam` | profile; length; bearing |
| Generic Model | Generic Models | `glb_import` or `ai_element` (parametric proxy) | full parameter transfer via IfcPropertySet |
| Furniture | Furniture | `furniture` (per type) | mapped to PRYZM FurnitureType enum |

This mapping table is **the contract**. Adding new Revit-family mappings = a PR against `packages/schemas/src/revit/`.

---

## §4 — Parameter translation

Revit Type Parameters + Instance Parameters → PRYZM Data Graph (BIM 2.0). Round-trip via `IfcPropertySet`:

- Each Revit parameter has a `Name` and `StorageType` (Integer / Double / String / ElementId / etc.).
- Mapping: Revit `Name` + `StorageType` → IFC `Pset` + Property.
- Lossy parameters explicitly listed below; round-trip preserves all non-lossy parameters.

### §4.1 — Lossy parameters (one-way only)

| Revit parameter | Reason for loss | Mitigation |
|---|---|---|
| Revit View Filters (parametric visibility rules) | No direct IFC equivalent | Documented in adapter; lost on PRYZM → Revit return trip. |
| Revit Design Options (alternates) | IFC has no design-option concept | Adapter exports as `IfcZone` with named groups; lossy on Revit re-import. |
| Revit Linked Files (xref) | Resolved at export time; not preserved | Document hand-off pattern: re-link in Revit after import. |
| Revit Schedule Formulas | PRYZM uses its own formula DSL (`packages/family-runtime/`) | Adapter rewrites Revit formulas to PRYZM DSL syntax. |

---

## §5 — Level + view + sheet translation

- **Levels**: Revit `Level` ↔ PRYZM `Level` 1:1. Name + elevation + datum preserved.
- **FloorPlan view**: Revit `FloorPlan` → PRYZM plan view (named, scaled). Cross-link to `plugins/plan-view/` (S29 / ADR-0028).
- **3D View**: Revit `3D View` → PRYZM 3D view. Camera position + target preserved.
- **Section / Elevation**: Revit section/elevation → PRYZM section view (cross-link to `plugins/section-view/` skeleton, S37/S38).
- **Sheet**: Revit `Sheet` → PRYZM `Sheet` ([C24](C24-SHEET-COMPOSITION-ENGINE.md)). Viewport positions, scale, title block fields all preserved.

---

## §6 — Optional Python adapter (external companion plugin)

### §6.1 — Adapter scope

The external Python adapter is a Revit add-in (Windows-only, requires Revit 2024+) that:

1. Reads `.rvt` via Revit's API.
2. Writes a PRYZM-optimised IFC4 file (richer than Revit's default IFC export).
3. Reads `.pryzm` exports' companion `revit-extensions.json` (phasing / worksets / design options) and round-trips them back into Revit's data model.

### §6.2 — Adapter contract surface

The adapter consumes / produces a JSON sidecar (`revit-extensions.json`) alongside the IFC. Sidecar schema is defined in `packages/schemas/src/revit/` (per [§2](#2--schema-in-packagesschemassrcrevit)).

### §6.3 — Adapter lifecycle

- Released as a separate marketplace plugin (NOT in this monorepo).
- Version-pinned to Revit 2024 / 2025 / 2026.
- Maintained by the PRYZM team (or by a partner).
- Cannot block the core PRYZM 3 release — IFC4-only round-trip is acceptable for v1; adapter is v2.

---

## §7 — Round-trip validation

A reference suite of **10 Revit projects** is maintained for automated round-trip diff testing. Coverage:

1. Single-apartment (residential).
2. Two-storey townhouse.
3. Multi-storey residential (10+ units).
4. Open-plan office.
5. School with classrooms + corridors.
6. Retail unit with curtain wall.
7. Refurbishment with existing + demolition phases.
8. Single-family house with garage.
9. Mixed-use (residential + commercial).
10. Healthcare facility (regulatory edge cases).

Each project goes: Revit → IFC → PRYZM → IFC → Revit; diff comparison reports geometric + parameter + view fidelity.

CI gate: `tools/ga-gate/check-revit-roundtrip.ts` runs on the 10 reference projects nightly. Pass criteria: 95% geometric fidelity, 90% parameter preservation.

---

## §8 — Certification

Submit to buildingSMART for **IFC4 Reference View MVD** certification. This is a market-positioning deliverable, not a technical blocker.

---

## §9 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| 10-reference-project round-trip validation | < 30 min CI run | nightly |
| PRYZM → Revit IFC export | inherited from [C25 §9](C25-IFC-EXPORT-PRODUCTION.md) | — |
| Revit → PRYZM IFC import | inherited from `plugins/ifc-import/` | — |

---

## §10 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| No .rvt / .rfa parsing | Grep prevents `.rvt` / `.rfa` binary read in monorepo source | NEW `tools/ga-gate/check-no-rvt-parse.ts` |
| Revit mapping schema purity | `packages/schemas/src/revit/` has no I/O / DOM / THREE | extend `tools/ga-gate/check-schema-purity.ts` |
| Round-trip diff test | 10-project reference suite passes | NEW nightly job |

---

## §11 — Phase delivery

Implementation phases live in master plan [§9.2](../03-execution/plans/master-implementation-plan.md). RVT-α-1 through RVT-γ-3. ~17 wk total.

---

## §12 — What is NOT in this contract

- **Direct `.rvt` / `.rfa` binary parsing in PRYZM monorepo** — forbidden. IFC4 is the only bridge.
- **The optional Python adapter implementation** — lives outside the monorepo. C26 owns the contract surface only.
- **IFC schema details** — [C25](C25-IFC-EXPORT-PRODUCTION.md).
- **Revit Family Editor analogue** — `apps/component-editor/` + `packages/family-{runtime,loader,instance}/` (PRYZM 2 S55-S56). Out of scope for C26.
- **Archicad / Tekla / SketchUp round-trip** — separate future contracts (each uses IFC4 as bridge similarly).
- **BCF (BIM Collaboration Format)** — separate concern.

---

*End — C26 Revit Round-Trip, 2026-05-31.*
