# COMPLIANCE AUDIT — AutoDimension dimension + annotation elements (L-138)

> **Stamp**: 2026-07-07 · **Type**: verification-only compliance audit (no source changed)
> **Scope**: the AutoDimension surface shipped as **L-138** — the pure engine
> `@pryzm/auto-dimension` (commits `f2a74c19` P1 + `03523544` P2), the editor executor
> `apps/editor/src/ui/documentation/applyAutoDimensions.ts` (`de2e0fe7`), the
> `dimension.createMany` handler + store-key fix (`a4a1af27`), and the L0
> `DimensionString` / `AnnotationElement 'linear-dim'` schemas it emits.
> **Method**: static verification of the shipped code against every applicable
> contract (C03, C11, C15, C24, C24.1, C34, C56), ADR (ADR-0002, ADR-0028,
> ADR-0061, ADR-0118), and spec (SPEC-AUTODIMENSION), plus the 8 principles P1–P8.

---

## Executive verdict — **VIOLATIONS** (pure engine COMPLIANT; executor / render-sink integration has 3 violations)

The **pure L2 engine `@pryzm/auto-dimension` is strongly compliant** with C56 and
SPEC-AUTODIMENSION: it is genuinely pure (schemas + OTel only), deterministic
(byte-identical re-run is asserted in tests), realises the 8-stage pipeline, and
honours the completeness invariants DI-1…DI-5 with test evidence.

The **executor / integration layer violates the contract in three material ways**,
and the governing docs (C56 §1.8/§2, SPEC §5, ADR-0118) are **stale** relative to
the shipped render path:

1. **The render sink is broken** — the executor dispatches the full
   `'linear-dim'` `AnnotationElement` through `annotation.create`, but that bus
   handler (a) reads a **different payload shape**, (b) drops
   `geometry2D`/`references`, and (c) writes to a **different store** than the
   plan renderer reads. The auto-dimensions almost certainly **do not render**.
2. **Two/three parallel dimension representations are unreconciled** — C56/SPEC
   mandate a `dimension.createMany` → `DimensionString` sink, but the shipped
   renderer never reads that store, so `dimension.createMany` (and the
   `a4a1af27` store-key fix that enables it) is **dead infrastructure** for
   AutoDimension. The contract does not name the actual canonical sink.
3. **The mandated executor OTel span `pryzm.autodim.apply` is missing** (C56 §1.7,
   P8).

### Compliance tally

| Result | Count |
|---|---|
| **PASS** | 16 |
| **GAP** | 5 |
| **VIOLATION** | 3 |

---

## Applicable governance (Step 1 — discovered, not guessed)

Read the C00 index (`docs/02-decisions/contracts/README.md`) and grepped the
subsystem. Contracts / ADRs / specs that govern the dimension + annotation elements:

| Doc | Why it applies |
|---|---|
| **C56 — AutoDimension Engine** | the contract authored for this exact subsystem (normative invariants §1.1–§1.8, command surface §2, gates §3) |
| **C03 — Schemas, Commands & State** | the L0 `DimensionString` schema, command-bus-only mutation (P6), CQRS/undo |
| **C11 — Element Creation Pipeline** | derived creation = one `runBatch` = one undo; `skipRedetectRooms` |
| **C15 — Hosted Element Contract** | opening offsets read from the embedded `Opening` metric-offset model |
| **C24 / C24.1 — Sheet + Auto-Documentation** | C56 is C24.1's "DS5+" dimension provider; one-undo (§1.2); no silent room/opening omission (§1.3) |
| **C34 — Print & Drawing Standards** | placement styles injected by the caller, never hardcoded in the engine |
| **ADR-0118** | the decision this subsystem ratifies (deterministic L2-pure engine, executor-only mutation, `dimension.createMany` sink) |
| **ADR-0002** (`ADR-0002-command-handler-signature.md`) | `HandlerContext.stores` / `affectedStores` — the store-key contract behind `a4a1af27` |
| **ADR-0028** (`ADR-0028-plan-view-canvas-architecture.md`) | the plan-view canvas / `PlanViewAnnotationRenderer` that draws annotations |
| **ADR-0061** | determinism + ULID ids (`createId`) as first-class |
| **SPEC-AUTODIMENSION** | the engineering charter (INV-1…6, §4 stages, §5 API, §6 determinism) |
| **P1–P8** (CLAUDE.md) | P2 THREE-owner, P4 no window-any/DOM, P5 schema purity, P6 command-only mutation, P8 ≥1 span/exported fn |

**Note on schema location:** the two representations live in two different layers.
`DimensionString` is an **L0 Zod schema** (`packages/schemas/src/annotation/dimension.ts`).
The `'linear-dim'` **`AnnotationElement`** the executor actually emits is a **plugin-level
TypeScript interface** (`plugins/annotations/src/subsystem/AnnotationTypes.ts:132`), *not*
an L0 Zod-validated element — a fact C56 does not acknowledge (§1.8 claims the output schema
is the L0 `DimensionString`, "reused with zero schema churn").

---

## Compliance matrix (clause → code evidence → verdict)

### A. Pure engine `@pryzm/auto-dimension` (L2)

| # | Clause | Code evidence | Verdict |
|---|---|---|---|
| A1 | **C56 §1.1 / INV-1** determinism, no AI/ML/RNG/wall-clock | `planAutoDimensions.ts` — no `Math.random`/`Date.now` anywhere in `src/` (grep clean; the only hits are in comments `planAutoDimensions.ts:4-5`); byte-identical re-run asserted `__tests__/planAutoDimensions.test.ts:73-77, 256-257, 272-273` | **PASS** |
| A2 | **C56 §1.4 / P5·P2·P4** purity, L2, no THREE/DOM/store/bus | package imports only `@pryzm/schemas` + `@opentelemetry/api` + internal `./` (import grep); `geometry.ts:1-9` documents the deliberate re-port of `JunctionResolverV2` helpers to avoid the THREE-tainted `geometry-wall` barrel | **PASS** |
| A3 | **C56 §1.2** 8-stage pipeline is the normative shape | `planAutoDimensions.ts:184-286` realises stages 1(`graph`)→2/3(`segment`)→4/5(`chain`)→6(`place`)→7(`conflict`)→8(`qa`) in order | **PASS** |
| A4 | **C56 §1.6 / SPEC §6** determinism mechanics (sort once, canonical axisDir, id tiebreaks) | wall sort `planAutoDimensions.ts:41-49`; `canonicalDir` `geometry.ts:82-88`; node-id ordering `perimeter.ts:80-89`; every `sort` ends in an id/`dedupKey` comparator (`planners.ts:104`, `conflicts.ts:81-83`, `perimeter.ts:311-316`) | **PASS** |
| A5 | **C56 §1.3 DI-1** overall dims always exist | `planners.ts:40-68` `planOverall` emits 1 H + 1 V; QA `overall-mismatch` guard `planAutoDimensions.ts:156-173`; test `:92-102` | **PASS** |
| A6 | **DI-2** every opening located AND sized | width dim = opening `left`→`right` edge segment inside `planOpeningChain` (`planners.ts:100-101`); location = `center` tick `planOpeningLocations` (`planners.ts:128-147`); QA `opening-unsized`/`opening-unlocated` `planAutoDimensions.ts:137-143`; test `:137-159, 233-243` | **PASS** |
| A7 | **DI-3** every wall break dimensioned | `planWallChain` ticks all `run.nodeRefs` (`planners.ts:71-86`) | **PASS** |
| A8 | **DI-4** never dimension the same distance twice | plan-time dedup by `dedupKey` `planAutoDimensions.ts:233-238`; Stage-7 span-dedupe `conflicts.ts:79-91`; test `:161-166, 240-242` | **PASS** |
| A9 | **DI-5 / C56 §1.5** no avoidable overlap; rule-based; RNG never | placement (side + rows) `placement.ts:108-148`; bump/push bounded (`MAX_ROWS=8`) `conflicts.ts:105-169`; accepts + logs `text-overlap-unresolved`/`geometry-crossing` — never RNG | **PASS** |
| A10 | **DI-6 / SPEC §4.4** QA **rejects** incomplete docs via a typed **error** | **`AutoDimReport` has NO `errors` field** — only `warnings` + `skipped` (`types.ts:152-162`); completeness failures are recorded as `ValidationWarning` (`types.ts:137-150`), the executor still reports **success** and creates whatever exists (`applyAutoDimensions.ts:170-177`). "QA rejects" is not implemented — QA *annotates*. SPEC §3/§4.4 specify `errors: ValidationError[]`. | **GAP** |
| A11 | **SPEC §4.4 QA-2** each run's ticks partition `[0,runLength]` (no `chain-gap`/`chain-overlap`) | `runQA` (`planAutoDimensions.ts:107-175`) implements QA-1/QA-3/QA-4 but **not** QA-2; codes `chain-gap`/`chain-overlap` are absent from the `ValidationWarning` union (`types.ts:137-150`) | **GAP** |
| A12 | **C03 / P5** `DimensionString` output conforms to the L0 schema | `serialize()` calls `DimensionStringSchema.parse({...})` `planAutoDimensions.ts:93-104`; refs mapped to `{elementId, anchor}`; `isAutoGenerated:true`, `autoMode:'set-out'`; test `:104-113` | **PASS** |
| A13 | **C34 / C56 §1.4** styles injected, not hardcoded | offsets come from `opts.baseOffsetMm`/`rowSpacingMm` with defaults, never a THREE/DOM style read (`planAutoDimensions.ts:90-92`) | **PASS** (v1 defaults; full `DimStyleTable` injection is P4) |
| A14 | **C56 §1.7 / P8** every exported **engine** function opens a `pryzm.autodim.*` span | root + all 7 stages open spans via `withAutoDimSpan` (`tracing.ts`, `planAutoDimensions.ts:188-265`). **But** the barrel (`index.ts:10-11`) also publicly exports `polygonCentroid`, `outwardNormal`, `segmentsCross` with **no span** ("exposed for tests"). Literal §1.7 = "every exported engine function". CI gate `check-autodim-otel-spans.ts` is soft-fail. | **GAP** |

### B. Schemas / element identity

| # | Clause | Code evidence | Verdict |
|---|---|---|---|
| B1 | **C03 / P5** emitted `'linear-dim'` `AnnotationElement` conforms to its schema | `makeAnnotationElement('linear-dim', ownerViewId, [pointRef,pointRef], geometry2D{modelPoints,offset}, {unit:'mm'})` `applyAutoDimensions.ts:234-241`; shape matches `AnnotationElement` (`AnnotationTypes.ts:132-166`) | **PASS** (but see B2) |
| B2 | **C56 §1.8** "the output schema is the L0 `packages/schemas/annotation/dimension.ts`" | the render path emits a **plugin-level `AnnotationElement` interface**, not the L0 `DimensionString`; it is **not Zod-validated** and lives at L7 not L0. C56 §1.8's "reused with zero schema churn / DimensionString flows through evaluateDimensions→renderer" describes a path the shipped code does not take. | **VIOLATION** (contract ↔ code mismatch — see §Two-representations) |
| B3 | **ADR-0061** element ids are ULID via `createId` | dead path OK: `CreateManyDimensions.ts:59` uses `createId('dimension')`; `CreateAnnotation.ts:59` uses `createId('annotation')`. **Live path**: the executor mints `crypto.randomUUID()` (`applyAutoDimensions.ts:236`) — **not** a `<prefix>_<ULID>` id, and non-deterministic → the *persisted* element ids differ every run (engine `DimensionString` ids stay deterministic, but they are discarded). `makeAnnotationElement` also stamps `Date.now()` (`AnnotationTypes.ts:257`). | **GAP** |
| B4 | **C15** openings read from the embedded metric-offset model; no new opening state | executor reads `w.openings[].offset/width` (`applyAutoDimensions.ts:123-140`); engine `AutoDimOpening{offset,width}` (`types.ts:16-24`); creates no opening | **PASS** |

### C. Executor / command-state path (L5)

| # | Clause | Code evidence | Verdict |
|---|---|---|---|
| C1 | **C11 / C24.1 §1.2 / C56 §1.4** one `runBatch` = one undo; `skipRedetectRooms`; `levelIds` | `batchCoordinator.runBatch(() => {…}, {levelIds:[level.id], totalElementCount, skipRedetectRooms:true})` `applyAutoDimensions.ts:160-168` | **PASS** |
| C2 | **P6 / C03 §6 / ADR-0118** mutation only through the command bus (executor is the only impure surface; engine emits no commands) | engine returns `DimensionString[]` only; executor dispatches `runtime.bus.executeCommand('annotation.create', …)` — no direct store write in the executor (`applyAutoDimensions.ts:162`) | **PASS** (structurally; effect is wrong — C3) |
| C3 | **Render-sink correctness** — the executor's own header claim "so the existing renderer draws them" (`applyAutoDimensions.ts:20-23`) | The plan renderer reads the **subsystem singleton** `annotationStore.getByView` (`PlanViewAnnotationRenderer.ts:22, 217`). That store is populated by `annotationStore.add(element)` via the **legacy** `CreateAnnotationCommand` (`CreateAnnotationCommand.ts:53`) + `commandManager.execute` — exactly what the manual tool does (`LinearDimensionAnnotationTool.ts:828-832`). The **bus** `annotation.create` handler instead writes a flat `AnnotationData` to `AnnotationsState` (`CreateAnnotation.ts:76-79`) and **reads `cmd.viewId`/`cmd.kind`** — but an `AnnotationElement` carries `ownerViewId`/`type`, so `viewId`→`''`, `kind`→default `'text-note'`, and `geometry2D`/`references` are **dropped**. `'linear-dim'` is not even in `ANNOTATION_KINDS` (`intent.ts:16-28`). The executor **never** calls `annotationStore.add` / `CreateAnnotationCommand`. → the dims are written to the wrong store in the wrong shape and **do not render**. | **VIOLATION** |
| C4 | **C56 §2 / SPEC §5 / ADR-0118** the executor sink is `dimension.createMany` (→ `DimensionString`) | the shipped executor dispatches **`annotation.create`** (`applyAutoDimensions.ts:162`), never `dimension.createMany`. `dimension.createMany` + `DimensionStore` are explicitly "left in place … no longer the executor's render sink" (`applyAutoDimensions.ts:22-23`) → **dead infra**. The `a4a1af27` store-key fix repairs a verb the render path does not use. Contract/SPEC/ADR describe a sink the code abandoned. | **VIOLATION** |
| C5 | **C56 §1.7 / P8** executor opens `pryzm.autodim.apply` around the `runBatch` | `applyAutoDimensions` opens **no** span (no `startActiveSpan`/`withHandlerSpan`/`withAutoDimSpan` in the file). §1.7 explicitly requires it. | **VIOLATION** |
| C6 | **P8** the new exported helper `dimensionStringsToLinearDimAnnotations` opens ≥1 span | exported (`applyAutoDimensions.ts:202`), no span | **GAP** |
| C7 | **ADR-0002 §3** `affectedStores` store must be present in `HandlerContext.stores` under the declared key (`storeKey`) | `a4a1af27` sets the `dimensions` plugin `storeKey:'dimension'` (`PluginRegistry.ts`) to match every dimension handler's `affectedStores=['dimension']` + `ctx.stores.dimension` (`CreateManyDimensions.ts:30, 36, 80`). Correct per ADR-0002 — resolves the "required store 'dimension' is missing" class. (Cross-plugin naming remains inconsistent: `rooms` handlers read plural, `dimension` reads singular — a convention gap, not a violation.) | **PASS** |
| C8 | **DOC / ADR-0028 / ownerViewId** dims are view-scoped to the active plan view | `resolveActivePlanViewId()` requires a plan-like `viewType` and returns the real active view id (`applyAutoDimensions.ts:61-70`); `ownerViewId = activeViewId` `:234-238`. (The engine's own `DimensionString.viewId = plan-${level.id}` `:145` is a synthetic id, but it is discarded on the render path — harmless, though inconsistent.) | **PASS** |

---

## Prioritised violations + gaps (with exact remediation)

### VIOLATION 1 (P0) — the executor writes dimensions to the wrong store in the wrong shape; they do not render
- **Where:** `apps/editor/src/ui/documentation/applyAutoDimensions.ts:160-168`.
- **Why:** `runtime.bus.executeCommand('annotation.create', annotation)` routes a full
  `AnnotationElement` to `CreateAnnotationHandler`, which reads `cmd.viewId`/`cmd.kind`/`cmd.anchor`
  (an `AnnotationElement` has `ownerViewId`/`type`/none), drops `geometry2D`+`references`, and writes
  a flat `AnnotationData` to `AnnotationsState` — **not** the subsystem `annotationStore` that
  `PlanViewAnnotationRenderer.getByView` reads (`PlanViewAnnotationRenderer.ts:217`).
- **Evidence the manual analog does more:** `LinearDimensionAnnotationTool.ts:828-832` fires the
  same bus telemetry **and** `this._commandManager.execute(new CreateAnnotationCommand(element))`,
  which does `annotationStore.add(this._element)` (`CreateAnnotationCommand.ts:53`) — the actual
  render-store write the executor omits.
- **Remediation (choose one, keep P6 in view):**
  1. **Match the manual tool** — inside the batch, drive the subsystem store through the same
     command the tool uses (`CreateAnnotationCommand`/`annotationStore.add`) so `getByView` is
     populated; *or*
  2. **Add a real bus verb** `annotation.createElement` (or extend `annotation.create`) whose
     payload is the full `AnnotationElement` and whose handler writes it to the subsystem
     `annotationStore` — this is the P6-clean fix and removes the legacy `commandManager` dependence
     for *both* the tool and the executor.
- **Verify:** run AutoDimension on a plan and confirm `annotationStore.getByView(activeViewId)`
  returns the `'linear-dim'` elements and they draw. (This audit is static; runtime confirmation is
  required — the payload/store mismatch is high-confidence but should be exercised.)

### VIOLATION 2 (P0) — governance is stale: contract/SPEC/ADR mandate a `dimension.createMany` sink the code abandoned
- **Where:** C56 §1.8 + §2, SPEC-AUTODIMENSION §5, ADR-0118 "Decision" bullet 4.
- **Why:** all three say the executor dispatches `dimension.createMany` and the `DimensionString[]`
  flows through `evaluateDimensions → PlanViewAnnotationRenderer` unchanged. The shipped renderer
  never reads the `DimensionStore` that `dimension.createMany` writes (`applyAutoDimensions.ts:12-23`),
  so the executor emits `'linear-dim'` `AnnotationElement`s instead. Per the governance rule ("when
  code disagrees with a contract, the code is wrong — fix the code **or** raise a superseding ADR"):
  a decision is owed.
- **Remediation:** raise a superseding ADR (or amend C56 §1.8/§2 + SPEC §5 in place once VIOLATION 1
  is resolved) that names the **canonical AutoDimension render sink**. Either (a) declare the
  `'linear-dim'` `AnnotationElement` the sink and demote `dimension.createMany`/`DimensionStore` to
  documented dead-until-P4 infra, or (b) restore the C56 path by teaching `PlanViewAnnotationRenderer`
  to read the `DimensionStore`. Do **not** leave the contract asserting a path the code does not take.

### VIOLATION 3 (P1) — mandated executor span `pryzm.autodim.apply` is missing
- **Where:** `applyAutoDimensions` has no span (`applyAutoDimensions.ts:100-183`).
- **Contract:** C56 §1.7 ("The editor executor adds `pryzm.autodim.apply` around the `runBatch`
  dispatch"), SPEC §5 (`// span: pryzm.autodim.apply`), P8.
- **Remediation:** wrap the gather→plan→`runBatch` body in `withAutoDimSpan('apply', …)` (or a
  `startActiveSpan('pryzm.autodim.apply')`), attributes `wall_count`/`string_count`/`error_count`.

### GAP 1 (P1) — DI-6 "QA rejects incomplete documentation" not implemented; `errors` renamed to `warnings`
- **Where:** `types.ts:137-162` (`ValidationWarning`, `AutoDimReport{warnings,skipped}` — no `errors`),
  `applyAutoDimensions.ts:170-177` (always reports success).
- **Contract:** C56 §1.3 DI-6 + SPEC §3/§4.4 require `errors: ValidationError[]` and a **reject**.
- **Remediation:** either amend C56/SPEC to say completeness failures are *warnings* (non-blocking) —
  matching the shipped intent of "no silent omission, surface the diagnostic" — or add an `errors`
  channel and make the executor refuse/flag an incomplete SET. Reconcile the `ValidationError` vs
  `ValidationWarning` naming across contract/spec/code.

### GAP 2 (P2) — SPEC QA-2 (chain partition: `chain-gap`/`chain-overlap`) not implemented
- **Where:** `runQA` (`planAutoDimensions.ts:107-175`) has QA-1/3/4 but not QA-2; codes absent from
  `ValidationWarning` (`types.ts:137-150`).
- **Remediation:** implement the run-partition check per SPEC §4.4 QA-2, or record the deviation in
  SPEC §11 as deferred to P2/P3 with rationale.

### GAP 3 (P2) — element ids are `crypto.randomUUID()`, not ULID; non-deterministic persisted set
- **Where:** `applyAutoDimensions.ts:236`.
- **Contract:** ADR-0061 (ULID via `createId`), C56 §1.6.
- **Remediation:** mint annotation ids with `createId('annotation', …)` (ULID); for a fully
  deterministic persisted set, derive the ULID seed from the engine's positional `DimensionString`
  id so a re-run is byte-identical end-to-end (the engine half already is).

### GAP 4 (P2) — barrel-exported pure helpers lack spans; the new executor helper lacks a span
- **Where:** `index.ts:10-11` (`polygonCentroid`/`outwardNormal`/`segmentsCross`),
  `applyAutoDimensions.ts:202` (`dimensionStringsToLinearDimAnnotations`).
- **Contract:** C56 §1.7 / P8 (literal "every exported function").
- **Remediation:** wrap the helper in a span, and either add spans to the three exported geometry
  helpers or narrow the `check-autodim-otel-spans.ts` gate definition of "exported engine function"
  to the pipeline entry points (and record that scoping in C56 §1.7).

### GAP 5 (P3) — `'linear-dim'` render element is a plugin interface, not an L0 Zod schema
- **Where:** `AnnotationTypes.ts:132` (`interface AnnotationElement`, no Zod parse at the sink).
- **Contract note:** C56 §1.8 implies the output is L0-schema-validated; the render element is not.
- **Remediation:** fold into the VIOLATION 2 ADR — if `'linear-dim'` becomes the canonical sink, note
  that its schema authority is the annotations plugin (DOC-*), not `packages/schemas`.

---

## The two-representations question (architecturally important)

The codebase carries **three** dimension representations, and AutoDimension touches all three:

1. **`DimensionString`** — L0 Zod schema, element+anchor refs, `evaluateDimensions`-resolved
   (`packages/schemas/src/annotation/dimension.ts`). **This is the engine's output** and the sink
   C56/SPEC/ADR-0118 assume.
2. **`DimensionData` / `DimensionStore`** — flat points-based records written by
   `dimension.create` / `dimension.createMany` (`plugins/dimensions/src/…`). **The plan renderer
   never reads this store** (`applyAutoDimensions.ts:16-18`).
3. **`AnnotationElement 'linear-dim'` (and flat `DimensionElement`)** — view-owned records the plan
   renderer actually draws via `annotationStore.getByView` / `getDimensionsByView`
   (`PlanViewAnnotationRenderer.ts:217-218`). **This is what the shipped executor emits.**

**Finding:** `dimension.createMany` (and therefore the `a4a1af27` `storeKey='dimension'` fix that
made it "find its store") is **dead infrastructure for the AutoDimension render path** — the executor
deliberately bypasses it (`applyAutoDimensions.ts:22-23`) because rep. 2 doesn't render. The engine
produces rep. 1, the executor converts rep. 1 → rep. 3 via `evaluateDimensions`
(`dimensionStringsToLinearDimAnnotations`, `applyAutoDimensions.ts:202-248`), and rep. 2 sits unused.

This is a genuine **contract conflict/duplication that C56 (or a DOC-* / ADR) must reconcile**: no
contract currently declares which representation is canonical for *rendered* documentation. C56 §1.8
asserts rep. 1-through-renderer; the code ships rep. 3. The `dimension.*` command family (C56 §2)
overlaps the `annotation.*` family for the same user-visible artifact (a dimension on a plan). Until
an ADR names the canonical sink and the render authority, the subsystem has two live command
families and one dead store for one artifact — the exact drift C31/governance exists to prevent.

**Recommendation:** one superseding ADR (folding VIOLATION 1, 2, and GAP 5) that (a) names the
canonical rendered-dimension representation, (b) reconciles the `dimension.*` vs `annotation.*`
command surfaces, and (c) either deletes/defers `DimensionStore` or wires the renderer to it — then
amend C56 §1.8/§2 + SPEC §5 in place to match.

---

## What is compliant (with evidence)

- **The pure engine is a model L2 citizen.** No THREE/DOM/store/bus/RNG/wall-clock; imports only
  `@pryzm/schemas` + `@opentelemetry/api`; re-ports the junction/topology helpers to stay off the
  THREE-tainted barrel (`geometry.ts:1-9`, `perimeter.ts:1-11`). P2/P4/P5 upheld.
- **Determinism is real and tested.** Byte-identical re-run and input-order independence asserted
  across P1 and P2 stages (`__tests__/planAutoDimensions.test.ts:72-90, 245-279`); every ordering is
  total with an id/`dedupKey` tiebreak.
- **The 8-stage pipeline + completeness DI-1…DI-5** are implemented and test-backed (overall dims,
  located+sized openings, wall-break ticks, no-duplicate, outward-side placement, bounded conflict
  resolution).
- **One-undo (C11/C24.1 §1.2)** via a single `batchCoordinator.runBatch` with `skipRedetectRooms`.
- **C15 opening model** consumed read-only from the embedded metric-offset fields.
- **ADR-0002 store-key contract** correctly satisfied by `a4a1af27` (the fix itself is right; its
  target verb is just unused by the render path).

---

## Bottom line

The **intelligence layer C56 was written to produce is built correctly** — the pure engine is
deterministic, pure, complete, and well-tested, and it honours C56 §1.1–§1.6 and the C11/C15
integration invariants. The failure is at the **seam between the engine and the screen**: the
executor dispatches to a bus command whose payload shape and target store do not match the render
pipeline, so the deterministic set the engine computes is unlikely to render; and the governing
contract/spec/ADR still describe the `dimension.createMany`/`DimensionString` sink the code has
silently replaced with `'linear-dim'` annotations. Resolve the render sink (VIOLATION 1), then
ratify the actual sink in a superseding ADR and amend C56/SPEC to match (VIOLATION 2), add the
mandated `pryzm.autodim.apply` span (VIOLATION 3), and close the DI-6/QA-2/ULID/span gaps.
