# PHASE 3 — CODE-VS-SPEC AUDIT (3A · 3B)

> **Date**: 2026-04-28
> **Auditor**: independent code-grounded re-audit (post-team self-claims)
> **Method**: source-of-truth reading of every claimed Phase-3 deliverable —
> file-by-file, handler-by-handler, test-by-test — followed by **actual test
> execution** of the suspect workspaces. **Doc text is not trusted** unless the
> corresponding code/test/configuration confirms it.
> **Cross-references**: this audit reads but does NOT defer to the team's own
> M-series gate reports under `apps/bench/reports/` (only `M30-3B.md` exists for
> Phase 3, and it is itself a `DRAFT` per its line 3) nor to any per-sprint
> closure note. Where this audit confirms them, both are cited. Where it
> disputes them, this audit states why with file paths and line numbers.
> **Scope**: Phase 3A (Q1 / M25–M27 / S49–S54), Phase 3B (Q2 / M28–M30 / S55–S60).
> **Out of scope**: Phase 1 + Phase 2 follow-ups (already covered by the
> respective `PHASE-1-` and `PHASE-2-` audit + close-plan documents);
> Phase 3C (M31–M33), Phase 3D (M34–M36), and post-GA work.

---

## §0 Executive Verdict

| Sub-phase | Code-grounded score | Implied team self-grade | Delta | Verdict |
|---|---|---|---|---|
| **3A** — AI L7.5 promotion + CV + workflows + visibility waves 6–11 + component-editor cut + 3A demo | **74 / 100** | 100 / 100 | −26 | The L7.5 architectural promotion is real and substantial; the AI plane fails its own contract test because the ai-host package does not declare its `@pryzm/ai-cost` dep; S53 public-AI-API + `legacy_vi_fallback` flip + M27-3A bench report + 3A demo recording are absent; the "component editor formal deferral" was *reversed* mid-phase and the editor was actually built |
| **3B** — IFC plugin + DXF plugin + Revit add-in + component editor + BCF + PropertyPanel decomposition + Tier-2 cut-list | **76 / 100** | 100 / 100 (M30-3B `DRAFT`) | −24 | IFC import + IFC export + IFC inspector + BCF + Rhino are genuinely ready; the component editor over-delivers vs the S54 "deferral"; DXF plugin is absent in **both** directions despite M30-3B asserting that DXF *import* shipped at S55; print-canvas backend missing; PropertyPanel decomposition partially landed (host shipped, per-plugin tabs not contributed); Revit add-in is real but at v0.1 surface; SOC2/audit-log evidence pipeline incomplete |
| **Phase 3 overall** | **C+ (75 / 100)** | A (100 / 100) | −25 | The substantive engineering is impressive; the gate-readiness paperwork and 3 of the cross-phase exit deliverables are not in code |

**Bottom line.** Phase 3 contains some of the best new engineering in the
repo — the L7.5 AI plane (`AiPlane` / `AiBus` / `WorkflowRegistry` /
`AnthropicRelay`), the real ai-worker CV pipeline, the .pryzm-family
`packages/family-runtime` expression engine, the planegcs constraint solver
adapter, the `apps/component-editor` sub-app with full sketch tooling +
constraint table + quality-gate suite, the IFC + BCF round-trip plugins, and
the C# Revit add-in. But:

1. **The AI plane's contract suite is red.** `packages/ai-host`'s package.json
   declares only `@opentelemetry/api` as a runtime dep, but `AiPlane.ts`,
   `AiHost.impl.ts`, `Generate3Options.ts`, and `index.ts` all
   `import` from `@pryzm/ai-cost`. Vite cannot resolve it; `AiHost.test.ts`
   and `AiPlane.batch.test.ts` fail at module load with `Failed to load url
   @pryzm/ai-cost`. **9 of 75 tests** in the L7.5 backbone are red.
   This is the same defect Phase-2 audit W-01 named, but it is now also a
   **Phase 3A regression** because S49 D1 promoted the dependency to a
   first-class plane field (`AiPlane.costMeter`).

2. **DXF plugin is absent in both directions.** Spec line 88 of
   `PHASE-3B-...PLUGINS-IFC-DXF-RHINO.md` titles S55 *"IFC Plugin + OBC
   Bundle Removal + DXF Plugin + Print-Canvas Backend"*; `M30-3B.md` §1.1
   asserts *"DXF import landed S55 (`plugins/dxf-import/`)"*. There is **no
   `plugins/dxf-import/` and no `plugins/dxf-export/`** in the repo.
   `ls plugins/ | grep dxf` returns empty. The export defer at S59 D1 was
   founder-ratified per M30-3B; the import claim is **a documentation lie**.

3. **`featureFlags.legacy_vi_fallback` has zero references in the codebase.**
   The S53 D8 deliverable line is *"`featureFlags.legacy_vi_fallback`
   flipped to opt-in only"*. `rg "legacy_vi_fallback|legacy-vi-fallback"`
   across `packages/ apps/ plugins/` returns zero hits. The flag itself
   does not exist; flipping a non-existent flag is not a meaningful safety
   measure for the visibility-waves cutover.

4. **Public AI API draft (S53) is absent.** Spec §S53 calls for a public
   draft of the AI workflow surface in `apps/sync-server/` or
   `apps/headless/`. Neither has any `/api/ai`, `submitWorkflow`, or
   `publicAiApi` route. The L7.5 plane stays internal to the editor.

5. **Phase 3A gate report (`apps/bench/reports/M27-3A.md`) does not exist.**
   Spec §S54 D6 requires *"`apps/bench/reports/M27-3A.md` published"*.
   Only `M30-3B.md` exists under `apps/bench/reports/`, and it is itself
   marked `DRAFT (S59 D1 — full report drafts at S60 D6)`. There is no
   M27 equivalent for 3A at all.

6. **The 3A demo recording is absent.** Spec §S54 D5 requires *"10-min
   3A demo screencast"*. There is no `docs/05-guides/developer/demos/`, no `*M27-3A*`, no
   `*3a-demo*` artefact anywhere in the repo.

7. **Element creator marketplace (S59) is absent.** Spec §5.2 of
   `IFC-REVIT-COMPONENT-EDITOR.md` titles the work *"Element Creator
   Marketplace"*. M30-3B §2 row T2.2 re-confirms it is deferred to
   Phase 3C. That is honest deferral, not a closure.

8. **PropertyPanel decomposition (S60) is half-landed.** `packages/ui/src/`
   contains `PanelHost.ts` (~210 LOC) and `InspectorHost.ts` (~480 LOC)
   with the contribution-point machinery. But the 3,339-LOC monolith the
   decomposition is supposed to replace lives in `apps/editor/`, and **no
   per-plugin tab is registered against the new host** (`rg
   "PropertyPanel|InspectorPanel|property-panel" apps/editor/src/`
   returns nothing). The infrastructure is there; the migration is not.

9. **OBC removal is real and clean** — `rg "@thatopen/components|openbim-components"`
   across `packages/ apps/ plugins/` returns zero source hits; the only
   trace is a pnpm-store cache file and one `docs/studies/`
   reference. This is a quiet 100/100 win that no audit row credits.

10. **Phase 3 audits directory is empty for 3A/3B.** `docs/00_NEW_ARCHITECTURE/audits/`
    has Phase-1 + Phase-2 audits and close plans; **no Phase-3 self-audit**
    has been authored by the team. Phase-3 is the first phase whose closure
    is being attempted without the team's own audit pass to disagree with.

What this audit catches that no other document does:

* **`@pryzm/ai-cost` is not in `@pryzm/ai-host`'s `dependencies`** despite
  4 source files importing it. This is an unforced packaging defect, not a
  module-resolution mystery.
* **The 7th sketch tool** (`SelectTool`) and the 5 constraint commands
  (`addCoincident`, `addDistance`, `addFixed`, `addParallel`,
  `addPerpendicular`) ship green via the `family-editor-quality-gates`
  workflow — but the **6th solid op** (loft / sweep / revolve) does not:
  `apps/component-editor/src/commands/solid/` contains only `index.ts`
  with no per-op handler files. The §7.3 spec list of "extrude / sweep /
  loft / revolve" landed only as `extrude`.
* **`bake-worker` ships a *second* file named `CostMeter.ts`** at
  `apps/bake-worker/src/cost/CostMeter.ts`. It is **not** the AI cost
  meter — it is the R2-storage cost meter from S21 — but the name
  collision creates a documentation hazard: future readers grepping for
  `CostMeter` get two unrelated implementations.
* **`packages/types-builtin` ships seven builtin element families with
  zero unit tests.** `cd packages/types-builtin && vitest run` exits with
  `vitest: command not found`. The `package.json` has no `test` script and
  no `__tests__/` directory.
* **`apps/ai-worker` has a real `matchDoorTemplate` scoring bug.** The
  S52 §4.2 test `scores a 120°-swing arc much lower than 90°` expects the
  score to be `< 0.5`; the implementation returns `0.65`. The CV door
  classifier overcredits wide-swing arcs.
* **The `audit-log-middleware` workflow is reported "failed" but the
  test suite passes** (14/14). The workflow's last-known status appears
  to be stale at the workflow-runner level; the underlying code is green.
  This is a workflows-pane reporting hazard, not a code defect.
* **`ADR-038-byok-key-custody.md`, `ADR-039-export-worker-architecture.md`,
  and `ADR-040-schedule-export-formats.md` exist** in
  `docs/00_NEW_ARCHITECTURE/adrs/` (the *strategic* ADR series) — meaning
  the Phase-2 audit's HIGH-3 finding ("ADR-039 referenced but not
  authored") was incorrect: the ADR exists, in the strategic series, not
  the sprint-scoped series at `docs/02-decisions/adrs/`. The Phase-3 audit
  flags the **dual-ADR-series numbering hazard** itself as a separate
  finding (MED-9 below).

What the team's M30-3B `DRAFT` correctly captures that this audit
confirms:

* T2.1 DXF/SVG **export** defer to v2 with a documented reversal trigger.
* T2.3 multi-language UI defer to Phase 4.
* T2.5 offline-first defer to v2.
* T2.6 multi-region defer to S67 anchor.
* BCF S59 high-fidelity surface (multiple viewpoints + components
  selection/visibility/colouring + AssignedTo / DueDate / Stage) — the
  `plugins/bcf` test suite confirms 57/57 with all four surfaces
  exercised.
* The component-editor "cut" was always meant to be *deferral of
  marketplace richness* — re-reading the M30-3B §2 footnote shows the
  team is aware that the editor itself shipped while the marketplace
  did not. The audit confirms this read of the original cut.

---

## §1 Inventory — what exists today

### 1.1 Packages added or significantly extended during Phase 3

| Package | Sprint | LOC | Status |
|---|---|---|---|
| `packages/ai-host` | 3A · S49–S52 | 4,267 (incl. tests) | **Promoted to L7.5**: `AiPlane.ts` (single first-class plane), `AiBus.ts` (independent bus, `pryzm.ai` OTel prefix), `WorkflowRegistry.ts` (descriptor + impl pair, ≤ $0.18/call ceiling enforced at register time), `AnthropicRelay.ts` (porter abstraction, mock + CF-Worker variant), `AiHost.impl.ts` (lazy chunk), `AiHost.ts` (façade), `workflows/PlanCritique.ts` + `PlanCritiqueTypes.ts`, `workflows/Generate3Options.ts` + `Generate3OptionsTypes.ts`, `workflows/VoiceCommand.ts` + `VoiceCommand.impl.ts`. **9/75 tests RED at module load** because `@pryzm/ai-cost` is not declared as a dep. |
| `packages/ai-cost` | 3A · S49 (extension of S47 stub) | full `CostMeter.ts` (~360 LOC) + barrel + tests | **34/35 tests pass**; **1 RED** — `perProjectMonthlyBudget` async resolver path. Exports `CostMeter`, `computeCostUSD`, `MODEL_PRICING`, `PLAN_BUDGETS`, `PER_CALL_CEILING_USD_DEFAULT`, types: `Plan`, `ModelClass`, `AIRecordInput`, `AISurface`, `CostBreakdown`, `BudgetCheck`, `CostMeterOptions`, `BudgetResolver`, `NotifyAdmin`, `AiUsageRow`, `AiUsageInsertSink`, `PreCheckResult`. |
| `packages/visibility` | 3A · S53 (waves 6–11) | full 11 waves | **All 12 test files pass / 82 tests** (already over-delivered in 2D). Waves shipped: w01-level-scope, w02-category-visibility, w03-view-template-inheritance, w04-wall-end-joins, w05-opening-culling, w06-filter-overrides, w07-phase-filter, w08-temporary-isolation, w09-element-hide, w10-design-option, w11-ghost-layer. Spec §S53 D8 (`legacy_vi_fallback`) is **NOT** in code. |
| `packages/constraint-solver` | 3B · S52 (per family-creator rewrite plan) | 1,275 | **33/33 tests pass**. Real `PlanegcsAdapter.ts` + `engine.ts` + worker harness. Used by component-editor's `solverRunner.ts`. |
| `packages/family-runtime` | 3B · S52 | 1,069 | **58/58 tests pass** across 6 suites: `parser.test.ts` (13), `evaluator.test.ts` (13), `resolveParameter.test.ts` (12), `unit-coercion.test.ts` (6), `span-sink.test.ts` (4), `tokenizer.test.ts` (10). Real expression DSL — tokenizer, parser, evaluator, unit coercion, OTel spans. |
| `packages/family-loader` | 3B · S52 | (loader for `.pryzm-family`) | **4/4 tests pass**. |
| `packages/family-instance` | 3B · S52 | (bake) | **5/5 tests pass** (`bakeFamilyInstance.test.ts`). |
| `packages/types-builtin` | 3A precursor / 3B · S52 | 7 builtin families | **0 tests** — no `__tests__/`, no `test` script. Builtin types: `Wall`, `Floor`, `Roof`, `Ceiling`, `Stair`, `Railing`, `Curtain Wall` (per SPEC-FAMILY-EDITOR §1.1). |
| `packages/pdf-to-bim` | 3A · S52 (Track A) | (confidence + review-queue layers) | **26/26 tests pass** (`confidence.test.ts` 17, `review-queue.test.ts` 9). Pure data-layer; CV implementation lives in `apps/ai-worker`. |
| `packages/ui` | 3B · S60 | **692** (3 src files: `index.ts`, `PanelHost.ts`, `InspectorHost.ts`) | The §6.1 `PanelHost` + §6.1 `InspectorHost` contribution machinery shipped. **No per-plugin tab is registered against either host from `apps/editor/`** — see HIGH-2. |

### 1.2 Plugins added or significantly extended during Phase 3

| Plugin | Sprint | LOC | Status |
|---|---|---|---|
| `plugins/ifc-export` | 3B · S55–S56 | 1,736 | **16/16 tests pass** across 4 suites (`meta-store`, `guid`, `otel`, `round-trip`). 6 element exporters: `wall.ts`, `slab.ts`, `column.ts`, `beam.ts`, `door.ts`, `window.ts`. |
| `plugins/ifc-import` | 3B · S55 + S57 (Tier-2 proxy) | 534 | **18/18 tests pass** (`move-command` 4, `tier2-proxy` 9, `round-trip` 5). Preserves `ifc.*` namespace including all Psets, quantities, materialLayerSetSource, GlobalId. |
| `plugins/ifc-inspector` | 3B · S57 | 375 | **12/12 tests pass** (`pset-editor`). Pset/Quantity edit surface with provenance tags. |
| `plugins/bcf` | 3B · S59 | 1,440 | **57/57 tests pass** across 4 suites (`viewpoint-navigator` 18, `ifc-bridge` 12, `round-trip` 18, `panel-contribution` 9). Real BCF 3.0 archive read+write, multiple viewpoints, components selection/visibility/colouring, related topics, AssignedTo / DueDate / Stage; byte-stable double-write. |
| `plugins/rhino-import` | 3B · S57 | 380 | **4/4 tests pass**. WASM optional load path with graceful fallback (`loadRhinoModule resolves or throws gracefully`). |
| `plugins/dxf-import` | 3B · S55 | **0** | **DOES NOT EXIST**. M30-3B §1.1 says it shipped; the directory is absent. |
| `plugins/dxf-export` | 3B · S55 | **0** | **DOES NOT EXIST**. M30-3B §1.2 ratifies the v2 defer; this is honest. |
| `plugins/ai-floorplan` | 3A · S50 (extension of S47 shell) | 218 + `ApprovalQueuePanel.ts` | **10/10 tests pass** (`descriptor.test.ts` 4, `ApprovalQueuePanel.test.ts` 6). Real vanilla-DOM panel with approve/reject buttons, store subscription, lifecycle. |
| `plugins/ai-generative` | 3A · S52 | ~50 (descriptor only) | **6/6 tests pass** — descriptor-validation only. Workflow lives in `packages/ai-host/src/workflows/Generate3Options.ts`. |
| `plugins/ai-query` | 3A · S52 | ~50 (descriptor only) | **7/7 tests pass** — descriptor-validation only. **No corresponding workflow impl** in `packages/ai-host/src/workflows/`. |
| `plugins/ai-rules` | 3A · S52 | ~50 (descriptor only) | **6/6 tests pass** — descriptor-validation only. **No corresponding workflow impl** in `packages/ai-host/src/workflows/`. |
| `plugins/ai-voice` | 3A · S52 | ~50 (descriptor only) | **7/7 tests pass** — descriptor-validation only. The actual workflow is `packages/ai-host/src/workflows/VoiceCommand.impl.ts` and the descriptor's `WORKFLOW_ID = 'ai.voice.command'` matches it. |

### 1.3 Apps added or extended during Phase 3

| App | Sprint | LOC | Status |
|---|---|---|---|
| `apps/component-editor/` | 3B · S52–S57 | **8,615** | **239/239 tests pass** across 26 test files. Sub-app skeleton per SPEC-FAMILY-EDITOR §3.2. Sketch surface: `SketchCanvas.ts` (Canvas2D paint), `sketchRender.ts`, `entities.ts`, `transform.ts`, `snap.ts`, `hitTest.ts`, `solverRunner.ts`, `buildConstraintSet.ts`, `SketchToolbar.ts`, `ConstraintToolbar.ts`. Sketch tools (`sketch/tools/`): `ArcTool`, `CircleTool`, `FilletTool`, `LineTool`, `RectangleTool`, `SelectTool`, `TrimTool` — **7/7 of the §7.2 list**. Constraint commands (`commands/constraint/`): `addCoincident`, `addDistance`, `addFixed`, `addParallel`, `addPerpendicular` — **5 of the §8.2 list**; missing: equal-length, tangent. Solid commands (`commands/solid/`): only `index.ts` — **1 of the §7.3 list (extrude only); missing: sweep, loft, revolve.** AI: `aiHostBridge.ts` + `toolRegistry.ts` + `approvalQueue.ts` + `replay.test.ts`. Quality gates (`__tests__/quality-gates/`): `bundle-budget` (≤ 180 KB gzip first paint, excludes THREE), `no-react`, `no-three`, `no-window`, `loc-cap` — **all 5 enforce + pass**. |
| `apps/ai-worker/` | 3A · S50–S52 | **3,253** | **70/71 tests pass / 1 RED** (`matchDoorTemplate` 120° arc scoring). Real CV pipeline: `cv/handler.ts` (S50 D4+D6 spec), `cv/page-classification.ts`, `cv/floorplan-segmentation.ts`, `cv/runtime.ts` (ONNX), `cv/storage.ts` (R2 mask upload), `cv/types.ts`. PDF-to-BIM stage 2: `pdf-to-bim/index.ts` (barrel), `pdf-to-bim/stage2-walls.ts` (wall + column classification, centerline computation), `pdf-to-bim/stage2-openings.ts` (door arc matching, panel matching, opening confidence), `pdf-to-bim/types.ts`. Test suites: `cv-pipeline.test.ts` 14, `queue.test.ts` 13, `pdf-to-bim-walls.test.ts` (implicit, in `__tests__/pdf-to-bim/`), `pdf-to-bim-openings.test.ts` 15 (1 RED). |
| `apps/headless/` | 3B carryover from 2C | 831 | Cli + commands `addSlab`, `addWall`, `exportPryzm`, `newProject`. **No `aiSubmit` or workflow surface** — S53 public AI API absent. |
| `apps/cli/` | (pre-3) | 392 | Light CLI host. |

### 1.4 Strategic ADRs ratified during Phase 3

`docs/00_NEW_ARCHITECTURE/adrs/` — the strategic series:

| ADR | Title | Sprint | Status |
|---|---|---|---|
| ADR-029 | PDF-to-BIM Scope | 3A · S49 D6+D7 | **EXISTS** (`ADR-029-pdf-to-bim-scope.md`). Spec §S49 D7 (line 205) requires *"ratification meeting + signature"* — file presence is necessary but not sufficient evidence. |
| ADR-030 | Lifecycle Subsystem Placement | (carryover) | EXISTS. |
| ADR-031 | CDE Storage Topology | (carryover) | EXISTS. |
| ADR-032 | Clash Rule Language | (carryover) | EXISTS. |
| ADR-033 | MEP Propagation Graph Traversal | (carryover) | EXISTS. |
| ADR-034 | COBIE Fallback Policy | (carryover) | EXISTS. |
| ADR-035 | buildingSMART Cert Scope | (carryover) | EXISTS. |
| ADR-036 | Stakeholder Review Pricing | (carryover) | EXISTS. |
| ADR-037 | Sovereignty Default Cloud Region | (carryover) | EXISTS. |
| ADR-038 | BYOK Key Custody | (carryover) | EXISTS — Phase-2 audit was wrong to flag missing. |
| ADR-039 | Export-Worker Architecture | (carryover) | EXISTS — Phase-2 audit was wrong to flag missing. |
| ADR-040 | Schedule Export Formats | (carryover) | EXISTS — Phase-2 audit was wrong to flag missing. |
| (also) | `M28-IFC-IMPORT-PIPELINE.md` | 3B · S55 | EXISTS — supplementary spec note in the `adrs/` dir (irregular placement). |

### 1.5 SPECs added or extended during Phase 3

`docs/00_NEW_ARCHITECTURE/specs/`:

| SPEC | Title | Sprint | Status |
|---|---|---|---|
| SPEC-45 | PDF-to-BIM Pipeline | 3A · S50 D5 | **EXISTS** (`SPEC-45-PDF-TO-BIM-PIPELINE.md`). **Spec line 297 of `PHASE-3A-...AI-VISIBILITY-COMPLETE.md` calls this "SPEC-31" — that is wrong.** SPEC-31 in the actual specs dir is `SPEC-31-LOAD-BENCH-AND-BACKPRESSURE.md`, an entirely different document. The phase doc has a stale spec-number reference. |
| SPEC-46 | Plan-Critique Workflow | 3A · S51 | **EXISTS**. |
| SPEC-47 | Generate-3-Options Workflow | 3A · S52 | **EXISTS**. |
| SPEC-48 | Constraint Solver | 3B · S52 | **EXISTS** (matches the family-creator rewrite plan). |
| SPEC-FAMILY-EDITOR | The PRYZM Family Editor | 3B · S52 | **EXISTS** (no number — anomaly: every other SPEC has an integer prefix). |

### 1.6 Test suites — actual run results (executed during this audit)

Run with `cd <pkg> && npx vitest run --reporter=basic`:

| Workspace | Result | Notes |
|---|---|---|
| `packages/ai-host` | **9 RED / 75 total**; 4 of 9 test files fail | All 9 failures are `Failed to load url @pryzm/ai-cost` at module-load time — the dep is imported but not declared. Affects `AiHost.test.ts` (5), `AiHost.lazy.test.ts` (4), `AiPlane.batch.test.ts` (load-fail), and `AiPlane.test.ts` (load-fail). |
| `packages/ai-cost` | **1 RED / 35 total** | `perProjectMonthlyBudget` async resolver branch. |
| `packages/visibility` | **82 / 82 PASS**; 12 test files | All 11 waves + parity tests. |
| `packages/constraint-solver` | **33 / 33 PASS** | `PlanegcsAdapter` (9), `engine` (24). |
| `packages/family-runtime` | **58 / 58 PASS**; 6 test files | parser, evaluator, resolveParameter, unit-coercion, span-sink, tokenizer. |
| `packages/family-loader` | **4 / 4 PASS** | `loadFamily`. |
| `packages/family-instance` | **5 / 5 PASS** | `bakeFamilyInstance`. |
| `packages/types-builtin` | **N/A — no test runner** | `vitest: command not found`; no `__tests__/`, no `package.json` test script. |
| `packages/pdf-to-bim` | **26 / 26 PASS** | `confidence` (17), `review-queue` (9). |
| `apps/ai-worker` | **70 / 71 PASS, 1 RED** | `matchDoorTemplate` 120° arc returns 0.65 expected `<0.5`. CV pipeline + queue all green. |
| `apps/component-editor` | **239 / 239 PASS**; 26 test files | jsdom emits `HTMLCanvasElement.prototype.getContext` warnings — these are stderr-only, all assertions pass; the SketchCanvas paint path runs in jsdom without a real Canvas2D context but the tests assert DOM mount/unmount, not pixel output. |
| `plugins/ifc-export` | **16 / 16 PASS** | round-trip exercises all 6 element exporters. |
| `plugins/ifc-import` | **18 / 18 PASS** | round-trip + Tier-2 proxy + move command. |
| `plugins/ifc-inspector` | **12 / 12 PASS** | full Pset/Quantity editor surface. |
| `plugins/bcf` | **57 / 57 PASS** | viewpoint navigator + IFC bridge + round-trip + panel contribution. |
| `plugins/rhino-import` | **4 / 4 PASS** | optional WASM. |
| `plugins/ai-floorplan` | **10 / 10 PASS** | descriptor (4) + ApprovalQueuePanel (6). |
| `plugins/ai-generative` | **6 / 6 PASS** | descriptor only. |
| `plugins/ai-query` | **7 / 7 PASS** | descriptor only. |
| `plugins/ai-rules` | **6 / 6 PASS** | descriptor only. |
| `plugins/ai-voice` | **7 / 7 PASS** | descriptor only. |
| `tests/audit-log-s57` | **14 / 14 PASS** | all `writeAuditRow` paths green; the workflow runner reports `failed` (stale). |

### 1.7 Workflows status (Replit) — current snapshot at audit time

| Workflow | Reported | Actual |
|---|---|---|
| `Start application` | running | OK |
| `audit-log-middleware` | **failed (reported)** | **14/14 PASS when run manually** — workflow status is stale |
| `bake-worker-test-geometry` | finished | (graceful skip per `2>/dev/null \|\| echo`) |
| `bcf-round-trip` | running | 57/57 PASS |
| `constraint-solver-snapshot` | running | 33/33 PASS (real, not skipped) |
| `family-editor-quality-gates` | running | quality-gate suite under `apps/component-editor/__tests__/quality-gates/` PASSES |
| `ifc-export-tier1` | running | 16/16 PASS |
| `ifc-import-tier2` | running | 18/18 PASS |
| `ifc-inspector-pset-editor` | running | 12/12 PASS |
| `pdf-classification-accuracy` | running | the workflow's `2>/dev/null \|\| echo "deferred per S54"` masks the real `apps/ai-worker/__tests__/cv` that **does** pass; the workflow's intent is unclear |
| `pdf-stage3-pure` | running | similarly masks `apps/ai-worker/__tests__/pdf-to-bim` which has 1 RED — the `2>/dev/null \|\| echo "deferred"` swallows the failure |
| `pryzm-persistence` | running | (carryover) |
| `pryzm-vi-parity` | running | 82/82 PASS |
| `rhino-import-3dm` | running | 4/4 PASS |

**Workflows-pane risk**: 2 workflows (`pdf-classification-accuracy`,
`pdf-stage3-pure`) wrap their test invocation in `2>/dev/null || echo
"…deferred"`, which **silently turns red into green** in the workflow pane.
The `pdf-stage3-pure` workflow currently masks the real
`matchDoorTemplate` regression. See HIGH-1.

### 1.8 Bench reports under `apps/bench/reports/`

| Report | Sprint | Status |
|---|---|---|
| `M27-3A.md` | spec §S54 D6 | **DOES NOT EXIST** |
| `M30-3B.md` | spec line 487 D7 / §6 D6 | **EXISTS** — but marked `DRAFT (S59 D1 — full report drafts at S60 D6)`. Substantive: documents T2.1 DXF/SVG defer (founder + agent ratified), T2.2-T2.6 Tier-2 cut-list re-confirmations, BCF S59 surface deliverables, reversal triggers, and references to `[strategic ADR-018]`. |
| (any 3A demo recording) | spec §S54 D5 | **DOES NOT EXIST** anywhere in repo |

### 1.9 Revit add-in (S57+)

`revit-addin/PRYZM.Revit.Bridge/` — **C# project, 382 LOC across 11 files**:

* `Commands/ExportToPRYZMCommand.cs`, `Commands/SetTokenCommand.cs`
* `Exporters/ElementExporter.cs`, `Exporters/IfcExporter.cs`
* `UI/CredentialStore.cs`, `UI/ExportDialog.xaml` + `.xaml.cs`,
  `UI/TokenDialog.xaml` + `.xaml.cs`
* `PRYZM.Revit.Bridge.csproj`, `PRYZM.Revit.Bridge.addin`,
  `Properties/AssemblyInfo.cs`, `README.md`

This is a **real** Revit add-in — not a stub — but it ships only the v0.1
surface (export-to-PRYZM + SetToken). Spec §S57 + §S58 + §S59 escalate to
v0.1 → v0.2 → v1.0 with Pset round-trip parity, two-way sync, and
component-edit-back. The current shape covers v0.1 only.

---

## §2 100/100 Wins — what is genuinely complete and well-built

### W-1. AiPlane L7.5 architectural promotion (S49 D1+D2)

`packages/ai-host/src/AiPlane.ts` is a substantial, well-commented
implementation of the spec's L7.5 contract:

* `bus: AiBus` — independent pub/sub with otelPrefix `pryzm.ai`; the spec
  §3 contract that AI events do not pollute the command-bus event log
  is honoured.
* `costMeter: CostMeter` — first-class plane field (the dep is imported
  from `@pryzm/ai-cost`; that the *package boundary* is broken does not
  invalidate the plane's design).
* `workflowRegistry: WorkflowRegistry` — descriptor + impl pair; spec
  line 129 requires `registerWorkflow(descriptor, impl)` and that exists
  as a convenience pass-through on the plane.
* `approvalQueue: AiApprovalQueueLike` — duck-typed surface so unit tests
  can substitute an in-memory queue (an explicit "unit-test friendly"
  affordance the test suite exercises).
* `submit()` pipeline — 8 steps, exactly per spec lines 22-30: validate
  → preCheckBudget → emit `workflow.start` → run impl → recordCall →
  emit `workflow.propose` → enqueue → (later) commit.
* PURE design: no DOM, no THREE, no Node primitives — bake-worker-safe.

### W-2. AnthropicRelay porter (S51 D3 prep)

`packages/ai-host/src/AnthropicRelay.ts` introduces the right
abstraction: `RelayPorter` interface with two implementations
(`MockAnthropicRelay` for tests, `CfWorkerRelay` for production) and
explicit `costUsd` surface so the recorder can tag `pryzm.ai.cost.usd`.
The mock is deterministic, which lets `PlanCritique.test.ts` run a
full submit→propose pipeline without hitting Anthropic.

### W-3. CV pipeline (S50)

`apps/ai-worker/src/cv/` is **not a stub**. The handler implements
spec lines 247-267 exactly: fetch raster → classify → preCheckBudget →
run segmentation → recordCall → upload mask → return outcome. The
files include real logic (page classification thresholds,
mask-key derivation, ONNX runtime detection with GPU/CPU fallback,
storage porter abstraction). 14/14 `cv-pipeline.test.ts` pass.

### W-4. PDF-to-BIM Stage-2 (S52 §4.2)

`apps/ai-worker/src/pdf-to-bim/stage2-walls.ts` and
`stage2-openings.ts` ship real classifiers — wall thickness limits,
column aspect ratios, centerline computation, opening subtypes,
arc + panel matching, confidence scoring. 70/71 tests pass; the 1 RED
is a regression in `matchDoorTemplate` that this audit catches.

### W-5. Visibility waves 1–11 — over-delivered

`packages/visibility/src/waves/` ships **all 11 wave files**
(`w01..w11`). 82/82 tests pass. Spec §S53 expected waves 6–11 to land
this sprint; in fact all 11 were already in the tree from 2D and now
have full parity coverage. (The S53 D8 `legacy_vi_fallback` flag flip
is missing — see CRIT-3.)

### W-6. Component editor as sub-app (S52–S57)

`apps/component-editor/` is **8,615 LOC, 239/239 tests, 26 test files**
with real engineering:

* 7 sketch tools (`ArcTool`, `CircleTool`, `FilletTool`, `LineTool`,
  `RectangleTool`, `SelectTool`, `TrimTool`) — exactly the §7.2 list.
* 5 constraint commands (`addCoincident`, `addDistance`, `addFixed`,
  `addParallel`, `addPerpendicular`).
* `referencePlane.test.ts` exercises ref-plane creation/edit.
* `solid.test.ts` exercises the extrude path (only solid op shipped — see
  HIGH-3).
* `aiHostBridge.test.ts` + `toolRegistry.test.ts` + `approvalQueue.test.ts`
  + `replay.test.ts` exercise the AI tool-bridge surface.
* Five **enforced quality gates**: `bundle-budget` (first-paint ≤ 180 KB
  gzip excluding THREE chunk), `no-react`, `no-three` (only `*Committer.ts`
  may import three), `no-window`, `loc-cap` (≤ 300 LOC per file). All
  five gates **pass** at audit time.
* `family-editor-bundle-budget` test reports the bundle is under budget
  with the THREE chunk correctly lazy-loaded.

This is the most complete component-editor cut in the entire roadmap.
Notably it shipped *despite* the S54 "formal deferral", which means M30-3B
§2 row T2.2's "STAYS CUT" is a misread of what actually happened — see
LOW-1.

### W-7. `family-runtime` expression engine (S52)

`packages/family-runtime/` ships a real expression DSL pipeline:
**1,069 LOC** divided into tokenizer (10 tests), parser (13 tests),
evaluator (13 tests), parameter resolver (12 tests), unit coercion (6
tests), and OTel span sink (4 tests). 58/58 pass. This is the
`pryzm.family.parameter.evaluate` + `pryzm.family.solver.solve`
pipeline the spec §10 OTel table promises.

### W-8. Real planegcs constraint solver (S52)

`packages/constraint-solver/src/PlanegcsAdapter.ts` (9 tests) +
`engine.ts` (24 tests) = 33/33 pass. The S52 §6.1 porter contract
materialises in source. The spec called for a *browser* and a *node*
porter as separate files (`planegcs-porter.ts`, `planegcs-node-porter.ts`)
— the actual layout consolidates into `PlanegcsAdapter.ts`; the porter
boundary is the same, just a different file partition. Functionally
equivalent.

### W-9. IFC Tier 1 export (S55–S56)

`plugins/ifc-export/` — 1,736 LOC, 16/16 tests. 6 element exporters
(beam, column, door, slab, wall, window). `round-trip.test.ts`
exercises the full write path with `meta-store.test.ts` + `guid.test.ts`
+ `otel.test.ts` covering provenance + telemetry. Pset preservation via
the inspector path on the import side.

### W-10. IFC import with full Pset preservation (S55, S57)

`plugins/ifc-import/` — 534 LOC, 18/18 tests. The wall-import case
preserves the entire `ifc.*` namespace on the PRYZM side: GlobalId,
typeName, name, description, objectType, all Psets (walked via
`IfcRelDefinesByProperties`), all `IfcElementQuantity`,
materialLayerSetSource. Tier-2 proxy support shipped (`tier2-proxy.test.ts`
9 tests) for the read-only IFC 4.3 proxies per ADR-008.

### W-11. IFC Pset/Quantity inspector (S57)

`plugins/ifc-inspector/` — 375 LOC, 12/12 tests covering the full editor
surface (read, write, validate, lint, undo, type-check, IFC-class-aware
defaults). The Pset-editor surface is what makes the round-trip useful:
without it, imported Psets are read-only metadata.

### W-12. BCF 3.0 round-trip (S59)

`plugins/bcf/` — 1,440 LOC, 57/57 tests across 4 suites. Real read+write
to the ZIP archive, multiple viewpoints with selectedComponents,
hiddenComponents, colouring; topics with AssignedTo, DueDate, Stage; byte-stable
double-write; panel-contribution wiring (`panel-contribution.test.ts` 9
tests) for the editor sidebar; ifc-bridge for cross-plugin element ID
resolution. This is the canonical Phase-3B win.

### W-13. Rhino .3dm import (S57)

`plugins/rhino-import/` — 380 LOC, 4/4 tests. The optional-WASM path
(`loadRhinoModule resolves or throws gracefully`) is correct: the plugin
must not hard-fail when the Rhino WASM is unavailable in CI.

### W-14. C# Revit add-in skeleton (S57)

`revit-addin/PRYZM.Revit.Bridge/` — 11 files, 382 LOC C#, real .csproj +
.addin manifest + WPF dialogs (XAML + code-behind) + `CredentialStore`
for token persistence + `IfcExporter` + `ElementExporter`. v0.1 surface
shipped; v0.2 + v1.0 escalation deferred to Phase 3C.

### W-15. ai-floorplan `ApprovalQueuePanel` (S50, extension of S48)

`plugins/ai-floorplan/src/ApprovalQueuePanel.ts` is a vanilla-DOM,
zero-framework, panel renderer with explicit lifecycle (mount,
subscribe, render, dispose) following the `plugins/multiplayer/src/lock-ui.ts`
pattern. 6 tests exercise the empty + populated states, store
subscription, and idempotent dispose.

### W-16. OBC bundle removal (S55)

The 4MB+ OBC library is **gone** from source. `rg "@thatopen/components|openbim-components"`
across `packages/ apps/ plugins/` returns zero hits. The only traces
are a pnpm-store cache file (which is a hash-addressed download, not a
source import) and one `docs/studies/obc-340-annotation-study.md`
(documentation, not code). Bundle-size budget assertion in
`apps/component-editor/__tests__/quality-gates/bundle-budget.test.ts`
passes — the THREE chunk is correctly tree-shaken from the first-paint
path.

### W-17. M30-3B `DRAFT` gate report — substantive

Despite being marked DRAFT, the report contains real analysis: the T2.1
defer decision is justified with five concrete inputs (Phase-2 velocity,
beta-cohort demand, DXF-import ship status, existing 2D export coverage,
cut-list carry); reversal trigger documented; cross-references to
`[strategic ADR-018]` row T2.1 and risk register row R3B-06. The
discipline of *recording* the founder + agent decision rather than
silently dropping the work is exactly the discipline the audit framework
asks for.

### W-18. ai-host AnthropicRelay mock determinism (S51 D3)

The mock relay produces deterministic critique JSON keyed by request
hash, which is what makes `PlanCritique.test.ts` runnable in unit-test
isolation. Production-time, the same porter interface accepts the
`CfWorkerRelay` adapter. This is correct porter-pattern design.

### W-19. `WorkflowRegistry` descriptor schema with cost ceiling enforcement

`packages/ai-host/src/WorkflowRegistry.ts` rejects descriptors whose
`estimatedCostUsd` exceeds the SPEC-28 §3 ceiling (`0.18 USD`). The
plugin descriptors confirm this: `aiGenerativeDescriptor.estimatedCostUsd
= 0.18` (at the ceiling), `aiVoiceDescriptor.estimatedCostUsd = 0.05`
(well under). The registry prevents a plugin from accidentally promising
to spend more than the per-call budget allows.

### W-20. PanelHost / InspectorHost machinery (S60 §6.1, §6.2)

Even though no plugin tabs are *registered* against either host (HIGH-2),
the host code itself is correct: `PanelHost.register` sorts by `priority`
ascending, `mount` does its `unmountAll` + per-contribution mount with
DOM containers, `unmount` is idempotent. `InspectorHost` adds lazy
mount-on-activation for tab switching. The infrastructure is ready for
Phase 3C consumers.

---

## §3 Gaps, risks, wrongs — code-grounded

### CRITICAL items

#### CRIT-1. AI plane contract suite is RED — `@pryzm/ai-cost` not declared in `@pryzm/ai-host` deps

**Where**: `packages/ai-host/package.json` lines 22-24.
The `dependencies` block contains only:

```json
"dependencies": {
  "@opentelemetry/api": "^1.9.0"
}
```

But `packages/ai-host/src/AiPlane.ts:37` does
`import type { CostMeter, BudgetCheck } from '@pryzm/ai-cost';`,
`packages/ai-host/src/AiHost.impl.ts:24` does
`import { CostMeter } from '@pryzm/ai-cost';`,
`packages/ai-host/src/types.ts:111+218` references the package by name,
and `packages/ai-host/src/workflows/Generate3Options.ts:60` references it
in comments. Vite's resolver cannot follow an undeclared workspace dep,
and **9 of 75 tests** in the L7.5 backbone fail at module-load time:

```
Error: Failed to load url @pryzm/ai-cost (resolved id: @pryzm/ai-cost)
       in /home/runner/workspace/packages/ai-host/__tests__/AiPlane.batch.test.ts.
```

Affected suites:
* `AiHost.test.ts` — 5 tests (all submit-workflow tests)
* `AiHost.lazy.test.ts` — 4 tests (entire lazy bootstrap contract)
* `AiPlane.batch.test.ts` — load-fail
* `AiPlane.test.ts` — load-fail

**Why it matters (Phase 3A): this is the L7.5 promotion's contract surface.
The whole point of S49 D1 was to make `AiPlane.costMeter` a first-class
plane field, but that field's package boundary is broken at the
declaration level. The implementation works at runtime when the editor's
import map happens to resolve workspace deps transitively, but the
plane's own test suite — the spec's own contract test — does not load.**

**Fix**: add `"@pryzm/ai-cost": "workspace:*"` to
`packages/ai-host/package.json` `dependencies`. ~5-min change. This is the
same item Phase-2 audit named as W-01 in `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`;
it remained un-actioned and is now also a Phase-3A regression because
S49 promoted the dep to a plane field.

**Why it is CRITICAL not HIGH**: the AI plane's contract test is the
backbone gate for everything in Phase 3A. As long as it stays red, every
downstream gate (M27-3A bench, public AI API draft, beta-bug-fix lane
exit) is on a foundation whose own contract is unverified.

---

#### CRIT-2. DXF plugin absent in both directions — but M30-3B asserts DXF import shipped

**Where**: `M30-3B.md` §1.1 line 21 of the visible body:
*"DXF import landed S55 (`plugins/dxf-import/`) and is the primary
surface beta users touch — they consume CAD detail libraries, they do
not author CAD deliverables."*

Versus the actual filesystem:

```
$ ls plugins/ | grep -i dxf
(empty)
$ ls plugins/dxf-import/ 2>&1
ls: cannot access 'plugins/dxf-import/': No such file or directory
```

**Why it matters**: the entire DXF/SVG export *defer* decision in M30-3B
§1.2 hangs on the premise that DXF *import* was already in the bundle.
If import was not actually shipped, then the export defer is reasoning
from a false premise — beta users who need DXF interop have nothing,
not just no export path. M30-3B's defer rationale collapses.

**Compounding hazard**: M30-3B is the only Phase-3B closure document
(M27-3A is missing entirely — see CRIT-4). Future readers will treat the
M30-3B claim as ground truth. The decision-record discipline that makes
M30-3B a 100/100 win for the deferral *process* is undermined by a
factual error about what shipped.

**Fix**: either (a) ship `plugins/dxf-import/` to honour the M30-3B
claim, or (b) correct M30-3B §1.1 to say *"DXF import was deferred"* and
re-justify the export defer on the actual evidence (PDF export covers
2D handoff; beta cohort has not asked for DXF interop in either
direction).

---

#### CRIT-3. `featureFlags.legacy_vi_fallback` does not exist in code

**Where**: spec line 570 of `PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`:
*"D8: `featureFlags.legacy_vi_fallback` flipped to opt-in only."*

Actual:

```
$ rg "legacy_vi_fallback|legacy-vi-fallback" packages/ apps/ plugins/
(empty)
```

Phase-2 audit's §1.1 row for `packages/feature-flags` claimed it
*"Carries `plan_view_v2` and `legacy_vi_fallback`"* — that statement was
itself wrong. Neither flag has a runtime consumer (see Phase-2 audit
CRIT-3 for `plan_view_v2`); `legacy_vi_fallback` is not even *defined*
anywhere.

**Why it matters**: the visibility-waves cutover is the highest-risk
behavioural change in the editor's render pipeline; the entire S46/S53
cutover plan rests on the assumption that there is a kill-switch. There
is no kill-switch. If a beta site reports a regression introduced by
waves 6-11, there is no flag-flip to roll back to the legacy path.

**Fix**: define the flag in `packages/feature-flags`, wire a real
consumer in `packages/visibility/src/runtime.ts` that branches on the
flag, and add a test that asserts the legacy path is reachable when the
flag is on.

---

#### CRIT-4. Phase 3A gate report (`M27-3A.md`) does not exist

**Where**: spec §S54 D6: *"`apps/bench/reports/M27-3A.md` published."*

Actual:

```
$ ls apps/bench/reports/
M30-3B.md
```

**Why it matters**: closure of Phase 3A is gated on a published bench
report (per spec §S54 exit criteria block). With no M27-3A report, the
M27 milestone has no documented gate decision. The M27-vs-M30 asymmetry
is also notable: M30-3B is at least a `DRAFT`; M27-3A is nothing at all.

**Fix**: author `apps/bench/reports/M27-3A.md` with the spec §S54 D2/D3/D4
content (bench suite assembly, baseline + production-scale fixture runs,
analysis). This requires running `apps/bench/ai-cost.ts` and
`apps/bench/visibility-correctness.ts` first; both bench scripts are
referenced in spec line 601 — verify they exist as sources.

---

### HIGH items

#### HIGH-1. PDF-stage workflow swallows test failures

**Where**: workflow definition for `pdf-stage3-pure`:

```
cd apps/ai-worker && npx vitest run __tests__/pdf-to-bim --reporter=default 2>/dev/null || echo "pdf stage tests not present (deferred per S54)"
```

The `2>/dev/null || echo "…"` chain means **any non-zero exit** of the
test runner — including a real test failure — gets converted to a
green-looking workflow with a stdout `pdf stage tests not present
(deferred per S54)` line. The actual `apps/ai-worker/__tests__/pdf-to-bim/`
directory **does** exist and contains 71 tests, 1 RED (the
`matchDoorTemplate` 120° arc regression). The workflow misreports green
and the failure is invisible in the workflows pane.

The same pattern is used in `pdf-classification-accuracy` and
`bake-worker-test-geometry` and `constraint-solver-snapshot`. The
constraint-solver case is benign (the suite passes anyway); the
pdf-stage3-pure case actively hides a failure today.

**Fix**: replace `2>/dev/null || echo "…"` with either a real `[ -d
__tests__/pdf-to-bim ] && vitest …` precondition guard, or remove the
silent-fallback and let the workflow turn red when the suite exists and
fails.

#### HIGH-2. PropertyPanel decomposition (S60) is half-landed — host shipped, no plugin tabs registered

**Where**: `packages/ui/src/PanelHost.ts` + `packages/ui/src/InspectorHost.ts`
ship the contribution machinery. But:

```
$ rg -l "PropertyPanel|InspectorPanel|property-panel" apps/editor/src/
(empty)
```

No file in `apps/editor/` registers tabs against either host. The
3,339-LOC `PropertyPanel.ts` monolith referenced in spec §6.1 is still
the production code path. The decomposition is **infrastructure-only**;
the migration of the 6 categories ('Parameters' / 'Constraints' / 'IFC' /
'Analysis' / 'AI' / 'Issues') has not happened.

**Fix scope**: per-category extraction into 6 plugin-side panel
contributions (`packages/ifc-inspector` and `plugins/bcf` are obvious
candidates for IFC + Issues; AI is `plugins/ai-floorplan`'s territory).
Each contribution is ~150-300 LOC. The work is mechanical but cannot be
deferred indefinitely — the bundle-size budget for Phase 3C depends on
not loading 3,339 LOC up-front.

#### HIGH-3. Component-editor solid commands ship only `extrude`

**Where**: `apps/component-editor/src/commands/solid/`:

```
$ ls apps/component-editor/src/commands/solid/
index.ts
```

Spec SPEC-FAMILY-EDITOR §7.3 lists *"3D operations (NEW, all pure):
extrude, sweep, loft, revolve"*. The §13 family-editor quality-gate
suite passes because there are no per-op handler files to fail an LOC
gate against; but the absence of sweep/loft/revolve means the family
editor cannot author the bulk of the door / window / casework / lighting /
plumbing geometry the marketplace (Phase 3C) needs. Without sweep, you
cannot model a chair-rail; without revolve, you cannot model a column
capital or a doorknob.

**Fix scope**: 3 new pure-Node solid op modules (`commands/solid/sweep.ts`,
`loft.ts`, `revolve.ts`) plus the corresponding tests. The
`packages/family-runtime` expression engine + `packages/constraint-solver`
solver are both ready to consume them; the missing piece is the boolean
+ surface-from-curve kernel work per §7.4.

#### HIGH-4. Public AI API draft (S53) absent

**Where**: spec line 519 *"Visibility-Intent Migration Waves 6–11 +
Public AI API Draft."*

```
$ rg "/api/ai|publicAiApi|api/v1/ai" apps/ 2>/dev/null
(empty)
$ rg "submitWorkflow|workflows/submit" apps/sync-server/src/ apps/headless/src/
(empty)
```

Neither `apps/sync-server/` nor `apps/headless/` exposes any AI workflow
surface. The L7.5 plane is editor-only; programmatic consumers
(`apps/headless`) cannot drive a critique or generate-3-options run.

**Fix scope**: a single `/api/ai/workflows/:id/submit` route in
`apps/sync-server/src/routes/` that proxies to `getAiHost().submit(…)`
behind `authz.can('ai:submit')` (which is itself missing per Phase-2
audit, so this work is blocked on the Phase-2 close plan W-04 / authz
middleware item).

#### HIGH-5. 3A demo recording absent

**Where**: spec §S54 D5: *"10-min 3A demo screencast."*

Actual: no `docs/05-guides/developer/demos/`, no `*M27-3A*`, no `*demo*3a*` artefact in the
repo. There is no recording.

**Fix**: capture the screencast against the current editor build with the
S50 CV pipeline + S51 PlanCritique + S52 Generate-3-Options + S52 Voice
Command surfaces. This is a non-code deliverable and can land alongside
the M27-3A bench report fix (CRIT-4).

#### HIGH-6. `apps/component-editor` test environment uses jsdom, paint path silently no-ops

**Where**: `apps/component-editor/__tests__/sketch/SketchCanvas.test.ts`
emits stderr lines like:

```
Error: Not implemented: HTMLCanvasElement.prototype.getContext
       (without installing the canvas npm package)
   at paint (/home/runner/workspace/apps/component-editor/src/sketch/SketchCanvas.ts:166:24)
```

The test passes because it asserts mount/unmount, not pixel output. But
this means **the actual paint path is never exercised in CI**. A
regression in `sketchRender.ts` (e.g. wrong stroke order, wrong
transform matrix, missing snap indicator) would not be caught.

**Fix**: either (a) add `canvas` (the npm package) as a dev-dep so
jsdom can hand back a real `Canvas2D` context, or (b) add a separate
golden-image test under playwright that exercises the paint path against
a real Chromium. Given the family editor is meant to be authoring tool,
the paint correctness is not optional.

---

### MEDIUM items

#### MED-1. `apps/ai-worker` `matchDoorTemplate` regression — wide-swing arc overscored

**Where**: `apps/ai-worker/__tests__/pdf-to-bim-openings.test.ts:107`:

```
expected 0.65 to be less than 0.5
```

The CV door-classifier's template-match scoring gives a 120° arc a
score of 0.65 against a 90° template; the spec test asserts wide-swing
arcs should score below 0.5 (so the door classifier rejects them and the
review queue catches them). The bug is in
`apps/ai-worker/src/pdf-to-bim/stage2-openings.ts` — the arc-angle
penalty is too lenient.

**Fix scope**: ~30-line tightening of the angle-deviation penalty. Test
exists; fix the implementation until it passes.

#### MED-2. `packages/ai-cost` has 1 RED — async budget resolver path

**Where**: `packages/ai-cost/__tests__/CostMeter.test.ts:325` —
`perProjectMonthlyBudget` async resolver branch fails. The implementation
calls `await Promise.resolve(this.perProjectMonthlyBudget(projectId))`
but the test expects a different code path. ~30-min triage + fix.

#### MED-3. `packages/types-builtin` ships zero tests

The 7 builtin element families (Wall, Floor, Roof, Ceiling, Stair,
Railing, Curtain Wall) are the foundation for the entire family system
and the IFC import "round-trip preserves system family bindings"
contract. They have no `package.json` test script, no `__tests__/`
directory, and `vitest` is not even installed. Spec §13 of the
family-creator rewrite plan calls for `family-bake-pure-node` gate at
S55 close — that gate cannot exist without tests.

**Fix**: add `__tests__/builtins.test.ts` exercising each builtin's
default parameters, IFC entity binding, and round-trip-through-PRYZM
identity. ~2h.

#### MED-4. `plugins/ai-query` and `plugins/ai-rules` ship descriptors with no workflow impl

**Where**: descriptors for `ai-query` and `ai-rules` exist in
`plugins/ai-{query,rules}/src/descriptor.ts`, but
`packages/ai-host/src/workflows/` has only `PlanCritique`,
`Generate3Options`, `VoiceCommand`. No `Query.ts` or `Rules.ts` workflow
impl. The descriptor's `WORKFLOW_ID` references workflow ids that the
registry will reject when the editor tries to register them.

**Fix**: either ship the workflow impls or remove the descriptors until
the impls land. The current shape is an empty signal — the plugins
*claim* to add a surface but cannot actually be wired.

#### MED-5. Revit add-in is v0.1; v0.2 + v1.0 not landed

`revit-addin/PRYZM.Revit.Bridge/` ships 4 commands + 2 dialogs + 1
credential store; spec §S57 + §S58 + §S59 want Pset round-trip + two-way
sync + edit-back. Current shape covers export only. The defer to Phase 3C
is acceptable but should be **explicitly recorded** in M30-3B §3 (BCF
section), which currently does not mention Revit.

#### MED-6. `M30-3B.md` is `DRAFT` and cites unfinished sections

The report is honest about its DRAFT status, but the `DRAFT (S59 D1 —
full report drafts at S60 D6)` postponement lands at the end of the
sub-phase — there is no buffer for finalising it before M30 closure. If
S60 slips, M30 closes without a final gate report.

#### MED-7. `audit-log-middleware` workflow status reports red while suite is green

The Replit workflows pane shows `audit-log-middleware — failed`. Manual
re-run shows `14/14 PASS` in 1.39s. This is a stale workflow-runner
status, not a code defect, but it is a *signalling* hazard: a real
audit-log regression would be invisible because the badge is already
red and operators may stop attending to it.

**Fix**: restart the workflow once to clear the stale state.

#### MED-8. SOC2 evidence pipeline (S57) has only the test fixture

`tests/audit-log-s57/` ships a working middleware test (14/14) but spec
§3 of `PHASE-3B-...PLUGINS-IFC-DXF-RHINO.md` calls for a *full* SOC2
evidence pipeline including (a) immutable audit log table, (b) S3 archive
shipping, (c) attestation-report generator. The test fixture exercises
the middleware shape; the table/S3/report layers are not in
`apps/sync-server/`.

#### MED-9. Dual ADR-series numbering hazard

Two parallel ADR series both contain entries numbered `0029`:

* `docs/00_NEW_ARCHITECTURE/adrs/ADR-029-pdf-to-bim-scope.md` — the
  *strategic* ADR series (referenced in phase docs as `[strategic
  ADR-029]`).
* `docs/02-decisions/adrs/0029-vector-primitives-and-backends.md` — the
  *sprint-scoped* ADR series (referenced in phase docs as `[ADR
  0029-vector-primitives-and-backends]`).

The Phase-3 phase docs distinguish them with `[strategic …]` vs
`[ADR NNNN-slug]` syntax, but the Phase-2 audit (HIGH-3) confused them.
The risk is real: a future contributor adding `ADR-029` to either series
could believe they are extending the document already there. The
phase-doc convention is correct; the directory structure is the hazard.

**Fix**: rename one series for collision-freedom (e.g., the sprint-scoped
series prefix becomes `SADR-NNNN-…` for "sprint-scoped ADR") and update
all references. ~2h.

#### MED-10. IFC round-trip CI gate exists locally, not in `.github/workflows/ci.yml`

`scripts/` contains many guard scripts but no `ifc-round-trip` check.
`.github/workflows/ci.yml` is the only file in `.github/workflows/`. The
local Replit workflow `ifc-export-tier1` + `ifc-import-tier2` cover the
round-trip locally, but a contributor opening a PR does not get the
gate. Spec §S58 calls for the gate to block PRs.

---

### LOW items

#### LOW-1. M30-3B §2 row T2.2 misreads the component-editor "cut"

Row T2.2 says *"STAYS CUT (re-confirmed)"* with rationale *"Component
editor (`apps/component-editor/`) shipped S55 + S56 + S57 (parameter
table + expression DSL + IFC Pset binding + .pryzm-family v1) so the
'cut' was the *deferral of further marketplace richness* — confirmed:
marketplace landing remains Phase 3-C."* This is internally inconsistent:
the cell label says "STAYS CUT" but the rationale describes a "ship".
Re-label to "T2.2: marketplace deferral — STAYS CUT; component editor
itself shipped (formal S54 deferral reversed at S55)" for clarity.

#### LOW-2. SPEC-FAMILY-EDITOR has no integer prefix

`docs/00_NEW_ARCHITECTURE/specs/SPEC-FAMILY-EDITOR.md` is the only spec
without a number. Every other spec in the dir is `SPEC-NN-SLUG`. Assign
it a number (49 is the next free in the family-editor / constraint-solver
range — 48 is the constraint solver) for consistency.

#### LOW-3. Phase-3A spec line 297 cites "SPEC-31" for PDF-to-BIM, actual is SPEC-45

`PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md:297` says *"SPEC-31
outline drafted + published."* Actual spec is `SPEC-45-PDF-TO-BIM-PIPELINE.md`.
The phase doc has a stale spec number from an earlier numbering pass.
Update the phase doc to cite SPEC-45 (and/or check whether other Phase 3
phase docs have similar stale numbers).

#### LOW-4. `bake-worker` ships a second `CostMeter` with the same class name

`apps/bake-worker/src/cost/CostMeter.ts` is the **R2 storage cost meter**
(per S21), not the AI cost meter. The class names collide. Future
contributors grepping `class CostMeter` will get two unrelated
implementations. Either rename one (e.g., `R2CostMeter`) or move both
into a shared `@pryzm/cost-metering` package with disambiguating
exports.

#### LOW-5. ADRs directory hosts a non-ADR `M28-IFC-IMPORT-PIPELINE.md`

`docs/00_NEW_ARCHITECTURE/adrs/M28-IFC-IMPORT-PIPELINE.md` is a
phase-supplementary spec note, not an architecture decision record. It
should live under `docs/00_NEW_ARCHITECTURE/specs/` or
`docs/00_NEW_ARCHITECTURE/phases/notes/`.

#### LOW-6. Component-editor `commands/` is missing `parameter`, `type`, `material`, `profile` directories

Per SPEC-FAMILY-EDITOR §8.1–§8.6 the command surface includes
`commands/profile/`, `commands/parameter/`, `commands/type/`,
`commands/material/`. Actual: only `commands/{constraint, referencePlane,
solid}/`. The missing directories represent the parameter table (S55)
and material slot (S55) work that the spec claims shipped. The
parameter-table tests live elsewhere (`__tests__/parameterTable.test.ts`?
absent — confirm) — verify that the parameter / material surfaces are
actually shipped or that the spec claim is wrong.

#### LOW-7. M30-3B's BCF success metric does not cite the panel-contribution suite

M30-3B §3 (BCF) lists the S59 surface deliverables but does not credit
`plugins/bcf/__tests__/panel-contribution.test.ts` (9 tests) which is the
cross-plugin DOM contract. The 9 tests are real engineering and should
be cited as evidence of the surface, not just `round-trip.test.ts`.

#### LOW-8. `apps/ai-worker` lacks an explicit OTel meter assertion test

The CV pipeline emits `pryzm.ai.cost.usd` per spec but there is no
explicit `meter.test.ts` asserting the metric is recorded with the
expected attributes (model, surface, plan). The `cost-meter.test.ts`
in `packages/ai-cost` covers the meter; the `ai-worker` integration
does not.

---

## §4 Deferred-binding inventory + risk per binding

The Phase-3A and Phase-3B specs collectively introduce the following
deferred bindings. Each is listed with its current status as of audit
time.

| # | Binding | Spec source | Current status | Risk if not closed by stated anchor |
|---|---|---|---|---|
| DB-1 | Production CF Worker relay adapter wired to `ANTHROPIC_RELAY_URL` | PHASE-3A line 35 of AnthropicRelay.ts header | **deferred to S52 D3 alongside real Vision call** — `MockAnthropicRelay` ships in source; no `CfWorkerRelay` implementation file exists in `packages/ai-host/src/`. | Medium. The plane works in tests; production calls would fail without the adapter. |
| DB-2 | AI Spend dashboard wiring (`pryzm.ai.cost.usd` aggregation) | PHASE-3A §S52 D6 | **unverified** — Honeycomb / dashboard config not in `apps/sync-server/` or any infra-as-code file in repo. | Medium. Cost overruns invisible until billing surprise. |
| DB-3 | `featureFlags.legacy_vi_fallback` flip | PHASE-3A §S53 D8 | **flag does not exist** (CRIT-3). | High. No kill-switch for visibility-waves cutover. |
| DB-4 | Public AI API draft | PHASE-3A §S53 | **absent** (HIGH-4). | Medium. Programmatic consumers cannot drive AI workflows. |
| DB-5 | M27-3A bench report | PHASE-3A §S54 D6 | **absent** (CRIT-4). | High. M27 milestone has no documented gate decision. |
| DB-6 | 10-min 3A demo screencast | PHASE-3A §S54 D5 | **absent** (HIGH-5). | Low. Communication artefact, not architectural. |
| DB-7 | Beta bug-fix lane S49–S52 exit (zero P0/P1) | PHASE-3A §line 193 | **no evidence** — no `.local/tasks/` rows tagged `beta-bugfix`, no per-sprint exit log. | Medium. Cannot prove the lane closed clean. |
| DB-8 | DXF plugin (import side per M30-3B claim) | PHASE-3B §S55 + M30-3B §1.1 | **absent** (CRIT-2) — M30-3B's claim is false. | High. Beta cohort consuming CAD detail libraries has no path. |
| DB-9 | DXF/SVG export | PHASE-3B §S55 + S59 | **deferred to v2** per M30-3B §1.2 (founder + agent ratified). Reversal trigger documented. | Low. Honest defer with reversal contract. |
| DB-10 | Print-canvas backend per SPEC-29 §4.4 | PHASE-3B §S55 D8 | **absent** — no `packages/*` or `apps/*` candidate; rg returns empty. | Medium. PDF-to-BIM (S58) and `/api/print` (S65) consumers blocked. |
| DB-11 | `packages/ui/` design tokens + primitives + half of `src/styles/` migrated | PHASE-3B §S56 | **partial** — `packages/ui` ships only `PanelHost.ts` + `InspectorHost.ts` (692 LOC across 3 files). No design-tokens module, no `src/styles/` migration evidence. | Medium. Bundle-size budget for Phase 3C depends on token tree-shaking. |
| DB-12 | Revit add-in v0.2 → v1.0 escalation | PHASE-3B §S57 / S58 / S59 | **v0.1 only** in `revit-addin/PRYZM.Revit.Bridge/`; v0.2 + v1.0 deferred. | Low. Revit cohort can export today; the two-way sync is a richness item. |
| DB-13 | Element creator marketplace publish flow | PHASE-3B §S59 | **absent** — explicitly re-deferred to Phase 3C in M30-3B §2 row T2.2. | Low. Honest defer. |
| DB-14 | PropertyPanel decomposition — per-plugin tab contributions | PHASE-3B §S60 §6.1 | **half-landed** (HIGH-2) — host shipped, no plugin tabs registered. | High. The 3,339-LOC `PropertyPanel.ts` monolith remains in the editor's first-paint path. |
| DB-15 | IFC round-trip CI gate in `.github/workflows/ci.yml` | PHASE-3B §S58 | **absent** (MED-10) — local Replit workflows cover the suite, GitHub PR-time check does not. | Medium. Contributors opening external PRs do not get the gate. |
| DB-16 | SOC2 evidence pipeline — table + S3 archive + attestation generator | PHASE-3B §S57 | **partial** (MED-8) — middleware shipped, downstream pipe absent. | Medium. SOC2 audit cannot rely on what is in code today. |
| DB-17 | T2.4 collaboration cursor history | M30-3B §2 | **STAYS OPEN — revisit S60 D2** | Low. Not blocking GA. |

---

## §5 Risks NOT surfaced by any other document

### R-1. The L7.5 promotion is real, but the budget enforcement is also broken in the same place

The spec wants `AiPlane.preCheckBudget` to be the single gate that
prevents AI calls from over-spending. `AiPlane.ts` correctly delegates
to `costMeter.preCheckBudget`. But if no caller can construct an
`AiPlane` (because the import fails), the gate is also never executed.
The budget contract is therefore *unverified*, not just untested. This
risk is masked by the workflow status (the affected workflows show
green-via-silent-fallback per HIGH-1).

### R-2. The CV pipeline assumes ONNX Runtime at runtime; no fallback to a CPU-only stub

`apps/ai-worker/src/cv/runtime.ts` does GPU/CPU detection (per file
header) but the actual runtime invocation path has no documented stub.
If the production worker boots without ONNX (Node version mismatch,
missing native dep), the queue handler crashes rather than rejecting
the job to the review queue. Spec §S50 D1 claims "GPU/CPU detection";
re-read the file to confirm a real CPU fallback exists and the
detection is not just env-var-driven.

### R-3. `apps/component-editor/__tests__/sketch/SketchCanvas.test.ts` runs in jsdom without a Canvas2D shim

(Restated for emphasis from HIGH-6.) The paint path is not exercised
in CI. Combined with the `loc-cap` quality gate (≤ 300 LOC per file),
the implementation pressure on `sketchRender.ts` is to factor
aggressively, which makes regressions more likely. Without paint-path
coverage, those regressions are invisible.

### R-4. Two `CostMeter` classes increase cognitive load for new contributors

(Restated from LOW-4.) This is a documentation hazard rather than a
behavioural one, but new contributors looking at the Phase-3 cost
discipline will see two `CostMeter`s and one `AiCostMeter`-shaped thing
they cannot find. The risk is not bug-shaped, it is onboarding-shaped.

### R-5. M30-3B's reasoning chain is publicly false on one premise

If the M30-3B DXF-import-shipped claim (CRIT-2) is not corrected, every
*later* document that cites M30-3B as evidence inherits the false
premise. The blast radius of CRIT-2 is therefore **larger than just the
M30-3B file** — it propagates anywhere downstream consumers cite the
report.

### R-6. The "PARTIAL-RATIFIED" pattern from Phase 2D has not been applied in Phase 3

Phase 2D used the `PARTIAL-RATIFIED` label honestly to admit deferrals
without inflating the score. Phase 3 has no such label in any artefact;
M30-3B simply marks itself `DRAFT` and the team's own audit pass for
3A/3B does not exist. The risk is that Phase 3 closure will be claimed
as A/100 by inheritance from "everything tests green" without the
deferral discipline that made Phase 2D's honesty credible.

### R-7. AI-cost meter's `perProjectMonthlyBudget` async-resolver branch is the budget-enforcement path

(MED-2 stated as a risk.) The 1 RED in `packages/ai-cost` is **not** a
benign edge case — it is the per-project monthly budget enforcement
when the budget value comes from an async source (e.g., a plan-tier
lookup against the persistence layer). In production, every call goes
through this path. The current red test means production budget
enforcement is broken for any deployment that uses an async resolver.

### R-8. No `apps/component-editor` test asserts the `pryzm/no-react-runtime` ESLint rule is wired

The §13 quality-gate suite includes `no-react.test.ts`, which asserts
*the file tree* contains no React imports. It does not assert that the
ESLint rule `pryzm/no-react-runtime` is loaded into the lint config and
will catch a *new* React import added in a future PR. The test catches
the snapshot today; it does not enforce the future.

### R-9. Phase 3 bench scripts under `apps/bench/` may not exist

Spec line 601 lists `apps/bench/ai-cost.ts` and
`apps/bench/visibility-correctness.ts` as the source for the M27-3A
bench report. Neither was located during this audit. If they do not
exist as bench scripts, then writing M27-3A is also blocked on
authoring them first. Verify.

### R-10. The C# Revit add-in has no automated test coverage in this repo

`revit-addin/PRYZM.Revit.Bridge/` has 11 source files, no `Tests/` dir,
no `*.csproj` for a test project. C# addins typically need
`PRYZM.Revit.Bridge.Tests.csproj` with NUnit or xUnit; the
`ElementExporter` and `IfcExporter` are obvious unit-test candidates.
The add-in is shipped on faith; a regression introduced by a Revit API
change in 2027 will be caught only by the Revit-cohort beta user.

---

## §6 Sub-phase scorecard — code-grounded vs implied team grade

### Phase 3A — AI L7.5 + CV + Workflows + Visibility 6–11 + Component Editor cut + 3A demo (M25–M27 / S49–S54)

| Item | Spec ref | Status | Score |
|---|---|---|---|
| AiPlane L7.5 promotion | S49 D1 | Source code complete; tests RED at module load | 8/10 |
| CostMeter implementation + budget gate | S49 D3+D4 | Implementation 34/35; package boundary broken | 7/10 |
| `ai_usage` table + nightly aggregation | S49 D4 | Unverified — no `apps/sync-server/` schema reference found | 4/10 |
| CV pipeline (page-classification + floorplan-segmentation) | S50 | Real impl; 14/14 cv-pipeline tests pass | 10/10 |
| SPEC-45 (PDF-to-BIM Pipeline) published | S50 D5 | EXISTS (spec text says "SPEC-31"; actual is SPEC-45 — LOW-3) | 9/10 |
| PlanCritique workflow | S51 | Real impl + tests; mock relay deterministic | 10/10 |
| Generate-3-Options workflow | S52 | Real impl + tests | 10/10 |
| Voice-command surface | S52 D5 | Real `VoiceCommand.impl.ts` + descriptor | 10/10 |
| AI Spend dashboard | S52 D6 | Unverified; no infra-as-code in repo | 4/10 |
| Cost-guardrail verification suite | S52 D8 | Tests partially exist (manufactured overshoot via `CostMeter.test.ts`); not a separate suite | 6/10 |
| Visibility waves 6–11 | S53 D1-D6 | Over-delivered: all 11 waves shipped; 82/82 tests | 10/10 |
| `legacy_vi_fallback` flip | S53 D8 | Flag does not exist (CRIT-3) | 0/10 |
| Public AI API draft | S53 | Absent (HIGH-4) | 0/10 |
| Component editor "formal deferral" | S54 D1 | Reversed in practice — editor shipped (W-6) | n/a |
| 3A bench suite assembly | S54 D2-D4 | Bench scripts unverified (R-9) | 5/10 |
| 10-min 3A demo recording | S54 D5 | Absent (HIGH-5) | 0/10 |
| `M27-3A.md` published | S54 D6 | Absent (CRIT-4) | 0/10 |
| Beta bug-fix lane S49–S52 exit | line 193 | No evidence (DB-7) | 4/10 |
| ADR-029 ratified | S49 D7 | File exists; meeting/signature unverifiable from filesystem | 7/10 |

**Weighted score**: drop-in average across the 19 items × 1 weight: ~6.4/10
= **64/100**. Adjusting upward for the over-delivered visibility wave
work and the genuinely substantial L7.5 + CV + workflows engineering, and
downward for the missing closure paperwork (M27-3A + demo) and the
broken contract test, the net score is **74/100 — grade C**.

---

### Phase 3B — IFC + DXF + Rhino + Revit + Component Editor + BCF + PropertyPanel + Tier-2 cut-list (M28–M30 / S55–S60)

| Item | Spec ref | Status | Score |
|---|---|---|---|
| IFC import plugin | S55 | Real, 18/18 tests, full Pset preservation | 10/10 |
| OBC bundle removal | S55 | Clean, no source imports remain | 10/10 |
| DXF import plugin | S55 | Absent — but M30-3B claims shipped (CRIT-2) | 0/10 |
| DXF export plugin | S55 + S59 | Honest defer; reversal trigger documented | n/a (deferred) |
| Print-canvas backend | S55 D8 | Absent (DB-10) | 0/10 |
| Bundle-size budget gate | S55 D7 | Real test in `apps/component-editor/__tests__/quality-gates/bundle-budget.test.ts`; passes | 10/10 |
| `packages/ui/` design tokens + primitives | S56 | Partial — only PanelHost + InspectorHost; no token system | 4/10 |
| Half of `src/styles/` migrated | S56 | No evidence | 3/10 |
| IFC export Tier 1 (6 element exporters) | S55–S56 | All 6 (beam, column, door, slab, wall, window); 16/16 tests | 10/10 |
| IFC Tier 2 read-only proxies | S57 | 9/9 `tier2-proxy.test.ts` | 10/10 |
| IFC Pset/Quantity inspector | S57 | 12/12 tests | 10/10 |
| Rhino import plugin | S57 | 4/4 tests; optional WASM | 10/10 |
| BCF round-trip | S59 | 57/57 tests, all four S59 surfaces (viewpoint + components + colouring + topic-meta) | 10/10 |
| Audit-log middleware (S57) | S57 | 14/14 tests pass; downstream pipe (table + S3 + attestation) absent (MED-8) | 6/10 |
| Revit add-in v0.1 | S57 | Real, 11 files, 382 LOC C#; export-only | 7/10 |
| Revit add-in v0.2 + v1.0 | S58/S59 | Deferred to Phase 3C | n/a (deferred) |
| Component editor as separate SPA | S58 | `apps/component-editor/` 8,615 LOC, 239 tests | 9/10 (missing 3 of 4 solid ops + 2 of 5+ constraint commands) |
| `.pryzm-family` file format (loader/runtime/instance) | S52–S55 | family-loader 4/4 + family-runtime 58/58 + family-instance 5/5 | 10/10 |
| Constraint solver (planegcs porter) | S52 | 33/33 tests; real PlanegcsAdapter | 10/10 |
| Element creator marketplace | S59 | Deferred to Phase 3C; honest | n/a (deferred) |
| IFC round-trip CI gate in CI | S58 | Local workflows cover; `.github/workflows/ci.yml` does not (MED-10) | 5/10 |
| PropertyPanel decomposition (host) | S60 | Shipped (PanelHost + InspectorHost) | 10/10 |
| PropertyPanel decomposition (per-plugin tabs migrated) | S60 | Not done (HIGH-2) | 3/10 |
| Tier-2 cut-list checkpoint | S60 D6 / M30-3B | Documented (M30-3B §2) | 10/10 |
| `M30-3B.md` published | S60 D6 | EXISTS as DRAFT | 7/10 |
| BCF Issue Round-Trip per §5.1 | S59 | Shipped (W-12) | 10/10 |
| Bundle-size first-paint budget held | S55 D7 + S60 | Held (per family-editor bundle test) | 10/10 |

**Weighted score**: drop the deferred items (DXF export, Revit v0.2/v1.0,
marketplace) from the average; the remaining 25 items average **7.6/10
= 76/100 — grade C**.

---

### Phase 3 overall: (74 + 76) / 2 = **75 / 100 → grade C+**

---

## §7 Recommendations — what to do next

### 7.1 Pre-M30 close (block GA gate)

**Must-do**:

1. **Fix `@pryzm/ai-host` package.json deps** — add `"@pryzm/ai-cost":
   "workspace:*"`. Re-run `npm test --workspace=@pryzm/ai-host`. Expected
   delta: 9 tests turn green. **~5 min** (CRIT-1 / Phase-2 W-01).
2. **Resolve CRIT-2 by either shipping `plugins/dxf-import/` OR
   correcting M30-3B §1.1 + §1.2 reasoning chain**. The decision is
   product (ship vs defer); the audit constraint is "M30-3B must not
   contain a false premise". Either edit the doc or ship the code.
   **~30 min** (doc) OR **~3 days** (code).
3. **Define `featureFlags.legacy_vi_fallback` and wire a runtime
   consumer in `packages/visibility/src/runtime.ts`**. Add a parity
   test that exercises the legacy path under flag-on. **~3 h** (CRIT-3).
4. **Author `apps/bench/reports/M27-3A.md`** with: bench-script run
   results (verify scripts exist first per R-9), per-sprint exit
   confirmations, P0/P1 bug counts from beta lane, ADR-029 ratification
   timestamp. **~4 h** (CRIT-4).
5. **Capture the 10-min 3A demo screencast** of the full
   PDF→Critique→Generate-3-Options→Voice→Approve pipeline.
   **~2 h** (HIGH-5).
6. **Fix the `pdf-stage3-pure` workflow's silent-fallback** — convert
   `2>/dev/null || echo "deferred"` to either a real precondition guard
   or remove the fallback. Then fix the `matchDoorTemplate` 120° arc
   regression (MED-1) so the workflow stays green honestly. **~2 h
   total** (HIGH-1 + MED-1).
7. **Restart the `audit-log-middleware` workflow** to clear stale red.
   **~1 min** (MED-7).

### 7.2 Pre-M30 close (degrade gate if missed)

**Should-do**:

8. **Ship the public AI API draft** — `apps/sync-server/src/routes/ai.ts`
   with `submit` + `status` endpoints, behind authz (which is itself
   blocked on Phase-2 W-04). **~6 h** (HIGH-4).
9. **Migrate at least 2 of the 6 PropertyPanel categories to plugin
   tabs** — IFC (already in `plugins/ifc-inspector`) and Issues (already
   in `plugins/bcf`'s `panel-contribution.test.ts` surface). The other
   4 can land Phase 3C. **~6 h** (HIGH-2).
10. **Ship `commands/solid/sweep.ts` + `loft.ts` + `revolve.ts`** in
    `apps/component-editor/`. The constraint solver + family runtime
    are ready; only the boolean kernel work is needed. **~12 h**
    (HIGH-3).
11. **Add `canvas` npm dev-dep to `apps/component-editor`** and re-run
    `SketchCanvas.test.ts` to verify the paint path actually executes.
    **~30 min** (HIGH-6 / R-3).

### 7.3 Process recommendations (compound payoff)

12. **Enforce a Phase-3 audit pass** before claiming Phase 3 closure —
    M30-3B's DRAFT status + the absence of any team-authored 3A audit
    means there is no internal disagreement against this independent
    audit; the lack of double-audit erodes the discipline that made
    Phase 2D's `PARTIAL-RATIFIED` honest.
13. **Forbid `2>/dev/null || echo` patterns in workflow definitions** —
    any test invocation that can fail must surface its failure. Add a
    lint rule in `scripts/scan-logs.js` (or its successor).
14. **Prohibit imports of un-declared workspace deps** — extend
    `scripts/check-ai-host-bundle.mjs` with a generic pre-build check
    that asserts every `import '@pryzm/X'` has a corresponding
    `dependencies` entry in the importing package's `package.json`.
    This would have caught CRIT-1 at PR time.
15. **Resolve the dual-ADR-series numbering convention** (MED-9). Pick a
    rename for the sprint-scoped series (e.g., `SADR-NNNN-…`) and update
    references atomically.

### 7.4 Long-term recommendations (Phase 3C planning)

16. **Schedule the marketplace work** (S59 deferral) explicitly into
    Phase 3C — `.pryzm-family` publish flow, signing, version pinning,
    revocation, search.
17. **Schedule Revit add-in v0.2 → v1.0** explicitly into Phase 3C —
    Pset round-trip parity, two-way sync via WebSocket, edit-back.
18. **Schedule `plugins/types-builtin` test suite authoring** — even at
    `n=7` builtins, tests for default parameters and IFC bindings are
    cheap and unblock the `family-bake-pure-node` gate.
19. **Schedule `apps/export-worker/`** if it remains a Phase-2 W-XX
    item; the M30-3B silence on it suggests the Phase-2 close plan
    item is still open.

---

## §8 Summary

Phase 3 is the most architecturally substantial slice of the roadmap so
far. The L7.5 AI plane, the real CV pipeline, the `apps/component-editor`
sub-app with its 5-gate quality suite, the `.pryzm-family` runtime, the
planegcs constraint solver, the IFC + BCF + Rhino plugins, and the C#
Revit add-in are all real engineering with real test coverage that this
audit ran and confirmed.

The Phase 3 gap profile is qualitatively different from Phase 1 or
Phase 2:

* **Phase 1's gaps were boundary defects** — schema drift, missing
  envelope versioning, audit-log table missing.
* **Phase 2's gaps were architectural breaches** — plan-view importing
  scene-committer, sync-server lacking authz, export-worker app
  missing, AI-host package boundary broken.
* **Phase 3's gaps are paperwork + decommissioning + the same Phase-2
  AI-host packaging defect, plus one critical documentation lie**
  (M30-3B asserting DXF import shipped).

The headline number is **C+ (75/100)**. The substantive engineering
deserves a B; the missing closure paperwork (M27-3A bench report, 3A
demo, `legacy_vi_fallback` flag, public AI API draft, DXF
import-or-correct-the-doc, Phase-3 self-audit) is what holds the score
back. Every blocker in §7.1 is addressable in under one sprint of work
combined.

The Phase 3 close plan should pick up the 7 must-do items in §7.1, then
move to the 4 should-do items in §7.2, then commit to the process
items in §7.3 to prevent the same package-boundary + workflow-silent-
fallback patterns from re-appearing in Phase 3C.
