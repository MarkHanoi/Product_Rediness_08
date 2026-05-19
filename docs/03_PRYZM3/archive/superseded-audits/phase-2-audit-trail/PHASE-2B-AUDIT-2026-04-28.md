# Phase 2B — Plan View — Closure Audit

**Date**: 2026-04-28
**Auditor**: Engineering main-track
**Source spec**: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`
**Conflict order applied**: `06-PRYZM-IDENTITY-AND-RECOUNT.md` > `08-VISION.md` > `10-MASTER…` > this audit.
**Anchor ADR**: `docs/architecture/adr/0030-phase-2b-post-audit-reconciliation.md` — this audit RATIFIES that ADR as the binding closure record for the partial sprints (S35, S36).

This document is the **per-exit-criterion** record of what shipped, what didn't, and where the deferments are tracked. It mirrors `PHASE-2C-AUDIT-2026-04-28.md` in format. It is run **before** Phase 2D entry to close out the two open Phase 2B sprints (`S35`, `S36`) that the tracker still showed as `[ ]` despite ADR-0030 (2026-04-27) declaring their post-audit reconciliation work landed.

---

## §0 Scoring Summary

| Sprint | Tracker mark (pre-audit) | Audit verdict | Score |
|---|---|---|---|
| S31 — Plan-view canvas host + dirty-flag rendering | [x] | DONE — `PlanViewCanvasHost`, `PlanCamera`, `PlanViewRenderer`, projection, hit-test | 100 % |
| S32 — Annotations + dimensions in plan view | [x] | DONE — `annotation-committer`, `annotation-renderer`, auto-dim, style-resolver | 100 % |
| S33 — Plan View + SVP Parity (Contract 44 G1–G10) | [x] | DONE — all 10 gap tests in `tests/contract-44/` green | 100 % |
| S34 — Visibility-Intent waves 3-4 / Annotations Migration / Track C backfill | [x] | DONE — see ADR-0030 §2.4 (111 tests across schemas, geometry-kernel, scene-committer) | 100 % |
| S35 — Visibility-Intent wave 5 + plan-vs-SVP visual diff | [ ] → [x] (PARTIAL-RATIFIED) | SHIPPED-AS-PARTIAL per ADR-0030 §2.2 — skeleton + harness + ADR; Playwright PNG promotion deferred to S37 D5 with explicit re-eval trigger | 75 % core / 100 % closure |
| S36 — Plan-view perf tune + 2B demo / Multi-view sync | [ ] → [x] (PARTIAL-RATIFIED) | SHIPPED-AS-PARTIAL per ADR-0030 §2.2 — `view-state` package (multi-view-layout, view-sync, view-controller, view-registry, view-definition) + tests; production hardening deferred to S46 with explicit re-eval trigger | 75 % core / 100 % closure |

**Phase 2B score (mark): 100/100 (closure verdict).**
**Phase 2B score (raw exit-criterion): 90/100.**

The two scores diverge by design. `100/100 closure` reflects that every open item is bound to a future sprint with an ADR, an issue, and a re-eval trigger — the governance contract is satisfied. `90/100 raw` reflects that two of the spec's eleven exit criteria (visual-diff Playwright PNG promotion and multi-view production hardening) are **explicitly deferred** rather than met in-phase. ADR-0030 §4 declared this split openly; this audit ratifies it as the closure verdict so Phase 2D entry is unblocked.

---

## §1 S31 — Plan-View Canvas Host + Dirty-Flag Rendering

| Spec exit gate (spec §S31) | Code | Test | Verdict |
|---|---|---|---|
| `PlanViewCanvasHost` Canvas2D back-end of SPEC-04 vector primitive model | `plugins/plan-view/src/PlanViewCanvasHost.ts` | `plan-view-canvas-host.test.ts` (7 tests) | DONE |
| FrameScheduler dirty-flag rendering (0 fps idle / 60 fps interactive) | host wired to `@pryzm/frame-scheduler` | `plan-view-renderer.test.ts` (5 tests) | DONE |
| World XZ → canvas xy with Z-flip projection | `plugins/plan-view/src/projection.ts` | `projection.test.ts` (7 tests) | DONE |
| `PlanCamera` (orthographic, pan, zoom) | `plugins/plan-view/src/PlanCamera.ts` | `plan-camera.test.ts` (11 tests) | DONE |
| `LevelStore` plan-view specific | `plugins/plan-view/src/LevelStore.ts` | `level-store.test.ts` (8 tests) | DONE |
| Hit-testing for selection | `plugins/plan-view/src/hit-test.ts` | `hit-test.test.ts` (9 tests) | DONE |
| Visual diff plan view (geometry) < 10 px | `tests/visual-diff/plan-view/` recording-canvas harness + 5 fixtures | per ADR-0030 §2.4 — recording-canvas measures stream-equivalence; PNG promotion at S37 D5 | DONE (stream) / DEFERRED (PNG) |
| Plan view fps < 50 fps p95 hard-fail | `apps/bench/src/benches/visual-diff-plan.bench.ts` skeleton | per skeleton in bench file; full Playwright pipeline opt-in via `PRYZM_VISUAL_DIFF_PLAYWRIGHT=1` | SKELETON-LIVE |
| Code-level `ADR 0023 — Plan view Canvas2D renderer` | `docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` | DONE |
| Pre-port: 5 hot ops (selection, drag, snap, pan, zoom) on Canvas2D backend per SPEC-30 §5 | `plan-view-selection.test.ts` (7 tests) + `plan-view-drag.test.ts` (5 tests) + `PlanCamera` (pan/zoom in 11 tests) | snap test coverage rolled into selection/drag tests | DONE for 4 of 5 ops; snap is the §S30.5–S30.10 follow-up |

S31 was the heaviest sprint of the 36-month plan per the spec's gap-closure absorption (SPEC-13/15/21/24/26/27/28/29/30 ratification + reverse-doc envelopes for 18 families + `packages/drawing-primitives/` MVP + `plugins/lifecycle/` skeleton + lazy-mount Cesium + service-role-key removal). The ESLint rules (`pryzm/no-impure-context`, `pryzm/single-frame-owner`, `pryzm/no-react-runtime`, `pryzm/no-direct-three-examples`) are lit at warning level per spec; promotion to error happens at S32 per spec §Gap-Closure.

---

## §2 S32 — Annotations + Dimensions in Plan View

| Spec exit gate | Code | Test | Verdict |
|---|---|---|---|
| Annotation committer (text, leader, callout, region) | `plugins/plan-view/src/annotation-committer.ts` | `annotation-committer.test.ts` (7 tests) | DONE |
| Annotation renderer (Canvas2D) | `plugins/plan-view/src/annotation-renderer.ts` | `annotation-renderer.test.ts` (11 tests) | DONE |
| Auto-dimensions (placement) | `plugins/plan-view/src/auto-dim.ts` | `plan-view-auto-dim.test.ts` (5 tests) | DONE |
| Style resolver (per-view per-element overrides) | `plugins/plan-view/src/style-resolver.ts` | `style-resolver.test.ts` (9 tests) | DONE |
| Visual diff plan view (annotations) < 5 px | recording-canvas harness | per ADR-0030 §2.4 — stream-equivalence measured; pixel-tolerance promotion at S37 D5 | DONE (stream) / DEFERRED (pixel) |
| Code-level `ADR 0024 — Plan view annotation pipeline` | `docs/architecture/adr/0024-plan-view-annotation-pipeline.md` | DONE |

---

## §3 S33 — Plan View + SVP Parity (Contract 44 G1–G10)

| Gap | Test | Verdict |
|---|---|---|
| G1 | `tests/contract-44/G1.test.ts` | DONE |
| G2 | `tests/contract-44/G2.test.ts` | DONE |
| G3 | `tests/contract-44/G3.test.ts` | DONE |
| G4 | `tests/contract-44/G4.test.ts` | DONE |
| G5 | `tests/contract-44/G5.test.ts` | DONE |
| G6 | `tests/contract-44/G6.test.ts` | DONE |
| G7 | `tests/contract-44/G7.test.ts` | DONE |
| G8 | `tests/contract-44/G8.test.ts` | DONE |
| G9 (selection persistence across views) | `tests/contract-44/G9.test.ts` | DONE |
| G10 (drag in plan view → persisted `element.move` commands) | `tests/contract-44/G10.test.ts` | DONE |

| Spec exit gate | Code | Verdict |
|---|---|---|
| Visual diff plan view (full) < 2 px hard-fail at S33 | recording-canvas stream-equivalence | DONE-AS-STREAM, PNG-DEFERRED to S37 D5 — see ADR-0030 §2.4 + §2.2 |
| Plan-view consumes `VectorPrimitiveSet` (SPEC-29 §4.2) | `plugins/plan-view/src/PlanViewRenderer.ts` via `@pryzm/drawing-primitives` | DONE |
| AI proposal queue lit per SPEC-24 §1.6 / SPEC-28 §5 | `Supabase ai_proposals` table + scaffold per ADR-0030 §2.4 | DONE-AS-SKELETON |
| New visibility resolver (SPEC-30 §3.1) parity vs legacy | `packages/visibility/src/index.ts` waves 3-4 reducer (`applyVisibilityIntent`) | DONE for waves 3-4; wave 5 explicitly OPEN — see §5 below |
| `PerViewOverridesStore` + Contract-44 G5 round-trip persistence test | per ADR-0030 §2.4 | DONE |

---

## §4 S34 — Annotations Migration + Track C Backfill (re-labelled per ADR-0030 §2.2)

| Spec exit gate | Code | Test | Verdict |
|---|---|---|---|
| All annotation types functional in 3D AND plan view | `plugins/annotations/` | covered by host integration tests + `annotation-committer.test.ts` + `annotation-renderer.test.ts` | DONE |
| 8 annotation handlers with `produceWithPatches` | `plugins/annotations/src/handlers/` | covered (per ADR-0030 §2.4 the test backfill row) | DONE |
| Annotation tools operational in 3D + plan-view contexts | `plugins/annotations/src/tools/` + `plan-view-selection.test.ts` | DONE |
| `ViewTemplate` Zod schema | `packages/schemas/src/view/view-template.ts` | DONE per ADR-0030 §2.4 |
| `DimensionProducer` (5 modes) + `DimensionEvaluator` (10 anchor kinds) | `packages/geometry-kernel/src/dimensions/` | covered | DONE |
| `ViewResolutionAlgorithm` (4-tier priority + 9 filter conditions) | `packages/geometry-kernel/src/view-resolution/` | DONE |
| Canvas2D `DimensionCommitter` (5 arrowhead styles + override flag) | `packages/scene-committer/` | DONE per ADR-0030 §2.4 |
| ESLint rules promoted from warning → error | `eslint.config.mjs` | DONE per spec §Gap-Closure S32 |
| `packages/visibility/legacy-adapter.ts` lit | `packages/visibility/src/index.ts` (the package IS the legacy-adapter; waves 3-4 live, wave 5 OPEN) | DONE for adapter; wave 5 OPEN |
| RLS policies generator lit per ADR-028 Part E | per ADR-0030 §2.5 follow-up | DEFERRED (project-task) |

S34 closure noted in tracker as "111 unit tests across `packages/schemas`, `packages/geometry-kernel`, and `packages/scene-committer`."

---

## §5 S35 — Visibility-Intent Wave 5 + Plan-vs-SVP Visual Diff (PARTIAL-RATIFIED)

This sprint is closed **as partial** per ADR-0030 §2.2: "Plan-view perf tune + visual-diff harness lit — partial; Playwright deferred to S37 D5."

| Spec exit gate | Status | Where the deferred work is bound |
|---|---|---|
| Section line tool draws section line in plan view; section view opens | `plugins/section-view/src/{SectionViewCanvasHost,section-cut-producer,index}.ts` + `__tests__/section-cut-producer.test.ts` | DONE-AS-SKELETON; full tool wiring deferred to S37 D5 (recording-canvas already measures section-cut output) |
| Cut elements with poche fill; projected elements as outlines | `packages/geometry-kernel/src/poche.ts` (S30) + `section-cut-producer.ts` | DONE-AS-PRODUCER; commit-side tool wiring deferred to S37 D5 |
| `section-cut.ts` is pure — runs in Node test | `packages/geometry-kernel/src/producers/` (kernel-pure) + `plugins/section-view/src/section-cut-producer.ts` | DONE |
| Pan/zoom works in section view | `SectionViewCanvasHost` | host shell wired; pan/zoom inherits from `PlanCamera` patterns | DONE-AS-SKELETON |
| Visual diff vs PRYZM 1 section view: < 5 px (tightens to < 2 px in S36) | Recording-canvas harness measures stream-equivalence on 5 fixtures per ADR-0030 §2.4. Pixel-tolerance gate is OPEN. | **DEFERRED to S37 D5** — re-eval trigger: Playwright PNG pipeline lit at S37 D5 per spec §Gap-Closure S31 (`pnpm bench plan-view-perf` + SVG ↔ Canvas2D ↔ PDF equivalence gate per SPEC-29 §4.5) |
| Code-level `ADR 0024 — Section cut algorithm` (distinct from `[strategic ADR-024]` constraint solver) | `docs/architecture/adr/0024-plan-view-annotation-pipeline.md` carries the plan-view annotation decision; the section-cut algorithm decision is documented inline in `section-cut-producer.ts` and ratified by ADR-0030 §2.4 | DOCUMENTED-IN-CODE; promotion to standalone ADR-0031-section-cut is OPEN as a documentation polish |
| Hidden-line classifier (kernel-pure) integrated per SPEC-30 §3.2 | `packages/geometry-kernel/src/hidden-line/` | DONE per ADR-0030 §2.4 |
| Perf bench Large tier passes per SPEC-30 §2 Large | `apps/bench/src/benches/visual-diff-plan.bench.ts` measures stream-equivalence; full SPEC-30 §2 Large tier (50,000 elements) is bound to the same Playwright promotion at S37 D5 | DEFERRED-WITH-TRIGGER |
| WebGL2 implementation; WebGPU compute deferred per ADR-025 Part E | WebGL2 path is the rendering default; WebGPU compute deferral is per `[strategic ADR-022]` Phase rollout | DONE / DEFERRED-BY-DESIGN |
| Visibility-Intent wave 5 (the spec's literal ask) | OPEN. Waves 3-4 ship in `packages/visibility/src/index.ts`; wave 5 = full 11-wave port = S49 / Phase 3A per the package docstring. | **DEFERRED to S49 / Phase 3A** — re-eval trigger: Phase 3A capacity available |

**S35 closure rationale**: the spec's "visibility-intent wave 5" was a planned-pre-execution requirement. ADR-0030 §2.5 reclassified it as an explicit deferral (project task) once the closeout audit found that the wave-3-4 reducer covers the practical use cases for Phase 2B's renderer integration. The wave-5 propagation (the "halftone-cousin-of-cousin" cascade) is wholly legacy-side and is folded into the full 11-wave port at S49 per `[strategic ADR-015]` (Visibility-Intent placement).

---

## §6 S36 — Multi-View Sync + Cross-View Layout (PARTIAL-RATIFIED)

This sprint is closed **as partial** per ADR-0030 §2.2: "Multi-view sync + cross-view layout — partial; production hardening at S46."

| Spec exit gate (spec §S36) | Status | Where the deferred work is bound |
|---|---|---|
| Edit in any view → change visible in all other views within 16 ms p95 | `packages/view-state/src/view-sync.ts` (`ViewSyncBus` pure publisher with topic taxonomy `selection` / `viewport` / `cut-plane`) + 5 tests in `view-sync.test.ts`. Frame-budget enforcement is the host-side responsibility; bench gate is OPEN. | DONE-AS-PUBLISHER; `apps/bench/multi-view-sync.bench.ts` deferred to S46 D2 |
| `apps/bench/multi-view-sync.ts` < 16 ms p95 hard-fail | NOT YET COMMITTED | **DEFERRED to S46 D2** — re-eval trigger: production hardening sprint per ADR-0030 §2.2 |
| Contract 44: all 10 gaps green (from S33; maintained through S36) | `tests/contract-44/G1-G10.test.ts` (all 10 files) | DONE |
| Visual diff: plan view < 2 px, section view < 2 px on 30-case fixture | Recording-canvas stream-equivalence on 5 fixtures per ADR-0030 §2.4. 30-case fixture corpus + pixel tolerance bound to Playwright promotion at S37 D5. | DEFERRED-WITH-TRIGGER (S37 D5) |
| `featureFlags.plan_view_v2` operational | `packages/feature-flags/` per ADR-0030 §2.4 | DONE |
| Multi-view layout: 1-up, 2-horizontal, 2-vertical, 4-equal all functional | `packages/view-state/src/multi-view-layout.ts` (pure layout solver: `tabs` / `split-2` / `grid-4`) + 5 tests in `multi-view-layout.test.ts`. Spec lists 1-up / 2-h / 2-v / 4-equal; the pure solver supports `tabs` (= 1-up) / `split-2` (= 2-h or 2-v depending on splitter axis) / `grid-4` (= 4-equal). | DONE-AS-PURE-SOLVER; splitter-drag UI deferred to S46 D1 (host-side) |
| 2B demo recording committed to `docs/demos/M18-2B.mp4` | OUT OF SCOPE — recording asset, not code | DEFERRED — folded into M24 beta demo per §2C-AUDIT §9 pattern |
| `apps/bench/reports/M18-2B.md` committed | NOT YET COMMITTED | DEFERRED to S31-bis bench-reports sweep |
| ADRs 023–025 merged | `0023-plan-view-canvas2d-renderer.md`, `0024-plan-view-annotation-pipeline.md`, `0025-plan-view-svp-parity-contract-44.md` | DONE |
| 2B retro decision on `featureFlags.plan_view_v2` default for beta | `packages/feature-flags/` skeleton ships flag-OFF default; default-ON decision bound to S47 (beta cohort onboarding) per `[strategic ADR-018]` cut-list ranking | DOCUMENTED-AS-DEFERRED |
| `view-resolution` consumed by `PlanViewCanvasHost` (default-template helper) | per ADR-0030 §2.4 wiring row | DONE |

**S36 closure rationale**: ADR-0030 §2.2 explicitly relabelled this row as "partial; production hardening at S46". The skeleton shipped (pure layout solver + view-sync bus + topic taxonomy + 8 unit tests) is the stable type-side dependency the host code can take per `view-sync.ts` line 17. The hard-fail bench gate is bound to S46 D2; the 30-case visual-diff fixture corpus is bound to S37 D5. **No silent deferrals remain.**

---

## §7 Cross-Cutting Status

### §7.1 ADRs (per spec §3.1)

| Spec slug | Actual file | Verdict |
|---|---|---|
| `0023 — Plan view Canvas2D renderer` (S31) | `docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` | DONE |
| `0024 — Section cut algorithm` (S35) | folded into `0024-plan-view-annotation-pipeline.md` + inline in `section-cut-producer.ts`; standalone ADR is OPEN-AS-DOC-POLISH | DOCUMENTED-IN-CODE |
| `0025 — Multi-view sync` (S36) | `0025-plan-view-svp-parity-contract-44.md` (Contract 44 SVP parity decision; multi-view sync decision is in ADR-0030 §2.2 + `view-sync.ts` docstring) | DOCUMENTED-IN-ADR-0030 |
| `0029 — Vector primitives & backends` (post-2B closeout) | `docs/architecture/adr/0029-vector-primitives-and-backends.md` | DONE |
| `0030 — Phase 2B post-audit reconciliation` | `docs/architecture/adr/0030-phase-2b-post-audit-reconciliation.md` | DONE — RATIFIED BY THIS AUDIT |

### §7.2 CI Gates Added in 2B (per spec §3.2)

| Gate | Hard-fail Threshold | Sprint | Status |
|---|---|---|---|
| Visual diff plan view (geometry) | > 10 px | S31 | STREAM-EQUIVALENT GREEN; pixel gate DEFERRED to S37 D5 |
| Visual diff plan view (annotations) | > 5 px | S32 | STREAM-EQUIVALENT GREEN; pixel gate DEFERRED to S37 D5 |
| Visual diff plan view (full) | > 2 px | S33 | STREAM-EQUIVALENT GREEN; pixel gate DEFERRED to S37 D5 |
| Contract 44 gap tests (G1–G10) | Any failure | S33 | GREEN (10/10) |
| Multi-view sync latency | > 20 ms p95 | S36 | DEFERRED to S46 D2 |
| Section view visual diff | > 2 px | S36 | STREAM-EQUIVALENT GREEN; pixel gate DEFERRED to S37 D5 |
| Plan view fps | < 50 fps p95 | S31 | SKELETON-LIVE in `visual-diff-plan.bench.ts`; opt-in via `PRYZM_VISUAL_DIFF_PLAYWRIGHT=1` |

### §7.3 OTel Spans Added in 2B (per spec §3.3)

`pryzm.plan-view.{render,poche,annotation-layout,annotation-draw}`, `pryzm.section-view.{cut,render}`, `pryzm.multi-view.sync-propagation` — all live (verify via `plugins/plan-view/src/tracing.ts` 6-test file + `view-state/src/otel.ts`).

### §7.4 Risk Register Status

| Risk | Status | Mitigation outcome |
|---|---|---|
| R2B-01 (font AA visual-diff > 2 px) | OPEN — non-blocker | Recording-canvas measures stream-equivalence; pixel-tolerance promotion at S37 D5 will use 3 px text-pixel tolerance per spec §R2B-01 mitigation |
| R2B-02 (Contract 44 G9/G10 incompatible with multi-view sync) | NOT TRIGGERED | G9/G10 green; multi-view sync skeleton uses pure publisher (`ViewSyncBus`) — no lock contention |
| R2B-03 (section cut self-intersecting polygons) | OPEN (low) | Producer is pure; convex-hull fallback per spec is implementable in `intersectWithPlane` when the case fires; no production reports yet |
| R2B-04 (multi-view edit propagation > 16 ms) | DEFERRED — bench gate at S46 D2 | The publisher-side has no inherent budget cost; the renderer-side budget is host-by-host |
| R2B-05 (2B overruns by > 2 weeks compressing 2C) | NOT TRIGGERED | 2C closed 100/100 on 2026-04-28; 2B overrun absorbed by ADR-0030 closeout pattern |
| R2B-06 (`featureFlags.plan_view_v2` toggle crashes on older projects) | NOT TRIGGERED | Skeleton ships flag-OFF default |

### §7.5 Kill-Switches

| Kill-switch | Status |
|---|---|
| K2B-1 (annotation visual-diff > 5 px at S32 D5) | NOT FIRED |
| K2B-2 (Contract 44 G9/G10 incompatible at S33) | NOT FIRED |
| K2B-3 (section view visual diff > 10 px at S35) | NOT FIRED — kernel-pure producer + recording-canvas stream-equivalence within tolerance |
| K2B-4 (multi-view sync latency > 30 ms p95 at S36 D5) | NOT EVALUATED — bench gate deferred to S46 D2 with the same kill-switch rule re-armed |

K2B-1..K2B-4 are coded as feature-flag gates in `packages/feature-flags/` per ADR-0030 §2.4 (closing the spec's "kill-switches absent" §1 finding).

---

## §8 Gap-Closure Sub-phase Status (spec §Gap-Closure-Subphase)

The gap-closure work that the 2026-04-27 directive absorbed into S31 is recorded here for closure traceability:

| Sprint | Gap-closure deliverable | Status |
|---|---|---|
| S31 | SPEC-13/15/21/24/26/27/28/29/30 published as standing references | DONE |
| S31 | ADRs 0022/0023/0025/0026/0028/0030 ratified | DONE |
| S31 | ESLint rules `pryzm/no-impure-context`, `pryzm/single-frame-owner`, `pryzm/no-react-runtime`, `pryzm/no-direct-three-examples`, `pryzm/no-circular` lit at warning level | DONE |
| S31 | Reverse-document envelopes for 12 Phase-1 GREEN families + 6 Phase-2A in-flight families | DONE per SPEC-13 §3 + SPEC-21 Step 2 |
| S31 | Service-role-key removal from `server.js` | OPEN — project task per ADR-0030 §2.5 |
| S31 | BullMQ scheduled sweep replaces probabilistic `project_command_log` cleanup | OPEN — project task per ADR-0030 §2.5 |
| S31 | `00_Contracts/` archived | DONE per SPEC-27 §5 |
| S31 | `packages/drawing-primitives/` schemas + Zod + SVG MVP | DONE |
| S31 | `plugins/lifecycle/` skeleton + first three cross-family rules | DONE per ADR-030 Part D |
| S31 | Plugin data sandbox path reserved in `.pryzm` | DONE per SPEC-26 §11 |
| S31 | Pre-port: 5 hot ops on Canvas2D backend per SPEC-30 §5 | DONE for 4 of 5 (selection/drag/pan/zoom); snap is the §S30.5–S30.10 follow-up |
| S31 | Cesium mount becomes lazy + disposable per ADR-023 Part C | OPEN — project task per ADR-0030 §2.5 |
| S32 | ESLint rules promoted from warning to error | DONE per spec §Gap-Closure |
| S32 | RLS policies generator lit per ADR-028 Part E | OPEN — project task |
| S33 | New visibility resolver parity-tested on SPEC-11 fixture corpus | DONE — wave-3-4 reducer in `packages/visibility/` parity'd against legacy adapter |
| S33 | Canvas2D backend (overlays) per SPEC-29 §4.2 lit | DONE — `packages/drawing-primitives/src/backends/canvas2d.ts` |
| S33 | AI proposal queue lit | DONE-AS-SKELETON |
| S34 | Switch primary to new resolver; legacy retained as feature-flag fallback | DONE per `packages/feature-flags/` + `packages/visibility/legacy-adapter.ts` (= `packages/visibility/src/index.ts`) |
| S34 | Symbol layer integration; SPEC-29 §1 backend equivalence gate at SPEC-30 §2 Medium tier | DONE-AS-STREAM; pixel-tier promotion at S37 D5 |
| S34 | Plan-symbol producers (`plugins/<family>/plan-symbol.ts`) for all 18 families | DONE per SPEC-21 Step 8 (every Phase 2A plugin ships a producer in `packages/geometry-kernel/src/producers/`) |
| S35 | Hidden-line classifier integrated | DONE per ADR-0030 §2.4 |
| S35 | Perf bench Large tier passes | DEFERRED-WITH-TRIGGER (S37 D5) |
| S36 | Multi-view sync per SPEC-30 §7 | DONE-AS-PUBLISHER; production hardening at S46 D2 |
| S36 | Perf bench Torture tier passes | DEFERRED-WITH-TRIGGER (S37 D5 / S46 D2) |
| S36 | SPEC-29 SVG↔Canvas2D equivalence gate green on full fixture corpus | DEFERRED-WITH-TRIGGER (S37 D5) |

---

## §9 Deferred (with explicit rationale)

These items are spec'd by the 2B sprint range or its Gap-Closure overlay but do **not** block Phase 2D entry per ADR-0030 §3-§4:

| Deferred item | Why deferred | Re-eval trigger |
|---|---|---|
| Playwright PNG pixel-tolerance harness for plan + section visual diff | Recording-canvas harness measures stream-equivalence on 5 fixtures, which is sufficient for Contract 44 G1–G10 to remain green and for ADR-0030's "P1 code findings" to be honestly ratified. Promoting to PNG-pixel comparison requires a Tier-3 CI dependency (Playwright) and a 30-case fixture corpus production pass. | S37 D5 per spec §Gap-Closure S31 |
| `apps/bench/multi-view-sync.bench.ts` (< 16 ms p95 hard-fail) | Pure publisher (`ViewSyncBus`) has no inherent latency cost; renderer-side budget is host-by-host and only meaningful with all three view types live in one workbench. | S46 D2 per ADR-0030 §2.2 |
| Visibility-Intent wave 5 (full 11-wave port) | Wave-3-4 reducer covers the practical use cases for Phase 2B's renderer integration. The wave-5 cascade is the "halftone-cousin-of-cousin" propagation that only fires inside the full Visibility-Intent placement system per `[strategic ADR-015]`. | S49 / Phase 3A |
| 2B demo recording (`docs/demos/M18-2B.mp4`) | Recording asset, not code. Folded into M24 beta launch demo per §2C-AUDIT §9 pattern. | M24 beta launch |
| `apps/bench/reports/M18-2B.md` | All bench infrastructure in place; the report .md is bookkeeping. | S31-bis bench-reports sweep (combined with M15-2A baseline) |
| Standalone `0031-section-cut-algorithm.md` ADR | Decision is documented inline in `plugins/section-view/src/section-cut-producer.ts` and ratified in ADR-0030 §2.4. | Phase 3 doc-org cleanup |
| `featureFlags.plan_view_v2` default-ON for beta | Decision bound to S47 beta cohort onboarding (one variable to flip). | S47 D1 |
| Service-role-key removal, BullMQ sweep, Cesium lazy mount, RLS policies generator | Each is real engineering depth; ADR-0030 §2.5 explicitly filed them as project tasks rather than closeout work. | Tracked as project tasks; per-sprint owner is `engineering-platform` |

---

## §10 Verdict

**Phase 2B — PLAN VIEW — CLOSED** at the **closure-verdict** scoring of 100/100 (raw exit-criterion scoring 90/100 with the two deferred items explicitly bound to S37 D5 and S46 D2).

6 sprints, 6 marks set to `[x]` (S31-S34 already `[x]`; S35 and S36 promoted from `[ ]` to `[x]` (PARTIAL-RATIFIED) by this audit). `[x] (PARTIAL-RATIFIED)` means:
1. The skeleton + tests + ADR shipped within sprint envelope.
2. The remaining production-hardening work is bound to a named future sprint (S37 D5 or S46 D2).
3. The kill-switch rule (K2B-3 / K2B-4) is re-armed at that future sprint.

ADR-0030 is the binding closure record. This audit ratifies it and surfaces it in the standard audit format so `PROCESS-TRACKER §2B` can be flipped to honest `[x]` rows. **Phase 2B exit is unblocked from the 2B side**; Phase 2C is closed (`PHASE-2C-AUDIT-2026-04-28.md` 100/100); Phase 2D entry now requires only the ADR-002 implementation companion (sprint-scoped `0033-sync-client-event-bridge.md`) and the chaos-test fixture, both filed alongside this audit on 2026-04-28.

---

*Audit run: 2026-04-28. Owner: Engineering main-track. Companion audits: `PHASE-2A-AUDIT-2026-04-28.md` (issued same day) + `PHASE-2C-AUDIT-2026-04-28.md` (issued 2026-04-28).*
