# C38 — Cost / 5D

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs construction cost estimation — the **5D** dimension of BIM. Per-element quantity takeoff (sourced from the C25 IFC Qto Psets — area · volume · count · length) multiplied by a versioned, regional unit-cost pricing table produces a per-element line item, rolled up by CSI MasterFormat · NRM2 · or Uniformat II. Codifies the `PricingTable` import surface, the `TakeoffRule` mapping, the `CostStore`, the `cost.*` command bus surface, the Cost panel UI, the export adapters (Bluebeam · CostX · SAP · Excel), and the budget-vs-actual reconciliation.
> **Depends on**: [C25](C25-IFC-EXPORT-PRODUCTION.md) (Qto Psets are the sole quantity source), [C28](C28-DATA-PANEL-AND-AUTOMATION.md) (Data panel grid + bulk-edit chassis is reused for the Cost panel grid), [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (P6 — every cost mutation through commandBus), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md), [C23](C23-PROVENANCE-AND-AI-AUDIT.md) (provenance attribution for AI-suggested unit costs).
> **Sibling**: [C37](C37-SCHEDULE-4D.md) (4D — time). C37 and C38 share the project-phase model (the "phase" axis joins schedule + cost), but each owns its own store and command surface.
> **Downstream**: QS / cost-consultant deliverables · client budget reporting · ERP-export pipeline (SAP / Oracle / Sage) · marketplace cost-catalogue plugins.
> **Key principles**: **P5** (pricing schemas pure), **P6** (cost mutations via commandBus), **P8** (every import + every estimate emits an OTel span), **P0.3** (pricing-catalogue plugins are first-class marketplace artefacts).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §11 (Phase 6.1 commerce + interchange)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Every CostItem MUST cite a source

Every `CostItem` row carries a non-null `source` block: `{ catalogueId, catalogueName, revisionDate, sourceRowRef }`. A `CostItem` with no source is invalid; the schema validator rejects it. AI-suggested unit costs (per [C23](C23-PROVENANCE-AND-AI-AUDIT.md)) MUST carry `source.catalogueId = 'ai-suggested'` AND `source.modelRef` AND `source.promptHash`.

The "source" is auditable — every line item in every export traces to a published cost catalogue (RSMeans 2026 NA · BCIS 2026 Q2 UK · Spon's Architects' & Builders' Price Book 2026 · a customer's `custom://<orgId>/<tableId>` table) or to an AI suggestion with the prompt + model recorded.

### §1.2 — Pricing currency MUST be explicit per table

Every `PricingTable` carries a top-level `currency: ISO4217Code` (e.g. `GBP` · `USD` · `EUR` · `AED`). Currency MUST NOT be inferred from locale. A `CostItem` derived from a multi-currency table is invalid; tables are single-currency. A project that mixes tables of different currencies MUST run conversion through `cost.convertCurrency` (§4) and store the converted lines with `convertedFromCurrency` + `conversionRate` + `conversionDate` provenance.

### §1.3 — Roll-up keys MUST follow a named taxonomy

Every cost roll-up MUST be keyed by exactly one of:

- **CSI MasterFormat** (50-division, 6-digit codes — North America)
- **NRM2** (RICS New Rules of Measurement, 3-level hierarchy — UK / Commonwealth)
- **Uniformat II** (functional-element hierarchy — A10/A20/B10 etc., North America)

The project chooses one taxonomy at `cost.initEstimate` time and that taxonomy is the project's roll-up axis for the life of the estimate. Switching taxonomies requires a NEW estimate (per §1.7 — estimates are versioned).

A `CostItem` MAY also carry a `secondaryRollupKey` for cross-reporting, but the primary key is binding.

### §1.4 — Takeoff quantity MUST trace back to a C25 Qto value

Every `CostItem.quantity` value MUST be derived from a [C25](C25-IFC-EXPORT-PRODUCTION.md) Qto Pset value via a declared `TakeoffRule`. The `TakeoffRule.source` references the C25 Pset name + property name (e.g. `Qto_WallBaseQuantities.NetSideArea`).

Three legal `TakeoffRule.kind` values:

- `qto-direct` — `quantity = QtoPset.property` (e.g. wall NetSideArea drives `m²` cost)
- `qto-derived` — `quantity = f(QtoPset.property, ...)` for compound formulas (e.g. `paint_area = NetSideArea × 2` for both faces)
- `count-by-type` — `quantity = COUNT(elements WHERE type = X)` (e.g. number of `IfcDoor` with `PartitioningType = 'SINGLE_SWING_LEFT'`)

The forbidden fourth case — `quantity = manual_input` — is permitted ONLY as a per-element override (§1.8) with justification.

### §1.5 — Every import + every estimate run emits an OTel span

Per P8:

- `pryzm.cost.importPricing` — `{ catalogueId, rowCount, currency, revisionDate, fileSizeBytes }`
- `pryzm.cost.runEstimate` — `{ estimateId, elementCount, lineItemCount, totalAmount, currency, rollupTaxonomy, durationMs }`
- `pryzm.cost.export.<adapter>` — `{ estimateId, adapter, fileSizeBytes }`
- `pryzm.cost.convertCurrency` — `{ fromCurrency, toCurrency, rate, source }`

Spans MUST open at the public boundary of `packages/cost-engine` (§8).

### §1.6 — Cost changes flow through commandBus per P6

UI code MUST NOT mutate `CostStore` directly. Every mutation — import a table, assign a takeoff rule, override an element, run an estimate, export — is a command (`cost.*`, §4). One undo step covers one logical user action (a bulk-import is one undo step; a 10k-element estimate is one undo step that records the estimate-version snapshot, not 10k snapshots).

### §1.7 — Pricing tables are immutable post-import (versioned)

Once a `PricingTable` is imported, its rows are frozen. Editing a row is forbidden. To revise a table the user MUST re-import the catalogue (which generates a new `PricingTable.id` + `revisionDate`); the prior version remains in the project for audit. Existing `CostItem` rows continue to point at their original `PricingTable.id` until the user explicitly re-runs the estimate (`cost.reprice`).

Custom (customer-authored) tables follow the same rule: a customer can author a v1, but editing a row creates v2 — v1 is sealed.

Rationale: cost catalogues are licensed data. RSMeans / BCIS / Spon's licensing agreements forbid post-import modification of catalogue rows. The contract enforces this by schema.

### §1.8 — Per-element cost overrides require a justification

A user MAY override `CostItem.unitCost` on a per-element basis (e.g. "this façade panel was negotiated at £125/m² instead of catalogue £180"). The override schema REQUIRES a non-empty `justification: string` (≥ 16 chars) AND an `overriddenBy: UserId` AND an `overriddenAt: timestamp`. Overrides without justification are rejected by schema validation.

The override is displayed in the Cost panel as a yellow badge with the justification on hover.

### §1.9 — Budget-vs-actual is a paired estimate

A project MAY hold N estimates simultaneously. The user designates ONE as `role: 'budget'` (the agreed contract sum) and zero or more as `role: 'forecast'` or `role: 'actual'`. The Cost panel surfaces a variance view (actual − budget · forecast − budget) keyed by the roll-up taxonomy. Variance is a derived view — not stored.

### §1.10 — AI-suggested unit costs are flagged + auditable

When the AI host (per [C09](C09-AI-AND-VISIBILITY-INTENT.md)) suggests a unit cost (e.g. "estimate cost for a non-standard custom-fabricated element"), the suggestion MUST be wrapped in an `AiSuggestion` envelope per [C23](C23-PROVENANCE-AND-AI-AUDIT.md): `{ modelRef, promptHash, generatedAt, confidence, humanAcceptedAt? }`. An unaccepted AI suggestion appears in the panel with a distinct icon and is excluded from totals until the user accepts.

### §1.11 — Cost estimates are sealed at issue

When the user runs `cost.issueEstimate(estimateId)`, the estimate transitions `draft → issued`. Issued estimates are frozen — no further mutation is permitted. To produce a revised number the user creates a NEW estimate (the prior estimate remains for audit). This mirrors C30 §1.2 sheet revisions.

### §1.12 — Discipline-neutrality

The contract MUST NOT presume the project is residential, commercial, or any specific building type. The pricing-table schema, the takeoff-rule registry, and the roll-up taxonomies all apply to any building type. Per the C00 governance discipline-neutrality bar.

### §1.13 — No silent zero-quantity lines

If `cost.runEstimate` cannot resolve a Qto value for an element matched by a takeoff rule (e.g. the C25 export omitted the Pset for that element type), the engine MUST NOT emit a `CostItem` with `quantity: 0`. Instead, the line is emitted with `quantity: null` and a non-empty `unresolvedReason: string`, and the panel surfaces the row in a distinct "needs takeoff" tab. Zero-quantity lines are reserved for the genuine "element exists but contributes nothing to this cost" case (e.g. a placeholder annotation), which MUST be flagged explicitly by the takeoff rule.

### §1.14 — Estimate snapshot is reproducible

Re-running `cost.runEstimate` on the same `(model snapshot · pricing-table revision · takeoff-rule set · overrides)` MUST produce byte-identical line items. The engine is deterministic — no Date.now() in line totals, no Map iteration-order dependency in roll-up. CI bench `cost-determinism.bench.ts` runs the same fixture twice and diffs the JSON output.

---

## §2 — Schema (in `packages/schemas/src/cost/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `PricingTable` | `{ id: PricingTableId, name, catalogueId, vendor, revisionDate, currency: ISO4217, region: ISO3166, taxonomy: 'csi-masterformat' \| 'nrm2' \| 'uniformat2', rowCount, sealed: true, importedAt, importedBy }` |
| `PricingTableRow` | `{ id, tableId, taxonomyCode, description, unit: UnitOfMeasure, unitCost: number, currency: ISO4217, source: SourceRef }` (immutable per §1.7) |
| `TakeoffRule` | `{ id, name, kind: 'qto-direct' \| 'qto-derived' \| 'count-by-type', elementTypeFilter: ElementTypePredicate, qtoSource: { psetName, propertyName }, formula?: string, unit: UnitOfMeasure }` |
| `CostItem` | `{ id, estimateId, elementId, elementType, takeoffRuleId, pricingRowId, quantity, unitCost, lineTotal, currency: ISO4217, rollupKey: string, source: SourceRef, override?: ItemOverride }` |
| `ItemOverride` | `{ unitCost: number, justification: string, overriddenBy: UserId, overriddenAt: timestamp }` (justification ≥ 16 chars) |
| `Estimate` | `{ id, name, projectId, role: 'budget' \| 'forecast' \| 'actual', taxonomy, currency, status: 'draft' \| 'issued' \| 'superseded', items: CostItemId[], totalAmount, createdAt, issuedAt?, issuedBy? }` |
| `CostRollup` | `{ estimateId, taxonomy, nodes: RollupNode[] }` (derived view; not persisted) |
| `RollupNode` | `{ key, label, depth, lineTotal, childKeys: string[], itemIds: CostItemId[] }` |
| `SourceRef` | `{ catalogueId, catalogueName, revisionDate, sourceRowRef, modelRef?, promptHash? }` |
| `AiSuggestion` | `{ modelRef, promptHash, generatedAt, confidence, humanAcceptedAt? }` |
| `CurrencyConversion` | `{ fromCurrency, toCurrency, rate, ratedAt, source: 'manual' \| 'ecb-daily' \| 'oanda' \| 'fixer' }` |

### §2.2 — Branded IDs

`PricingTableId`, `EstimateId`, `CostItemId`, `TakeoffRuleId` are branded string IDs per the ADR-0001 typed-ID strategy.

### §2.3 — `UnitOfMeasure` enum

`m²` · `m³` · `m` · `each` · `t` · `kg` · `hour` · `day` · `ft²` · `ft³` · `ft` · `yd²` · `yd³`. Unit MUST match the C25 Qto property's native unit; conversion happens in the takeoff rule.

### §2.4 — Reserved roll-up codes

| Taxonomy | Reserved root keys |
|---|---|
| CSI MasterFormat | 01 General Requirements · 03 Concrete · 04 Masonry · 05 Metals · 06 Wood + Plastics · 08 Openings · 09 Finishes · 22 Plumbing · 23 HVAC · 26 Electrical · … (50 total) |
| NRM2 | 1 Substructure · 2 Superstructure · 3 Internal Finishes · 4 Fittings · 5 Services · 6 External Works · 7 Prelims |
| Uniformat II | A Substructure · B Shell · C Interiors · D Services · E Equipment + Furnishings · F Special Construction + Demolition · G Building Sitework |

### §2.5 — Field-level constraints

| Field | Constraint |
|---|---|
| `PricingTable.revisionDate` | ISO-8601 date (YYYY-MM-DD); MUST NOT be in the future |
| `PricingTable.currency` | ISO 4217 three-letter code; rejected at import if absent |
| `PricingTableRow.unitCost` | `number > 0`; a zero or negative unit cost is rejected at import |
| `PricingTableRow.taxonomyCode` | MUST match the parent `PricingTable.taxonomy` enum; mixed-taxonomy rows are rejected |
| `Estimate.totalAmount` | derived from `Σ CostItem.lineTotal`; never stored verbatim |
| `CostItem.lineTotal` | `quantity × (override.unitCost ?? unitCost)`; null when `quantity == null` |
| `ItemOverride.justification` | `length >= 16` after `trim()`; line breaks count as one char each |
| `Estimate.role` | exactly one estimate per project per role-key `(role, phaseRef)`; uniqueness gate at `cost.initEstimate` |

### §2.6 — Foreign keys

| FK | Target | Cascade |
|---|---|---|
| `CostItem.elementId` | `ElementStore.elementId` | element-delete → the line is preserved BUT tagged `orphaned: true`; never silently dropped |
| `CostItem.takeoffRuleId` | `TakeoffRuleRegistry` | rule-delete → orphaned (same behaviour as element delete) |
| `CostItem.pricingRowId` | `PricingTableStore` | table-delete forbidden if any `CostItem` references it (per §1.7 sealing) |
| `Estimate.projectId` | `ProjectStore` | project-delete cascades to all estimates (deleted with audit retention per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)) |

---

## §3 — Stores

### §3.1 — `CostStore` (`packages/stores/src/CostStore.ts`)

Holds the project's `Estimate` set, `CostItem` rows, item overrides, AI suggestions awaiting acceptance. Reactive to element-add / element-remove from the project's `ElementStore` — adding a new element does NOT auto-add a cost line (the user must rerun `cost.runEstimate` to incorporate; this is by design for predictability).

### §3.2 — `PricingTableStore` (`packages/stores/src/PricingTableStore.ts`)

Holds all imported `PricingTable` + their `PricingTableRow` content. Append-only after import (§1.7). Indexed by `taxonomyCode` for fast row lookup during `cost.runEstimate`.

### §3.3 — `TakeoffRuleRegistry` (`packages/cost-engine/src/takeoffRules.ts`)

Per-element-type rule registry. Ships with built-in rules for the 18+ canonical element types (wall · slab · door · window · column · beam · stair · roof · curtain-wall · furniture · plumbing fixture · light · etc.). Customer overrides via `cost.assignTakeoffRule` (§4).

### §3.4 — Persistence

Estimates + items + tables persist to the `.pryzm` file per [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) under a new `cost/` sub-namespace. Issued estimates and sealed tables are CRDT-protected from edit by an `immutable: true` Yjs annotation.

### §3.5 — Pipeline (`runEstimate`)

```
elements: ElementId[]                       (filtered by estimate.scope)
   │
   ▼  for each element
   │   resolve TakeoffRule via TakeoffRuleRegistry.matchElement(el)
   │     - no rule → skip (warning surfaced; not an error)
   │
   ▼  fetch Qto value via qtoBridge.read(el, rule.qtoSource)
   │     - missing Pset → emit CostItem with quantity:null + unresolvedReason
   │
   ▼  match PricingTableRow by (taxonomy, rule.taxonomyCode, currency)
   │     - no match → emit CostItem with unitCost:null + unresolvedReason
   │
   ▼  apply override (if any) via CostStore.overrides[elementId]
   │
   ▼  compute lineTotal = quantity × resolvedUnitCost
   │
   ▼  attach rollupKey from PricingTableRow.taxonomyCode
   │
   ▼  CostItem[]
   │
   ▼  CostRollup = buildRollup(items, estimate.taxonomy)
   │
   ▼  estimate.totalAmount = Σ CostItem.lineTotal
   │
   ▼  span: pryzm.cost.runEstimate.close
```

Every stage is pure; side effects (store writes, span emission) happen at the boundary in `composeCostEngine()`. The pipeline is bounded by `runBatch` per [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) so one estimate = one undo step.

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.5.

| Command | Effect |
|---|---|
| `cost.importPricing` | Parse a catalogue file (CSV / XLSX / RSMeans XML / BCIS XML / custom JSON) → create `PricingTable` + N `PricingTableRow`; seal the table per §1.7 |
| `cost.assignTakeoffRule` | Bind a `TakeoffRule` to an element-type filter; later `runEstimate` calls use the binding |
| `cost.initEstimate` | Create a new `Estimate` with name, role, taxonomy, currency, source pricing-table(s); status: `draft` |
| `cost.runEstimate` | Materialise `CostItem` rows: iterate elements, apply takeoff rules → fetch Qto values → match `PricingTableRow` by taxonomy code → compute `lineTotal` |
| `cost.reprice` | Re-fetch unit costs from a different table version (typically a new catalogue revision); preserves overrides |
| `cost.overrideElement` | Apply a per-element `ItemOverride` (requires justification ≥ 16 chars per §1.8) |
| `cost.clearOverride` | Remove a per-element override; line reverts to catalogue unit cost |
| `cost.convertCurrency` | Convert all lines of an estimate to a target currency at a stated rate (records the conversion in the estimate's metadata) |
| `cost.assignSecondaryRollup` | Tag every line with a secondary roll-up key (e.g. project uses NRM2 primary + CSI secondary) |
| `cost.issueEstimate` | Transition `draft → issued`; estimate is sealed (§1.11) |
| `cost.supersedeEstimate` | Transition `issued → superseded` when a newer estimate issues |
| `cost.acceptAiSuggestion` | Mark an `AiSuggestion` as human-accepted (per C23); the suggested unit cost takes effect |
| `cost.rejectAiSuggestion` | Discard the suggestion |
| `cost.exportExcel` | Excel workbook with sheets: Summary · Items · Rollup · Overrides · Audit-trail |
| `cost.exportCostX` | CostX-compatible XML/JSON export (Exactal CostX is the dominant QS desktop tool) |
| `cost.exportBluebeam` | Bluebeam Revu markup XML (line items as PDF markups for QS review) |
| `cost.exportSAP` | SAP S/4HANA Project System BoQ import format |
| `cost.deleteEstimate` | Delete a `draft` estimate (issued/superseded estimates MUST NOT be deleted — they remain audit material) |

---

## §5 — UI

### §5.1 — Cost panel

A new editor-side panel `apps/editor/src/ui/cost/` rendered in the right-side tab strip alongside Inspect and Data. Three sub-views:

1. **Estimate list** — header table of all `Estimate` rows in the project with role + status + total.
2. **Quantity breakdown** — per-line grid (reuses the [C28](C28-DATA-PANEL-AND-AUTOMATION.md) Data-panel grid component): columns `Element · Type · TakeoffRule · Quantity · Unit · UnitCost · LineTotal · Override · RollupKey · Source`. Right-click to override + record justification.
3. **Roll-up tree** — collapsible tree keyed by the chosen taxonomy (CSI / NRM2 / Uniformat). Each node shows subtotal · child count · % of total. Click a node to filter the breakdown grid.

### §5.2 — Override-with-justification modal

Triggered when the user attempts to override a unit cost. The modal blocks save until a justification ≥ 16 chars is entered. The justification is rendered in the audit-trail tab + in every export.

### §5.3 — Currency-conversion banner

When an estimate carries a `convertedFromCurrency`, a persistent banner notes "Converted from XXX at rate Y.YYY on YYYY-MM-DD via <source>". This is required by audit standards (RICS · AACE).

### §5.4 — AI-suggestion ribbon

Suggestions awaiting acceptance appear at the top of the breakdown grid in a yellow ribbon: "AI suggests £X/m² for element Y — accept · reject · ask for alternative". Accept routes through `cost.acceptAiSuggestion`.

### §5.5 — Variance view (budget vs actual)

When a project has both `role: 'budget'` and one of `role: 'forecast' | 'actual'`, the panel surfaces a Variance tab keyed by roll-up node showing `(actual − budget)` in absolute + percentage form. Variance > 5 % renders red; > 10 % renders red with an alert icon.

### §5.6 — Audit trail tab

A read-only Audit tab lists every command issued against the estimate (per P6 commandBus history) with `{ timestamp, command, actor, before, after }`. Every override + every issuance event appears here. Audit content is what feeds the `cost.exportExcel` Audit-trail sheet.

### §5.7 — Keyboard surface

| Key | Effect |
|---|---|
| `Ctrl + Shift + E` | Open Cost panel |
| `Ctrl + R` (with panel focus) | Re-run estimate (issues `cost.runEstimate`) |
| `O` (with row selected) | Open override modal |
| `Enter` (in roll-up tree) | Expand/collapse node |
| `Ctrl + I` (with estimate selected) | Issue (transitions `draft → issued` with confirmation modal) |

WCAG 2.2 AA per [C43](C43-ACCESSIBILITY.md) — screen-reader announces line totals + variance status; the panel is fully keyboard-navigable.

---

### §4.1 — Exporter detail

#### §4.1.1 — `cost.exportExcel`

Sheets: `Summary` (estimate-level totals + currency + role + taxonomy + issue date) · `Items` (one row per `CostItem`, columns per §5.1.2) · `Rollup` (collapsible roll-up tree flattened to rows with depth indicator) · `Overrides` (every `ItemOverride` with justification + actor + timestamp) · `AuditTrail` (every `cost.*` command applied to this estimate). Excel format is `.xlsx` via `exceljs`; column widths auto-fit; currency cells carry an Excel currency format-code per `Estimate.currency`.

#### §4.1.2 — `cost.exportCostX`

CostX (Exactal) supports both XML and CSV ingress; the C38 exporter targets the XML schema documented in the CostX API guide v6.0+. Each `CostItem` becomes a `BillItem` element with `Code` (taxonomy code), `Description`, `Quantity`, `Unit`, `Rate`, `Total`, `Source` extension fields. The exporter preserves the roll-up hierarchy as nested `BillGroup` elements.

#### §4.1.3 — `cost.exportBluebeam`

Bluebeam Revu consumes a CSV with markup placement coordinates (`PageNumber`, `X`, `Y`); since PRYZM owns 3D element geometry not 2D PDF markup positions, the exporter requires a paired sheet-set reference per [C30](C30-DRAWING-SET-MANAGEMENT.md) — the cost item maps to the markup placed on the sheet that contains the source element. Sheet-less estimates export with `PageNumber: 1, X: 0, Y: 0` and a warning toast.

#### §4.1.4 — `cost.exportSAP`

SAP S/4HANA Project System ingests `Bill of Quantities` via the `WBS Element` API. The exporter emits a SAP-compliant XML payload with `WBSElementId` mapped from `Estimate.id`, `BoQItem` mapped from `CostItem`, and `CostCenter` derived from `rollupKey`. Customer must provide `sapCustomerCode` + `wbsRoot` in the export dialog.

### §4.2 — Importer detail

#### §4.2.1 — RSMeans

RSMeans 2026 publishes per-region books (NA Building Construction Costs · NA Plumbing · NA Mechanical · NA Electrical · …) in proprietary `.rsmx` (XML) format. The importer parses `Division`, `CSI` (MasterFormat 2020 6-digit), `Line`, `Description`, `Crew`, `DailyOutput`, `LaborHours`, `BareMaterials`, `BareLabor`, `BareEquipment`, `BareTotal`, `TotalIncOP`. The importer respects RSMeans's licensing-watermark Pset and stores it as `PricingTable.licenseRef`.

#### §4.2.2 — BCIS

BCIS (Building Cost Information Service, RICS) publishes UK costs in CSV + XML per NRM2. The importer maps BCIS `Element`, `SubElement`, `Description`, `Rate`, `Currency` (GBP), `Quarter` (e.g. `2026 Q2`) to the canonical schema; `Quarter` becomes the `revisionDate` (first day of quarter).

#### §4.2.3 — Spon's

Spon's Architects' and Builders' Price Book ships as a printed reference + a digital `.spon` JSON. The importer parses the JSON and maps to the NRM2 taxonomy (Spon's already groups by NRM2 chapters since the 2014 edition).

#### §4.2.4 — Generic CSV

For customer-authored or boutique catalogues. Required columns: `code` · `description` · `unit` · `rate` · `currency`. Optional: `source-row-ref` · `notes`. The importer is taxonomy-agnostic but requires the user to declare the table's taxonomy at import time.

#### §4.2.5 — Custom JSON

For programmatic catalogue authoring (e.g. a construction firm's internal rate library). Strict zod schema matching §2.1 `PricingTableRow`. Used by the marketplace cost-catalogue plugin runtime (P0.3, 5D-δ-1).

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-cost-source-cited` | `tools/ga-gate/check-cost-source-cited.ts` | Every `CostItem` in fixtures + tests has a non-null `source.catalogueId` (per §1.1) |
| `check-takeoff-c25-trace` | `tools/ga-gate/check-takeoff-c25-trace.ts` | Every `TakeoffRule.qtoSource.psetName` resolves to a Pset defined in the [C25](C25-IFC-EXPORT-PRODUCTION.md) Pset registry (per §1.4) |
| `check-cost-currency-explicit` | `tools/ga-gate/check-cost-currency-explicit.ts` | Every `PricingTable` + `Estimate` carries a non-null `currency: ISO4217Code` (per §1.2) |
| `check-cost-spans` | extends `check-spans.ts` | Every public `packages/cost-engine` boundary function carries an OTel span (per §1.5 + P8) |
| `check-cost-schemas-pure` | extends existing schema-purity check | `packages/schemas/src/cost/` has zero I/O, zero THREE, zero DOM imports (per P5) |
| `check-cost-rollup-taxonomy` | runtime — schema validator | Every `Estimate.taxonomy` is one of the three reserved values (per §1.3) |
| `check-cost-override-justification` | runtime — schema validator | Every `ItemOverride.justification.length >= 16` (per §1.8) |
| `check-cost-table-sealed` | runtime — schema validator | An `imported: true` `PricingTable` rejects row edits (per §1.7) |
| `check-cost-issued-sealed` | runtime — schema validator | An `issued` `Estimate` rejects mutation (per §1.11) |
| `check-cost-determinism` | bench — `cost-determinism.bench.ts` | Two `runEstimate` invocations on the same fixture produce byte-identical JSON (per §1.14) |
| `check-cost-no-silent-zero` | runtime — schema validator | A `CostItem` with `quantity: 0` MUST carry an explicit takeoff rule flag, never an unresolved Pset (per §1.13) |
| `check-cost-ai-suggestion-envelope` | runtime — schema validator | Any `unitCost` sourced `catalogueId: 'ai-suggested'` carries the full `AiSuggestion` envelope (per §1.10 + [C23](C23-PROVENANCE-AND-AI-AUDIT.md)) |
| `check-cost-no-direct-store-write` | eslint rule | UI code under `apps/editor/src/ui/cost/` MUST NOT import `CostStore` directly for mutation; only via `commandBus` (per P6 + §1.6) |

---

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Takeoff-rule conformance | `packages/cost-engine/__tests__/takeoff/*.test.ts` | Every built-in rule resolves correctly against a published reference Pset; per-rule fixture in `__fixtures__/qto/` |
| Importer conformance | `packages/cost-engine/__tests__/importers/*.test.ts` | 10-row published-row samples for RSMeans · BCIS · Spon's · CSV · custom-JSON round-trip without data loss |
| Roll-up correctness | `packages/cost-engine/__tests__/rollup/*.test.ts` | Reference QS-textbook examples (Smith + Jaggar `Building Cost Planning` 4th ed.; RICS `Templates for Cost Planning`) reproduce to within £0.01 |
| Currency conversion | `packages/cost-engine/__tests__/currency/*.test.ts` | Manual rates apply correctly; provider mocks return expected payload shapes |
| Determinism | `packages/cost-engine/__tests__/determinism.test.ts` | Per §1.14 — repeat-run produces byte-identical output |
| Override schema | `packages/schemas/__tests__/cost/override.test.ts` | Rejects sub-16-char justifications, accepts ≥ 16 |
| AI envelope | `packages/schemas/__tests__/cost/ai-suggestion.test.ts` | Per §1.10 — rejects `catalogueId: 'ai-suggested'` without paired envelope |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Run estimate, 10 000 elements | < 2 s | `cost-estimate-10k.bench.ts` (new) |
| Run estimate, 100 000 elements | < 20 s | `cost-estimate-100k.bench.ts` (new) |
| Roll-up tree render, 10 000 line items | < 200 ms | `cost-rollup-render.bench.ts` (new) |
| Import RSMeans (~36 000 rows) | < 5 s | `cost-import-rsmeans.bench.ts` (new) |
| Import BCIS (~9 000 rows) | < 2 s | `cost-import-bcis.bench.ts` (new) |
| Import Spon's (~14 000 rows) | < 3 s | `cost-import-spons.bench.ts` (new) |
| Excel export, 10 000 lines | < 3 s | `cost-export-excel.bench.ts` (new) |
| CostX export, 10 000 lines | < 4 s | `cost-export-costx.bench.ts` (new) |
| Bluebeam CSV export, 10 000 lines | < 1 s | `cost-export-bluebeam.bench.ts` (new) |
| SAP XML export, 10 000 lines | < 2 s | `cost-export-sap.bench.ts` (new) |
| Currency conversion across an estimate | < 500 ms | `cost-convert-currency.bench.ts` (new) |
| Per-line override (single command latency) | < 50 ms | inherited from C03 command-bus budget |
| Cold-start Cost panel mount (10k items) | < 800 ms | `cost-panel-cold-mount.bench.ts` (new) |
| Variance recompute on actual edit | < 100 ms | `cost-variance.bench.ts` (new) |
| `.pryzm` round-trip (10k cost items) | < 1 s additive over baseline | extends C05 persistence bench |

---

## §8 — Migration plan

### §8.1 — New package `packages/cost-engine/`

```
packages/cost-engine/
  src/
    index.ts                       — composeCostEngine() boundary (P8 spans here)
    estimate/
      runEstimate.ts               — the main pipeline
      reprice.ts
      rollup.ts                    — derives CostRollup from CostItems
      variance.ts                  — budget-vs-actual derived view
    takeoff/
      takeoffRules.ts              — TakeoffRuleRegistry
      qtoBridge.ts                 — fetches values from C25 IfcMetaStore / native Qto
      builtin/                     — default rules for the 18+ element types
    pricing/
      importers/
        rsmeans.ts                 — RSMeans XML parser
        bcis.ts                    — BCIS XML parser
        spons.ts                   — Spon's parser
        csv.ts                     — generic CSV importer
        custom.ts                  — customer-JSON importer
      seal.ts                      — enforces §1.7 immutability
    exporters/
      excel.ts
      costx.ts
      bluebeam.ts
      sap.ts
    currency/
      convert.ts
      providers/                   — ecb-daily · oanda · fixer · manual
    schemas/                       — re-exports from packages/schemas/src/cost/
```

Wired into `composeRuntime()` at L3 — the cost-engine is a domain layer (not L0 pure schemas, not L1 IO). The engine imports from `packages/schemas/src/cost/` (L0), `packages/stores/` (L3), and the C25 `IfcMetaStore` (via a thin bridge in `qtoBridge.ts`).

### §8.2 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| 5D-α-1 | `packages/schemas/src/cost/` (all §2 schemas) + zod validators | 0.5 wk |
| 5D-α-2 | `CostStore` + `PricingTableStore` + persistence wiring | 0.5 wk |
| 5D-α-3 | `packages/cost-engine/` skeleton + `composeCostEngine()` boundary + P8 spans | 0.5 wk |
| 5D-β-1 | TakeoffRuleRegistry + 18 built-in rules + C25 Qto bridge | 1 wk |
| 5D-β-2 | `runEstimate` pipeline + roll-up engine (CSI · NRM2 · Uniformat) | 1 wk |
| 5D-β-3 | Pricing-table importers (RSMeans · BCIS · Spon's · CSV · custom) | 1.5 wk |
| 5D-β-4 | Per-element override + justification modal + audit trail | 0.5 wk |
| 5D-γ-1 | Excel + CostX + Bluebeam + SAP exporters | 1 wk |
| 5D-γ-2 | Cost panel UI (estimate list + breakdown grid + roll-up tree + variance) | 1.5 wk |
| 5D-γ-3 | Currency conversion + provider integrations | 0.5 wk |
| 5D-γ-4 | AI-suggestion envelope wiring (per C23) + acceptance ribbon | 0.5 wk |
| 5D-γ-5 | CI gates (§6) all green | 0.5 wk |
| 5D-δ-1 | Marketplace catalogue-plugin runtime (per P0.3) — plugin-authored pricing tables | 1 wk |

**Total: ~10 wk** (within the master plan's Phase 6.1 commerce-track ~3-sprint budget when paralleled with C37 4D).

### §8.3 — Backward compatibility

There is no existing PRYZM 2 cost surface to migrate. C38 is greenfield. The `.pryzm` file format gains the `cost/` namespace at minor-version bump per [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md); older files load with `cost/` absent and the Cost panel shows "no estimates yet" with a create-estimate CTA.

### §8.4 — Test plan

Per [C25](C25-IFC-EXPORT-PRODUCTION.md) test convention: every takeoff-rule + every importer + every exporter gets a vitest suite under `packages/cost-engine/__tests__/`. Conformance fixtures: 10 published RSMeans rows · 10 BCIS rows · 10 Spon's rows · 10 custom-JSON rows. Roll-up correctness checked against published QS textbook examples.

---

## §9 — What is NOT in this contract

- **Quantity takeoff from raw geometry** — [C25 §1.6](C25-IFC-EXPORT-PRODUCTION.md) owns Qto Pset emission; the cost-engine consumes those values, never computes them from THREE meshes. Per P2.
- **4D schedule** — [C37](C37-SCHEDULE-4D.md). The phase axis is shared (a `CostItem` MAY carry an optional `phaseRef: PhaseId`), but the time-phasing model + the Gantt UI + the simulation engine all live in C37.
- **Data-panel grid + bulk-edit chassis** — [C28](C28-DATA-PANEL-AND-AUTOMATION.md). The Cost panel reuses the C28 grid component as a dependency; bulk-edit of cost overrides routes through `data.bulkUpdate` per [C28 §1.2](C28-DATA-PANEL-AND-AUTOMATION.md).
- **COBie FM handover** — [C35](C35-COBIE-FM-HANDOVER.md). COBie carries asset cost-at-handover; that's a separate post-construction artefact.
- **Stripe billing of PRYZM subscriptions** — `server.js` Stripe surface. C38 is about cost estimation OF the customer's BUILDING, not OF PRYZM.
- **Pricing-catalogue licensing + commercial terms** — separate legal track. The contract assumes catalogues are properly licensed for import; PRYZM stores license metadata in `PricingTable.licenseRef` but does not enforce the licensing contract at runtime. **OPEN Q — see §10.**
- **Tendering / bid management** — out of scope. Cost estimation is the QS deliverable; tendering is the procurement workflow that consumes it.
- **Currency hedging / FX risk modelling** — out of scope. C38 records a conversion at a stated rate; it does not model rate volatility.
- **Project-finance modelling (IRR · NPV · cash-flow)** — out of scope. C38 produces a static estimate; a project-finance plug-in would consume that estimate.
- **Plugin runtime for marketplace cost-catalogue plugins** — depends on P0.3 plugin runtime; cited as 5D-δ-1 milestone but the runtime itself is owned by the family-platform direction.

---

## §10 — Open questions (DRAFT-stage)

1. **Currency-conversion timing**. Two competing models:
   - (a) **Convert at import** — every imported table converts to the project's currency immediately; the `PricingTable` carries the converted unit costs.
   - (b) **Convert at estimate-run** — tables stay in native currency; conversion happens during `cost.runEstimate` using the prevailing rate.
   The contract currently leans (b) for audit clarity (the source row is preserved verbatim), but (a) has perf and UX advantages. Needs an ADR before CANONICAL.
2. **Pricing-table licensing ownership**. Who carries the RSMeans / BCIS / Spon's licence — PRYZM (we negotiate one master licence and resell access to customers as a subscription tier) or the customer (each customer brings their own licence + key, we just import)? Materially affects pricing tiers + marketplace strategy. Tracking under C39 (Pricing & Plan Tiers) + a forthcoming commercial-track ADR.
3. **Roll-up taxonomy switching**. §1.3 says taxonomy is sealed at estimate-creation. Is that too rigid for projects that need a draft in CSI but issue in NRM2? A migration command `cost.migrateTaxonomy` could be added if mapping tables are good enough.
4. **AI-suggested cost confidence calibration**. The `AiSuggestion.confidence` field needs a calibration regime — what does 0.7 mean operationally? A miscalibrated AI suggestion that QS accepts could be a £100k contractual error. Defer to C23 ratification + a separate confidence-calibration spec.
5. **Per-region tax handling** (VAT / sales tax / GST). Most catalogues quote ex-tax; estimates often need a tax-inclusive variant for client presentations. Currently scoped out — would belong in a `cost.applyTaxRate` extension.
6. **Schedule-of-rates vs lump-sum**. Some procurement methods price a schedule-of-rates rather than per-element; the current schema is per-element. May need a parallel `cost.rateScheduleItem` table; deferred to post-DRAFT.
7. **Contingency / risk-uplift handling**. QS practice applies design-stage contingency (typically 5–15 %) + construction-stage risk uplift on top of the priced sum. Should contingency be a derived layer over the estimate (computed at panel-render time) or a stored `Estimate.contingencyPct` field? Current §2 has neither; needs a downstream ADR.
8. **Multi-table blending priority**. When an estimate's `sourceTables: PricingTableId[]` includes two tables with overlapping taxonomy codes (e.g. a base RSMeans + a regional override custom-table), what's the precedence rule? Currently undefined; provisional answer = first-table-wins-by-order, but a more nuanced "newest revisionDate wins" or per-row hint may be needed.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every cost mutation through commandBus |
| [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) | `.pryzm` file gains the `cost/` namespace |
| [C09](C09-AI-AND-VISIBILITY-INTENT.md) | AI-suggested unit costs originate here |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans + the NFT budgets are reported via |
| [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Project-delete cascades cost data with retention |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `cost.*` commands follow the authoring protocol |
| [C23](C23-PROVENANCE-AND-AI-AUDIT.md) | AI-suggestion envelopes + audit trail surface |
| [C25](C25-IFC-EXPORT-PRODUCTION.md) | The Qto Pset registry is the SOLE quantity source |
| [C28](C28-DATA-PANEL-AND-AUTOMATION.md) | Cost panel reuses the Data-panel grid component + bulk-edit chassis |
| [C30](C30-DRAWING-SET-MANAGEMENT.md) | Bluebeam export requires paired sheet-set reference |
| [C37](C37-SCHEDULE-4D.md) | Shared phase model; `CostItem.phaseRef` links 5D to 4D |
| [C43](C43-ACCESSIBILITY.md) | Cost panel meets WCAG 2.2 AA |

---

*End — C38 Cost / 5D, 2026-06-01 — DRAFT.*
