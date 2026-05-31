# C28 — Data Panel & Automation

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: governs the existing `plugins/schedules/` (PRYZM 2 S41 / Phase 2C / ADR-0032) PLUS the new unified Data tab that wraps schedules with (a) unified grid across all elements, (b) quality-rules engine sourcing rules from the 248+ constraint DB + dimensional G-classes + topology A-classes, (c) bulk-edit commands through commandBus (P6). Codifies the live data layer for `check / automate / update / review` operations.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (P6 — commands only), [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC Pset export from data grid), [C27](C27-BIM3-INSPECT-MODEL.md) (Inspect selection drives data filter), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md).
> **Downstream**: external BI tools (Tableau / PowerBI) via SQL / JSON export; FM handover via [C25](C25-IFC-EXPORT-PRODUCTION.md) IFC Pset injection.
> **Key principles**: **P5** (rules-engine schemas pure), **P6** (bulk-edit through commandBus), **P8** (every rule-run and bulk-edit has a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md Part VI](../03_PRYZM3/PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.6](../03_PRYZM3/PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md). PRYZM 2 ref: S41 / ADR-0032.

---

## §1 — Invariants

### §1.1 — Data tab wraps schedules — does not replace them

`plugins/schedules/` (PRYZM 2 S41) is the IMPLEMENTED foundation:

- ScheduleStore + 6 handlers (CreateSchedule, DeleteSchedule, AddColumn, RemoveColumn, SetGroupBy, SetFilter).
- Pure-TS formula DSL parser + evaluator.
- Snapshot-based reactive table view.
- CSV / XLSX export + CSV import.

The Data tab in C28 **wraps** schedules — it does NOT supersede them. A schedule (single-element-type, configurable columns, formula evaluator, export) remains a useful primitive. The Data tab adds three NEW capabilities on top:

1. **Unified grid** across all element types (not per-schedule).
2. **Quality-rules engine** that runs codified rules across the model.
3. **Bulk-edit** commands that mutate many elements with one undo step.

### §1.2 — Bulk-edit routes through commandBus

Per P6, bulk-edit MUST be a single command: `data.bulkUpdate(filter, paramName, newValue)`. One undo step covers the entire batch. UI MUST NOT update store directly.

### §1.3 — Quality rules are codified, not hardcoded

Quality rules are first-class data structures. Each rule:

```
{
  id: string,
  scope: 'apartment' | 'room' | 'element' | 'project',
  predicate: (ctx) => boolean,
  severity: 'info' | 'warning' | 'error',
  message: string,
  fixSuggestion?: string,
  source: 'constraint-db' | 'g-class' | 'a-class' | 'custom',
}
```

The 248+ rules from the constraint database (apartment doc), the dimensional G-classes (G-class doc), and the topology A-classes (A-class doc) are loaded into the rules engine as JSON or TypeScript modules at startup.

### §1.4 — Every rule run has a span

Per P8, every `runQualityCheck` invocation emits an OpenTelemetry span. Span name: `pryzm.data.runQualityRule` with attributes `{ ruleId, scope, elementCount, violationCount }`.

### §1.5 — Data tab selection syncs with Inspect

Per [C27 §8](C27-BIM3-INSPECT-MODEL.md), the Data grid and the Inspect tree share `InspectSelectionStore`. Selecting in one updates the other.

---

## §2 — Schema (in `packages/schemas/src/data/`)

| Schema | Owns |
|---|---|
| `DataFilter` | `{ type?: ElementType[], level?: LevelId[], apartment?: ApartmentId[], room?: RoomId[], parameterFilters?: ParameterFilter[] }` |
| `DataSort` | `{ column: string, direction: 'asc' \| 'desc' }[]` |
| `DataGroupBy` | `'type' \| 'level' \| 'apartment' \| 'room' \| 'custom-field'` |
| `QualityRule` | as per §1.3 |
| `QualityViolation` | `{ ruleId, elementId, severity, message, fixSuggestion? }` |
| `BulkUpdatePayload` | `{ filter: DataFilter, paramName: string, newValue: ParameterValue }` |
| `ScheduledCheck` | `{ id, ruleIds, cron, recipients, lastRun?, lastResult? }` |

---

## §3 — Stores

| Store | Path | Owns |
|---|---|---|
| `DataStore` | `packages/stores/src/DataStore.ts` (NEW) | Active filter, sort, group-by, selection set |
| `QualityRuleStore` | `packages/data-engine/src/rules/QualityRuleStore.ts` (NEW) | Loaded rules + last-run violations |
| `ScheduledChecksStore` | `packages/data-engine/src/ScheduledChecksStore.ts` (NEW) | Cron-scheduled checks + email recipients |
| `ScheduleStore` (existing) | `plugins/schedules/src/store.ts` | Per-element-type schedules (PRYZM 2 S41) |

---

## §4 — Data engine package (NEW L3)

`packages/data-engine/` (NEW). Responsibilities:

- Load quality rules at startup (from constraint-db / G-class / A-class).
- Provide a `runQualityCheck(ruleId, scope)` API that returns `QualityViolation[]`.
- Provide a `runAllChecks()` API that runs all rules + emits a summary.
- Provide schedule templates (Room / Door / Window / Furniture / Finish / Electrical) configurable column sets.
- Provide bulk-update command handlers.
- Provide cron scheduling + email-on-violation.

---

## §5 — Commands

| Command | Effect |
|---|---|
| `data.bulkUpdate` | Update a parameter on N elements matched by filter. Single undo step. |
| `data.runQualityCheck` | Run one rule by id. Returns violations. |
| `data.runAllChecks` | Run all rules. Returns aggregated report. |
| `data.exportToExcel` | Current grid → `.xlsx`. |
| `data.exportToCsv` | Current grid → `.csv`. |
| `data.exportToJson` | Current grid → JSON. |
| `data.exportToIfcPset` | Current grid → `IfcPropertySet` injection into IFC export ([C25](C25-IFC-EXPORT-PRODUCTION.md)). |
| `data.exportToSql` | Current grid → SQL insert statements for external BI tools. |
| `data.scheduleCheck` | Register a `ScheduledCheck` (cron-style). |
| `data.removeScheduledCheck` | Unregister. |
| `schedule.create`, `schedule.addColumn`, etc. | EXISTING — from `plugins/schedules/` S41 handlers. |

All commands open OTel spans per P8.

---

## §6 — Data grid UI

`apps/editor/src/ui/data/` (NEW). Component hierarchy:

- `DataPanel` — top-level, hosts filter chips + grid + detail rail.
- `FilterChipBar` — type / level / apartment / room / parameter filters as chips.
- `DataGrid` — virtualised grid (target: 100k rows at 60 FPS via `@tanstack/virtual` or similar).
- `GroupByControl` — group-by selector.
- `BulkEditModal` — select N rows → choose param → enter value → preview → confirm.
- `QualityReportPanel` — shows violations from last `runAllChecks`, grouped by severity, click-to-isolate-in-viewport.
- `ScheduleSnapshotPicker` — embeds existing schedules from `plugins/schedules/` for backward compatibility.

---

## §7 — Quality rules sourcing

Rules come from three canonical sources:

| Source | Path | Rules count (approx) |
|---|---|---|
| Constraint DB | `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` + others | 248+ |
| G-classes (dimensional) | [APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md §G-class table](../03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md) | 10 |
| A-classes (topology) | [APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md §A-class table](../03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md) | 8 |
| Custom (user-authored, per project) | project file | variable |

Total: 266+ codified rules at baseline.

### §7.1 — Rule execution tiers

To avoid combinatorial explosion at edit-time:

- **Tier 1 (on-edit)**: ~10 fast rules (immediate violations like room < min area). Run after every command.
- **Tier 2 (on-save)**: ~50 rules (medium-cost: adjacency / circulation / daylight). Run on file save.
- **Tier 3 (on-demand)**: all 266+ rules (full run including expensive cognition-stack rules). Run via `data.runAllChecks` button or scheduled-check.

---

## §8 — Export targets

| Target | Format | Use case |
|---|---|---|
| Excel | `.xlsx` | Stakeholder reports, takeoffs |
| CSV | `.csv` | BI tools, archival |
| JSON | `.json` | Stable, versioned schema; API consumers |
| IFC Pset | injected into IFC4X3 export via [C25](C25-IFC-EXPORT-PRODUCTION.md) | FM handover, BIM coordination |
| SQL | `INSERT` statements | Tableau, PowerBI |

Excel + CSV export are ALREADY IMPLEMENTED in `plugins/schedules/`. JSON + SQL + IFC Pset injection are new.

---

## §9 — Data automation (scheduled checks)

Cron-style scheduling UI in `apps/editor/src/ui/data/automation/`:

- Pick rule(s) to run.
- Pick cron pattern (e.g. "every day 09:00" / "every Monday").
- Pick recipients (email).
- Pick action on violation: email summary / webhook / Slack / GitHub issue.

`packages/data-engine/src/scheduler/` runs cron in a background worker (`apps/bake-worker/` or a new `apps/data-worker/`).

---

## §10 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| Bulk-edit through commandBus | Any bulk write outside `data.bulkUpdate` command is forbidden | NEW `tools/ga-gate/check-bulk-edit-commands.ts` |
| Rule-engine schema purity | `packages/data-engine/src/rules/` schemas have no I/O | extend existing |
| Rule registry presence | Rules engine loads all canonical sources at startup | NEW `tools/ga-gate/check-rule-registry.ts` |
| Span per rule run | P8 — every rule execution has a span | extend existing |

---

## §11 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Grid render at 100k rows | < 200 ms | `data-grid.bench.ts` (new) |
| Bulk-edit of 1k rows | < 500 ms | `data-bulk-edit.bench.ts` (new) |
| `runAllChecks` of all rules at 10k-element model | < 5 s | `data-all-checks.bench.ts` (new) |
| Excel export of 10k rows | < 3 s | `data-excel-export.bench.ts` (new) |
| Scheduled-check email latency | < 10 s after cron fires | integration test |

---

## §12 — Phase delivery

Master plan [§14](../03_PRYZM3/PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md) DAT-α-1 through DAT-γ-5. ~12 wk total (audit-revised from ~18.5 wk).

---

## §13 — What is NOT in this contract

- **Inspect / model tree / isolation** — [C27](C27-BIM3-INSPECT-MODEL.md). C28's grid syncs with C27's selection.
- **IFC export details** — [C25](C25-IFC-EXPORT-PRODUCTION.md). C28 emits Pset payloads that C25 writes.
- **Sheet / PDF export** — [C24](C24-SHEET-COMPOSITION-ENGINE.md), [C29](C29-PDF-VECTOR-EXPORT.md).
- **Element creation / editing** — [C11](C11-ELEMENT-CREATION-PIPELINE.md).
- **Author panel** — covered by element creation contracts + BIM 2.0 Data Management Panel ([APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](../03_PRYZM3/APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md)).
- **Per-schedule formulas** — `plugins/schedules/` (existing, S41). C28 reuses the existing formula DSL.

---

*End — C28 Data Panel & Automation, 2026-05-31.*
