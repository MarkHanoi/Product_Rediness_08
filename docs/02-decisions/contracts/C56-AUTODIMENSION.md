# C56 — AutoDimension Engine

> **Stamp**: 2026-07-06 · **Status**: DRAFT
> **Scope**: governs PRYZM's **deterministic AutoDimension engine** — the missing intelligence layer that turns a floor plan into a *non-redundant, non-overlapping, architect-grade dimension SET*. PRYZM already ships the *output half* (the L0 `DimensionString` schema + `produceDimensions` emitter + `evaluateDimensions` + the plan-view annotation render loop) and the *input half* (the wall connectivity graph in `JunctionResolverV2`, the planar-face room/perimeter tracer in `PlanarTopologyEngine`, opening spans in `WallOccupancyStore`). C56 governs the deterministic planner in between: a new **pure** package `@pryzm/auto-dimension` (L2) that consumes an element snapshot, runs a deterministic **8-stage pipeline** over the wall graph, and returns a complete, deduplicated, stacked, QA-validated `DimensionString[]` that the existing evaluator + render/persist sinks already know how to draw. Companion to [C24.1](./C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md) (this engine is its missing dimension provider) and [C34](./C34-PRINT-AND-DRAWING-STANDARDS.md) (the drawing styles the placement consumes).
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md) (the L0 `DimensionString`/`DimensionReference`/`DimAnchor` schemas + the command bus + CQRS/undo — the only mutation path), [C11](./C11-ELEMENT-CREATION-PIPELINE.md) (auto-dim is a *derived* creation; the editor executor runs one `batchCoordinator.runBatch` = one undo), [C15](./C15-HOSTED-ELEMENT-CONTRACT.md) (opening locations read from the C15 embedded-`Opening` offset model via `WallOccupancyStore`; no new opening state), [C24](./C24-SHEET-COMPOSITION-ENGINE.md) (dimensions land on sheet viewports), [C34](./C34-PRINT-AND-DRAWING-STANDARDS.md) (line weights / arrow / offset styles injected by the caller — never hardcoded in the pure engine), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md) (OTel spans + the `O(n log n)` perf target).
> **Downstream**: the [C24.1](./C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md) auto-documentation SET — C56 is the "DS5+" dimension provider it needs; it upgrades C24.1's naive `set-out` dim mode to a planned, QA'd set. The output `DimensionString[]` flows through the existing `evaluateDimensions` (geometry-kernel L4) → `PlanViewAnnotationRenderer` draw loop with no schema change.
> **Decision record**: [ADR-0118](../adrs/ADR-0118-autodimension-engine.md) — the decision to build a deterministic L2-pure AutoDimension engine (vs extending the naive per-element producer in place, vs an AI/ML-based dimensioner).
> **Design spike**: [SPIKE-AUTODIMENSION-ENGINE](../../03-execution/spikes/SPIKE-AUTODIMENSION-ENGINE.md) (the authoritative design — commit `842dc2be`; grounds every §1 invariant in an existing subsystem).
> **Engineering spec**: [SPEC-AUTODIMENSION](../../03-execution/specs/SPEC-AUTODIMENSION.md).
> **Key principles**: **P2** (single THREE owner — the engine is THREE-free; only `packages/renderer-three/` may `import * as THREE`), **P4** (no `(window as any)` / no DOM — the engine is a pure DTO→DTO function), **P5** (schemas pure — output is the existing L0 `DimensionString`, no I/O), **P6** (every emitted dimension is created through a `dimension.*` command inside one `runBatch`, never a direct store write — the editor executor is the only impure surface), **P8** (every exported engine function opens ≥1 OTel span `pryzm.autodim.<stage>`).

---

## §1 — Invariants

The numbered rules below are binding on every PR that touches the AutoDimension subsystem. Each invariant has an §1.N id usable in `TODO(C56.N)` annotations and in `check-autodim-*.ts` CI gate failure messages.

### §1.1 — The determinism guarantee: same geometry → byte-identical output, no AI/ML/LLM

Given the same input element snapshot, the engine MUST return a **byte-identical** `DimensionString[]`. This is a hard invariant, not a best-effort goal:

- **No AI / ML / LLM.** The engine is graph traversal, computational geometry, line intersection, vector math, spatial indexing, and rule-based decision trees — nothing statistical, nothing sampled, nothing prompt-driven.
- **No non-determinism sources.** Zero `Math.random`, zero `Date.now`/wall-clock, zero floating tie-breaks, zero reliance on `Set`/`Map` iteration order for output ordering (collect, then sort).
- **Total orders everywhere.** Every `sort`/`min`/`max` ends in an explicit `elementId` (ULID) tiebreak (ADR-0061). Input walls are sorted once at entry by `(levelId, minX, minZ, id)` so the order-dependent `detectJunctions` clustering is reproducible.
- **Byte-identical re-run** is asserted in tests (QA-6, §1.7).

**Why**: construction-ready documentation must be reproducible and reviewable; an architect stamping a drawing cannot have the dimensions shuffle between runs. Determinism is the whole point of choosing a rule engine over an AI dimensioner (ADR-0118).

### §1.2 — The 8-stage pipeline is the normative shape

The engine's public entry `planAutoDimensions(snapshot, opts) → AutoDimResult` MUST realise the eight stages below, in order. They are the normative decomposition; a planner may not collapse or reorder them in a way that changes the guarantees.

| Stage | Name | Responsibility | Reuses |
|---|---|---|---|
| **1** | Connectivity graph + perimeter | Junction nodes + wall edges + building-shell ring + room rings | `detectJunctions` (`JunctionResolverV2`), `computeTopology` (`PlanarTopologyEngine`) |
| **2** | Segmentation | Slice each wall's `[0, length]` into alternating pier / opening segments | `WallOccupancyStore.getOccupiedSpans` |
| **3** | Opening analysis | Project each opening onto its host **run** axis → `[s0, s1]` stations | evaluator door-anchor maths |
| **4** | Chain planning | Choose WHICH strings (overall · exterior-chain · opening-chain · room · fallback) via ranked planners; group collinear walls into runs | `extensionCandidate` collinear test + union-find |
| **5** | Chain geometry resolution | Turn each planned chain into an ordered tick-station list on one datum axis; map ticks → element+anchor refs | `setOutDimensions` / `WallAlignmentInference` projection maths |
| **6** | Placement | Side selection, row stacking (offsets), ordering — deterministic, rule-based | `WitnessLineStyle`, C34 styles |
| **7** | Conflict resolution | Dedupe, merge tiny/zero, resolve text overlap, resolve geometry crossings | `intersectLines`, spatial-index broad-phase |
| **8** | QA validation | Coverage / completeness / consistency checks → `AutoDimReport` | linear scans |

Stages 4 is a **registry of pure string-planners** keyed by element class (`WallRunPlanner`, `OpeningChainPlanner`, `RoomChainPlanner`, later `GridPlanner`/`ColumnPlanner`/`SectionPlanner`). Stages 5–8 are planner-agnostic: adding a new documentation class is registering a planner, never touching placement/conflict/QA.

**Why**: the eight stages are the separation that makes the engine both deterministic (each stage a pure transform) and extensible (the planner registry mirrors the geometry-kernel `producers/*` shape). See SPIKE §11 for the grounded pseudocode.

### §1.3 — Documentation-completeness invariants (what a valid dimension SET must satisfy)

A returned SET is only valid if it satisfies **all** of the following. QA (Stage 8) MUST surface any incompleteness in the `AutoDimReport` — it MUST NOT silently omit.

> **Amendment (ADR-0119, 2026-07-07).** Completeness shortfalls are recorded as **non-blocking `AutoDimReport.warnings`** (e.g. `opening-undimensioned`) which the executor surfaces to the user (toast + console) — satisfying C24.1 §1.3 "no silent omission". They are NOT a hard reject: the executor still creates whatever the engine did produce. A hard-`errors` **reject** channel and the run-partition `chain-gap`/`chain-overlap` detection (QA-2) are **deferred** to P2 (conflict/stacking). DI-6 below is restated to match the shipped intent.

- **DI-1 Overall dims always exist.** At least one horizontal + one vertical `overall` string spans the perimeter AABB, once per axis.
- **DI-2 Every opening is located AND sized.** Every door/window appears in ≥1 emitted string as a ref, contributing both a **location** (offset-from-datum station) and a **width** dim. A width with no location, or vice-versa, is incomplete.
- **DI-3 Every wall break is dimensioned.** Every junction node on a run is a tick; the chain ticks partition `[0, runLength]` with no gap and no overlap beyond `EPSILON_M`.
- **DI-4 Never dimension the same distance twice.** A distance already ticked by a higher-rank string MUST NOT be re-emitted by a lower-rank string. An interior member of a chain gets **no** standalone length dim (DR-1); an opening already located in the exterior chain gets **no** separate opening chain on that façade (DR-2); two collinear walls forming one run produce **one** chain, not two length dims; the overall is emitted **once per axis**.
- **DI-5 No overlapping / crossing where avoidable.** Placement + conflict resolution (Stages 6–7) MUST avoid overlapping text and dim-line-vs-geometry crossings by stacking/bumping/pushing. Where a v1 overlap is genuinely unavoidable it MAY remain (see §1.5) but MUST be logged to the report — it is never "fixed" with RNG.
- **DI-6 QA surfaces incomplete documentation (no silent omission).** An SET missing any of DI-1…DI-4 surfaces a typed diagnostic (`opening-undimensioned`, `overall-mismatch`, …) in `AutoDimReport.warnings`, which the executor reports to the user. Silent omission is forbidden (C24.1 §1.3). A hard-reject `errors` channel + `chain-gap`/`chain-overlap` (QA-2) are deferred to P2 (ADR-0119).

**Why**: these are the exact defects of the naive `produceDimensions` per-element emitter that C56 exists to cure — un-chained collinear façades, located-but-unwidthed openings, and duplicate/overlapping dims. A dimension set that fails any of these is not construction-ready.

### §1.4 — Package boundary: `@pryzm/auto-dimension` is L2 and PURE

- **Layer.** `packages/auto-dimension/` → `@pryzm/auto-dimension` sits at **L2** (a domain-geometry peer of `geometry-kernel`, `constraint-solver`, `drawing-primitives`).
- **Purity.** The engine is **PURE**: zero THREE (P2), zero DOM (P4), zero I/O, zero RNG. The single allowed non-pure-domain import is `@opentelemetry/api` (spans, §1.7 P8) — exactly the concession `setOutDimensions.ts` already takes.
- **Downward deps only.** It imports **L0 `@pryzm/schemas`** (`Wall`, `Door`, `Window`, embedded `Opening`, and the output `DimensionString`/`DimensionReference`/`DimAnchor`) plus **pure wall-graph algorithms** (`detectJunctions`, `computeTopology`, `getOccupiedSpans`) reused as computational cores. It imports **NO store, NO command bus, NO renderer**. Any THREE-tainted barrel path (e.g. `room-topology` via `buildWallGraph`) MUST be avoided — the engine builds a pure `{x,z}` wall graph in-package or consumes a lifted pure `planar-topology` core (P4 refactor).
- **Signature.** The engine is a pure DTO→DTO function returning `DimensionString[]` (plus a sidecar `AutoDimReport`). Output refs use the **element+anchor** model so an auto-dim stays *live* (re-evaluates when the wall/opening moves) exactly like the existing producer output.
- **The one impure surface.** The editor-side executor `applyAutoDimensions` (in `apps/editor`, L5) is the ONLY code that touches stores/bus. It gathers the snapshot, calls the pure planner, and dispatches each emitted string through the command bus (P6) inside **one** `batchCoordinator.runBatch` so a whole auto-dimension SET is a **single undo** (C11, C24.1 §1.2).

**Why**: purity keeps the engine node-testable, deterministic, and free of the THREE/DOM/RNG that would break §1.1; the executor-only mutation boundary keeps P6 intact. Mirrors the pure `setOutDimensions.ts` + its editor caller.

### §1.5 — Placement is rule-based; a v1 overlap is acceptable, RNG is not

Stage-6 placement and Stage-7 conflict resolution MUST be deterministic and rule-based (C24.1 §1.5): side selection by outward-normal-vs-centroid, row stacking by string rank (opening-chain nearest geometry → overall outermost), ordering by `(axisId, rowIndex, stationStart, elementId)`. **Force-directed / physics placement is out of scope.** Text-overlap is resolved by bumping the lower-rank string to the next stack row (bounded retries); geometry crossings by pushing the stack out one row-spacing (bounded). If a conflict survives the bounded resolution, the engine **accepts the v1 overlap and logs it** to the report — it MUST NEVER perturb positions with `Math.random` to escape the overlap (that would break §1.1).

**Why**: a deterministic, occasionally-imperfect placement is reviewable and reproducible; a random "nicer" placement is neither. Styles/weights are injected by the caller from the C34 standards, never hardcoded in the pure engine (§1.4).

### §1.6 — Determinism mechanics: stable ordering + ULID tie-breaks (ADR-0061)

Concretely, the engine MUST:
- sort walls once at entry by `(levelId, minX, minZ, id)` (ULID final tiebreak);
- canonicalise every run's `axisDir` (`axisDir.x > 0`, or `axisDir.z > 0` when `x ≈ 0`) so it never depends on member insertion order;
- give every sort/min/max an explicit final `id` comparator;
- collect from any `Set`/`Map` then sort before emitting (never trust iteration order);
- use a caller-supplied `idFactory` (default monotonic) for dimension ids, with positional stability guaranteed by the Stage-8 output sort;
- use fixed-epsilon rounding (`EPSILON_M = 0.001`, mm rounding) — no floating tie-breaks.

**Why**: these are the concrete mechanisms that make §1.1 true and testable (QA-6). Grounded in ADR-0061 (determinism) and the SPIKE §14 enumeration.

### §1.7 — Observability: every exported function opens an OTel span (P8)

Every exported engine function MUST open ≥1 OpenTelemetry span, following the pure-module pattern already used by `solveSetOutPoint` (`startActiveSpan('pryzm.wall.solve_setout_point')`). The root span is `pryzm.autodim.plan` (attributes: `wall_count`, `opening_count`, `string_count`, `error_count`); each stage opens a child (`pryzm.autodim.graph|segment|chain|resolve|place|conflict|qa`). The editor executor adds `pryzm.autodim.apply` around the `runBatch` dispatch (C24.1 §1.9 span-at-boundary). QA-6 (byte-identical re-run) is a test obligation, not a runtime span.

> **Amendment (ADR-0119, 2026-07-07).** Implemented: the executor `applyAutoDimensions` opens `pryzm.autodim.apply` (attrs `wall_count`/`string_count`/`annotation_count`/`error_count`); its pure adapter `dimensionStringsToLinearDimAnnotations` opens a child `apply` span (`phase=adapt`). The barrel-exported pure helpers (`polygonCentroid`, `outwardNormal`, `segmentsCross`) each open a span at their **exported** entry; internal Stage-6/7 hot loops call an unspanned `…Impl` sibling so per-call span cardinality stays bounded (the O(n log n) target is unperturbed). `withAutoDimSpan(stage, fn, attrs)` passes the active `Span` to `fn` so a caller can set attributes it only knows mid-body without importing `@opentelemetry/api`.

**Why**: P8 requires ≥1 span per new exported function; the per-stage spans also give the C10 perf target (`O(n log n)`) an observable surface.

### §1.8 — Layered placement

The subsystem splits across the 8-layer model:
- the **pure engine** in a new low-layer package (`packages/auto-dimension/`, **L2** — the 8-stage pipeline, the string-planner registry, the pure geometry helpers; no THREE/DOM/I/O/RNG);
- the **engine output schema** is the existing `packages/schemas/annotation/dimension.ts` `DimensionString` (**L0**, pure — reused, not extended);
- the **evaluation + render** reuse `packages/geometry-kernel` `evaluateDimensions` (**L4**) → `PlanViewAnnotationRenderer` (**L4**) — unchanged;
- the **executor + sink** (`applyAutoDimensions`) live in `apps/editor` (**L5**) — the only impure surface.

> **Amendment (ADR-0119, 2026-07-07) — the RENDER sink.** The engine emits `DimensionString[]` (L0); the executor **adapts** each to a `'linear-dim'` `AnnotationElement` (the plugin-level type in `plugins/annotations`, NOT an L0 Zod schema) via `evaluateDimensions`, then writes the SET to the **subsystem `annotationStore`** — the store `PlanViewAnnotationRenderer.getByView` actually draws — through **one composite `CreateManyAnnotationsCommand`** on the legacy `CommandManager`, inside one `runBatch` (one undo). The bus `annotation.create` verb (CQRS `AnnotationsState`, text-notes) is NOT the render sink and drops dimension geometry; `dimension.createMany` / `DimensionStore` are retained for non-rendered consumers (schedules/export), not rendering. So the RENDERED representation's schema authority is the annotations plugin (DOC-*), not `packages/schemas`.

**Why**: keeps the THREE owner singular (P2), keeps the engine pure/deterministic/node-testable, reuses the existing render half with zero engine-schema churn, and confines mutation to a command on the editor boundary (P6).

---

## §2 — Command surface (normative shape — full schema in SPEC)

> **Amendment (ADR-0119, 2026-07-07) — the actual RENDER sink.** The `dimension.*` verbs below write the `plugins/dimensions` `DimensionStore`, which `PlanViewAnnotationRenderer` **does not read** — so they are the sink for **non-rendered** consumers (schedules, take-off, IFC/export), not for drawing. The **RENDER sink** the executor uses is `CreateManyAnnotationsCommand` (a composite legacy command → subsystem `annotationStore` `'linear-dim'` elements → `getByView`), dispatched once through the `CommandManager` inside one `runBatch` (one undo). See the §1.8 amendment.

| Command | Effect |
|---|---|
| `CreateManyAnnotationsCommand` (RENDER sink — ADR-0119) | Create N `'linear-dim'` `AnnotationElement`s in the subsystem `annotationStore` (the store the plan renderer reads) as ONE undoable unit. The executor's actual one-`runBatch` = one-undo path. Mutation via a command object on the `CommandManager` (P6). |
| `dimension.create` | Create one `DimensionString`/`DimensionData` in `DimensionStore` (typed handler; raw points via `evaluateDimensions` adapter). Undoable. Retained for **non-rendered** dimension consumers. |
| `dimension.createMany` | Batch `DimensionStore` verb. Retained for non-rendered consumers; **not** the render sink (its store is not drawn). |
| `dimension.autoGenerate` (editor executor) | The `applyAutoDimensions` entry: gather snapshot → call the pure `planAutoDimensions` → adapt strings → dispatch the RENDER sink command inside one `runBatch`. Opens `pryzm.autodim.apply`. |

All mutate via a command path only (P6). All emit OTel spans (§1.7, P8). The pure engine emits **no** commands — it returns `DimensionString[]`; the executor is the only command caller.

---

## §3 — CI gates

| Gate | Type | Checks |
|---|---|---|
| `check-autodim-purity.ts` | hard-fail | `packages/auto-dimension/` imports no THREE, no DOM, no store/bus/renderer, no `Math.random`/`Date.now` (§1.1, §1.4) |
| `check-autodim-determinism.ts` | hard-fail | the byte-identical re-run assertion (QA-6) runs in the package suite; every output sort has an `id` tiebreak (§1.1, §1.6) |
| `check-autodim-coverage.ts` | hard-fail | QA-1…QA-4 (opening coverage, chain completeness, overall consistency, no duplicates/zero-length) pass on the reference plans (§1.3) |
| `check-autodim-executor-onebatch.ts` | soft-fail → hard at GA | the editor executor dispatches inside exactly one `runBatch` (one undo, §1.4) |
| `check-autodim-otel-spans.ts` | soft-fail → hard at subsystem GA | every exported engine function opens a `pryzm.autodim.*` span (§1.7, P8) |

---

## §4 — Status

DRAFT 2026-07-06 (Issue Log **L-138**). No engine code ships with this contract; it governs the subsystem as the code lands per the ADR-0118 phased plan (P1 exterior-chain+openings → P2 stacking/conflict → P3 rooms → P4 grids/columns/sections). DRAFT → CANONICAL ratifies on the first PR after stakeholder sign-off + the §3 hard-fail gates green + P1 (exterior chain + located openings on rectangular/L plans, deterministic re-run byte-identical) shipped.
