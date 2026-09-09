# C25 — IFC Export (Production-Grade)

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: governs **BOTH IFC export pipelines** — `packages/file-format/src/export/ifc/**` (the path the app actually runs) **and** `plugins/ifc-export/**` (PRYZM 2 Phase 3-B Sprint S56) — plus the gap-fill work to reach production-grade IFC4X3 coverage across all PRYZM element types. ⚠ **This line read "governs the existing `plugins/ifc-export/`" until 2026-08-23 (lane IFCEXP49, L-8500). That is the pipeline NOTHING RUNS**; see §1.7. Codifies invariants for `IFC4X3Exporter`, the per-entity exporters, the `IFCMetaStore` round-trip, Pset authoring, spatial structure completeness, classification, and COBie.
> **Depends on**: [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md), [C12](C12-GEOSPATIAL.md), [C15](C15-HOSTED-ELEMENT-CONTRACT.md).
> **Downstream**: [C26](C26-REVIT-ROUND-TRIP.md) (IFC4 is the Revit bridge), [C28 §7](C28-DATA-PANEL-AND-AUTOMATION.md) (IFC Pset export from data grid).
> **Key principles**: **P5** (IFC config schema pure), **P8** (every Pset write opens a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §7](../03-execution/plans/master-implementation-plan.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.2](../03-execution/status/prior-art-audit-2026-05-31.md). PRYZM 2 reference: S56 (export), S57 (Tier 2 import + Pset editor).

---

## §1 — Invariants

### §1.1 — IFC4X3 is the target schema

> ## ⛔ CORRECTED IN PLACE 2026-09-01 (lane EXT · audit §6.1) — **THIS SECTION IS FALSE OF THE PIPELINE USERS ACTUALLY RUN, AND IT SAYS SO ONLY IN §1.7**
>
> §1.7 has recorded since 2026-08-23 that *"§1.1 … is FALSE of the path users actually use"*
> (**L-8560, OPEN**). **§1.1 itself carried no marker**, so a reader who lands here — which is what
> a reader designing a component→IFC mapping does — gets the false claim and the words
> *"Audit confirms"* underneath it. **A correction recorded only in the section that discovered it
> is a correction the next reader will not see.** That is the identical shape as C15 §0.1.1
> (corrected the same day) and as the `plugins/ifc-export` scope line this file's own front-matter
> already corrects.
>
> **Re-measured 2026-09-01 at HEAD, both halves:**
>
> | Claim | Reading |
> |---|---|
> | *"Every export targets **IFC4X3** … NOT IFC2x3 and NOT IFC4"* | ⛔ **FALSE of Pipeline A, the shipping path.** `packages/file-format/src/export/ifc/IfcExporter.ts` declares `schema?: 'IFC2X3' \| 'IFC4'` and takes `const schema = options.schema \|\| 'IFC4'` into `this.api.CreateModel({ schema })`. `ExportIFC.ts` repeats the same union. **IFC4X3 is not a value this pipeline can express** — migrating it is a geometry-and-entity question, not a flag. |
> | *"**Current state**: `plugins/ifc-export/…/IFC4X3Exporter.ts` already writes IFC4X3 … Audit confirms"* | ⚠ **TRUE, AND ABOUT THE DEAD PIPELINE.** `grep -rn exportProjectToIFC4X3` over `packages apps plugins src`, non-test → the definition, the barrel re-export, and **one comment**. **Zero callers.** The sentence is a true statement about code no user reaches, printed where it reads as a clearance for the code they do. |
>
> ⛔ **BINDING PRECONDITION — read §1.7 before designing ANY new element's IFC mapping**, the
> component/`.pryzm-family` `ifc-mapping.json` included. **Cite the pipeline by name or do not cite
> a capability**: the two disagree on schema version, on geometry (real triangulated mesh vs box
> extrusion) and on openings (present vs absent), so *"the exporter supports X"* is not a
> proposition until the exporter is named.
>
> **WHAT STANDS:** IFC4X3 remains the **target**. This correction retires the present-tense claim
> that it is the **state**, and nothing more.

~~Every export targets **IFC4X3** (the latest official buildingSMART schema), NOT IFC2x3 and NOT IFC4.~~ **← see the banner.** IFC4X3 is the TARGET schema. Every export passes `ifc-validator` in CI; schema errors hard-fail.

**Current state**: ~~`plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` already writes IFC4X3 — including respecting schema differences (e.g. `IFCWALL` not `IFCWALLSTANDARDCASE`). Audit confirms.~~ **← TRUE OF PIPELINE B, WHICH NOTHING CALLS.** Pipeline A — the one `ExportRailPanel` → `BimService.exportIfc` → `exportIFC` reaches — writes **IFC4**, selectably IFC2X3. **L-8560, OPEN.**

### §1.2 — Streaming writer for large models

Export MUST stream to a `Writable` (Node) or `Blob` (browser) — no full-document in-memory copies. The NFT target is < 20 s for 10k elements.

### §1.3 — Spatial structure completeness

Every export MUST populate the full IFC spatial hierarchy:

```
IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace (per Room) → IfcZone (per Apartment, grouping its rooms)
```

`IfcSpace` MUST be generated from every Room. `IfcZone` MUST group rooms per apartment with a custom `Pset_ApartmentData` carrying unit number, score breakdown (from cognition-stack objective vector), and gross/net floor area.

> ⚠ **CORRECTED 2026-08-18, by measurement.** The sentence below — *"IfcSite is empty; IfcSpace is
> absent; IfcZone is absent"* — is **FALSE ON ALL THREE COUNTS**, and the three gap-fill phases it
> schedules (IFC-α-1 / α-2 / α-3) are **already delivered**:
>
> | Claim | Measured at HEAD |
> |---|---|
> | *"IfcSite is empty"* | `plugins/ifc-export/src/hierarchy.ts:283,318` emits `IFCSITE`, populating `RefLatitude` / `RefLongitude` / `RefElevation` / `LandTitleNumber` / `SiteAddress` (`:256-258`) with a documented project-origin fallback and warning (`:311`) |
> | *"IfcSpace is absent"* | `plugins/ifc-export/src/exporters/space.ts` + `__tests__/space.test.ts` |
> | *"IfcZone is absent"* | `plugins/ifc-export/src/exporters/zone.ts` + `__tests__/zone.test.ts` |
>
> **WHAT STILL STANDS:** the spatial-structure COMPLETENESS invariant this paragraph exists to
> assert — every element resolves to a storey, every storey to a building, every building to the
> site — is unchanged. It is now something to **VERIFY against the shipped exporters**, not to
> build. The §5 file inventory is otherwise accurate: all nine listed paths exist.
>
> ⭐ **This is the same defect class as C73's "SPECIFIED, NOT BUILT" gates and C32's DXF section:
> a contract stamped before the work landed, never re-read after.** Three phases of an execution
> plan were pointed at code that already shipped. *Logged as L-959.*
>
> *Exit condition:* the three α-phases are struck from the master execution tracker, and this
> paragraph becomes a coverage audit of the shipped `space.ts` / `zone.ts` / `hierarchy.ts`
> against the §3 Pset table.

**Current state**: `plugins/ifc-export/src/hierarchy.ts` implements IfcProject → IfcBuilding → IfcBuildingStorey. ~~**IfcSite is empty; IfcSpace is absent; IfcZone is absent.** These are the master plan IFC-α-1/α-2/α-3 gap-fill phases.~~ **← SUPERSEDED, see the banner above.**

### §1.3.0 — CARDINALITY: one `IfcSite`, **N** `IfcBuilding`, each owning its OWN storeys (added 2026-09-09, ADR-0385)

> ⭐ **THIS CLAUSE IS AN AMENDMENT, NOT A CORRECTION.** §1.3 above fixes the *chain*
> `IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace → IfcZone` and asserts
> *"every storey to a building, every building to the site"*. It has never stated a **cardinality**,
> and both shipping writers read the silence as **one**. The founder, 2026-09-09: *"each building
> should be considered as a different building entity for the IFC schema and the inspect tree etc…
> as per IFC standards."* This clause states the number §1.3 left unsaid.

**A project MAY contain SEVERAL buildings. Every export MUST emit one `IfcBuilding` per building
the containment authority records, and each `IfcBuilding` MUST aggregate ITS OWN
`IfcBuildingStorey` set.** A master plan of three blocks is **three `IfcBuilding` entities under
one `IfcSite`**, not one building with nine storeys.

⛔ **Block A "Level 1" and Block B "Level 1" are ONE PRYZM `levelId` and TWO `IfcBuildingStorey`
entities.** An `IfcBuildingStorey` is decomposed from exactly one `IfcBuilding`, so a storey table
keyed by `levelId` alone cannot express a master plan. Pipeline A keys storeys by a composite
**slot**, `storeySlot(buildingId, levelId)` (`packages/file-format/src/export/ifc/ifcIdentity.ts`).

**Relationship entities — unchanged, because the defect was cardinality and not vocabulary:**

| Edge | Entity | Clause |
|---|---|---|
| site ⊃ buildings | `IfcRelAggregates` | IFC4 (ISO 16739-1:2018) §5.1.3.3 + §5.1.2.5; IFC2x3 (ISO/PAS 16739:2005) `IfcKernel.IfcRelDecomposes` |
| building ⊃ storeys | `IfcRelAggregates` | same |
| storey ⊃ products | `IfcRelContainedInSpatialStructure` | IFC4 §5.1.3.5; IFC2x3 `IfcProductExtension` |
| storey ⊃ `IfcSpace` | `IfcRelAggregates` | L-8504 — a spatial element is decomposed, not contained |

Both relation entities exist unchanged in **IFC4 and IFC2x3**, which is what Pipeline A can emit
(`ExportOptions.schema: 'IFC2X3' | 'IFC4'`, default `IFC4`; the Revit route at
`apps/editor/src/engine/initUI.ts:2003` passes `'IFC2X3'`). **IFC4X3 remains out of scope here —
Pipeline A cannot express it, which is §1.1's open L-8560, not this clause's problem.**

#### The containment AUTHORITY, and why it is not `SpaceEnvelope.group`

**ADR-0385 §2 (accepted 2026-09-09):** `hierarchyStore` is the authority for spatial containment;
`SpaceEnvelope.group` (ADR-0383 D1) is the massing-stage **authoring** axis that PROJECTS into it,
exactly as `partOf` does under ADR-0328. **Nothing downstream reads `group` for containment.** The
exporter, the PRYZM inspect tree and the IFC inspect tree all call **one** resolver —
`resolveLevelBuilding()` / `buildBuildingRoster()` in
`packages/core-app-model/src/hierarchy/BuildingResolver.ts` — so the file and the trees cannot give
two answers (C84 EI-9). ⛔ Four records could have answered *"which building is this element in"*;
ADR-0328 forbids a second independent hierarchy source of truth, and this is how that ruling is
kept here.

The resolver is **three-valued and the third value is load-bearing** (§CONTEXT-DATA-HONESTY,
L-581/L-616): `carried` (the substrate records it) · `derived` (it records nothing, so the single
default building — **every project authored before ADR-0385 takes this path**) · `unknown` (it
cannot answer: unreadable store, a **dangling** `buildingId`, or two buildings claiming one
`bimLevelId`). ⛔ An `unknown` still writes a storey — no element may be lost — but MUST raise an
`UNRESOLVED_BUILDING` diagnostic. **An unreadable hierarchy and a genuinely ungrouped project must
never produce the same report.**

#### ⛔ THE BACK-COMPATIBILITY PIN, AND IT IS LOAD-BEARING

`storeyKey()` seeds `ifcGlobalId()`. **The slot MUST degenerate to the bare `levelId` when the
building is the default (`DEFAULT_BUILDING_ID = 'building-1'`)**, so `storey:L0`,
`relcontained:L0` and `relaggregates:storey-spaces:L0` come out **byte-identical** for every
project that has no hierarchy buildings. Re-keying unconditionally re-churns every storey GlobalId
in every existing project — the exact defect **L-8501** fixed.

⛔ **The slot MUST NOT depend on how many buildings the model holds.** A rule like *"compose only
when N > 1"* would re-churn the first building's ids the moment a second was added. The sentinel is
local to the building and nothing else.

⛔ **The arms asserting `IFCRELAGGREGATES === 4`** in
`packages/file-format/__tests__/ifc-export-file-validity.test.ts` — the arithmetic of exactly one
site and exactly one building — **are the ADR-0383 D3 guarantee and are preserved VERBATIM as the
ungrouped arm.** Editing them to accommodate a change retires the guarantee silently.

#### ⚠ WHAT THIS CLAUSE DOES NOT YET DELIVER, stated before it is believed

**N buildings alone are N correct CONTAINERS with NO CONTENTS.** Measured 2026-09-09:
`grep -rni "spaceenvelope" packages/file-format/src plugins/ifc-export/src plugins/ifc-import/src
plugins/ifc-inspector/src` → **0 hits**, and `Wall`/`Slab` carry **no group axis**. So an element's
building is resolved **through its level**, and when two buildings claim one PRYZM `levelId` the
element is genuinely unroutable — that resolves `unknown` and is reported, never guessed.
*Exit condition:* elements carry a building axis of their own (the group→element join), at which
point `resolveElementBuilding` stops going through the level.

### §1.3.1 — Hosted openings resolve to a storey THROUGH THEIR HOST (added 2026-08-23, L-8900)

⚠ §1.3's completeness invariant — *"every element resolves to a storey"* — must NOT
be read as *"every element carries a storey"*. **Doors and windows do not, by
design.**

**MEASURED:** `packages/schemas/src/elements/Door.ts:48` and `Window.ts:48` declare
`wallId: idRef('wall')` and **no** `levelId`. Per [C15](C15-HOSTED-ELEMENT-CONTRACT.md)
a hosted opening is an offset along a wall, so its storey is a property **of the host
wall** (`Wall.ts:91`). A door with no `levelId` is **correct**, not defective.

⭐ **Consequence for any tool that groups or reports by storey:** it MUST resolve a
hosted opening through `wallId → wall.levelId`, and MUST distinguish a **derived**
storey from a **carried** one. Treating the absence as "unassigned" is a false
statement about the model. The IFC tree made exactly that error against a real
project — 117 openings in one bucket — and the fix is recorded as L-8900..L-8903.

⛔ **THIS SAYS NOTHING ABOUT WHAT THE EXPORT SHOULD WRITE.** Whether an exported
`.ifc` should emit `IfcRelContainedInSpatialStructure` for a hosted opening — or
rely solely on `IfcRelVoidsElement` / `IfcRelFillsElement` and let the host carry
containment — is a **live MVD question tracked as L-8590 and NOT decided here**.
A VIEW grouping a door under its host's storey carries no standards risk; a FILE
asserting direct containment might. **Do not cite this section as authority to
change the exporter.**

### §1.4 — IfcSite full attributes

`IfcSite` attributes (`refLatitude`, `refLongitude`, `refElevation`, `LandTitleNumber`, `SiteAddress`) MUST be populated from `SiteModel` when present, and project-origin-promoted otherwise. Cross-link to [C12](C12-GEOSPATIAL.md) for the LTP-ENU coordinate transforms.

### §1.5 — Pset round-trip is preserved

`IFCMetaStore` (`plugins/ifc-export/src/meta-store.ts`) is the side-car GlobalId + custom Pset round-trip mechanism. Import → edit → export MUST preserve GlobalIds + Psets that survived through a Revit-side or third-party IFC editor.

**Current state**: IMPLEMENTED in PRYZM 2 S57. This contract codifies it as binding.

### §1.6 — Every Pset write opens a span

Per P8, every `IfcPropertySet` write emits an OpenTelemetry span. Span name: `pryzm.ifc.exportPset` with attributes `{ entityType, psetName, propertyCount }`.

**Current state**: `plugins/ifc-export/src/otel.ts` exists with P8 spans. Audit confirms.

---

### §1.7 — ⛔ There are TWO export pipelines, and this contract governed the wrong one

> **Added 2026-08-23 · lane IFCEXP49 · L-8500..L-8560 · [ADR-0362](../adrs/ADR-0362-one-ifc-globalid-codec-at-l0-not-a-second-pipeline.md), [ADR-0363](../adrs/ADR-0363-ifc-globalid-is-derived-not-stored.md).**

Measured at HEAD with two tools, because a single grep is not proof (ripgrep and `grep -rn` agreed):

| | **Pipeline A** — the shipping path | **Pipeline B** — the contract's subject until today |
|---|---|---|
| Root | `packages/file-format/src/export/ifc/**` (L3) | `plugins/ifc-export/src/**` (L6) |
| Reached from the UI | ⭐ **YES** — `ExportRailPanel` → `BimService.exportIfc` → `exportIFC` | **NO** |
| Why not | — | `runtime-composer/src/ImportExportSlots.ts` throws `RuntimeNotWiredError('ifc.export.run','F.12.4')`; `exportProjectToIFC4X3` has **zero** non-test callers |
| Schema written | **IFC4** (IFC2X3 selectable) | IFC4 / IFC4X3 |
| Geometry | real triangulated mesh | box extrusion only |
| Openings | present | **absent** |

**Two consequences for this contract, both binding:**

1. **§1.1 (*"Every export targets IFC4X3, NOT IFC2x3 and NOT IFC4"*) is FALSE of the path users
   actually use** — it writes IFC4. This is recorded as a real, open gap (**L-8560**), not quietly
   reconciled. Pipeline A's `IfcExporter.ExportOptions.schema` is `'IFC2X3' | 'IFC4'`; IFC4X3 is not
   an option it can express. Migrating it is a geometry-and-entity question, not a flag.
2. **Everything §3 and §5 assert about "the exporter" was measured against Pipeline B.** Where the
   two disagree, the reader must be told which one is meant. §3 now says so.

⭐ **This is the same defect shape the §1.3 banner already records for IFC-α-1/α-2/α-3 and that
C25 §2.1 records for the class maps: a contract stamped against one artefact while a different
artefact does the work.** It is the third recurrence inside this one file. The convergence in
ADR-0362 is the structural answer — a shared core at L0 that both pipelines import — so that a
statement about "the GlobalId minter" is now true of both by construction rather than by
coincidence.

*Exit condition:* Pipeline A gains IFC4X3, or Pipeline B is wired and Pipeline A retired. Until one
of those happens, **every claim in this contract must name its pipeline.**

#### §1.7.1 — ⛔ **THE TWO PIPELINES MUST BE RESOLVED BEFORE ANY COMPONENT IFC MAPPING IS DESIGNED** (added 2026-09-01, lane EXT · audit §6.1)

**Why this clause exists now, and why it is a precondition rather than a note.** The component
format already ships an **authoring-time IFC binding** — `ifc-mapping.json` is a first-class ZIP
entry (`packages/file-format/src/family-types.ts`) and every parameter carries
`ifcMapping: { psetName, propertyName } | null` (`family-schema.ts`, `FamilyParameterSchema`). So a
component author can bind a parameter to a Pset **today**, and the value of that binding is decided
entirely by which exporter eventually reads it.

> **MUST.** No component→IFC mapping — entity type, Pset authoring, classification, or the
> `ifc-mapping.json` consumer — may be designed until **L-8560 is resolved and the surviving
> pipeline is named in this contract.** A mapping authored against Pipeline B inherits **box
> extrusion and no openings**; a mapping authored against Pipeline A inherits **IFC4, not IFC4X3**.
> ⛔ **Designing against "the exporter" chooses one of those silently, and the choice becomes
> permanent the moment a `.pryzm-family` is signed carrying it** (the envelope is content-addressed
> and signed — `signing/schema-hash`, `signing/signature`).

> **MUST NOT.** The resolution may not be *"support both."* Two exporters reading one
> `ifc-mapping.json` differently is the split-brain C84 EI-1 forbids, arriving through a file format
> rather than through a store — and per §1.7's own history, **this file has already recorded the
> same shape three times.**

⚠ **The honest current answer for anyone who needs one before L-8560 closes — measured, not
assumed (2026-09-01):**

```
grep -rn "ifcMapping\|ifc-mapping" --include=*.ts packages/file-format/src/export plugins/ifc-export/src
   -> NO OUTPUT.  Neither pipeline mentions the binding, in any form.
```

**Neither exporter reads it.** The only code that carries `ifcMapping` forward is
`packages/family-loader` (`loadFamily.ts` → `LoadedFamily.ifcMapping`), the eight parameter-level
migration ops that preserve it, and `packages/family-instance`'s bake input — and
`@pryzm/family-loader` / `@pryzm/family-instance` have **no importer outside themselves**, on any
axis (no manifest dependency, no source import).

So the read channel is not merely unproven — **it does not exist**. Treat `ifcMapping` as
**persisted authoring intent with NO reader**, state it that way wherever it is described (C69 §2.2
— `UNKNOWN` is never rendered as LIVE), and **do not describe component IFC export as a
capability.** *A binding whose reader is unnamed is `[[authored-but-unwired]]` with a standards
logo on it.* ⭐ **This is also the cheapest possible moment to choose the pipeline**: nothing
downstream has to be migrated, because nothing downstream exists.

### §1.8 — `IfcGloballyUniqueId` is valid and stable, by construction

> **Added 2026-08-23 · lane IFCEXP49 · L-8500/L-8501.**

**Validity.** Every `GlobalId` MUST satisfy: 22 characters; every character in
`0-9 A-Z a-z _ $`; and the FIRST character no greater than `'3'` (it encodes only the top 2 bits of
the 128-bit value — the condition hand-rolled validators forget). The single authority is
`packages/schemas/src/ifc/GlobalId.ts` (**L0**, pure, zero imports), and **both pipelines import
it**. `plugins/ifc-export/src/guid.ts` is re-exports only.

> ⚠ **Until 2026-08-23 this held for neither pipeline in production.** Pipeline A wrote
> `crypto.randomUUID()` — a **36-character** hyphenated UUID — verbatim into `GlobalId` through an
> encoder that was the identity function (`IfcModelBuilder.ts:21`, `IfcSpatialStructure.ts:21`).
> **Every `.ifc` file PRYZM had ever exported was schema-invalid at every GlobalId.** A correct
> encoder sat in Pipeline B with **zero production call sites**.

**Stability.** A `GlobalId` MUST be stable for the life of the element. It is **DERIVED**, never
stored in a lookup table and never randomised:

* a persisted `ifcData.guid` (an imported IFC identity) is **preserved verbatim**;
* otherwise it is derived from the PRYZM element id — `globalIdFromStableKey('el:' + id)`.

Relationship entities derive from namespaced keys (`opening:`, `relvoids:`, `relfills:`,
`relcontained:`, `relaggregates:`, `pset:`). ⛔ **The lane seeds and these namespace strings are a
persistence format**: changing either silently re-mints every derived GlobalId in every project.

**Every write site MUST go through `toIfcGlobalId(value, stableKey)`**, which cannot return an
invalid value. A rule that asks an author to remember to call an encoder is a rule that decays; this
one is enforced by the type of the only reachable minter.

### §1.9 — A wrong number is worse than a missing one

> **Added 2026-08-23 · lane IFCEXP49 · L-8510..L-8515, L-8530, L-8541.**

Where the model does not carry a fact, the export MUST omit it rather than emit a default that reads
as a measurement. Three rulings, each from a shipped defect:

1. **Quantities.** A `Qto_*` Net quantity MUST NOT be emitted when the opening figures are unknown.
   `openingsArea ?? 0` made `NetSideArea === GrossSideArea` and `NetVolume === GrossVolume` for every
   wall ever exported — the file asserted, with a standard quantity set's authority, that a wall full
   of windows was solid. `undefined` now means UNKNOWN and suppresses; `0` means known-to-have-none
   and is emitted. **A QS reads Net; they do not read the absence of Net.**
2. **Property sets.** A `Pset_*Common` property MUST NOT be emitted unless a real element field
   backs it. See §3.
3. **Silent relocation is forbidden.** An element whose `levelId` does not resolve MUST NOT be
   reassigned to another storey. It goes to an explicitly-named `UNASSIGNED` storey and raises an
   error diagnostic. The old behaviour put it in *the first storey in the map*: the file opened
   cleanly, every element was present, and a third-floor wall sat on the ground floor. Nothing warned.

Every such condition MUST raise an `ExportDiagnostic` reaching both the console and the caller
(`ExportOptions.onDiagnostic`). Codes: `UNRESOLVED_LEVEL`, `MISSING_HOST_WALL`,
`OPENING_WITHOUT_GEOMETRY`, `EMPTY_GEOMETRY`, `UNKNOWN_IFC_CLASS`.

## §2 — Element coverage table

Every PRYZM element type MUST export to a typed IfcEntity with its canonical Pset:

| PRYZM type | IfcEntity | Pset | Status |
|---|---|---|---|
| Wall | `IfcWall` | `Pset_WallCommon` | EXISTS (S56 wall.ts); audit FireRating/AcousticRating coverage |
| Slab | `IfcSlab` | `Pset_SlabCommon` | EXISTS (S56 slab.ts); audit Pset depth |
| Floor (finish) | `IfcCovering` · PredefinedType `FLOORING` | `Pset_CoveringCommon`, `Pset_FlooringCommon` | ⭐ **ROW SPLIT 2026-08-23 (L-8302)** — see §2.1 |
| Curtain panel | `IfcPlate` · PredefinedType `CURTAIN_PANEL` | `Pset_PlateCommon` | ⭐ **ROW ADDED 2026-08-23 (L-8302)** — see §2.1 |
| Door | `IfcDoor` | `Pset_DoorCommon`; `OperationType` derived from door type | EXISTS (S56 door.ts); audit OperationType derivation |
| Window | `IfcWindow` | `Pset_WindowCommon`; `PartitioningType` derived from system type | EXISTS (S56 window.ts); audit PartitioningType |
| Door/window **opening profile** (non-rectangular void shape — [C86 §10.1](C86-ELEMENT-WALL-OPENING.md#§10.1), incl. the `custom` kind, [ADR-0373](../adrs/ADR-0373-window-custom-outline-authored-in-elevation-via-the-wall-profile-editor.md)) | n/a — still `buildBoxRepresentation`, no `IfcArbitraryClosedProfileDef` | n/a — no Pset property invented (§1.9 rule 2 forbids it) | **DECLARED ABSENCE, wired 2026-08-25 (§OUTLINE82, D9).** The box geometry is unchanged; `door.ts`/`window.ts` now write the profile kind (and, for `custom`, the vertex count) into the entity's `Description` via `opening-profile-declaration.ts`, proven through `exportProjectToIFC`/`exportProjectToIFC4X3` (`opening-profile-declaration.test.ts`). A faithful profile representation (the `IfcArbitraryClosedProfileDef` this row does NOT build) stays a **GAP**. ⚠ Runs on Pipeline B only (§1.7) — not the pipeline the app's export button calls |
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


### §2.1 — Corrections of 2026-08-23 (lane IFCTREE47, L-8300..L-8306)

Building the IFC primitive tree required a SINGLE authority for "what IFC class is
a PRYZM `wall`?". Establishing it found **four** rival statements of that fact, not
one, and two disagreements with this table.

**The four maps, and how they relate:**

| # | Where | Maps | Rows | Live consumers |
|---|---|---|---|---|
| A | `packages/core-app-model/src/CoreElement.ts:77` `ELEMENT_TYPE_TO_IFC_CLASS` | `ElementType` → IFC class NAME | 19 | ⚠ **ONE** (`CreateHandrailCommand.ts:185`) |
| B | `packages/file-format/src/export/ifc/IfcModelBuilder.ts:24` `IFC_CLASS_MAP` | IFC class NAME → web-ifc numeric code | 20 | the export path the app runs |
| C | `packages/file-format/src/export/ifc/FragmentReader.ts:250` `mapImportedIfcClass` | raw IFC type → class NAME | ~16, private | import path only |
| D | **this table** | PRYZM type → IfcEntity | — | normative |

⭐ **A and B are NOT rivals — they COMPOSE** (`ElementType` → class name → web-ifc
code). The real rivalry is **A vs D**, plus **58 hand-typed `ifcClass:` literals**
across `command-registry` and `core-app-model` stores that bypass A's factory
entirely. `createIfcMetadata()`, the function A exists to serve, has **one** live
call site — A is effectively dead code that nonetheless disagrees with this table.

**Two rows: the CODE was wrong, this contract was right** (per the CLAUDE.md
conflict-resolution order — when code disagrees with a contract, the code is wrong):

| PRYZM type | Code said | This table says | Verdict |
|---|---|---|---|
| `furniture` | `IfcFurnishingElement` | **`IfcFurniture`** | contract wins |
| `plumbing` | `IfcFlowTerminal` | **`IfcSanitaryTerminal`** | contract wins |

Both are emittable — `node_modules/web-ifc/ifc-schema.d.ts` exposes
`IFCFURNITURE = 1509553395` and `IFCSANITARYTERMINAL = 3053780830`. *(This lane did
NOT verify offline whether IFC4X3 makes the supertypes abstract, and does not assert
it; the binding reason is the ordering, not a schema claim.)*

**One row: the CODE was right and THIS TABLE was imprecise** — hence the split above.
The old row read *"Slab / Floor → `IfcSlab`"*, conflating two families PRYZM keeps
separate. `packages/core-app-model/src/stores/FloorSystemTypeStore.ts` stamps
`ifcTypeName: 'FLOORING'` on every floor system type — that is literally
`IfcCoveringTypeEnum.FLOORING`. **PRYZM's `floor` is a FINISH; its `slab` is the
STRUCTURE.** Mapping the finish to `IfcSlab` would emit two structural slabs where
the model has one slab and one covering.

**⛔ EIGHTEEN element families have no row here at all.** The L0 id vocabulary
(`packages/schemas/src/types/Id.ts:136`, **36** members) and `core-app-model`'s
`ElementType` (`CoreElement.ts:7`, **18** members) **disagree** — they even spell
curtain walling differently (`curtainwall` vs `curtain-wall`). Families in L0 with no
row in this table include `lift`, `liftPart`, `pool`, `balcony`, `water`,
`boundaryLine`, `verticalCirculation`, `structural`, and `section`.

⭐ These are recorded as **UNMAPPED and NAMED** by
`plugins/ifc-inspector/src/tree/ifc-class-authority.ts`, never invented and never
proxied. That matters because `IfcModelBuilder.ts:156` silently falls back to
`IFCBUILDINGELEMENTPROXY` for any class it does not know — so today an unranked
family exports as a generic proxy **with no warning anywhere**. Non-products
(`view`, `sheet`, `schedule`, `project`) are separated from real gaps: absent by
design is not the same as absent by omission.

*Exit condition:* a founder decision on the unranked families, each landing as a row
in this table; then the 58 literals and map A collapse into the single authority, and
`createIfcMetadata` either gains real callers or is deleted.

> ⚠ **The authority lives in a PLUGIN, which is the wrong layer for it long-term.**
> `plugins/ifc-inspector/src/tree/ifc-class-authority.ts` is L6; a class mapping this
> fundamental belongs at L0/L2 beside the vocabularies it reconciles. It was placed
> there to avoid a cross-lane edit to `core-app-model` and `file-format` while the
> export half was being reworked by another lane. **Promoting it is L-8307.**

---

## §3 — Pset depth

`Pset_WallCommon` MUST carry: `LoadBearing`, `FireRating`, `AcousticRating`, `SurfaceSpreadOfFlame`, `ThermalTransmittance`, `IsExternal`, `ExtendToStructure`.

`Pset_DoorCommon` MUST carry: `FireRating`, `AcousticRating`, `SecurityRating`, `IsExternal`, `Infiltration`, `SmokeStop`.

`Pset_WindowCommon` MUST carry: `FireRating`, `AcousticRating`, `SecurityRating`, `ThermalTransmittance`, `Infiltration`, `GlazingAreaFraction`.

`Pset_SlabCommon` MUST carry: `LoadBearing`, `FireRating`, `AcousticRating`, `ThermalTransmittance`, `IsExternal`, `Combustible`, `Compartmentation`.

`Pset_SpaceCommon` MUST carry: `Reference`, `NetFloorArea`, `GrossFloorArea`, `GrossVolume`, `Height`, `IsExternal`, `OccupancyType`, `OccupancyNumber`.

`Pset_FurnitureTypeCommon` MUST carry: `Reference`, `Style`, `NominalLength`, `NominalWidth`, `NominalHeight`, `Status`.

### §3.1 — ⛔ Corrections of 2026-08-23 (lane IFCEXP49, L-8540/L-8541)

> The MUSTs above are **schema requirements PRYZM currently cannot meet**, and saying so is the
> point of this subsection. They are retained as the target; what follows is what is measurable today.

**Which pipeline?** Every "current state" claim in §3 above was written against **Pipeline B**, which
nothing runs (§1.7). Restated per pipeline:

| Pset | Writer supports | Pipeline B ships | Pipeline A ships (the user's file) |
|---|---|---|---|
| `Pset_WallCommon` | 11 properties | **`Status='NEW'` alone** — the caller passes `{ id: wall.id }` | `Status` + `Reference` |
| `Pset_DoorCommon` | 14 | 2 (`Status`, `FireRating`) | `Status` + `Reference` + `FireRating` |
| `Pset_WindowCommon` | 13 | 2 (`Status`, `FireRating`) | `Status` + `Reference` + `FireRating` |
| `Pset_SlabCommon` / `Pset_ColumnCommon` / `Pset_CurtainWallCommon` | — | **absent entirely** | `Status` + `Reference` |

⭐ **Before L-8540, Pipeline A shipped NONE of these for a natively-authored model.** Every reader's
Common pset was a passthrough of `ifcData.psetCommon`, a field that exists only on elements
IMPORTED from IFC — `WallData.ifcData` is declared `{ guid, ifcClass }` and nothing else. A model
drawn entirely in PRYZM exported no `Pset_WallCommon`, `Pset_SlabCommon`, `Pset_DoorCommon`,
`Pset_WindowCommon` or `Pset_ColumnCommon` **at all**.

⚠ **The audit framed this as a starved caller — "the writers are already correct, the callers starve
them; plumb the real element data". That is right for exactly two properties and wrong for the rest.**
For `Status` (← `CoreElement.properties.phase`) and `FireRating` (← `DoorData.fireRating` /
`WindowData.fireRating`) the data existed and is now plumbed. For the others **there is nothing on the
element to pass.** Verified against `packages/schemas/src/elements/Wall.ts` and
`packages/geometry-wall/src/WallTypes.ts`, these have **no source field anywhere in PRYZM**:

> `IsExternal` · `LoadBearing` · `ThermalTransmittance` · `AcousticRating` · `Combustible` ·
> `Compartmentation` · `SurfaceSpreadOfFlame` · `ExtendToStructure` · `SecurityRating` ·
> `Infiltration` · `GlazingAreaFraction` · `SmokeStop`

**They are NOT emitted, and MUST NOT be.** A standard property carrying a fabricated value is worse
than absence, because the consumer cannot tell the difference — the same ruling as §1.9 and the same
reasoning the materials section applies to `IfcMaterial` (§5.1). A test asserts each of the eight
wall properties stays absent.

**`Status` is emitted always**, defaulting to `NEW`: an authoring tool's default genuinely is new
construction, and it is the one property downstream checkers treat as mandatory. PRYZM's `'Future'`
phase is deliberately **not** mapped — `PEnum_ElementStatus` has no future member and `TEMPORARY`
means temporary *works*, so mapping it would be a lie with an enum's authority.

*Exit condition:* **this is a SCHEMA gap, not a plumbing gap (L-8541).** The twelve properties reach
the file the moment the element schemas carry them; no exporter change is needed. Until then §3's
MUSTs are unmet and this table is the honest reading.

**Current state**: `plugins/ifc-export/src/psets.ts` implements core Psets; Pipeline A's is
`packages/file-format/src/export/ifc/readers/commonPsets.ts`. The depth audit (IFC-γ-1 in master
plan) verifies coverage — **against the table in §3.1, not the MUSTs above.**

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
