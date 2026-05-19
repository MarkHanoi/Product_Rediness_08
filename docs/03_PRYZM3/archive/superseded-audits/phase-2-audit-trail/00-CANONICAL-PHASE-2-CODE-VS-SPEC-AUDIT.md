# PHASE 2 — CODE-VS-SPEC AUDIT (2A · 2B · 2C · 2D)

> **Date**: 2026-04-28
> **Auditor**: independent code-grounded re-audit (post-team self-audits)
> **Method**: source-of-truth reading of every claimed Phase-2 deliverable —
> file-by-file, handler-by-handler, test-by-test — followed by **actual test
> execution** of the suspect workspaces. **Doc text is not trusted** unless
> the corresponding code/test/configuration confirms it.
> **Cross-references**: this audit reads but does NOT defer to the team's own
> closure audits at `docs/00_NEW_ARCHITECTURE/phases/audits/PHASE-2A/B/C/D-*.md`,
> the M-series bench reports, and the per-ADR ratification claims. Where this
> audit confirms them, both are cited. Where it disputes them, this audit
> states why with file paths and line numbers.
> **Scope**: Phase 2A (M13–M15 / S25–S30), 2B (M16–M18 / S31–S36), 2C
> (M19–M21 / S37–S42), 2D (M22–M24 / S43–S48).
> **Out of scope**: Phase 1 follow-up items (already in
> `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`); Phase 3 onward.

---

## §0 Executive Verdict

| Sub-phase | Code-grounded score | Team self-grade | Delta | Verdict |
|---|---|---|---|---|
| **2A** — Non-element families | **96 / 100** | 100 / 100 | −4 | Substantively complete; one safety toggle never wired |
| **2B** — Plan view | **78 / 100** | 100/100 closure (90/100 raw) | −22 | Test failures + architectural boundary breach + section-view shell |
| **2C** — Sheets, schedules, docs | **88 / 100** | 100 / 100 | −12 | Documentation pipeline ships; export-worker missing; one test suite broken via plan-view import |
| **2D** — Sync, awareness, beta | **70 / 100** | 100/100 PARTIAL-RATIFIED (raw 70/100) | −30 (raw 0) | The PARTIAL-RATIFIED items are real blockers, not closures: cutover, authz, chaos test, AI worker live wiring all absent |
| **Phase 2 overall** | **B (83 / 100)** | A (100 / 100) | −17 | "Closure 100" pattern over-credits skeletons + bound-deferrals |

**Bottom line.** The substantive engineering for Phase 2 is impressive
breadth-wise — 6 new element families with full Wall-recipe parity, a 17-file
plan-view subsystem, sheets + 10 widget types + 4 export formats, 11 of 11
visibility waves (over-delivered), Yjs sync client + soft-locks + multiplayer
plugin, AI host with lazy bootstrap. The team's per-sprint audits are
self-honest about what they call "PARTIAL-RATIFIED" deferrals.

What this audit catches that the team's own audits did not, or under-stated:

1. **Real test failures** in plan-view (2/16 suites) and ai-host (9/75 tests)
   that the existing audits do not mention. These are not "skeletons" — they
   are broken integration that returns red.
2. **`PlanViewCanvasHost` imports `@pryzm/scene-committer`** — a direct
   architectural breach of ADR-0023 / ADR-0028's "no THREE in plan view"
   contract. The test failure surfaces the import; no audit row catches it.
3. **`featureFlags.plan_view_v2`** lives in the persistence-client manifest
   schema with `default(true)` but has **zero runtime consumers** in
   `apps/editor/` or `plugins/plan-view/` (verified by exhaustive `rg`).
   The "built-in safety" for the highest-risk sub-project of the 36-month
   plan does not actually do anything.
4. **`authz.can` middleware**: the sync-server `apps/sync-server/src/`
   directory has bake/cde/eventLog/handlers/locks/protocol/session — and
   no `authz/`. The Phase 2D spec (line 49) makes it an S43 D7 deliverable
   in **every** gateway route. The only mention of `authz.can` in the
   entire codebase is a comment in `SyncClient.ts` saying it's a server-side
   concern. The server side does not have it.
5. **No chaos test harness**. `packages/sync-client/__tests__/` has 6 files
   (locks, awareness, awareness-e2e, event-bridge, event-bridge-roundtrip,
   SyncClient). None of them is `chaos.test.ts`. The spec text:
   *"chaos test harness is the gate that lets us sleep at night through
   Phase 3"*. It is missing.
6. **`apps/export-worker/` does not exist**. Phase 2C spec line 39 lists
   it as an S40 deliverable; the team's 2C audit deferred it to "ADR-039".
   The actual `apps/` directory contains: `ai-worker, bake-worker, bench,
   cli, component-editor, editor, headless, sync-server`. No export-worker.
7. **Section view is genuinely a shell** — 3 files, 221 LOC total, zero
   handlers, no SectionStore, no renderer. The shell records `render()`
   call counts but does not draw. The M24 functional-readiness checklist
   in `M24-beta.md` claims "section view … functional" — that is not
   true.

What the existing audits **do correctly capture** that this audit confirms:

* All 18 element families are present and Wall-recipe-conformant.
* Soft-locks, Yjs SyncClient, awareness, sheets, schedules, formula DSL,
  visibility waves, AI host lazy-bootstrap pattern — all real.
* Cutover-checklist-enforcer pattern is correctly defensive (no operator
  can drop tables before burn-in).
* The "PARTIAL-RATIFIED" pattern is honest about deferrals — it just
  conflates "deferred" with "complete" in the score column.

---

## §1 Inventory — what exists today

### 1.1 Packages added during Phase 2

| Package | Phase | LOC budget | Notes |
|---|---|---|---|
| `packages/expr-eval` | 2A · S25 | parser.ts + evaluator.ts + index.ts | Light parametric expressions (SPEC-01 §4.1). No constraint solver — by design. |
| `packages/drawing-primitives` | 2A · S30 | backends/, classifier-to-primitives.ts, types.ts, index.ts | SPEC-04 vector primitives + Canvas2D backend; precondition for plan-view |
| `packages/sync-client` | 2D · S43 | SyncClient, event-bridge, awareness, locks, types, tracing, index | Yjs `^13.6.18` installed correctly |
| `packages/ai-host` | 2D · S47 | AiBus, AiHost, AiHost.impl, AiPlane (287 LOC), AnthropicRelay (160 LOC), WorkflowRegistry, types, tracing, index, workflows/ × 3 | Lazy-loaded via `import('./AiHost.impl.js')`; static guard at `scripts/check-ai-host-lazy.mjs` |
| `packages/ai-cost` | 2D · S47 | (referenced from ai-host but module-resolution fails in test) | **Listed in deps but `Failed to load url @pryzm/ai-cost` in `AiPlane.batch.test.ts`** |
| `packages/visibility` | 2B · S34 / 2D · S46 | runtime.ts + waves/w01..w11 + index + types | **All 11 waves shipped** (spec said 1-5 in 2D, 6-11 in 3A) — over-delivered |
| `packages/beta-signup` | 2D · S48 | BetaSignupStore, submitBetaSignup, validation, types, index | Validates → normalises → records → emails |
| `packages/email-transport` | 2D · S48 | (consumed by beta-signup) | Pluggable transport |
| `packages/crash-reporter` | 2D · S48 | (production OTel + Sentry-equivalent) | Present per package list |
| `packages/feature-flags` | 2A | (cross-cutting) | Carries `plan_view_v2` and `legacy_vi_fallback` |
| `packages/family-loader / runtime / instance` | 2A | (loadable family scaffold; full editor lands Phase 3B) | Per SPEC-05 §1.2 |
| `packages/constraint-solver` | (Phase 3A) | parked early | NOT a 2A scope item per the spec; lives in repo for early arrival |
| `packages/types-builtin` | 2A | (built-in family types) | SPEC-05 |
| `packages/pdf-to-bim` | (Phase 3A AI) | parked early | AI worker scope |
| `packages/legacy-shim` | sunset | (Phase 1 audit captured this — undocumented) | Same as Phase 1 finding |
| `packages/render-runtime` | (kept from 1) | | |
| `packages/ui` | (Phase 2 cross-cutting) | | UI primitives |

Phase 2 added **6 new packages that are Phase-2-essential**
(`expr-eval, drawing-primitives, sync-client, ai-host, beta-signup,
email-transport`) plus **5 packages parked early or sunset** (`ai-cost,
constraint-solver, family-loader/runtime/instance, pdf-to-bim`).

### 1.2 Plugins added during Phase 2

| Plugin | Phase | Handlers (code) | Handlers (spec) | Δ |
|---|---|---|---|---|
| `plugins/rooms` | 2A · S25 | 9 | 8 | **+1** (`RecomputeRoomBoundary`) |
| `plugins/structural` | 2A · S26 | 7 | 7 | 0 |
| `plugins/lighting` | 2A · S26 | 5 | 5 | 0 |
| `plugins/plumbing` | 2A · S26 | 4 | 4 | 0 |
| `plugins/furniture` | 2A · S27 | 7 | 7 | 0 (+ `catalogue/` dir) |
| `plugins/dimensions` | 2A · S29 | 6 | 6 | 0 |
| `plugins/plan-view` | 2A skeleton + 2B full | 17 src files (no handlers — view layer) | 13+ files in spec | covered + over |
| `plugins/annotations` | 2B · S34 | 8 | 8 | 0 |
| `plugins/section-view` | 2B · S35 (DEFERRED) | **0 handlers, 3 files (221 LOC)** | 6 handlers + canvas-host + renderer | **−6 handlers, −2 critical files** |
| `plugins/sheets` | 2C · S37–S40 | 11 | 11 (4 + 7) | 0 |
| `plugins/sheets/widgets/` | 2C · S39 | 10 widget types (+ base, index, registry) | 10 | 0 |
| `plugins/schedules` | 2C · S41–S42 | 6 | 6 | 0 |
| `plugins/multiplayer` | 2D · S44 | cursor (185), peer-list (155), view-chip (22), lock-ui (226), index (43) | per-cursor + peer-list + peer-view-chip + lock-ui | 0 (named `view-chip.ts` not `peer-view-chip.ts`) |
| `plugins/visibility-intent` | (NOT FOUND) | — | dedicated wave plugin per spec line 70 | **−1 plugin** (waves live in `packages/visibility/` instead) |
| `plugins/ai-floorplan` | 2D · S47 | descriptor + ApprovalQueuePanel + index | shell only (per spec) | 0 |

### 1.3 Apps added or extended during Phase 2

| App | Phase | Status |
|---|---|---|
| `apps/ai-worker/` | 2D · S47 | Skeleton: cv/, pdf-to-bim/, queue.ts, handlers.ts. **No live BullMQ/Redis** — InMemoryQueue only. |
| `apps/component-editor/` | (Phase 3B early arrival) | Already present, family-editor quality-gates workflow runs |
| `apps/editor/src/projects/` | 2A · S28 | NewProjectDialog, ProjectCard, ProjectHub, index — project hub real |
| `apps/sync-server/src/locks/` | 2D · S45 | InMemorySoftLockStore, PgSoftLockStore, soft-locks.sql, Sweeper, handlers, types — full implementation |
| `apps/sync-server/src/cde/` | 2A | Common Data Environment registry |
| `apps/headless/` | (Phase 1) | Used by export-worker pattern (which is missing) |
| `apps/export-worker/` | 2C · S40 | **DOES NOT EXIST** |

### 1.4 ADRs added during Phase 2

ADR sequence 0022 → 0037 (16 ADRs added). Headline contents:

| ADR | Sprint | Subject | Code-side state |
|---|---|---|---|
| 0022 | S25 | Room boundary detection | Implemented in `plugins/rooms/` + `produceRoom` |
| 0023 | S31 | Plan-view Canvas2D renderer (no THREE) | **Breached** — see C-1 below |
| 0024 | (collision: S35 section-cut OR strategic constraint solver) | — | Confusion documented in spec; section-cut producer is in plan-view dir, not its spec'd home |
| 0025 | S36 | Multi-view sync | Skeleton only (`view-sync.ts` is ViewSyncBus stub) |
| 0026 | S26 | Second-tier elements triage | Reflects what shipped |
| 0027 | S27 | Furniture multi-representation | Implemented |
| 0028 | S29 | Plan-view canvas architecture | Same boundary breach as 0023 |
| 0029 | S30 | Vector primitives + backends | `drawing-primitives` package present |
| 0030 | post-2B | Phase 2B post-audit reconciliation | Closes S35/S36 as PARTIAL-RATIFIED |
| 0031 | S61 (FUTURE) | Staged legacy deletion + 90-day sunset | Forward-binding only |
| 0032 | S41 | Schedule formula DSL | Implemented; 161/161 schedule tests green |
| 0033 | S43 | Sync-client + Immer ⇄ Y.Doc bridge | Implemented; 73/73 sync-client tests green |
| 0034 | S44 | Awareness extended + multiplayer plugin | Implemented |
| 0035 | S45 | Soft-locks + Replit-PG → Supabase cutover gate | Soft-locks shipped; cutover deferred |
| 0036 | S46 | Visibility-Intent waves 1-5 + restore-verify streak | Code over-delivered (waves 1-11 present) |
| 0037 | S47 | AI host lazy bootstrap + worker queue + approval queue | Lazy bootstrap real; live BullMQ deferred |

### 1.5 Test suites — actual run results (executed during this audit)

| Suite | Files | Tests | Pass | Fail | Verdict |
|---|---|---|---|---|---|
| `packages/sync-client` | 6 | 73 | 73 | **0** | ✅ Green |
| `plugins/schedules` | 13 | 161 | 161 | **0** | ✅ Green |
| `plugins/sheets` | 28 | 266 | 266 | 0 — **but 1 SUITE failed to load** | ⚠ One test file fails on `@pryzm/scene-committer` resolution |
| `plugins/plan-view` | 16 | 105 | 105 | 0 — **but 2 SUITES failed to load** | ⚠ `plan-view-auto-dim.test.ts` + `plan-view-canvas-host.test.ts` fail on `@pryzm/scene-committer` resolution |
| `packages/visibility` | 12 | 82 | 82 | **0** | ✅ Green (all 11 waves parity-tested) |
| `packages/ai-host` | 9 | 75 | 66 | **9** | ❌ `AiHost.test.ts` "submit workflow" all-failing; `AiPlane.batch.test.ts` cannot load `@pryzm/ai-cost` |

The two suite-level failures and the nine ai-host test failures are real
regressions that the team's own audits do not mention.

### 1.6 Workflows status (Replit) — current snapshot

13 of 14 Phase-2-relevant workflows running/finished. `audit-log-middleware`
remains failed (carried over from Phase 1; same gap as W-11 in the Phase-1
close plan).

### 1.7 Bench reports under `apps/bench/reports/`

| Report | Status | Notes |
|---|---|---|
| `M15-2A-baseline.md` | Captured | All 18 element families listed; geometry-kernel 28 files / 492 tests green |
| `M21-2C.md` | Captured | Schedule export bench: CSV 0.64 ms p95 (156× under 100 ms budget); XLSX 61 ms (8× under 500 ms); PDF 188 ms (53× under 10 s) |
| `M24-beta.md` | **DRAFT** | TODO checkboxes for `pnpm bench yjs-collab`, `pnpm bench restore-verify`, `pnpm spec:audit-storage`, AI dashboard, service-role key removal, `check-ai-host-lazy.mjs`, `vite build --report`. **None measured.** |
| `M30-3B.md` | Captured | Phase 3B early arrival report |

The M24 beta report is honest: it shows DRAFT and lists every gate
unchecked. Reading the spec lines 689–695 against the current code:
**none of the seven M24 gates is currently green.**

---

## §2 100/100 Wins — what is genuinely complete and well-built

### W-1. All 18 element families operational with Wall-recipe parity

**Evidence**: `apps/bench/reports/M15-2A-baseline.md` §1 lists all 18 with
plugin + producer + parity tests. Six new families (`rooms, structural,
lighting, plumbing, furniture, dimensions`) added in 2A, each conforming
to the canonical element recipe established in Phase 1B. Per-handler
counts match spec (6/6 for dimensions, 7/7 for structural, 5/5 for
lighting, 4/4 for plumbing, 7/7 for furniture). Rooms ship 9 handlers
(+1 over spec for `RecomputeRoomBoundary`, justified by half-edge
re-flood when an adjacent wall changes).

**Why this is real**: every plugin has its own `committer/`, `handlers/`,
`store.ts`, `intent.ts`, `tool.ts`, `errors.ts`, `index.ts` — same shape
as `plugins/wall/`. Producers exist in `packages/geometry-kernel/src/
producers/`. This is the K1-C multiplier-pattern proof, working at scale.

### W-2. Drawing-primitives package + edge-projection + poche pure modules

**Evidence**: `packages/drawing-primitives/src/{backends, types.ts,
classifier-to-primitives.ts, index.ts}` and `packages/geometry-kernel/
src/{edge-projection.ts, poche.ts}` both present. The geometry-kernel
test gate reports `edge-projection.test.ts` (34 tests) and `poche.test.ts`
(18 tests) both green with snapshot baselines committed. Headless-pure
foundations the entire plan-view subsystem stands on.

### W-3. Plan-view subsystem — 17 files of substantive implementation

**Evidence**: `plugins/plan-view/src/` contains:
`PlanViewCanvasHost.ts, PlanViewRenderer.ts, PlanCamera.ts, CanvasHost.ts,
LevelStore.ts, projection.ts, hit-test.ts, drag.ts, selection.ts,
annotation-renderer.ts, annotation-committer.ts, level-scoped-renderers.ts,
style-resolver.ts, view-element-visibility.ts, view-template-bridge.ts,
tracing.ts, index.ts`. 14 of 16 test suites pass (105 tests green). The
team's 2B audit calls S31–S34 100/100 — substantively correct, with the
caveats in §3 (C-1 to C-3 below).

### W-4. Annotations plugin — 8 handlers + plan-view adapter

**Evidence**: `plugins/annotations/src/handlers/` ships 8 handlers
(`Create, Delete, Move, SetColor, SetKind, SetText, SetTextHeight,
SetRotation, SetRotation`). Plus `plan-view-adapter.ts` to bridge to the
Canvas2D renderer. Matches spec exactly.

### W-5. Sheets plugin — 11 handlers + 10 widgets + viewport + book exporter

**Evidence**: `plugins/sheets/src/handlers/` ships 11 handlers covering
sheet CRUD + viewport CRUD + widget CRUD + title block. `widgets/` ships
10 widget types (`bim-tag, image, legend, line, north-arrow, region,
revisions-table, scale-bar, schedule-snapshot, text`) + `base.ts, index.ts,
registry.ts`. `book/book-exporter.ts` orchestrates PDF export. 27 of 28
test suites pass (266 tests green). Real, working documentation editor.

### W-6. Schedules plugin — 6 handlers + formula DSL + 4 export formats

**Evidence**: `plugins/schedules/src/handlers/` ships 6 handlers
(`Create, Delete, AddColumn, RemoveColumn, SetFilter, SetGroupBy`).
`formula-evaluator.ts` + `evaluate-schedule.ts` implement the SPEC-03
formula DSL with AST cache. `export/{csv, xlsx, pdf}.ts` + `import/csv.ts`
+ `view.ts` + `sort.ts`. **161/161 tests pass**. The M21-2C bench report
shows export performance an order of magnitude under budget on every
format. This is the cleanest 100/100 in Phase 2.

### W-7. Sync-client — Yjs + EventBridge + awareness + locks

**Evidence**: `packages/sync-client/package.json` declares `"yjs":
"^13.6.18"` correctly. `SyncClient.ts` (227-line test file passes 17
tests), `event-bridge.ts` (240-line test 13 pass), `awareness.ts`
(340-line test 24 pass + 159-line e2e test 5 pass), `locks.ts` (231-line
test 11 pass) — **73/73 tests pass**. The bidirectional bridge between
command-bus events and Yjs map operations is real and tested. The
provider injection seam (`ProviderFactory`) lets tests use a `MockProvider`.

### W-8. Soft-locks — full server + client + UI implementation

**Evidence**: `apps/sync-server/src/locks/` ships `soft-locks.sql` (real
SQL schema with `expires_at_idx` + `project_id_idx`), `PgSoftLockStore.ts`
(real PostgreSQL implementation), `InMemorySoftLockStore.ts` (test
double), `Sweeper.ts` (TTL expiry sweeper), `handlers.ts` (HTTP routes),
`types.ts`, `createSoftLockStore.ts` (factory). Mirror in
`packages/sync-client/src/locks.ts` (acquire/release/extend) +
`plugins/multiplayer/src/lock-ui.ts` (226 LOC vanilla DOM UI). The 5-second
sweep interval + cold-start reconciliation pattern is documented in
ADR-0035 §2.5. End-to-end primitive.

### W-9. Visibility waves 1–11 — over-delivered

**Evidence**: `packages/visibility/src/waves/` ships **all 11 waves**
(`w01-level-scope, w02-category-visibility, w03-view-template-inheritance,
w04-wall-end-joins, w05-opening-culling, w06-filter-overrides,
w07-phase-filter, w08-temporary-isolation, w09-element-hide,
w10-design-option, w11-ghost-layer`). Per-wave parity fixtures exist
(`__tests__/waves/parity-w01..w11.test.ts`). **82/82 tests pass.**
Spec said waves 1-5 in 2D + 6-11 in 3A — code shipped all 11 in 2D.
ADR-0036's `LEGACY_WAVE_CHAIN` and `DEFAULT_WAVE_CHAIN` switching is
gated by the `legacy_vi_fallback` manifest flag. This is one of the
genuinely above-bar deliverables of Phase 2.

### W-10. expr-eval package — light parametric expressions

**Evidence**: `packages/expr-eval/src/{parser.ts, evaluator.ts,
index.ts}`. SPEC-01 §4.1 binding (`length = a + b`, `angle = 90°`).
No constraint solver — solver is correctly Phase 3A scope (see also
"parked early" `packages/constraint-solver/`).

### W-11. AI host lazy bootstrap pattern

**Evidence**: `packages/ai-host/src/AiHost.ts` (60 LOC) is the lazy
shell — `getAiHost()` performs `await import('./AiHost.impl.js')` with a
string literal. `AiHost.impl.ts` contains the full implementation.
`scripts/check-ai-host-lazy.mjs` is the static guard. Comment header in
`AiHost.impl.ts`: *"NO module under apps/editor (or any L7-or-below code)
may import this file directly."* This is the K3-A bundle gate from
`[strategic ADR-014]`. The pattern is implemented exactly as specified.

### W-12. AI workflows — 3 workflow shells

**Evidence**: `packages/ai-host/src/workflows/` ships
`Generate3Options.ts/.Types.ts`, `PlanCritique.ts/.Types.ts`,
`VoiceCommand.ts/.impl.ts`. Three workflows registered in
`WorkflowRegistry.ts` (70 LOC). Real, taxonomy-correct.

### W-13. Multiplayer plugin — cursor + peer-list + view-chip + lock-ui

**Evidence**: `plugins/multiplayer/src/{cursor.ts (185), peer-list.ts
(155), view-chip.ts (22), lock-ui.ts (226), index.ts (43)}`. 631 LOC
total. Vanilla DOM (apps/editor is not React-based). Renders peer cursors
+ active-view chips + lock badges. The spec lists `peer-view-chip.ts` —
the file is named `view-chip.ts` (a minor naming deviation, no code gap).

### W-14. ai-floorplan plugin shell + ApprovalQueuePanel

**Evidence**: `plugins/ai-floorplan/src/{descriptor.ts, ApprovalQueuePanel.ts,
index.ts}`. ApprovalQueuePanel mounts vanilla DOM into a sidebar slot,
subscribes to `AiApprovalQueueStore`, renders empty + populated states.
Disposable lifecycle. Matches spec line 670 + ADR-0037 §2.5.

### W-15. AiApprovalQueueStore + helpers

**Evidence**: `packages/stores/src/AiApprovalQueueStore.ts` exists with
`approvalQueueBadgeCount` helper.

### W-16. Beta-signup orchestrator with email transport

**Evidence**: `packages/beta-signup/src/{BetaSignupStore.ts,
submitBetaSignup.ts, validation.ts, types.ts, index.ts}`. Validates →
normalises → records → dispatches confirmation email. Pure of side effects
until store + transport are called. Email transport is injected
(`packages/email-transport/`). Real S48 deliverable.

### W-17. Project hub (S28)

**Evidence**: `apps/editor/src/projects/{ProjectHub.ts, ProjectCard.ts,
NewProjectDialog.ts, index.ts}`. Real screen.

### W-18. PDF export — pdf-lib wired

**Evidence**: `pdf-lib@^1.17.1` declared in `plugins/schedules/package.json`
and root `package.json`. `plugins/schedules/src/export/pdf.ts` and
`plugins/sheets/src/book/book-exporter.ts` use it. M21-2C bench shows
PDF p95 = 188 ms for 500 rows (53× under 10 s budget).

### W-19. Schedule formula AST cache

**Evidence**: `plugins/schedules/src/evaluate-schedule.ts` carries a
named AST cache keyed by formula source string, justified in code
comments by the immutability of column formulas.

### W-20. ScheduleStore, SheetStore, TitleBlockStore + active-* stores

**Evidence**: `packages/stores/src/{SheetStore.ts, ActiveSheetStore.ts,
TitleBlockStore.ts, ScheduleStore.ts, ActiveScheduleStore.ts,
AiApprovalQueueStore.ts}`. The two `Active*Store` files were not in spec
but are reasonable runtime additions.

---

## §3 Gaps, risks, wrongs — code-grounded

Severity legend:
* **CRITICAL**: prevents Phase 2 from "closing" in the strict sense
  (spec contract not met OR a real test failure OR a security/data-loss
  risk).
* **HIGH**: closeable around but distorts the architecture, leaves a
  trap-door, or invalidates a measured gate.
* **MEDIUM**: real but bounded — usually a missed file or a docs/code
  drift.
* **LOW**: cosmetic, naming, or process.

### CRITICAL items

#### C-1. PlanViewCanvasHost imports `@pryzm/scene-committer` — direct ADR-0023 / ADR-0028 boundary breach

**Evidence**:
```
plugins/plan-view/__tests__/plan-view-canvas-host.test.ts → FAIL
plugins/plan-view/__tests__/plan-view-auto-dim.test.ts    → FAIL
Error: Failed to load url @pryzm/scene-committer (resolved id:
       @pryzm/scene-committer) in
       /home/runner/workspace/plugins/plan-view/src/PlanViewCanvasHost.ts
```
Plus a transitive failure in `plugins/sheets/__tests__/view-renderer.test.ts`
that imports plan-view's host.

**Why this is critical**: ADR-0023 and ADR-0028 (and Phase 2B spec
line 56) explicitly state *"plan view does NOT use THREE.js. It owns a
2D HTML Canvas. The packages/renderer/ package is irrelevant to plan
view. The SceneCommitter is irrelevant."* The PlanViewCanvasHost in
shipping code imports SceneCommitter directly, breaking the architectural
invariant the entire 2B sub-phase was scaffolded around. The test
failure is evidence the import resolves to nothing in test context — but
the import statement itself is the breach.

**Audit-side surface**: PHASE-2B-AUDIT scored S31 100% with no mention of
this. The team's own boundary lint rule (`pryzm-no-three-in-kernel`)
should have caught this — either it was disabled for plan-view or the
import is via a re-export that the rule does not see.

**Fix**: either (a) remove the SceneCommitter import and refactor to
plain Canvas2D, or (b) amend ADR-0023 to acknowledge the dependency.
(a) is the spec-conformant resolution.

---

#### C-2. `apps/export-worker/` does not exist

**Evidence**: `ls apps/` returns `ai-worker, bake-worker, bench, cli,
component-editor, editor, headless, sync-server`. No `export-worker`.

Phase 2C spec line 39 (S40 deliverable): *`apps/export-worker/` skeleton
+ PDF job*. ADR-026 in the Phase 2C joint deliverables table explicitly
calls for "Export worker architecture (BullMQ, headless rasterise,
pdf-lib)".

The PHASE-2C-AUDIT acknowledges this as deferred to "ADR-039" (which
this auditor could not locate in the ADR directory — see L-3 below).
The deferral rationale is "raster path TBD pending true server worker"
— but the spec named the worker as the M24 beta-launch infrastructure
foundation (Phase 2C ¶3: *"the technical infrastructure (export worker)
that the M24 beta launch requires"*).

**Why critical**: PDF export currently runs in-process. M24's documentation
pipeline contract (`SheetEditorPanel` parity) requires server-side export
for production load patterns; without `export-worker`, every PDF generation
blocks the editor's main thread for ~190 ms per 500 rows (per M21-2C).
At 25 invited beta users this might survive; at any organic load, it
will not.

---

#### C-3. Section view is a 221-LOC shell with zero handlers

**Evidence**: `plugins/section-view/src/` contains exactly 3 files:
* `index.ts` (20 LOC) — public re-exports
* `SectionViewCanvasHost.ts` (60 LOC) — comment header: *"Skeleton only.
  Full feature lights up at S37 (cut producer depth-pass) and S38 (depth
  poche)."* The `render()` method calls `produceSectionCut()` and stores
  the result in `lastResult`, but **does not draw**. It increments a
  `renderCount` so callers can prove wiring exists.
* `section-cut-producer.ts` (141 LOC) — pure AABB intersection; no real
  edge-projection classifier.

NO handlers directory. NO `SectionStore.ts` in `packages/stores/src/`.
NO `section-cut.ts` in `packages/geometry-kernel/src/producers/`. NO
renderer. Phase 2B spec called for 6 handlers + canvas-host + renderer.

**Why critical**: M24-beta.md §3 functional readiness checkbox claims
"Plan view + section view + sheets + 10 widgets + PDF export +
schedules + 3 export formats functional" — section view is **not**
functional. The shell records render-call counts; no pixel is drawn,
no handler exists, no element store updates flow through. The spec gap
is misclassified by the team's own audit as 100/100 closure under
ADR-0030 §2.2 ("PARTIAL-RATIFIED — skeleton + harness + ADR; full
feature deferred to S37 D2 / S38 D1"). S37 and S38 ran in Phase 2C
and did NOT ship the section-view continuation — Phase 2C focused on
sheets + schedules.

**Net**: section view is one of the four named M24 functional-readiness
items and it is not implemented. The spec line is a false claim.

---

#### C-4. No `authz.can` middleware in sync-server

**Evidence**: `apps/sync-server/src/` contains `bake/, cde/, eventLog/,
handlers/, locks/, otel.ts, protocol/, session/, index.ts`. No
`authz/` directory. `rg "authz\.can|authorize\b|permission\.can" --type
ts` returns exactly **one** match: a comment in
`packages/sync-client/src/SyncClient.ts` saying *"the per-route authz.can
middleware (S43 D7 server-side concern)"*.

Phase 2D spec line 49: *`authz.can` middleware in every gateway route
(per [strategic ADR-011])* — S43 D7 deliverable.

`apps/sync-server/src/index.ts` comment: *"auth model: client passes
clientId + userId; server trusts. Full JWT lands in Phase 3C."*

**Why critical**: a multi-user beta with shared projects but no authz
check is a data-integrity hole. Any client that can enumerate
`projectId`s can append events to projects it has no permission to
edit. ADR-028 Part F + `[strategic ADR-011]` make this an S43 contract.
It is not implemented and is explicitly deferred to Phase 3C in the
sync-server's own header comment. The Phase 2D self-audit score does
not surface this.

---

#### C-5. No chaos test harness — the named "sleep at night" gate

**Evidence**: `packages/sync-client/__tests__/` contains `awareness-e2e,
awareness, event-bridge-roundtrip, event-bridge, locks, SyncClient`.
There is **no** `chaos.test.ts`, no `causal-test/` directory.

Phase 2D spec lines 188–203 (S43 D5–D6):
```
// packages/sync-client/causal-test/chaos.test.ts
it('100 random edits across 4 tabs converge in < 5s', ...)
```
Plus the executive-summary line: *"The chaos-test harness is the gate
that lets us sleep at night through Phase 3."*

**Why critical**: the spec frames the chaos harness as the existence
proof for CRDT correctness. Without it, "73/73 sync-client tests pass"
demonstrates handler-level correctness but not concurrent-tab convergence
under stress. Any Yjs implementation can pass the unit tests this code
ships; convergence under N tabs × 100 edits is the hard property.

---

#### C-6. `ai-host` has 9 failing tests + cannot resolve `@pryzm/ai-cost`

**Evidence**: `cd packages/ai-host && npx vitest run`:
```
Test Files  4 failed | 5 passed (9)
     Tests  9 failed | 66 passed (75)

FAIL __tests__/AiHost.test.ts > submit workflow > produces a pending action
FAIL __tests__/AiHost.test.ts > submit workflow > fails open when worker unreachable
FAIL __tests__/AiHost.test.ts > submit workflow > synthesises clientRequestId
FAIL __tests__/AiHost.test.ts > submit workflow > works without approval queue
FAIL __tests__/AiHost.test.ts > submit workflow > records workflow kind in OTel span name
Error: Failed to load url @pryzm/ai-cost (resolved id: @pryzm/ai-cost) in
       /home/runner/workspace/packages/ai-host/__tests__/AiPlane.batch.test.ts
```
The `@pryzm/ai-cost` package directory exists (`packages/ai-cost/`) but
its module resolution fails in test context — likely missing
`exports`/`main` in `package.json` or missing build output.

**Why critical**: PHASE-2D-S47-AUDIT scores S47 100/100 PARTIAL-RATIFIED
based on "skeleton + ADR + bound deferral" pattern. But the skeleton
itself has 9 failing tests on the workflow-submit pathway — the most
basic consumer-facing API. Either the tests are wrong (then they should
be deleted) or the code is wrong (then the score is wrong). Live
shipping with 9 red tests is not 100/100 by any honest definition.

---

#### C-7. Supabase cutover not landed; `SUPABASE_URL` unset

**Evidence**: `rg "SUPABASE_URL"` returns matches in
`apps/bench/src/benches/restore-verify.bench.ts` and
`apps/bench/src/benches/m24-gate.bench.ts` — both with skip-paths:
*"SUPABASE_URL not set — Supabase cutover (S43 D9) has not landed yet."*

ADR-0035 captures this as *"PARTIAL-RATIFIED — server + client + UI
shipped; D5 cutover deletion bound to S43 D9 cutover landing"*. The D5
deletions (DROP TABLE project_command_log, drop Replit-PG, gate fallback
on NODE_ENV, delete `src/snapping/`, tag commit) are all correctly
gated behind a checklist enforcer — operator cannot fat-finger.

**Why critical**: M24 beta gate exit criterion lists "production
cutover Replit-PG → Supabase" as the single biggest infrastructural
deliverable in Phase 2. The 14-day burn-in window has not started
because cutover has not happened. Until it does, the M24 beta gate
cannot pass — every other deferred item also lights up after S43 D9.

This is an honest deferral with explicit gating, not a fraud, but it
is a CRITICAL gap in the "Phase 2 closes" sense. The team's audit
correctly captures the binding; it incorrectly closes the score at 100.

---

### HIGH items

#### H-1. `featureFlags.plan_view_v2` schema-only — no runtime consumer

**Evidence**: `rg "plan_view_v2"` returns 3 matches, all in
`packages/persistence-client/src/manifest.ts` (line 140 doc comment,
line 158 schema definition with `default(true)`, line 188 default
object). **Zero matches in `apps/editor/`, `plugins/plan-view/`, or any
runtime consumer.**

Phase 2B spec line 48: *"`featureFlags.plan_view_v2` is a per-project
boolean in the project manifest. Toggling it to false switches the
editor to PRYZM 1's plan view for that project. This flag is active
from S31 D1."*

**Why HIGH not CRITICAL**: in a fresh PRYZM 2 codebase with no PRYZM 1
plan view to fall back to (legacy `apps/editor` deletion is S61 / Phase
3C), the absence of fallback wiring may be defensible. But the spec
explicitly framed this as the safety net for the highest-risk
sub-project of the entire 36-month plan. The flag is documented as
"active from S31 D1" but a project carrying `plan_view_v2: false`
today gets the PRYZM 2 plan view anyway. The safety mechanism does
not exist.

**Compare** the same package's `legacy_vi_fallback` flag, which IS
actually consumed by `packages/visibility/src/runtime.ts` and switches
between `LEGACY_WAVE_CHAIN` and `DEFAULT_WAVE_CHAIN`. The
`plan_view_v2` flag has no equivalent consumer.

---

#### H-2. `pnpm bench yjs-collab` does not exist; M24 250 ms-p95 gate unmeasured

**Evidence**: `M24-beta.md` §2 lists `pnpm bench yjs-collab` as a TODO
gate ("≤ 250 ms broadcast lag p95 at 50 concurrent users"). `find apps/
bench -name '*yjs*'` returns nothing. The bench is not implemented.

**Why HIGH**: 250 ms p95 broadcast lag is the headline performance number
of Phase 2D. Without a measurement, "ships within 250 ms" is a hope.
This is the same pattern as Phase 1's bundle-size DEFERRED — gate exists
in spec, script absent, claim therefore unverified.

---

#### H-3. `view-sync.ts` is a `ViewSyncBus` skeleton; renderer wiring deferred

**Evidence**: `packages/view-state/src/view-sync.ts` header: *"SCOPE
(skeleton; full feature S46) … At the closeout we ship the ViewSyncBus:
a pure publisher … The actual transport into the renderer (camera move,
selection paint) is plumbing that lives in each canvas host and is
wired in S46 D2."*

PHASE-2D-S46-AUDIT does **not** claim the renderer wiring landed; it
claims waves 1-5 (actually all 11) shipped. The view-sync renderer
plumbing remains a hole.

**Why HIGH**: multi-view sync is the Phase 2B headline UX feature
(plan-view selection ↔ 3D selection in lockstep). Without renderer
plumbing, the bus has nothing to broadcast to. The product feature
does not work end-to-end.

---

#### H-4. `bake-worker` debounce window — 250 ms not verified

**Evidence**: `[strategic ADR-010]` mandates 250 ms coalescing window.
Phase 2D spec line 50: *"`apps/bake-worker` debounce window pinned at
250 ms per [strategic ADR-010]"* (S43 deliverable). No `rg "250" apps/
bake-worker/` proof was performed during this audit.

**Why HIGH not CRITICAL**: defensible to leave at 500 ms in dev, but
the spec is explicit. Need a code check.

---

#### H-5. `audit-log-middleware` workflow still failing

**Evidence**: same as Phase 1 audit (`audit-log-middleware` failed
state in workflow status). Carry-over from W-11 in the Phase 1 close
plan. Phase-2 has not regressed this — it has not fixed it either.

---

#### H-6. ADR-0036 stale: claims waves 6-11 deferred when code shipped them

**Evidence**: ADR-0036 status: *"PARTIAL-RATIFIED — waves 1-5 shipped;
waves 6-11 bound to S49 / Phase 3A"*. Code reality:
`packages/visibility/src/waves/w01..w11` all exist; `__tests__/waves/
parity-w01..w11.test.ts` (some files) all run; `82/82 visibility tests
pass`.

**Why HIGH**: ADR vs code mismatch undermines the audit framework's own
trustworthiness. If ADR-0036 is wrong about what shipped, can ADR-0035
be trusted about what was deferred? Doc/code drift in the architectural
record is a tier-2 risk that compounds.

The fix is a one-line ADR amendment, but the precedent is the worry.

---

#### H-7. M24 beta report TODOs — none of the 7 named gates is currently green

**Evidence**: `M24-beta.md` §2 has 7 unchecked gates:
- [ ] `pnpm bench restore-verify` 7-night green streak
- [ ] `pnpm spec:audit-storage` green
- [ ] `pnpm bench yjs-collab` ≤ 250 ms p95
- [ ] AI cost dashboard reflects live `ai_usage`
- [ ] All `service_role` Supabase keys removed from production routes
- [ ] `node scripts/check-ai-host-lazy.mjs` green
- [ ] `vite build --report` confirms `AiHost.impl` in separate chunk

**Why HIGH (not CRITICAL)**: each gate is downstream of S43 D9 cutover.
If cutover lands, several gates become measurable in days. But today,
zero are measured — so the team's "100/100 closure" verdict assumes
infrastructure that does not exist.

---

### MEDIUM items

#### M-1. Section-cut producer not in `geometry-kernel/producers/`

Phase 2B spec (S35 Track A) called for `packages/geometry-kernel/
producers/section-cut.ts`. Implementation lives only in
`plugins/section-view/src/section-cut-producer.ts`. Wrong package, by
spec. Architecturally the math should be reusable from the geometry
kernel (e.g. by IFC export); embedded in a plugin it is unreachable
without circular dependency.

#### M-2. Sheets test failure transitive on plan-view

The sheets `__tests__/view-renderer.test.ts` failure roots in
`PlanViewCanvasHost`'s `@pryzm/scene-committer` import. Sheets did
nothing wrong. The fix for C-1 also fixes M-2.

#### M-3. Rooms has 9 handlers, spec says 8 (`+RecomputeRoomBoundary`)

Mirror of the Phase 1 wall-handler-count finding. Defensible; should be
recorded as an ADR-0022 amendment so the spec ↔ code alignment holds.

#### M-4. `view-chip.ts` named, spec says `peer-view-chip.ts`

Cosmetic naming deviation. One-line rename or one-line ADR amendment.

#### M-5. `plugins/visibility-intent/` directory absent — waves live in `packages/visibility/`

Phase 2D spec line 70: *"`plugins/visibility-intent/waves/{w01..w05}.ts`
literal preservation"*. Code path: `packages/visibility/src/waves/`.
The decision to keep visibility in a `package` rather than a `plugin`
is defensible (waves are pure functions, not L7 plugins) but the spec
says plugin. Either amend the spec or move the code. The code location
is arguably correct architecturally; the spec is arguably wrong.

#### M-6. `apps/ai-worker/` has no live BullMQ wiring

Spec (S47) calls for "BullMQ skeleton". Code ships `queue.ts` with
InMemoryQueue + DI seam for BullMQ. Real BullMQ adapter is bound to
S49+ when Redis lands. Honest deferral; flagged here for completeness.

#### M-7. `packages/ai-cost/` cannot be resolved by sibling test

The package exists but its `package.json` exports / build output
prevents `@pryzm/ai-cost` import resolution from `packages/ai-host/
__tests__/AiPlane.batch.test.ts`. A workspace-level config issue, fixable
in a one-line `package.json` `"exports"` field.

#### M-8. Active*Store extras not in spec

`ActiveSheetStore.ts` and `ActiveScheduleStore.ts` are over-spec adds
for runtime UI focus state. Reasonable, but should be documented in the
sheet/schedule ADRs.

#### M-9. Canonical "scope-creep" classification still missing

W-06 in the Phase-1 close plan called for KEEP/PARK/TRIM classification
of all packages and plugins. Phase 2 added 6 packages + 14 plugins; the
classification is now even more useful and remains undelivered.

#### M-10. The S38 "3 title-block templates" claim — not verified

PHASE-2C-AUDIT line for S38 says *"3 templates, scale labels, viewport
D&D"*. `plugins/sheets/src/title-block.ts` exists but template count not
verified in this audit.

---

### LOW items

#### L-1. `PROCESS-TRACKER` was stale — Phase 2A audit explicitly notes this

The Phase 2A audit's intro: *"It is run before Phase 2D entry to make
PROCESS-TRACKER §2A honest after the discovery (2026-04-28) that the row
was stale: every Phase 2A artifact is on disk and tested, but the
tracker still showed all six sprints as `[ ]`."* Self-acknowledged.
Process risk: tracker can drift again.

#### L-2. Demo recordings not done — 2A, 2B, 2C, 2D each name a screencast

None of the four sub-phase recordings is in the repo (no `docs/demos/
M15-2A.script.md` etc.). PHASE-2C-AUDIT § Deferred mentions *"the
recorded 8-min screencast"*. Same pattern as W-14 in the Phase-1 close
plan (founder rest week task).

#### L-3. ADR-039 referenced but not present

PHASE-2C-AUDIT references *"ADR-039 (raster path TBD pending true server
worker)"*. `ls docs/architecture/adr/` ends at 0037. ADR-039 is
referenced as the rationale for deferring `apps/export-worker` and does
not exist on disk.

#### L-4. ADR-040 referenced but not present

PHASE-2C-AUDIT line for S42: *"ADR-040, bench, OTel spans"*. Same
problem: ADR ends at 0037, no 0040 file present.

#### L-5. The "PARTIAL-RATIFIED 100/100" pattern conflates SHIPPED with CLOSED

The S44, S45, S46, S47, S35, S36 audits all use this pattern. It is
self-honest about the deferrals but mathematically unsound: a deferral
that blocks a downstream gate is not a closure of the gate, it is a
re-classification. Recommended scoring change: report `raw % shipped`
and `% closed iff dependencies land` as two separate columns. The
existing audit shape supports this (S44 explicitly shows 70/100 raw vs
100/100 closure).

#### L-6. `audits/` folder is split across two locations

* `docs/00_NEW_ARCHITECTURE/audits/` — Phase-1 audits, this audit
* `docs/00_NEW_ARCHITECTURE/phases/audits/` — Phase 2 sub-phase audits

Inconsistent layout; minor navigation friction. Pick one.

#### L-7. Visibility plugin vs visibility package — naming/architecture

Already covered as M-5. Architecturally fine; spec reference stale.

#### L-8. `packages/sync-client/src/__tests__/` empty — tests live one level up

`packages/sync-client/__tests__/` (workspace level). Trivial; cosmetic.

#### L-9. Sweeper does not broadcast `lock.released` over WebSocket

ADR-0035 §2.5 documents this as *"the sweeper-driven cleanup is bounded
above by the sweep interval (5 s) which the spec accepts as the
worst-case staleness for the badge UI"*. Honest deferral; flagged so
that beta-cohort feedback can confirm 5 s is tolerable.

---

## §4 Deferred-binding inventory + risk per binding

The team's audit pattern names every deferral with a binding event. This
table gives each binding a code-grounded risk score.

| ID | Item | Bound to | Audit row | Risk to M24 close |
|---|---|---|---|---|
| D1 | Supabase cutover (Replit-PG → Supabase) | S43 D9 (Supabase provisioning) | ADR-0035, M24 §3 | **HIGH** — the prerequisite for D2, D3, D4, D5, D6, H-1, H-7 |
| D2 | Soft-locks D5 deletions (DROP project_command_log etc.) | D1 + 14-day burn-in | ADR-0035 §2 | MEDIUM — irreversible; gating correctly implemented |
| D3 | Restore-verify 7-night green streak | D1 | ADR-0036, M24 §2 | MEDIUM — counter logic shipped, just needs nights to elapse |
| D4 | `pryzm.ai.cost.usd` Honeycomb metric | D1 (production OTel pipeline) | S44 audit E4 | LOW |
| D5 | `pnpm bench yjs-collab` | needs implementation, not just config | M24 §2 H-2 above | **HIGH** — bench script does not exist |
| D6 | `pnpm spec:audit-storage` | green if no rogue table | M24 §2 | LOW (gate exists) |
| D7 | AiPlane batch test green | needs `@pryzm/ai-cost` resolution fix | C-6 above | MEDIUM (1-line `package.json` fix) |
| D8 | `apps/ai-worker/` BullMQ live | S49+ when Redis lands | ADR-0037 | MEDIUM (acceptable for beta cohort) |
| D9 | Section view full feature | S37/S38 (already passed without continuation) | C-3 above | **HIGH** — the spec sub-phase that was supposed to fill section view ran on a different topic |
| D10 | `apps/export-worker/` | "ADR-039" (which does not exist on disk) | C-2, L-3 | **HIGH** — this is one of the M24 named infra items |
| D11 | `authz.can` middleware in sync-server | "Phase 3C" per sync-server header comment | C-4 | **HIGH** — the spec says S43 D7, not Phase 3C |
| D12 | Chaos test harness | not bound to anything | C-5 | **HIGH** — the spec self-cites this as the "sleep at night" gate |
| D13 | Plan-view fallback flag wiring | NOT bound; flag declared without consumer | H-1 | MEDIUM |
| D14 | `view-sync.ts` renderer plumbing | "S46 D2" per file comment; S46 audit does not claim it | H-3 | MEDIUM |

**Risk roll-up**: 6 items at HIGH risk, 5 at MEDIUM, 3 at LOW. Two of
the HIGH items (D11 authz, D12 chaos) are not bound to any future event
at all — they are silently dropped in the sync-server header comment
("Phase 3C") without an audit row reflecting the descope.

---

## §5 Risks NOT surfaced by the team's own audits

Items the team-side audits do not capture, but this audit does:

### R-1. ADR vs code drift — ADR-0036 stale

Already covered in H-6. Pattern: an ADR claims a deferral that the code
later closed. Under-scope claim is "less" damaging than over-scope
claim, but it still erodes audit-trail trustworthiness.

### R-2. "Closure 100/100" pattern double-counts

The S44 audit explicitly notes raw 70/100 + closure 100/100. Other
audits collapse this to a single 100/100. Reading PHASE-2D-S46-AUDIT
without reading the body, the score is 100. Reading the body, two
items are bound to S43 D9 cutover landing — i.e. blocked. A casual
reader (founder, investor) sees 100; a careful reader sees PARTIAL.
**Recommended fix**: every score should be `raw % / closure %` like S44.

### R-3. Test failures are not "skeletons"

PHASE-2D-S47-AUDIT credits S47 with 100/100 PARTIAL-RATIFIED based on
"package + skeleton + ADR + bound deferral". The skeleton has 9 failing
tests. There is no row for failing tests. The audit form needs a
"red-tests" column.

### R-4. Sync-server's own header comment contradicts the audit framework

`apps/sync-server/src/index.ts` says authz lands in "Phase 3C". Phase
2D spec says S43 D7. PHASE-2D-S43 audit (if there is one) does not
appear in the audit folder. The team-side accounting for this
contradiction is missing.

### R-5. `apps/export-worker/` referenced by other spec lines is missing

The spec files have multiple cross-references to export-worker that
become dangling once it is omitted. E.g. M24's PDF-export production
load assumption presumes server-side rasterisation.

### R-6. Plan-view test load failures could mask other broken paths

The 2 plan-view test files that fail to load do not reach their assertions.
Whatever assertions they would have made — possibly catching other
plan-view bugs — are silenced. The "passing 105 tests" statement is
true but incomplete.

### R-7. The `PARTIAL-RATIFIED` precedent is establishing — risks compounding

Once S35/S36 (2B), S44/S45/S46/S47 (2D) all close as PARTIAL-RATIFIED
100/100, the precedent is set for Phase 3 to do the same. If Phase 3A
ships waves 6-11 + AI subsystem + visibility waves under the same
pattern with the same deferral bindings to D1 (Supabase cutover), the
total deferral debt at GA could exceed the actual built surface.

### R-8. No security pass yet

Phase 2D ships multi-user with no authz, no secret-rotation pattern, no
input-validation matrix in `apps/sync-server/src/handlers/`. The
threat-modeling skill exists in this repo but has not been run against
sync-server. With 25 invited beta users and a public Supabase URL (when
that lands), this is a meaningful exposure.

### R-9. No load test against soft-locks

Soft-locks ship with PG implementation + sweeper + UI. There is no load
test proving the sweeper keeps up under N peers × M elements × T churn.
The 5-second sweep interval is a guess; without measurement, the badge
staleness ceiling is hypothetical.

### R-10. AiHost.impl loaded chunk size unmeasured

ADR-0014 / ADR-0037 K3-A gate: `AiHost.impl` must be a separate Vite
chunk. The static linter `check-ai-host-lazy.mjs` is referenced but
its existence not verified during this audit. Even if it exists, the
chunk-size threshold is not reported anywhere.

---

## §6 Sub-phase scorecard — code-grounded vs team self-grade

### Phase 2A — Non-element families (M13–M15 / S25–S30)

| Exit criterion | Spec | Code state | Score |
|---|---|---|---|
| 6 new families with handlers + producers + parity | 6 | 6 | 100 |
| Plan-view skeleton | yes | yes (17 files) | 100 |
| `edge-projection.ts` + `poche.ts` pure | yes | yes, 34 + 18 tests green | 100 |
| `expr-eval` light expressions | yes | yes | 100 |
| ADRs 0022/0027/0028/0029 merged | 4 | 4 | 100 |
| Project hub | yes | yes | 100 |
| 2A demo recording | yes | NO | 80 (process) |
| `apps/bench/reports/M15-2A-baseline.md` | yes | yes | 100 |
| 2A bench gates green | yes | yes per M15 | 100 |
| Drawing-primitives MVP | yes | yes | 100 |
| `RecomputeRoomBoundary` over-spec | n/a | +1 handler | (mostly fine) 95 |
| **Sub-phase score** | — | — | **96 / 100** |

### Phase 2B — Plan view (M16–M18 / S31–S36)

| Exit criterion | Spec | Code state | Score |
|---|---|---|---|
| Plan-view canvas host + dirty-flag rendering | yes | yes | 100 |
| Plan-view + SVP parity (Contract 44 G1–G10) | 10 gaps closed | claimed closed; not re-verified here | 90 |
| Annotations + dimensions in plan view | yes | yes | 100 |
| Visibility-Intent waves 3-4 (S34) | yes | yes (over-delivered to 11) | 100 |
| Wave 5 + visual-diff (S35) | full | "skeleton + harness + ADR" — Playwright PNG promotion deferred | 60 |
| Multi-view sync (S36) | full | ViewSyncBus skeleton; renderer plumbing not wired | 50 |
| Section-view canvas-host + 6 handlers + renderer | full | **3-file shell, 0 handlers, renderCount only** | **20** |
| `featureFlags.plan_view_v2` runtime gate | active S31 D1 | schema-only, no consumer | **20** |
| `PlanViewCanvasHost` no THREE/SceneCommitter | invariant | **violated** (causes test failures) | **0** |
| ADRs 0023/0025/0030 merged | 3 | 3 | 100 |
| 2B demo recording | yes | NO | 70 |
| `M18-2B.md` bench report | yes | NOT FOUND (`apps/bench/reports/M*` does not include it) | 50 |
| **Sub-phase score** | — | — | **78 / 100** (vs team 100/100 closure, 90/100 raw) |

### Phase 2C — Sheets, Schedules, Documentation (M19–M21 / S37–S42)

| Exit criterion | Spec | Code state | Score |
|---|---|---|---|
| `SheetStore` + 4 handlers (S37) | yes | yes (11 total handlers across S37–S40) | 100 |
| `sheet-editor-host.ts` (Canvas2D) | yes | yes | 100 |
| `viewport.ts` + `title-block.ts` (S38) | yes | yes (template count not verified) | 95 |
| 10 widget types (S39) | 10 | 10 | 100 |
| `widget-tool-palette.ts` | yes | yes | 100 |
| `apps/export-worker/` skeleton + PDF job (S40) | yes | **DOES NOT EXIST** | **0** |
| `book-exporter.ts` (in-process PDF) | spec wants worker | in-process only | (compensated) 60 |
| `ScheduleStore` + 6 handlers + formula DSL (S41) | yes | yes; 161/161 tests | 100 |
| Formula evaluator pure | yes | yes (AST cache) | 100 |
| Schedule view (table) | yes | yes | 100 |
| CSV / XLSX / PDF export (S42) | 3 | 3 | 100 |
| CSV import | yes | yes | 100 |
| Bench gates green | yes | yes (M21-2C — 156× / 8× / 53× under budget) | 100 |
| 2C demo recording | yes | NO | 70 |
| ADR-0032 merged | yes | yes | 100 |
| `view-renderer.test.ts` green | implicit | **fails on plan-view scene-committer import** | **70** |
| **Sub-phase score** | — | — | **88 / 100** |

### Phase 2D — Sync, awareness, beta (M22–M24 / S43–S48)

| Exit criterion | Spec | Code state | Score |
|---|---|---|---|
| `SyncClient` Yjs + provider + reconnect (S43) | yes | yes (73/73 tests) | 100 |
| `event-bridge.ts` bidirectional (S43) | yes | yes (16/16 tests across 2 files) | 100 |
| Chaos test harness (S43 D5–D6) | "100 random edits across 4 tabs converge in < 5s" | **DOES NOT EXIST** | **0** |
| Production cutover Replit-PG → Supabase (S43) | yes, 14-day burn-in | NOT LANDED — `SUPABASE_URL` unset | **0** |
| `authz.can` middleware in every gateway route (S43 D7) | every route | **NO authz code in sync-server** | **0** |
| Bake-worker debounce 250 ms (S43) | yes | unverified; spec demands check | 80 |
| Backup-verify nightly (S44) | yes | green-streak counter shipped; needs nights | 80 |
| `awareness.ts` + multiplayer plugin (S44) | yes | yes (24+5 tests; 4-file plugin) | 100 |
| Soft-locks server + client + UI (S45) | full | full (PG + InMemory + Sweeper + lock-ui) | 100 |
| D5 cutover deletions (S45) | yes | gated by checklist enforcer (correct) | 90 (deferred-correct) |
| Visibility-Intent waves 1-5 parity (S46) | 5 waves | **11 waves shipped** (over-delivered) | 100 |
| Restore-verify streak gate (S46) | yes | gate logic shipped | 100 |
| `AiHost.ts` lazy bootstrap (S47) | yes | yes (lazy import + static guard) | 100 |
| `apps/ai-worker/` BullMQ skeleton (S47) | yes | InMemoryQueue + DI seam; live BullMQ deferred | 80 |
| `AiApprovalQueueStore` + UI (S47/S48) | yes | yes (vanilla DOM panel) | 100 |
| `plugins/ai-floorplan/` shell (S47) | yes | yes | 100 |
| Beta sign-up page + 25 invitations (S48) | yes | beta-signup orchestrator yes; 25 invitations not verified | 80 |
| AI-host workflow tests pass | implicit | **9 failing tests** | **0** |
| `pnpm bench yjs-collab` ≤ 250 ms p95 | M24 gate | **bench file does not exist** | **0** |
| `pnpm spec:audit-storage` | M24 gate | gate logic exists | 90 |
| OTel + Sentry-equivalent crash reporter | yes | crash-reporter package present | 90 |
| 2D demo recording | yes | NO | 70 |
| **Sub-phase score** | — | — | **70 / 100** (vs team 100/100 PARTIAL-RATIFIED) |

### Phase 2 overall: **(96 + 78 + 88 + 70) / 4 = 83 / 100 → grade B**

The team's average (mostly 100 PARTIAL-RATIFIED) is **17 points** higher
than the code-grounded measurement.

---

## §7 Recommendations — what to do next

### 7.1 Pre-M24 must-do (block beta launch)

1. **Implement `authz.can` middleware** in `apps/sync-server/src/`:
   * Add `apps/sync-server/src/authz/` directory with `Authz.ts`,
     `policies.ts`, `index.ts`.
   * Wire into every handler in `handlers/AppendEvent.ts`,
     `handlers/LoadEvents.ts`, plus the WebSocket `project.subscribe`
     route in `index.ts`.
   * Add per-route negative test (unauth user gets 403).
   * Reflect in `apps/sync-server/src/index.ts` header comment.
2. **Author chaos test harness** at `packages/sync-client/__tests__/
   chaos.test.ts`:
   * Spawn N MockProviders sharing a Y.Doc.
   * Generate seeded random edits (RandomEditGenerator).
   * Assert convergence in < 5 s.
   * Run in CI as part of the sync-client workflow.
3. **Land Supabase cutover** (S43 D9):
   * Provision Supabase project; set `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`.
   * Run the cutover-checklist enforcer end-to-end.
   * Start the 14-day burn-in clock.
4. **Implement `pnpm bench yjs-collab`** at
   `apps/bench/src/benches/yjs-collab.bench.ts`:
   * Spawn 50 SyncClients with MockProvider.
   * Measure broadcast lag p95 under sustained edit load.
   * Update M24 report with the measured number.
5. **Fix `@pryzm/ai-cost` module resolution**: add `"exports"` field
   to `packages/ai-cost/package.json` so sibling tests can import it.
   Re-run `packages/ai-host/__tests__/` — expect 0 failures.
6. **Fix `PlanViewCanvasHost` SceneCommitter import** (C-1):
   * Either remove the import (spec-correct) or amend ADR-0023 to
     allow it.
   * Re-run `plugins/plan-view/__tests__/` and `plugins/sheets/
     __tests__/view-renderer.test.ts` — expect green.

### 7.2 Pre-M24 should-do (degrade beta if missed)

7. **Wire `featureFlags.plan_view_v2`** at the editor's view-bootstrap:
   read from manifest, branch on the flag (no PRYZM 1 plan view to fall
   back to yet — this is fine, but the flag should be observable).
8. **Build `apps/export-worker/`** even as a thin BullMQ + headless +
   pdf-lib skeleton. The PDF generation can stay in-process for v0;
   the worker pattern is the bone-structure that the M24-launch press
   release will reference.
9. **Author the section-view continuation**: 6 handlers + renderer +
   `SectionStore` in `packages/stores/src/`. Move
   `section-cut-producer.ts` to `packages/geometry-kernel/src/producers/
   section-cut.ts` per spec.
10. **Implement `view-sync.ts` renderer plumbing**: the bus exists; wire
    each canvas host to subscribe + propagate camera/selection/cut-plane
    moves.

### 7.3 Process recommendations (compound payoff)

11. **Two-column scoring**: every per-sprint audit reports `raw % shipped
    / % closed iff dependencies land`. Eliminate "100/100 PARTIAL-
    RATIFIED" — use S44's honest 70/100 + 100/100 (closure) shape
    everywhere.
12. **Add a "red-tests" column** to every audit. Skeletons are fine;
    failing tests are not.
13. **ADR ↔ code drift check**: ADR-0036 (waves 1-5) vs code (waves 1-11).
    Add a CI check that ADR claims line up with directory contents.
14. **Authoring** missing ADRs 0038, 0039, 0040 referenced by the 2C
    audit (or remove the references).
15. **Add a `chaos.test.ts` template** to the project skeleton — every
    sub-phase that introduces concurrent semantics (sync, locks, AI
    workflow approval) gets one.

### 7.4 Long-term recommendations

16. **Threat-model `apps/sync-server/`** before M24 — see `.local/skills/
    threat_modeling`. With multi-user + soon-to-be-Supabase, this is
    overdue.
17. **Load-test soft-locks** at 50 concurrent peers × 100 elements ×
    10 Hz churn. Validate the 5-second sweep interval is sufficient.
18. **Measure the lazy AI chunk size** with `vite build --report` and
    bake it into a CI gate (parallel to the Phase-1 bundle-size gate).
19. **Resurrect `audit-log-middleware`** workflow — same as Phase 1
    W-11. Carry-over.
20. **Author the four sub-phase demo recordings** (2A, 2B, 2C, 2D)
    during the founder rest week.

---

## §8 Summary

Phase 2 substantively shipped:

* **6 new element families** complete with the Wall recipe.
* **A 17-file plan-view subsystem** (with 1 architectural breach).
* **A complete sheets + schedules pipeline** with formula DSL, 4
  export formats, and bench performance an order of magnitude under
  budget.
* **Yjs-based sync client + soft-locks + multiplayer plugin** with
  73/73 sync tests green and a real PostgreSQL soft-lock implementation.
* **All 11 visibility-intent waves** (over-delivered vs the 1-5 spec).
* **AI host with lazy-bootstrap pattern** and an approval-queue UI.

Phase 2 left open:

* **Authz middleware** in sync-server (sec/data-integrity hole).
* **Chaos test harness** (the named CRDT correctness gate).
* **Supabase cutover** (the S43 D9 binding event for 6+ downstream items).
* **`apps/export-worker/`** (the named M24 infra item).
* **Section view** (claimed functional in M24 gate; actually a 60-LOC shell).
* **Plan-view safety toggle** (`plan_view_v2` flag with no consumer).
* **Plan-view boundary breach** (SceneCommitter import in `PlanViewCanvasHost`).
* **`pnpm bench yjs-collab`** (the named 250 ms p95 gate, no script).
* **9 failing AI-host tests** + module-resolution failure for `@pryzm/ai-cost`.
* **2 failing plan-view test suites** (cascade from the boundary breach).

The team's per-sprint audits are self-honest about the deferrals. The
score column conflates "shipped a skeleton + bound the deferral" with
"closed the gate." The honest two-column shape (raw / closure) used in
the S44 audit should be the standard.

If the 6 must-do items in §7.1 are completed, Phase 2 closes at code-
grounded **A− (90/100)** with the two architectural breaches (C-1
boundary, C-3 section view) being the only remaining items below
spec — both of which can be amended-via-ADR or filled in Phase 3A
without blocking the M24 beta.

— end —
