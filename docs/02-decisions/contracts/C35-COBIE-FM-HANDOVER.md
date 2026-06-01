# C35 — COBie FM Handover

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the Construction-Operations Building information exchange (COBie) handover artefact — the FM-oriented projection of a PRYZM project that travels alongside the IFC4X3 main export. Codifies the 18-sheet COBie schema, the COBie exporter (IFC4 COBie MVD + .xlsx), the COBie validator, and the FM equipment catalogue that maps IfcTypeProduct ↔ IfcProduct pairs for handover.
> **Depends on**: [C20](C20-BUILDING-AND-APARTMENT-AGGREGATES.md), [C25](C25-IFC-EXPORT-PRODUCTION.md), [C28](C28-DATA-PANEL-AND-AUTOMATION.md).
> **Downstream**: facility-management consumers (CAFM, CMMS, IWMS); the FM-handover preset of the Export wizard ([C06](C06-UI-SHELL-AND-TOOLS.md)); the equipment-list reporting in the Data panel ([C28 §7](C28-DATA-PANEL-AND-AUTOMATION.md)).
> **Key principles**: **P5** (CobieDocument schema pure), **P6** (export driven through commands), **P8** (every sheet write + every validation pass opens a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §7](../03-execution/plans/master-implementation-plan.md). Tracked as a follow-on to IFC-δ-2.
> **Prior-art**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) — C35 listed under medium-priority interchange contracts. C25 §6 currently stubs COBie as "optional Facility Management handover"; this contract replaces that stub with a binding specification.

---

## §1 — Invariants

### §1.1 — COBie 2.4 is the binding target schema

Every COBie export MUST conform to **COBie 2.4** (buildingSMART, 2020) sheet schema and column ordering. Earlier dialects (COBie 1.x, "COBie Lite") are NOT supported. COBie 3.0 (draft) MAY be emitted behind a feature flag; until ratified, 2.4 is the production wire format.

The export MUST be addressable in two coordinated forms:

- **COBie MVD** — an IFC4 file produced via the buildingSMART **IFC4 COBie 2.4 Model View Definition** (the "COBie 2.4 — Design" or "COBie 2.4 — Construction" MVD as selected by the export preset).
- **COBie Workbook** — a multi-sheet `.xlsx` file with exactly the 18 sheets defined in §2.

Both forms MUST be produced for any single COBie handover. A handover that omits either form is invalid.

### §1.2 — Every IfcSpace MUST appear in the COBie Space sheet

Every `IfcSpace` instance produced by [C25 §1.3](C25-IFC-EXPORT-PRODUCTION.md) MUST have a corresponding row in the COBie **Space** sheet. The `Space.Name` MUST equal the `IfcSpace.Name`; `Space.CreatedBy` MUST resolve to a row in the Contact sheet; `Space.FloorName` MUST resolve to a row in the Floor sheet.

A COBie export with a dangling `IfcSpace` (no Space-sheet row, or a Space-sheet row whose FloorName does not resolve) MUST fail the §6 `check-cobie-validity` gate hard.

### §1.3 — Every IfcType + IfcComponent pair MUST cross-reference

For every `IfcTypeProduct` (e.g. `IfcDoorType`, `IfcWindowType`, `IfcFurnitureType`, `IfcSanitaryTerminalType`) emitted to the COBie MVD, the COBie **Type** sheet MUST contain a row, AND every occurrence (`IfcDoor`, `IfcWindow`, `IfcFurniture`, `IfcSanitaryTerminal`) of that type MUST be a row in the COBie **Component** sheet whose `Component.TypeName` equals the `Type.Name`.

A Type row with zero Component rows is allowed (a type catalogued but not yet placed); a Component row whose `TypeName` does not resolve to a Type row is forbidden and MUST hard-fail validation.

### §1.4 — Contact emails MUST validate

Every row in the COBie **Contact** sheet MUST carry a syntactically valid email in the `Email` column (RFC 5322 / WHATWG living-standard intersection). `Contact.Email` is the primary key for foreign-key references from other sheets (`CreatedBy`, `ResponsibleParty`, etc.); a row with an invalid or empty Email MUST be rejected by §6.

Where PRYZM cannot resolve a real email (anonymous AI-generated contacts, placeholder owners), the exporter MUST synthesise a deterministic non-routable email of the form `placeholder+<role>@pryzm.local`, AND the workbook MUST carry a workbook-level note explaining the placeholder convention. Routable but unverified emails MUST NOT be silently fabricated.

### §1.5 — Document references MUST be resolvable

Every row in the COBie **Document** sheet MUST carry either:

- An absolute URL (`http://` or `https://` scheme) that returns HTTP 2xx at export time (a HEAD probe, behind a `--check-document-urls` flag), OR
- A project-relative path (forward-slash, no `..` traversal) whose target exists inside the project bundle's `documents/` folder.

The bundled-document path MUST be embedded in the `.pryzm` file ([C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)) so the handover travels intact. An unresolvable Document row MUST hard-fail validation.

### §1.6 — Every COBie sheet write opens a span

Per **P8**, every sheet emission and every validation pass MUST emit an OpenTelemetry span:

- Sheet write span: `pryzm.cobie.writeSheet` with attributes `{ sheetName, rowCount, durationMs }`.
- Validation pass span: `pryzm.cobie.validate` with attributes `{ ruleId, severity, passed }`.
- Export-level span: `pryzm.cobie.export` parent span carrying `{ format: 'mvd' | 'xlsx' | 'both', elementCount, sheetCount, durationMs, valid }`.

Span coverage is asserted by the existing P8 span-coverage check in CI.

### §1.7 — COBie validation MUST run before export emission

The `CobieValidator` MUST execute against the in-memory `CobieDocument` BEFORE either the MVD writer or the XLSX writer begins serialisation. A validator failure at severity `ERROR` MUST abort the export — no malformed `.xlsx` or `.ifc` file is ever written to disk. `WARN`-severity failures MUST be surfaced to the user via the Export wizard report but MUST NOT block emission.

Validator severities:

- `ERROR` — schema violation, FK dangle, invalid email, unresolvable document, missing required column. Aborts.
- `WARN` — best-practice violation, optional column unpopulated, COBie guidance recommendation unmet. Surfaces.
- `INFO` — informational counters (row counts, type/instance ratios). Logged only.

### §1.8 — Optional sheets MUST be populated when requested

The COBie **Spare**, **Resource**, and **Job** sheets are optional per COBie 2.4. The Export wizard preset MUST expose these as toggles. When toggled ON, the sheet MUST be populated with the user-supplied data (or with deterministic placeholders flagged for review); a toggle-ON sheet emitted empty is forbidden.

When toggled OFF, the sheet MUST still be present in the workbook with its header row only (per COBie 2.4 — every sheet exists; empty rows are legitimate).

### §1.9 — GlobalIds round-trip from C25 MUST be preserved

Every COBie row that maps to an IFC entity (Component, Type, Space, Zone, Floor, Facility, System, Assembly, Connection) MUST carry the IFC `GlobalId` in the `ExtIdentifier` column. The `GlobalId` MUST be identical to the value emitted by the C25 exporter for the same entity, so a downstream tool can join the COBie workbook back to the IFC by `GlobalId`.

A `GlobalId` mismatch between the COBie workbook and the companion IFC4X3 file MUST hard-fail the §6 join-consistency gate.

### §1.10 — FmEquipmentCatalogue is the single source for Type ↔ Component mapping

The `FmEquipmentCatalogue` (§3.4) is the ONLY authoritative source for which PRYZM element types yield COBie Type/Component pairs versus which are absorbed into the Component sheet alone (no Type) or excluded entirely (architectural-only with no FM relevance, e.g. annotations).

Hard-coding this taxonomy anywhere else in the exporter is forbidden. The catalogue MUST be readable as a pure data structure (no I/O, no THREE, no DOM — per **P5**) and SHOULD be extensible by plugins per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md).

### §1.11 — Coordinate sheet derives from C25 geospatial state

The COBie **Coordinate** sheet MUST derive every row from the `IfcMapConversion` + `IfcLocalPlacement` state already established by [C25 §7](C25-IFC-EXPORT-PRODUCTION.md) and [C12](C12-GEOSPATIAL.md). The COBie exporter MUST NOT compute or recompute coordinates; it MUST consume the C25 outputs.

### §1.12 — System and Assembly sheets reflect runtime topology

The COBie **System** and **Assembly** sheets MUST be populated from the live PRYZM topology — `SystemRegistry` (for MEP / structural / fit-out systems) and the C20 Apartment / Building aggregates (for compositional Assemblies). Authoring synthetic systems purely to satisfy the sheet is forbidden; an empty System sheet is legitimate when the project carries no systems.

### §1.13 — COBie export is command-driven

Per **P6**, the COBie export pipeline MUST be entered through the command bus (§4). Direct calls to `CobieExporter.export(...)` from UI code are forbidden. AI-initiated COBie exports ([C09](C09-AI-AND-VISIBILITY-INTENT.md)) MUST dispatch the same commands as the Export wizard.

---

## §2 — Schema — the 18 COBie sheets

The `CobieDocument` schema lives in `packages/schemas/cobie/` (L0, pure). It models the COBie 2.4 workbook as 18 typed sheet arrays, each with its required + optional columns. Column names match COBie 2.4 exactly; PRYZM does not rename or reorder columns.

### §2.1 — Sheet inventory

| # | Sheet | Mandatory? | Owns | Foreign keys (selected) |
|---|---|---|---|---|
| 1 | **Contact** | yes | People + organisations referenced by every other sheet | — (root of FK graph) |
| 2 | **Facility** | yes | The single building / project the workbook describes | `CreatedBy → Contact.Email` |
| 3 | **Floor** | yes | One row per `IfcBuildingStorey` | `CreatedBy → Contact.Email` |
| 4 | **Space** | yes | One row per `IfcSpace` (every Room → row) | `CreatedBy → Contact.Email`, `FloorName → Floor.Name` |
| 5 | **Zone** | optional | One row per `IfcZone` (per Apartment, per C20) | `SpaceNames → Space.Name[]` |
| 6 | **Type** | yes | One row per `IfcTypeProduct` selected by `FmEquipmentCatalogue` | `CreatedBy → Contact.Email` |
| 7 | **Component** | yes | One row per `IfcProduct` whose type is selected by `FmEquipmentCatalogue` | `TypeName → Type.Name`, `Space → Space.Name`, `CreatedBy → Contact.Email` |
| 8 | **System** | optional | One row per logical system (MEP / structural / fit-out) | `ComponentNames → Component.Name[]` |
| 9 | **Assembly** | optional | One row per compositional assembly (apartment, building, sub-assembly) | `SheetName ∈ {Component, Type, Space, Zone}`, `ParentName + ChildNames` |
| 10 | **Connection** | optional | One row per documented connection between two Components | `RowName1 → Component.Name`, `RowName2 → Component.Name` |
| 11 | **Spare** | toggle | One row per spare part associated with a Type | `TypeName → Type.Name`, `Suppliers → Contact.Email[]` |
| 12 | **Resource** | toggle | Tools, materials, training resources | `CreatedBy → Contact.Email` |
| 13 | **Job** | toggle | Scheduled maintenance / inspection jobs | `TypeName → Type.Name`, `ResourceNames → Resource.Name[]`, `Priors → Job.Name[]` |
| 14 | **Impact** | optional | Environmental / cost / accessibility impacts per Type or Component | `SheetName ∈ {Type, Component}`, `RowName` |
| 15 | **Document** | optional | Drawings, O&M manuals, warranties | `SheetName + RowName` (polymorphic), `CreatedBy → Contact.Email` |
| 16 | **Attribute** | optional | Extra Pset attributes not in the COBie canonical columns | `SheetName + RowName` (polymorphic) |
| 17 | **Coordinate** | optional | Per-row Cartesian coordinate (derived from C25, §1.11) | `SheetName + RowName` |
| 18 | **Issue** | optional | Open issues / risks recorded against any sheet | `SheetName + RowName`, `Owner → Contact.Email` |

### §2.2 — Column conventions (across all sheets)

| Column class | Required | Convention |
|---|---|---|
| `Name` | yes (on every sheet that has rows) | Sheet-unique key; case-sensitive |
| `CreatedBy` | yes (on most sheets) | FK → `Contact.Email` |
| `CreatedOn` | yes | ISO 8601 UTC timestamp |
| `Category` | yes | Uniclass 2015 `Ss`/`Pr` code (matches C25 §5); MAY fall back to OmniClass if Uniclass absent |
| `ExtSystem` | yes | Always `"PRYZM"` |
| `ExtObject` | yes | The IFC entity type, e.g. `IfcDoor`, `IfcSpace` |
| `ExtIdentifier` | yes | The IFC `GlobalId` (per §1.9) |
| `Description` | optional | Free-text |
| `Comments` | optional | Free-text, used by Issue / Job sheets primarily |

### §2.3 — TypeScript surface (the schema, abridged)

```ts
// packages/schemas/cobie/sheets.ts — L0, pure
export interface CobieRow {
  readonly Name: string;
  readonly CreatedBy: ContactEmail;      // branded
  readonly CreatedOn: IsoUtcTimestamp;   // branded
  readonly Category: ClassificationCode; // branded — Uniclass or OmniClass
  readonly ExtSystem: 'PRYZM';
  readonly ExtObject: IfcEntityName;     // branded
  readonly ExtIdentifier: IfcGlobalId;   // branded — round-trips with C25
  readonly Description?: string;
  readonly Comments?: string;
}

export interface ContactRow extends CobieRow {
  readonly Email: ContactEmail;          // primary key
  readonly GivenName: string;
  readonly FamilyName: string;
  readonly Company?: string;
  readonly Phone?: string;
  readonly Department?: string;
  readonly OrganizationCode?: string;
}

export interface SpaceRow extends CobieRow {
  readonly FloorName: string;            // FK → Floor.Name
  readonly RoomTag?: string;
  readonly UsableHeight?: Meters;
  readonly GrossArea?: SquareMeters;
  readonly NetArea?: SquareMeters;
}

export interface TypeRow extends CobieRow {
  readonly AssetType: 'Fixed' | 'Moveable';
  readonly Manufacturer?: ContactEmail;  // FK
  readonly ModelNumber?: string;
  readonly WarrantyGuarantorParts?: ContactEmail;
  readonly WarrantyDurationParts?: Months;
  readonly WarrantyGuarantorLabor?: ContactEmail;
  readonly WarrantyDurationLabor?: Months;
  readonly ReplacementCost?: Money;
  readonly ExpectedLife?: Years;
  readonly NominalLength?: Meters;
  readonly NominalWidth?: Meters;
  readonly NominalHeight?: Meters;
  readonly ModelReference?: string;
  readonly Shape?: string;
  readonly Size?: string;
  readonly Color?: string;
  readonly Finish?: string;
  readonly Grade?: string;
  readonly Material?: string;
  readonly Constituents?: string;
  readonly Features?: string;
  readonly AccessibilityPerformance?: string;
  readonly CodePerformance?: string;
  readonly SustainabilityPerformance?: string;
}

export interface ComponentRow extends CobieRow {
  readonly TypeName: string;             // FK → Type.Name
  readonly Space: string;                // FK → Space.Name
  readonly SerialNumber?: string;
  readonly InstallationDate?: IsoUtcTimestamp;
  readonly WarrantyStartDate?: IsoUtcTimestamp;
  readonly TagNumber?: string;
  readonly BarCode?: string;
  readonly AssetIdentifier?: string;
}

// … 13 more sheet shapes follow the same pattern …

export interface CobieDocument {
  readonly contacts: readonly ContactRow[];
  readonly facility: FacilityRow;        // singleton
  readonly floors: readonly FloorRow[];
  readonly spaces: readonly SpaceRow[];
  readonly zones: readonly ZoneRow[];
  readonly types: readonly TypeRow[];
  readonly components: readonly ComponentRow[];
  readonly systems: readonly SystemRow[];
  readonly assemblies: readonly AssemblyRow[];
  readonly connections: readonly ConnectionRow[];
  readonly spares: readonly SpareRow[];
  readonly resources: readonly ResourceRow[];
  readonly jobs: readonly JobRow[];
  readonly impacts: readonly ImpactRow[];
  readonly documents: readonly DocumentRow[];
  readonly attributes: readonly AttributeRow[];
  readonly coordinates: readonly CoordinateRow[];
  readonly issues: readonly IssueRow[];
  readonly meta: CobieDocumentMeta;      // schema version, generator stamp
}
```

The full schema is authored in `packages/schemas/cobie/` and re-exported by `@pryzm/schemas`. L0 purity is verified by the existing `check-schemas-pure` lint.

---

## §3 — Stores / API surface

### §3.1 — `packages/cobie-export/` (NEW, L4)

The runtime home for the COBie pipeline. Sibling of `plugins/ifc-export/`. Lives at L4 (renderer-adjacent) because it consumes C25 output and emits files.

| Module | Path | Responsibility |
|---|---|---|
| Builder | `packages/cobie-export/src/builder.ts` | Walks the live `PryzmRuntime` + the C25 IFC pre-export model, emits a `CobieDocument` |
| Validator | `packages/cobie-export/src/validator.ts` | Runs the §6 rule set against a `CobieDocument` |
| MVD writer | `packages/cobie-export/src/writers/mvd.ts` | Emits an IFC4 COBie MVD file (delegates STEP serialisation to `plugins/ifc-export`) |
| XLSX writer | `packages/cobie-export/src/writers/xlsx.ts` | Emits the multi-sheet `.xlsx` workbook (delegates to a vendored `xlsx-writer`) |
| Equipment catalogue | `packages/cobie-export/src/equipment-catalogue.ts` | `FmEquipmentCatalogue` — the Type ↔ Component mapping table (§3.4) |
| Orchestrator | `packages/cobie-export/src/orchestrator.ts` | The single entry point: `buildCobieDocument → validate → writeBoth` |
| OTel | `packages/cobie-export/src/otel.ts` | The span helpers per §1.6 |

### §3.2 — Public surface

```ts
/** Build a CobieDocument from the live runtime + the C25 export model. */
export function buildCobieDocument(
  runtime: PryzmRuntime,
  ifcModel: IfcPreExportModel,         // from C25, the in-memory IFC graph
  options: CobieBuildOptions,
): Promise<CobieDocument>;

/** Validate a document. Returns the full report; throws nothing. */
export function validateCobieDocument(
  doc: CobieDocument,
  options?: CobieValidateOptions,
): CobieValidationReport;

/** Emit a COBie MVD (IFC4 file). */
export function writeCobieMvd(
  doc: CobieDocument,
  ifcModel: IfcPreExportModel,
  target: Writable | Blob,
): Promise<void>;

/** Emit a COBie workbook (.xlsx, 18 sheets). */
export function writeCobieWorkbook(
  doc: CobieDocument,
  target: Writable | Blob,
): Promise<void>;

/** Orchestrator — the one entry called by command handlers. */
export function exportCobieHandover(
  runtime: PryzmRuntime,
  options: CobieExportOptions,
): Promise<CobieExportResult>;
```

Every exported function above MUST carry a JSDoc per [C31 §1.12](C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) and open a span at the boundary per **P8**.

### §3.3 — Build options

```ts
export interface CobieExportOptions {
  readonly format: 'mvd' | 'xlsx' | 'both';      // default 'both'
  readonly preset: 'design' | 'construction';    // selects MVD variant
  readonly variant: 'us' | 'uk';                 // §9 open question — default 'us'
  readonly includeSpare: boolean;
  readonly includeResource: boolean;
  readonly includeJob: boolean;
  readonly checkDocumentUrls: boolean;
  readonly target: { mvd?: ExportTarget; xlsx?: ExportTarget };
  readonly placeholderContact?: ContactRow;      // for synthesised emails
}
```

### §3.4 — `FmEquipmentCatalogue`

The catalogue is a pure record mapping every PRYZM element type to one of three FM dispositions:

| Disposition | Meaning | Examples |
|---|---|---|
| `type-and-component` | Both Type and Component rows emitted; FM-relevant equipment | door, window, plumbing fixture, kitchen appliance, light, sanitary terminal, HVAC unit |
| `component-only` | Only a Component row (no managed Type); architectural element with FM relevance but no asset-class management | space, zone, slab, ceiling, roof |
| `excluded` | Neither row; not FM-relevant | annotation, dimension, grid, level, sheet, drawing, view, preview-only elements |

```ts
export const fmEquipmentCatalogue: Readonly<Record<ElementType, FmDisposition>> = {
  // type-and-component
  door:                'type-and-component',
  window:              'type-and-component',
  furniture:           'type-and-component',
  plumbingFixture:     'type-and-component',
  kitchenAppliance:    'type-and-component',
  light:               'type-and-component',
  // component-only
  space:               'component-only',
  zone:                'component-only',
  slab:                'component-only',
  ceiling:             'component-only',
  roof:                'component-only',
  stair:               'component-only',
  // excluded
  annotation:          'excluded',
  dimension:           'excluded',
  grid:                'excluded',
  // … remainder of the union exhaustively mapped …
};
```

The catalogue MUST be exhaustively typed against the `ElementType` union — a `never`-check at the bottom asserts every type is mapped. Adding a new element type to PRYZM MUST add a row here in the same PR, enforced by `check-cobie-catalogue-coverage` (§6).

### §3.5 — No new Zustand stores

C35 does NOT introduce a runtime store. The `CobieDocument` is a transient build product computed at export time, validated, written, and discarded. Per-export state lives in the orchestrator's local scope.

---

## §4 — Commands

Three commands per **P6**. All three follow the C16 authoring protocol.

| Command | Purpose | Mutates? |
|---|---|---|
| `cobie.export.ifc` | Emit the COBie MVD (IFC4 file only) | No — read-only on runtime |
| `cobie.export.xlsx` | Emit the COBie workbook (.xlsx file only) | No — read-only on runtime |
| `cobie.validate` | Run the validator without emitting any file; surface report to user | No — read-only on runtime |

### §4.1 — Payloads

```ts
// L0, packages/schemas/commands/cobie.ts
export interface CobieExportIfcPayload {
  readonly options: CobieExportOptions & { format: 'mvd' };
}

export interface CobieExportXlsxPayload {
  readonly options: CobieExportOptions & { format: 'xlsx' };
}

export interface CobieValidatePayload {
  readonly options: Omit<CobieExportOptions, 'format' | 'target'>;
}

// Composite — used by the FM-handover preset
export interface CobieExportBothPayload {
  readonly options: CobieExportOptions & { format: 'both' };
}
```

### §4.2 — Command handler invariants (per C16)

Per **CA-14** + **CA-15** ([C16](C16-COMMAND-AUTHORING-PROTOCOL.md)):

- Each handler MUST open a `pryzm.cobie.export` span on entry and close it on completion.
- Each handler MUST run `validateCobieDocument` BEFORE invoking any writer (§1.7).
- Each handler MUST NOT mutate any store. COBie export is a read-only projection — there is no undo entry.
- The composite `'both'` path MUST build the `CobieDocument` ONCE and pass it to both writers (no double build).
- AI-initiated dispatch ([C09](C09-AI-AND-VISIBILITY-INTENT.md)) MUST go through these same commands. Direct AI handler shortcuts to `writeCobieWorkbook` are forbidden.

### §4.3 — Return contract

Every command returns a `CobieExportResult`:

```ts
export interface CobieExportResult {
  readonly status: 'ok' | 'validation-failed' | 'io-failed';
  readonly report: CobieValidationReport;
  readonly artefacts: {
    readonly mvd?: { uri: string; bytes: number; sha256: string };
    readonly xlsx?: { uri: string; bytes: number; sha256: string };
  };
  readonly durationMs: number;
}
```

The `sha256` of the emitted artefact is recorded so a downstream provenance lookup ([C23](C23-PROVENANCE-AND-AI-AUDIT.md)) can fingerprint the handover.

---

## §5 — UI

### §5.1 — Export wizard with FM-handover preset

The COBie surface lives behind the **Export › FM Handover (COBie)** entry in the Export wizard (`apps/editor`, under [C06](C06-UI-SHELL-AND-TOOLS.md) panels). The wizard is structured as four steps:

1. **Preset selection** — Design (in-progress models) or Construction (as-built handover).
2. **Sheet toggles** — Spare / Resource / Job (the optional sheets per §1.8). Each toggle shows a row-count estimate.
3. **Validation report** — Runs the validator live against the current runtime; surfaces ERROR + WARN counts; ERROR blocks "Next".
4. **Output** — Target file paths (MVD + workbook), final emit.

### §5.2 — Equipment catalogue inspector

A read-only sub-panel exposes the live `FmEquipmentCatalogue` for the current project, grouped by disposition. Plugin-contributed extensions ([C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) appear as a separate group. The panel is informational — the catalogue is binding, not user-editable at runtime.

### §5.3 — Data panel integration

The Data panel ([C28 §7](C28-DATA-PANEL-AND-AUTOMATION.md)) MUST expose two read-only COBie projections:

- **Type sheet preview** — every row of the live `Type` sheet, sortable, filterable.
- **Equipment list** — the live `Component` sheet joined to its `Type` row, with Space + Floor context.

The Data panel's "Export to COBie" button dispatches `cobie.export.xlsx` with the FM-handover preset.

### §5.4 — Preview style

Where the wizard renders status indicators (validation passed / warned / failed), they MUST follow [C18](C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) §41 — PRYZM purple `#6600FF` for the "ready" state. The wizard MUST NOT introduce new accent colours.

---

## §6 — Tests / CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| **`check-cobie-validity`** | Every COBie export passes the buildingSMART COBie 2.4 validator (or the closest open-source equivalent, e.g. `BIMcollab COBie validator`'s rule set transcoded). FK dangle, email syntax, missing required columns. Hard-fail on ERROR. | NEW — `tools/ga-gate/check-cobie-validity.ts` |
| **`check-cobie-xlsx-schema`** | Workbook has exactly 18 sheets in the canonical order; every sheet has the canonical column header row matching COBie 2.4; no extra columns; no renamed columns. | NEW — `tools/ga-gate/check-cobie-xlsx-schema.ts` |
| **`check-cobie-mvd-ifc-validity`** | The MVD output passes the C25 IFC4 schema validator. Reuses `check-ifc-validate` (C25 §8). | extends C25's gate |
| **`check-cobie-join-consistency`** | For every row in the MVD with a `GlobalId`, the matching workbook row's `ExtIdentifier` is identical. Per §1.9. | NEW — `tools/ga-gate/check-cobie-join.ts` |
| **`check-cobie-catalogue-coverage`** | Every `ElementType` union member is mapped in `FmEquipmentCatalogue` (compile-time `never`-check + runtime exhaustivity). | NEW — `tools/ga-gate/check-cobie-catalogue-coverage.ts` |
| **`check-cobie-spans`** | Every public function in `packages/cobie-export/` opens ≥ 1 span (P8). | extends existing `check-spans` |
| **`check-cobie-schema-pure`** | `packages/schemas/cobie/` carries no I/O, no THREE, no DOM (P5). | extends existing `check-schemas-pure` |

### §6.1 — Conformance fixtures

`packages/cobie-export/__tests__/fixtures/` ships three canonical fixtures:

1. **`minimal-apartment.json`** — a 1-storey, 4-room project with 2 doors, 1 window, 1 plumbing fixture. Sanity floor for unit tests.
2. **`mid-rise-handover.json`** — a 5-storey building with 20 apartments, full handover. The §7 NFT benchmark fixture.
3. **`malformed-edge-cases.json`** — a project deliberately constructed to trigger every ERROR-class validator rule. The validator's negative-test fixture.

### §6.2 — Round-trip test

A round-trip test MUST verify:

- C25 IFC4X3 export → in-memory IFC graph → COBie MVD → re-parsed by `plugins/ifc-import` → COBie sheets re-derived. The re-derived `CobieDocument` MUST be structurally equal to the originally built document (modulo timestamp).

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Build `CobieDocument` for a 10k-equipment project | < 10 s | `cobie-build-10k.bench.ts` |
| Write `.xlsx` workbook for the same | < 15 s | `cobie-xlsx-10k.bench.ts` |
| Write COBie MVD for the same | < 15 s | reuses C25 NFT path |
| **End-to-end COBie export (build + validate + both writers) for 10k equipment** | **< 30 s** | `cobie-e2e-10k.bench.ts` |
| Validator pass over a 10k-equipment document | < 3 s | `cobie-validate-10k.bench.ts` |
| Workbook file size for 10k equipment | < 25 MB | size assert in CI |

All NFTs run on the C10 reference hardware. Regression > 15% fails CI per [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md).

---

## §8 — Migration plan

### §8.1 — Layering on C25

C35 layers on the existing C25 IFC4X3 export path. The COBie MVD writer does NOT fork a parallel IFC pipeline; it adds a COBie-MVD-shaped projection on top of the C25 pre-export model. Concretely:

1. C25 builds the `IfcPreExportModel` as today.
2. The COBie orchestrator reads that model + the live runtime.
3. The orchestrator emits the MVD by invoking C25's writer with a COBie MVD filter (which selects only the COBie-relevant entities + Psets).
4. The orchestrator emits the workbook in parallel.

### §8.2 — Phasing

| Phase | Work | ETA | Status |
|---|---|---|---|
| **COBie-α (3 wk)** | `CobieDocument` schema + `packages/cobie-export/` skeleton + `FmEquipmentCatalogue` + builder + unit tests against `minimal-apartment.json` fixture | TBD | NOT STARTED |
| **COBie-β (3 wk)** | XLSX writer + MVD writer (delegates to C25) + the 3 commands + Export wizard preset | TBD | NOT STARTED |
| **COBie-γ (2 wk)** | `CobieValidator` + the 5 new CI gates + round-trip test | TBD | NOT STARTED |
| **COBie-δ (2 wk)** | NFT benchmarks + 10k-equipment fixture + perf tuning + the Data panel projections | TBD | NOT STARTED |

Total: ~10 weeks. Falls under master-plan IFC-δ-2 follow-on.

### §8.3 — Existing code

There is NO existing COBie code to migrate. C25 §6 currently states "NOT implemented" — this contract is the design that replaces that stub.

### §8.4 — Backward compatibility

C35 introduces no backward-compatibility burden. The MVD is a strict subset of an IFC4 file (C25's existing target), so consumers that already parse C25 output continue to work. The workbook is a new artefact — no prior PRYZM workbook format exists to migrate from.

---

## §9 — What is NOT in this contract

- **Generic IFC export** — [C25](C25-IFC-EXPORT-PRODUCTION.md) governs the main IFC4X3 path. C35 only layers the COBie MVD projection on top.
- **Schedule / 4D** — [C37](./) (proposed) — construction-phase scheduling is not COBie's remit, even though COBie's `Job` sheet brushes against scheduling.
- **Cost / 5D** — [C38](./) (proposed) — cost estimation and Qto Psets sit in C28 + C38; the COBie `Impact` sheet carries a cost field but is not an estimation surface.
- **Data panel mechanics** — [C28](C28-DATA-PANEL-AND-AUTOMATION.md) governs the panel itself; C35 only specifies the two COBie projections the panel exposes.
- **Revit-side COBie** — Revit's built-in COBie Extension is out of scope. PRYZM's COBie pipeline is independent and validated against buildingSMART rules directly.
- **BCF (BIM Collaboration Format)** — clash + issue coordination is a sibling concern; the COBie `Issue` sheet is a static FM-handover snapshot, not a live BCF channel.
- **PII handling** — [C22](C22-PRIVACY-AND-PII-TIER.md) governs the privacy tier of Contact-sheet emails. C35 specifies the wire format; C22 specifies retention + redaction.
- **Family schemas** — [P0 Family Platform docs](../../03-execution/specs/) — the equipment-type catalogue may extend through Family Platform plugins, but the families themselves are out of scope.
- **DXF / DWG round-trip** — [C32](./) (proposed) — drawing-file interchange is separate from FM handover.

---

## §10 — Open questions

### §10.1 — COBie 2.4 vs upcoming 3.0

COBie 3.0 is in buildingSMART draft as of 2026. Differences from 2.4 include:

- Tighter JSON-LD alignment (COBie 3.0 ships a JSON-LD encoding alongside the workbook).
- Re-canonicalised column ordering on Type + Component sheets.
- A new `Sustainability` sheet (overlap with C25 + C38).

**Open**: do we ship 2.4 as the production wire format and 3.0 behind a feature flag, OR target 3.0 directly once draft → final lands? Current contract is binding on 2.4; revisit when 3.0 ratifies.

### §10.2 — US COBie vs UK COBie

The US (GSA / WBDG) and UK (BSI BS 1192-4) COBie variants diverge on:

- Required-vs-optional column subsets (UK BS 1192-4 mandates more columns).
- Classification taxonomy (US leans OmniClass; UK mandates Uniclass 2015).
- Date format (US permits MM/DD/YYYY in some legacy tools; UK is strict ISO 8601).
- Contact identifier (US allows DUNS-style organisation codes; UK uses a different OrgCode regime).

**Open**: C35 ships `variant: 'us' | 'uk'` (§3.3) as an export option, defaulting to `'us'`. The UK profile MUST additionally validate the BSI BS 1192-4 extra-required columns; the US profile MUST emit OmniClass when the source Category is Uniclass. The full variant matrix is unspecified pending sign-off from UK customer-side reviewers.

### §10.3 — Validator implementation choice

The buildingSMART COBie validator is canonical but proprietary and not embeddable. Open-source alternatives:

- `BIMcollab COBie validator` rule set (rules are public; runtime is proprietary).
- `xBIM` COBie validator (open source, .NET — would need a Node port).
- A PRYZM-authored validator that transcribes the COBie 2.4 normative rules into TypeScript.

**Open**: the contract requires "per buildingSMART COBie 2.4 + cobie.org guidance" — the implementation choice (transcribed in-house vs vendored open-source) is deferred to COBie-γ phase planning.

### §10.4 — Placeholder-email policy

§1.4 mandates `placeholder+<role>@pryzm.local` for unresolvable contacts. Some FM consumers reject `.local` TLDs as invalid; a fallback to `placeholder+<role>@no-reply.pryzm.io` (a real TLD pointing at a dead-letter handler) is under consideration.

**Open**: which placeholder domain ships as default? Decision deferred to UX review with FM customer-side stakeholders.

### §10.5 — Document-bundle storage layout

§1.5 mandates that bundled Document targets live under `documents/` inside the `.pryzm` file. The `.pryzm` file format ([C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)) does not yet reserve a `documents/` namespace. A C05 amendment is required before COBie-α ships.

**Open**: amend C05 to reserve `documents/`, OR introduce a parallel side-car file (`<project>.documents.zip`) carried alongside the `.pryzm`? Current draft assumes the C05 amendment route.

---

*End — C35 COBie FM Handover, 2026-06-01.*
