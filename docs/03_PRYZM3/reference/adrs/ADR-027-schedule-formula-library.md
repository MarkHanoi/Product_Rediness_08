# ADR-027 — Schedule Formula Library Scope

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §10, §29 #19` (formula DSL referenced but unscoped); cross-ref `[strategic ADR-018]` T1.3 |
| Required by | Sprint S39 (Phase 2C — schedule producer first lit) |
| Owner | Architecture lead + Product |
| Implementation | `packages/schedule-formulas/`; `plugins/<family>/schedule.ts` |
| Spec dependency | SPEC-29 §6; SPEC-21 Step 9 |

---

## Context

PRYZM 1's schedules support full-formula expressions (Revit-class). Phase 2C must ship schedules. The corpus references "formula DSL" without scoping it. `[strategic ADR-018]` T1.3 lists "Schedule formula DSL → fixed-formula library only" as a Tier-1 cuttable scope.

This ADR ratifies the **default ship scope** — what's in v1 — and the **stretch path to user-authored formulas** post-GA.

---

## Decision

### Part A — what ships at GA (v1)

A **fixed library of 24 formulas**, not a user-authored DSL. The library is exposed as named `ScheduleFormulaRef`s in `plugins/<family>/schedule.ts`.

#### §A.1 The library

| Category | Formula | Args | Returns |
|---|---|---|---|
| Aggregate | `count` | rows | int |
| Aggregate | `count_distinct` | rows, column | int |
| Aggregate | `sum` | rows, column | number |
| Aggregate | `avg` | rows, column | number |
| Aggregate | `min` | rows, column | number |
| Aggregate | `max` | rows, column | number |
| Aggregate | `median` | rows, column | number |
| Geometric | `area_total` | rows | number (m² or ft²) |
| Geometric | `volume_total` | rows | number |
| Geometric | `perimeter_total` | rows | number |
| Geometric | `length_total` | rows | number |
| Cost | `cost_total` | rows, unit-price col | number |
| Cost | `weighted_avg_cost` | rows, qty col, price col | number |
| Material | `material_volume_by_layer` | rows, layer index | Record<material, number> |
| Material | `material_count` | rows, material id | int |
| Logical | `if` | cond, then, else | any |
| Logical | `coalesce` | values | first non-null |
| Logical | `match` | value, [(pattern, result)] | any |
| String | `concat` | strings | string |
| String | `format` | template, args | string |
| Date | `format_date` | date, pattern | string |
| Numeric | `round` | value, digits | number |
| Numeric | `unit_convert` | value, from, to | number |
| Reference | `parameter` | row, key | any |

### §A.2 Formula bindings (the schedule body)

A schedule column in `plugins/<family>/schedule.ts` declares either:
- `source: 'parameter'` — direct read (e.g. `parameter('width')`).
- `source: 'formula'` with a `formulaRef: ScheduleFormulaRef` — pick-by-name from the library.

Concrete shape:
```ts
interface ScheduleColumn {
  id: string;
  header: string;
  formulaRef: ScheduleFormulaRef;     // one of the 24, or 'parameter'
  args: ReadonlyArray<unknown>;
  formatter?: 'integer'|'decimal2'|'currency_usd'|'area_metric'|'volume_metric'|'percent'|'date_iso';
}
```

### Part B — what's NOT in v1

- **No user-authored expression language** (no `length = a + b * 2 - 0.5` parser).
- **No nested formula composition** beyond the library entries themselves (the library is the leaves; `if(cost_total(...) > 100, 'over', 'under')` is one composition, not arbitrary depth).
- **No external-data formulas** (no SQL, no CSV import as data source).

### Part C — capacity-cut alignment (per ADR-018 T1.3)

If velocity slips and ADR-018 Tier-1 fires, the library scope reduces to **the 14 most-used formulas**:
`count`, `sum`, `avg`, `min`, `max`, `area_total`, `volume_total`, `perimeter_total`, `length_total`, `cost_total`, `if`, `coalesce`, `format`, `parameter`.

The remaining 10 (`count_distinct`, `median`, `weighted_avg_cost`, `material_volume_by_layer`, `material_count`, `match`, `concat`, `format_date`, `round`, `unit_convert`) become Tier-1 deferrable to v2.

### Part D — post-GA path to a DSL

Post-GA (v2), a **user-authored expression language** is on the roadmap, scoped per a future ADR:
- Sandbox: same Web Worker isolation as plugins (per `[strategic ADR-009]`).
- Grammar: PEG / Pratt parser, ≤ 30 productions; no Turing-completeness (no recursion, no while-loops).
- Surface: per-column "custom formula" editor with autocomplete from the schedule's row schema.
- Cost guardrail: pre-flight evaluator estimates worst-case cost; reject if > 100 ms per cell.

### Part E — Light parametric expressions vs schedule formulas

`[strategic ADR-024]` references a "light expression evaluator" for per-element parameters (`length = a + b`). That evaluator is a **separate, simpler** subsystem from this ADR's schedule library:

| Subsystem | Scope | Where |
|---|---|---|
| Light parametric expressions (ADR-024 §Phase-2A) | per-element parameters; `a + b`, `2 * x`, `90°` | `packages/expressions-light/` |
| Schedule formula library (this ADR) | aggregate / cross-row formulas | `packages/schedule-formulas/` |
| Future schedule DSL (post-GA) | user-authored arbitrary expressions | `packages/schedule-dsl/` (v2) |

The two v1 subsystems share **no implementation code** — each is built for its specific shape — but share the same Result-type error model.

---

## Consequences

**Positive:**
- Predictable scope; finite library; testable.
- Per-family schedule columns get good defaults (per SPEC-21 Step 9).
- Tier-1 cut path is real and small (drops 10 of 24 functions).
- Post-GA DSL is a clean addition, not a retrofit.

**Negative:**
- Power users (some Revit transplants) miss arbitrary expressions; UX cost mitigated by good library + clear "v2 roadmap" messaging.
- 24 functions need rigorous test coverage.

---

## Alternatives considered

### A1 — Ship a full expression DSL at GA
Rejected: per ADR-018 T1.3, this is exactly the cuttable scope. We pre-cut.

### A2 — Embed Lua / JS / Excel-formula
Rejected: introduces a sandboxing surface (per ADR-009) that's heavier than 24 named functions.

### A3 — No formulas; pure column declarations
Rejected: aggregates (sum, count) are essential for schedules to be useful at all.

---

## Phase rollout

- S35 — ADR-027 land; `packages/schedule-formulas/` skeleton.
- S39 — first 14 formulas (the Tier-1-survivable subset) shipped; first family schedules lit.
- S41 — remaining 10 formulas shipped; full library complete.
- S42 (Phase 2C end) — schedule end-to-end with all 18 families.
- S55 — formula library hardening; formatter improvements.
- S65 — formula extraction for plugin SDK exposure (read-only).
- S72 (M36 GA) — library frozen at v1; v2 DSL RFC opens.
