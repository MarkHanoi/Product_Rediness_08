# 11 — Package Population Gap & Extended Waves 8–20 (CONSOLIDATED MASTER PLAN)

> **Stamp**: 2026-04-30 PM-late · **Status**: NORMATIVE — this is the SINGLE SOURCE OF TRUTH for getting from today (Wave 7 close, week 20) to FULL Phase-1/2/3-consumption day-1 (Wave 20 close, week 74). Sections §0.5, §0.6, §0.7 below are preserved as historical record of the four daily corrections. **§0.0 (next) is the canonical clean plan.** When §0.0 conflicts with §0.5/§0.6/§0.7, **§0.0 wins.**
> **Anchored to**: `../03-CURRENT-STATE.md §1` (live verifiers) + `§14` (Round-3 deep audit) + `§15` (Round-4 deep audit) + `§15.16` (S98-WIRE full 54-package inventory), `../02-ARCHITECTURE.md §1` (layer table), `../reference/specs/SPEC-01..SPEC-12` (40 specs), `../reference/adrs/ADR-001..ADR-024` (44 strategic ADRs), `../reference/phases/` (12 phase docs).
> **⚠ TRACKER RULE**: Editing this file — especially §0.0.4 wave ledger or §0.0.3 day-1 ladder — update `../00-PROCESS-TRACKER.md` §3/§4/§7 in the same commit.
> **Dependency map**: `16-PACKAGE-DEPENDENCY-MAP.md` — canonical inter-package import graph verified 2026-05-01. Supersedes any import-graph claims in §0.0 below whenever they conflict.
> **Package count correction (S98-WIRE, 2026-05-01)**: §0.0.2 table shows `packages/ count = 49`. Actual verified count is **54** — Wave 8 added `@pryzm/snapping` (32 LOC) and `@pryzm/spatial-index` (88 LOC); the deep-audit uncovered 3 additional packages that the original count missed (`@pryzm/legacy-shim`, `@pryzm/render-runtime`, `@pryzm/ai-cost`). The §0.0.2 table number is historically accurate for Wave 7 close; the authoritative current count is in `03-CURRENT-STATE.md §15.16`.
> **Authority**: this file owns the answer to "what closes the gap from week-20 structural day-1 to week-74 fully-Phase-consumed day-1, what the founder is actually asking when they ask 'is the plan covering everything'".

---

## §0.0 — MASTER IMPLEMENTATION PLAN (consolidated 2026-04-30 PM-late after FOUR rounds of brutal audit)

### §0.0.1 — What this section is

This §0.0 is the **clean, accurate, super-detailed implementation plan** that consolidates all four daily audit rounds (morning inventory, PM `packages/elements` correction, PM-late Round-2 commandBus consumption, PM-late Round-3 full-scope coverage, PM-late Round-4 final verification) into one canonical forward-looking schedule. It supersedes the running corrections in §0.5/§0.6/§0.7 below. Those sections remain for archaeological honesty — to show how the plan evolved as each round of brutal questioning surfaced gaps that the prior rounds had missed.

The plan is **one normative table per concern**, with no overlapping numbering, no aspirational language, no "paper done" answers. Every wave names its sprints, its weeks, its exact deliverables, its exact verifier shell command, and the dependencies that gate it.

### §0.0.2 — Where we are today (Wave 7 close, week 20 of project, 2026-04-30)

**Brutal ground truth in measured numbers** (every number is a measured `rg`/`wc`/`ls` output from this PM):

| Dimension | Number | What it means |
|---|---:|---|
| `src/` total LOC | 391,598 | PRYZM 1 monolith — STILL THE LIVE EDITOR via `src/main.ts` |
| `packages/` count | 49 | L0-L6 architecture |
| `plugins/` count | 46 | L7 plugin tree (target = ~50) |
| `apps/` count | 12 | All have package.json + non-empty src; component-editor (52 files), bench (60), sync-server (27), editor (17) are substantial |
| TypeScript compile errors | **0** | ✅ codebase is clean compile (Round-4) |
| `(window as any)` reaches in src/ | **2,070 across 315 files** | Round-4: drifted UP from morning's src/ui-only count of 773 |
| Total `as any` reaches in src/ | **3,448** | Typed-discipline gap |
| `runtime.*` facets defined | 25 | composeRuntime() return surface |
| `runtime.*` facets consumed by src/ | **11 of 25** | 14 unconsumed (commandBus, workspace, visibility, sync, geometry, renderer, physics, input, audit, cost, spend, schemas, commands, undoStack-deep) |
| Phase 1/2/3 deliverables built | **12** | All 4 phases produced code |
| Phase 1/2/3 deliverables CONSUMED end-to-end | **3 of 12** | Phase 1A 9-package build, Phase 1B wall recipe, Phase 1D bake-worker. The other 9 are built-but-unconsumed or critically-broken. |
| Plugins WIRED in `apps/editor/PluginRegistry.ts` | **18 of 46** | 28 plugins exist on disk but never load at runtime |
| Plugins LACKING the L7 recipe entirely | **5 substantial** | plan-view (3,546 LOC), bcf (1,448), ifc-export (1,972), multiplayer (640), cross (544) — Round-4 finding |
| Plugins consuming `@pryzm/plugin-sdk` | **0 of 46** | All 46 violate L7→L6 layering by importing command-bus/scene-committer/geometry-kernel directly (326 plugin importer files) |
| Packages with 0 tests | **11 of 49** | Including `runtime-composer` (THE composition root, 10 src files) — Round-4 |
| Stale-path citations across PRYZM3 docs (RESTRUCTURED 2026-04-30) | **0 reaches in canonical docs** (post-Wave-8-D1 codemod 2026-04-30 evening) | Round-5 measured 339 reaches across 87 doc files. Wave 8 D1 codemod (`scripts/codemod-restructure-2026-04-30.mjs`) rewrote 410 references across 152 files repo-wide using the OLD→NEW mapping at `../03-CURRENT-STATE.md §15.11.1`. CI gate `scripts/check-no-stale-paths.sh` enforces 0 reaches in canonical docs. 144 reaches preserved under `archive/` (deliberate historical record); 100 reaches preserved in 5 allowed meta-files (mapping table, verifier docs, the row that describes this rot). See Round-6 audit at `../03-CURRENT-STATE.md §15.12` for full details. |
| `src/` folders unmapped in plan | **21 of 35 folders, ≈24,000 LOC** | Round-3 finding |
| `apps/export-worker` (Phase 2C deliverable) | **DOES NOT EXIST** | Round-3 |
| End-to-end integration tests at `tests/integration/` | **3 EXIST** | Round-5 correction (Round-4 R4-6 was wrong): `all-12-elements.test.ts`, `headless-vs-browser-parity.test.ts`, `view-state-2a-readiness.test.ts`. Plus 102 other test files at `tests/` root including 10 contract-44 tests, family-load/marketplace, audit-log, browser-matrix, ga-gate, isolation guards. |
| `packages/` count breakdown | **49 total = 47 active + 2 empty shells** | Round-5: `release` and `bench-visual-diff` are 0-LOC placeholder shells (intentional Wave 13/17 scaffolds) |
| Phase doc count | **21** (5 PHASE-1 + 6 PHASE-2 + 9 PHASE-3 + 1 PHASE-4-POST-GA) | Round-5 correction (Round-4 said 12 — wrong; that was rg-affected count) |
| PHASE-4 BIM 2.0 (S73-S84, months 37-42) | **9 binding deliverables, 12 sprints, OUT-OF-SCOPE for Wave 8-20** | Round-5: CDE / Stakeholder Wedge / Sovereignty / Browser Security / COBie / Federated Clash / MEP / EIR-BEP-TIDP-MIDP / buildingSMART certification. End-week if extended = ~103 |
| Existing automation in `scripts/` | **19 scripts** | Round-5: `track-window-cast-count.mjs` is a working ratchet with `eslint-baseline-window-as-any.json`; `check-adr-code-drift.mjs`, `verify-bundle-size.mjs`, `cutover-checklist.mjs`, `scan-engine-bootstrap-importers.mjs` already exist — Wave 8-20 mostly RATCHETS existing tooling, doesn't build new |

### §0.0.3 — The day-1 ladder (four definitions of "day-1", in honest hardness order)

| Rung | Definition | Wave that closes it | End week | Calendar |
|---|---|---|---:|---|
| **Structural day-1** | Composition root + safety nets in place; `composeRuntime()` returns the runtime handle without throwing | Wave 7 | **20** | TODAY |
| **Functional day-1** | Architecture built end-to-end: every package has code, every plugin has a recipe, every src/ folder has a destination, the editor loads through the new boot path | Wave 15 | **54** | ~13 months |
| **Truly-wired day-1** | The 11 critical runtime.* facets the editor uses are reached via `runtime.*` (not via legacy globals): commandBus consumed (971 callsites migrated), boot unified (`src/main.ts` deletes its dual-boot, `EngineBootstrap` retired), 46 plugins auto-discovered (no hard-coded PluginRegistry list) | Wave 18 | **66** | ~16 months |
| **Fully Phase-1/2/3-consumed day-1** | All 12 phase deliverables actually consumed by the live editor: visibility/sync/geometry/renderer/audit/cost/spend/schemas all reach > 0 in src/, apps/export-worker created, 4 hardening packages wired, 46 plugins migrated to use `@pryzm/plugin-sdk` only | **Wave 20 ✅ CLOSED 2026-05-03** | **74** | **✅ REACHED** — all measurable gates pass; `src/` = 1 folder criterion deferred by user decision (see `19-WAVES-16-20-FULL-WIRE.md §5`) |

**The founder's literal question — "all aligned, perfect, all wired in UI" — maps to Wave 20 close (rung 4). Wave 20 ✅ CLOSED 2026-05-03. The `src/` = 1 folder condition is deferred by explicit user decision: `src/ui/` + `src/engine/` are kept as permanent top-level folders.**

### §0.0.4 — The complete Wave 8-20 ledger (13 waves, 28 sprints, 56 weeks past Wave 7)

| Wave | Name | Sprints | Weeks | Gates |
|---|---|---:|---:|---|
| **8** | Missing-package creation + citation-rot codemod (RESTRUCTURE-2026-04-30 cleanup) | S78-WIRE..S81-WIRE (3) | 21-23 | 5 NEW packages exist (physics-host, input-host, renderer-three, snapping, spatial-index); **all 344 stale-path reaches across 77 PRYZM3 doc files rewritten** per the OLD→NEW mapping table at `../03-CURRENT-STATE.md §15.11.1` (covers `00_NEW_ARCHITECTURE/`, `00_VISION/`, `01_ARCHITECTURE/`, `02_PLAN/` → `archive/pryzm3-internal/reference/{specs,adrs,phases,plan-detail,architecture-detail,status-detail}/` + archived audits/critical-review). New `scripts/codemod-restructure-2026-04-30.mjs` written + run + CI gate added. Replit.md historical sprint blocks (S44-S71) flagged as CORRECT-AS-RECORD (not rewritten). Wave 7 verifiers still green. |
| **9** | src/elements 85k strangler-fig deletion | S82..S85 (4) | 23-26 | 12 of 13 element-family src/ folders deleted (last is the lighting plugin's source); src/structural delete-only; src/furniture delete-only |
| **10** | src/core + src/commands + src/styles + src/services + src/migration | S86..S91 (6) | 27-32 | 4 src/ folder migrations complete; 264 commands → ~110 plugin handlers (per AS-IS-VS-TO-BE §4 verdicts: DROP 13, MERGE 47, PORT 169, LIFT 35); src/migration → packages/persistence-client/migrations |
| **11** | Small-folder migrations + cast deletion drive + recipe completion for 5 substantial plugins | S92..S97 (6) | 33-38 | 21 unmapped src/ folders all named (per §0.0.5 table); src/render vs src/rendering duplicate resolved; (window as any) reaches in src/ drops from 2,070 → < 200; recipe completion for plan-view/bcf/ifc-*/multiplayer/cross |
| **12** | Plugin compliance pass: 5 non-canonical handler folders → 5 plugins | S98..S100 (3) | 39-41 | All 46 plugins follow the canonical PHASE-1B recipe |
| **13** | NFT benches per package (incl. test coverage drive for 11 zero-test packages) | S101..S103 (3) | 42-44 | Every package has ≥ 3 tests including runtime-composer (currently 0) and runtime-undo-stack (currently 0); cold-boot < 800 ms per Vision §8 |
| **14** | 12 god-files split + 150 panels/toolbars consume runtime.* | S104..S106 (3) | 45-47 | No file > 1,500 LOC outside `src/main.ts`; UI panels read from runtime.workspace |
| **15** | Day-1 functional check + end-to-end integration test creation | S107 (1) + S107-WIRE (1) | 48-54 | `pnpm pryzm-3-functional-day-1` returns full green; new `apps/bench/integration/composeRuntime-click-to-render.test.ts` exists and passes |
| **16** | Runtime.* consumption codemod (commandBus + 13 other facets) | S108..S111-WIRE (4) | 55-62 | `runtime.commandBus` reaches in src/ goes from 0 → ≥ 800; 13 other unconsumed facets each reach > 0; legacy commandManager + 18 globals deleted |
| **17** | Boot unification (single boot path) | S112-WIRE (1) | 63-64 | `src/main.ts` boots ONLY via composeRuntime; EngineBootstrap.ts (2,066 LOC) deleted; the 5 dead apps/editor/src/bootstrap*.ts deleted; `mountEditor` is the single entry |
| **18** | Plugin auto-discovery + 28 unwired plugins activated | S113-WIRE (1) | 65-66 | apps/editor/PluginRegistry.ts replaced by manifest-driven discovery; all 46 plugins reach runtime.plugins; ifc-export/import/inspector/bcf/rhino-import/sheets/schedules/annotations/plan-view/section-view all loaded |
| **19** | Phase 2C+2D+3A+3D closeout | S114..S115-WIRE (2) | 67-70 | `apps/export-worker` created and runs PDF jobs (Phase 2C); runtime.sync wired (Phase 2D); runtime.visibility wired (Phase 3A); 4 hardening packages wired (Phase 3D telemetry/crash-reporter/perf-budgets/wcag-audit); runtime.audit registered |
| **20** | Plugin-SDK migration codemod (46 plugins → @pryzm/plugin-sdk only) | S116..S117-WIRE (2) | 71-74 | **✅ CLOSED 2026-05-03** — zero codemod work required (Wave 12 completed the migration; 0 L0-L5 violations in `plugins/`; ESLint `no-direct-pryzm-in-plugins` at ERROR since Wave 12; all exit gates pass). Boolean #1 (`src/` = 1 folder) deferred by user decision 2026-05-03: `src/ui/` + `src/engine/` kept as permanent top-level folders. Boolean #7 (`plugin-sdk published`) deferred to Phase F. |

### §0.0.5 — The 21-folder src/ destination table (the EXHAUSTIVE coverage check)

Walking every src/ folder against the plan. **Every folder has a named destination.** No more "swept under small folders".

| src/ folder | LOC | Destination | Wave |
|---|---:|---|---|
| `src/elements` | 85,073 | `plugins/<elem>/` (already populated for 16 of 17 families); src/elements deletion via strangler-fig | 9 |
| `src/ui` | 99,389 | Distribute: panels → bind to `runtime.workspace`; god-files split per Wave 14 table; framework helpers → `packages/ui-base/` | 14 |
| `src/core` | 76,197 | `packages/{stores, scene-committer, frame-scheduler, persistence-client, command-bus, runtime-composer}/` | 10 |
| `src/commands` | 34,048 | `plugins/<elem>/handlers/<Verb><Element>.ts` (per AS-IS-VS-TO-BE: DROP 13 / MERGE 47 / PORT 169 / LIFT 35) | 10 |
| `src/styles` | 30,977 | `packages/family-runtime/` + `packages/family-instance/` + `plugins/<elem>/styles.ts` | 10 |
| `src/ai` | 14,987 | `packages/ai-host/` (currently 2,620 LOC, 0 importers) + `plugins/ai-{floorplan, generative, query, rules, voice}/` (currently 5 stubs at 401 LOC total) | 11 |
| `src/engine` | 12,036 | `apps/editor/src/main.ts` thin entry + `packages/runtime-composer/`; `EngineBootstrap.ts` (2,066 LOC) deleted | 17 |
| `src/tools` | 10,905 | `plugins/<elem>/tool.ts` per element + `packages/picking/` for shared tool-base | 11 |
| `src/export` | 6,636 | `plugins/{ifc-export, export-pdf, dxf}/` + `apps/export-worker/` (NEW, Phase 2C) | 19 |
| `src/import` | 4,294 | `plugins/{ifc-import, rhino-import, ifc-inspector}/` (already populated, just unwired) | 18 |
| `src/snapping` | 3,387 | NEW `packages/snapping/` | 8 (creation) + 11 (migration) |
| `src/rendering` | 2,585 | `packages/renderer/` + `packages/render-runtime/` (both built, 0 importers today) | 11 |
| `src/spatial` | 1,738 | NEW `packages/spatial-index/` | 8 (creation) + 11 (migration) |
| `src/constraints` | 1,089 | `packages/constraint-solver/` (built, 0 importers today) | 11 |
| `src/topology` | 909 | `packages/geometry-kernel/topology/` subdirectory | 11 |
| `src/monetization` | 604 | `packages/{ai-spend, beta-signup}/` split | 11 |
| `src/migration` | 604 | `packages/persistence-client/migrations/` | 10 |
| `src/utils` | 571 | Distribution audit: core utils → `packages/types-builtin/`; framework utils → `packages/ui-base/` | 11 |
| `src/generative` | 489 | `packages/ai-host/` | 11 |
| `src/collaboration` | 434 | `packages/sync-client/` | 11 |
| `src/physics` | 433 | NEW `packages/physics-host/` | 8 (creation) + 11 (migration) |
| `src/structural` | 375 | DELETE — `plugins/structural/` (468 LOC, ✅ wired) is canonical | 9 |
| `src/persistence` | 367 | `packages/persistence-client/` (5,107 LOC, 0 importers today) | 11 |
| `src/dev` | 243 | `apps/bench/` (60 src files, ✅ exists) | 11 |
| `src/render` | 225 | NEW `plugins/physics-overlay/` (single-file folder containing PhysicsOverlayRenderer.ts) — DISTINCT from src/rendering | 11 |
| `src/geospatial` | 202 | `plugins/geospatial/` (96 LOC stub today — promote to real plugin) | 11 |
| `src/cde` | 166 | `packages/sync-client/` | 11 |
| `src/types` | 164 | `packages/types-builtin/` (806 LOC, 0 importers today) | 11 |
| `src/portfolio` | 147 | `packages/persistence-client/portfolio/` | 11 |
| `src/visibility` | 106 | `packages/visibility/` (1,228 LOC, 0 importers today) | 11 |
| `src/furniture` | 78 | DELETE — `plugins/furniture/` (1,165 LOC, ✅ wired) is canonical | 9 |
| `src/features` | 67 | `packages/feature-flags/` (293 LOC, 0 importers today) | 11 |
| `src/api` | 63 | `packages/{api-spec, api-rbac}/` | 11 |
| `src/history` | 47 | `packages/runtime-undo-stack/` (188 LOC, 0 importers today) | 11 |

**Verdict**: 35 of 35 src/ folders mapped. 5 NEW packages must exist by end of Wave 8: `physics-host`, `input-host`, `renderer-three`, `snapping`, `spatial-index`.

### §0.0.6 — The 12-phase deliverable wireup matrix (the EXHAUSTIVE consumption check)

Every Phase 1A/1B/1C/1D/2A/2B/2C/2D/3A/3B/3C/3D deliverable, with status today and the wave that closes it.

| Phase | Deliverable | Today | Closes at |
|---|---|---|---|
| 1A | 9 foundation packages + apps/bench + apps/editor/bootstrap | All 9 packages BUILT ✅. Of 9: only `stores`, `scene-committer`, `frame-scheduler` heavily consumed; `command-bus`, `persistence-client`, `protocol`, `schemas` lightly consumed via runtime.*; `renderer`, `eslint-plugin-pryzm` 0 importers | Wave 16 (commandBus + 13 other facets codemod) |
| 1B | plugins/wall full canonical recipe + 9 core primitives | Wall ✅ (4,706 LOC, all 5 recipe pieces). 8 of 9 core primitives have full recipe (slab/door/window/curtain-wall/grid/column/beam/roof). src/elements/walls (9,197 LOC) STILL ALIVE — strangler-fig | Wave 9 (deletion) |
| 1C | 13 element-family plugins | 12 of 13 wired in PluginRegistry. **lighting (712 LOC, full recipe) NOT WIRED** | Wave 18 |
| 1D | apps/bake-worker + .pryzm bake pipeline | apps/bake-worker exists ✅ (10 src files). Consumption from editor not measured. | (assumed wired) |
| 2A | annotations + dimensions + rooms plugins | dimensions ✅ wired; rooms ✅ wired. **annotations (871 LOC, [.H.TI] partial recipe) NOT WIRED** | Wave 18 + Wave 11 (recipe completion) |
| 2B | plan-view + section-view + featureFlags.plan_view_v2 | **plan-view (3,546 LOC) NOT WIRED + LACKS RECIPE entirely**. **section-view (606 LOC, [.H...] partial recipe) NOT WIRED**. `packages/feature-flags` 0 importers. | Wave 11 (recipe completion) + Wave 18 (wireup) |
| 2C | sheets + schedules + apps/export-worker + formula evaluator | sheets (4,948 LOC, [.H..I] partial) NOT WIRED. schedules (2,717, [.H..I] partial) NOT WIRED. **apps/export-worker DOES NOT EXIST**. `packages/formula-library` exists. | Wave 19 |
| 2D | sync-client + awareness | `packages/sync-client` 1,313 LOC built ✅. **runtime.sync = 0 reaches**. apps/sync-server (27 src files) ✅ exists. | Wave 19 |
| 3A | visibility + AI plugins | `packages/visibility` 1,228 LOC built ✅. **runtime.visibility = 0 reaches**. **5 AI plugins are stubs** (401 LOC total, 0 handlers each). `packages/ai-host` 2,620 LOC built but 0 importers. | Wave 19 (visibility) + post-Wave-20 (AI plugin completion is vision work) |
| 3B | apps/component-editor + IFC plugins + family creator | apps/component-editor ✅ (52 src files). **5 IO plugins NOT WIRED**: ifc-export 1,972 LOC, ifc-import 546, ifc-inspector 386, bcf 1,448, rhino-import 389. `packages/family-runtime` 1,069 LOC built but 0 importers. | Wave 18 (wireup) + Wave 11 (recipe completion for bcf/ifc-export which have [.....]) |
| 3C | plugin-sdk + apps/marketplace-{api,web} | `packages/plugin-sdk` 2,067 LOC built ✅. apps/marketplace-api ✅. apps/marketplace-web ✅. **CRITICAL: 0 plugin importers — all 46 plugins violate L7→L6 layering** | Wave 20 |
| 3D | telemetry + crash-reporter + perf-budgets + wcag-audit | `packages/telemetry` 0 LOC empty stub. `crash-reporter` 594 LOC, 0 importers. `perf-budgets` 319 LOC, 0 importers. `wcag-audit` 351 LOC, 0 importers. | Wave 19 |

**Verdict**: 12 deliverables → 3 fully consumed today, 8 built-but-not-consumed, 1 critically broken (3C). All 12 reach FULL CONSUMPTION at Wave 20 close.

### §0.0.7 — The 25-runtime-facet consumption matrix

| Facet | Reaches in src/ today | Phase that built it | Wave that wires it |
|---|---:|---|---|
| `runtime.stores` | 201 | 1A stores | ✅ heavily consumed |
| `runtime.scene` | 149 | 1A scene-committer | ✅ heavily consumed |
| `runtime.tools` | 108 | 1A | ✅ heavily consumed |
| `runtime.persistence` | 74 | 1A persistence-client | ✅ moderately consumed |
| `runtime.viewRegistry` | 26 | 1A view-state | ✅ |
| `runtime.toasts` | 20 | 1A | ✅ |
| `runtime.picking` | 19 | 1A picking | ✅ |
| `runtime.plugins` | 16 | 1A plugin-sdk | ✅ |
| `runtime.ai` | 11 | 3A ai-host | ⚠ light — AI plugins are stubs |
| `runtime.selection` | 9 | 1A | ✅ |
| `runtime.undoStack` | 5 | 1A runtime-undo-stack | ⚠ very light |
| `runtime.events` | 3 | 1A event-bus | ⚠ very light |
| `runtime.commandBus` | **0** | 1A command-bus | Wave 16 |
| `runtime.commands` | **0** | 1A | Wave 16 |
| `runtime.workspace` | **0** | 1A | Wave 16 (UI panel binding) |
| `runtime.visibility` | **0** | 3A visibility | Wave 19 |
| `runtime.sync` | **0** | 2D sync-client | Wave 19 |
| `runtime.geometry` | **0** | 1B geometry-kernel | Wave 16 |
| `runtime.renderer` | **0** | 1A renderer | Wave 11 (rendering migration) + Wave 16 (consumer codemod) |
| `runtime.physics` | **0** | (Wave 8 stub) | Wave 11 |
| `runtime.input` | **0** | (Wave 8 stub) | Wave 11 |
| `runtime.audit` | **0** | 3D wcag-audit | Wave 19 |
| `runtime.cost` | **0** | 3A ai-cost | Wave 16 |
| `runtime.spend` | **0** | 3A ai-spend | Wave 16 |
| `runtime.schemas` | **0** | 1A schemas | Wave 16 |

### §0.0.8 — The 46-plugin recipe-completeness matrix (Wave 12 Task 2 final — 2026-05-01)

Recipe = store + handlers + committer + tool + intent (the canonical PHASE-1B recipe).

**30 plugins with FULL recipe (S+H+T+I)** ✅ (Wave 12 Task 2 complete):
`wall, curtain-wall, slab, door, window, beam, ceiling, column, furniture, grid, handrail, lighting, plumbing, roof, rooms, stair, structural` (17 original)
`+ annotations, dimensions, schedules, sheets, section-view, selection, view, toy-cube` (8 former partials)
`+ plan-view, bcf, ifc-export, multiplayer, cross` (5 former lacking)

**0 plugins with PARTIAL recipe** ✅ (was 8 — all completed in Wave 12 Task 2)

**0 substantial plugins LACKING recipe** ✅ (was 5 — all completed in Wave 12 Task 2)

**16 intentional stub plugins** ⚠ (by design — no recipe required):
`ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice` (AI stubs — vision work post-Wave-20)
`dxf, export-pdf, floor, geospatial, levels, navigate, render, visibility-intent` (feature stubs)
`ifc-import, ifc-inspector, rhino-import` (IO plugins — recipe deferred to Wave 18)

**Wave 12 Task 2 verifier (2026-05-01)**:
```bash
for p in plugins/*/; do test -f $p/src/store.ts && test -d $p/src/handlers && test -f $p/src/tool.ts && test -f $p/src/intent.ts || echo INCOMPLETE: $p; done
# → prints exactly the 16 intentional stubs above, nothing else ✅
```

**Additional fixes landed in Task 2**:
- `packages/geometry-kernel/src/index.ts`: added `produceSectionCut` + 6 types from `./producers/section-cut.js` (W-09 export that was missing from kernel barrel)
- `packages/plugin-sdk/src/index.ts`: wired `produceSectionCut` + `AabbForSection` + `SectionCutResult` + `SectionEdge2D` + `SectionLine` re-exports from `@pryzm/geometry-kernel`
- `plugins/section-view/src/SectionViewCanvasHost.ts`: `target` made optional (guards headless test contexts)
- `plugins/section-view/package.json`: `@pryzm/plugin-sdk: workspace:*` added to `dependencies`
- All section-view tests: **21 / 21 passing** ✅; `pnpm tsc --noEmit` → 0 errors ✅; `npm run build` → ✓ built in 1m 4s ✅

### §0.0.9 — Four cross-cutting tracks added by Round-4 (no new waves, scope-expansions of existing)

| Track | Lives in wave | What it does |
|---|---|---|
| **T1 — Citation rot codemod (RESTRUCTURE-2026-04-30 cleanup)** | Wave 8 D1-D3 (2-3 days, was 1 day) | Codemod **344 stale-path reaches across 77 PRYZM3 doc files** (Round-5 correction — was understated at 51/12) per the OLD→NEW mapping in `../03-CURRENT-STATE.md §15.11.1`. Covers `00_NEW_ARCHITECTURE/{specs,adrs,phases,audits}/`, `00_VISION/`, `01_ARCHITECTURE/`, `02_PLAN/`, `CRITICAL-REVIEW-2026-04-27.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, `PROCESS-TRACKER.md`. Adds path-validity CI gate. Historical replit.md sprint blocks (S44-S71, ~75 occurrences) flagged as correct-as-record (not rewritten). |
| **T2 — Cast deletion drive (src/ wide, not just src/ui — RATCHETS EXISTING gate)** | Wave 11 (folded) | Reduce `(window as any)` reaches in src/ from 2,070 → < 200 (mostly `src/main.ts` boot path until Wave 17). Delete the equivalent `as any` count from 3,448 → < 500. **Uses existing `scripts/track-window-cast-count.mjs` + `eslint-baseline-window-as-any.json` ratchet** (Round-5 correction: this tooling already exists; T2 just ratchets the baseline DOWN sprint by sprint). |
| **T3 — Test coverage drive (zero-test packages)** | Wave 13 | Every active package gets ≥ 3 tests. The **9 currently-zero-test active packages** (Round-5 correction — `release` + `bench-visual-diff` are 0-LOC empty shells, excluded): `runtime-composer` (10 src, 845 LOC), `runtime-undo-stack` (2 src), `types-builtin` (8 src), `protocol` (1 src), `legacy-shim` (2 src) + 4 more. **runtime-composer is highest priority — central composition root, 845 LOC, 0 tests; FRONT-LOAD to Wave 8 D2 alongside T1 codemod (per R-19).** |
| **T4' — Enhance existing E2E integration test (Round-5 RETRACT — test already exists)** | Wave 18 | The end-to-end integration test ALREADY EXISTS at `tests/integration/all-12-elements.test.ts` (plus `headless-vs-browser-parity.test.ts` + `view-state-2a-readiness.test.ts`). Round-5 retracts the Round-4 T4 ("create new test") and replaces with **T4' = extend `all-12-elements.test.ts` to assert the 14 currently-unconsumed `runtime.*` facets after Wave 16+19 wireup**. Test becomes the explicit Wave 18 verifier. Saves ~1 sprint vs Round-4 estimate. |

### §0.0.10 — Per-wave detailed verifier shell command (the gate that proves the wave closed)

| Wave | Verifier command | Pass criterion |
|---|---|---|
| 8 | `ls packages/{physics-host,input-host,renderer-three,snapping,spatial-index}/package.json && for p in 00_NEW_ARCHITECTURE 00_VISION 01_ARCHITECTURE 02_PLAN; do rg -c "$p" docs/archive/pryzm3-internal/ \| awk -F: '{s+=$2} END {print "'$p'=", s+0}'; done` | **✅ VERIFIED 2026-05-01 (S98-WIRE):** All 5 package listings exist (`physics-host`, `input-host`, `renderer-three` — pre-existing; `snapping` + `spatial-index` — created S98-WIRE). Stale-path counts are non-zero but pre-existing in archive/meta files; canonical docs gate enforced separately by `scripts/check-no-stale-paths.sh`. `pnpm tsc --noEmit` clean; `vitest run` 1,428/1,428 ✅. (Round-5: was scoped to phases/ only — now scoped to entire `docs/archive/pryzm3-internal/` to catch all 344 stale-path reaches across 77 files) |
| 9 | `find src/elements -type d \| wc -l` | Returns ≤ 2 (only structural+furniture stubs left, which Wave 9 also deletes) |
| 10 | `find src/{core,commands,styles,services,migration} -type f -name '*.ts' \| wc -l` | Returns 0 |
| 11 | `for f in snapping rendering spatial constraints topology monetization utils generative collaboration physics persistence dev render geospatial cde types portfolio visibility features api history; do test -d src/$f && echo "STILL THERE: $f"; done` | Prints nothing |
| 11 (T2) | `rg -c '\(window as any\)' src --type ts \| awk -F: '{s+=$2} END {print s}'` | Returns < 200 |
| 12 | `for p in plugins/*/; do test -f $p/src/store.ts && test -d $p/src/handlers && test -f $p/src/tool.ts && test -f $p/src/intent.ts \|\| echo INCOMPLETE: $p; done` | Prints only intentional stubs |
| 13 | `for p in packages/*/; do test $(find $p -name '*.test.ts' \| wc -l) -ge 3 \|\| echo UNDERTESTED: $p; done` | Prints nothing |
| 14 | `find src/ apps/ packages/ plugins/ -name '*.ts' -size +60k` | Prints only `src/main.ts` (the live boot until Wave 17) |
| 15 | `pnpm vitest run tests/integration/all-12-elements tests/integration/headless-vs-browser-parity tests/integration/view-state-2a-readiness` | All 3 EXISTING integration tests pass against the Wave 15 functional architecture (Round-5 correction: tests already exist, no new test creation needed) |
| 16 | `rg -c 'runtime\.commandBus' src --type ts \| awk -F: '{s+=$2} END {print s}'` | Returns ≥ 800 (was 0) |
| 17 | `test ! -f src/engine/EngineBootstrap.ts && rg -c 'composeRuntime' src/main.ts` | Both true |
| 18 | `node -e "console.log(require('./apps/editor/dist/PluginRegistry.js').plugins.length)"` | Returns 46 |
| 19 | `ls apps/export-worker/package.json && rg -c 'runtime\.(sync\|visibility\|audit)' src --type ts` | exists; > 0 |
| 20 | `rg -c 'from .@pryzm/(command-bus\|scene-committer\|geometry-kernel\|stores\|schemas).' plugins --type ts \| awk -F: '{s+=$2} END {print s}'` | Returns 0 (was 326) |

### §0.0.11 — Risk register, consolidated R-1..R-17 (all four rounds)

R-1..R-11 from morning + PM + Round-2 (re: package population, plugin compliance, strangler-fig coverage, command consolidation, NFT benches, god-file split, day-1 functional check, commandBus codemod scale, boot unification surprise rollback, plugin auto-discovery security).

R-12 (Round-2): commandBus codemod is ≥ 971 callsites — could overrun Wave 16 by 1-2 sprints if AST migration hits edge cases.
R-13 (Round-2): boot unification deletes `EngineBootstrap` (2,066 LOC, 118 importers). Single-shot rollback risk.
R-14 (Round-2): Plugin auto-discovery exposes 28 unwired plugins to runtime — those plugins haven't been smoke-tested in months.
R-15 (Round-3): apps/export-worker creation requires `@pryzm/headless` to run under Node — second test of headless after apps/bake-worker.
R-16 (Round-3): Plugin-SDK codemod (Wave 20) must preserve type narrowness — no widening to `unknown`.
R-17 (Round-3): 3 NEW packages don't exist (snapping, spatial-index, expanded physics-host) — Wave 8 must extend creation to 5 packages, not 3.
**R-18 (Round-4)**: Recipe-completion for plan-view/bcf/ifc-export/multiplayer/cross is more than wireup — it's NEW CODE for stores + tools + intents per plugin. Wave 11 must absorb ~1,500-3,000 LOC of new plugin code per plugin, not just import-rewriting.
**R-19 (Round-4)**: 11 zero-test packages including the central `runtime-composer` (845 LOC) means a regression in composeRuntime() during any wave will be invisible until manual smoke. Wave 13 test drive must be FRONT-LOADED (move runtime-composer test creation to Wave 8 D2 alongside citation-rot fix).
**R-20 (Round-4)**: Citation rot is 51 occurrences across 12 phase docs — when Wave 16+ engineers grep for SPEC-04 or strategic ADR-018 they'll find broken links. Codemod must run BEFORE Wave 9 starts (Wave 8 D1).

### §0.0.12 — The seven founder questions, FINAL answer (after all four rounds)

| # | Question | Answer |
|---|---|---|
| 1 | Are we aligned at end of Wave 7 (today)? | **NO** — only structural day-1 (rung 1 of 4). Architecture exists; runtime consumes 11 of 25 facets; 18 of 46 plugins wired; 6 of 12 phase deliverables built-but-not-consumed. |
| 2 | Will we be aligned at end of Wave 15? | **PARTIALLY** — functional day-1 (rung 2). Architecture built; src/ migrations done; recipes complete. But commandBus + 13 facets still unconsumed; boot still dual; 28 plugins still unwired. |
| 3 | Will we be aligned at end of Wave 18? | **MOSTLY** — truly-wired day-1 (rung 3). The 11 critical paths that the editor uses every day are reached via runtime.*. But Phase 2C/2D/3A/3D deliverables (sheets export, sync, visibility, hardening) still unconsumed; plugin-SDK boundary still violated. |
| 4 | Will we be aligned at end of Wave 20 (week 74, ~18 months)? | **YES** — fully Phase-1/2/3-consumed day-1 (rung 4). All 12 phase deliverables consumed end-to-end; all 35 src/ folders mapped + migrated; all 46 plugins use plugin-SDK only; ESLint enforces L7→L6 boundary. |
| 5 | Will the solution be perfect at Wave 20 close? | **YES, against the Vision §1-§17 NFT spec** — modulo the 5 AI plugins which are stubs by design (vision work post-Wave-20). |
| 6 | Are Phase 1/2/3 deliverables wired end-to-end at Wave 20? | **YES** — every Phase deliverable has a measured consumption count > 0 at the verifier in §0.0.10. |
| 7 | All wired in UI at Wave 20? | **YES** — the live editor (`apps/editor/src/main.ts`, post-Wave-17 unified boot) consumes everything via `composeRuntime() + auto-discovered plugins`. |

### §0.0.13 — What this plan does NOT cover (honest scope boundaries — Round-5 expanded)

1. **AI plugin completion** — 5 AI stubs (ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice) total 401 LOC. Their full recipes are vision work, not Wave 8-20 scope.
2. **Marketplace go-live** — apps/marketplace-{api,web} exist (5+4 src files); their production launch is post-Wave-20 commercial scope.
3. **PRYZM 1 deletion** — `src/main.ts` and the legacy boot via `?pryzm2=1` flag delete only after a beta cohort cycle past Wave 20 close. The strangler-fig gives both alive simultaneously through Wave 19; Wave 17+18 retire the legacy boot path; final src/main.ts deletion is post-Wave-20.
4. **Mobile / native shells** — out of Vision §1-§17 scope.
5. **Federation / multi-tenant** — covered by Phase 2D + 3C scope but full enterprise SSO/RBAC roll-out is post-Wave-20.
6. **Bundle-size NFT** — Wave 13 includes bundle-size benches; the actual compression to < 1.8 MB gzip per Vision §8 is a Wave 13 OUTCOME not a scope line item.
7. **PHASE-4 BIM 2.0 Contractual Closure (Round-5 explicit out-of-scope)** — `docs/archive/pryzm3-internal/reference/phases/PHASE-4-POST-GA/4-BIM2-CLOSURE.md` defines 9 binding deliverables across **12 sprints S73-S84, months 37-42**, anchored to SPECs 32-40 + strategic ADRs 031-038: CDE module / Stakeholder Review Wedge / Hybrid Data Sovereignty / Browser Security & Enterprise Hardening / COBie 2.4 Export / Federated Clash Detection / MEP Systems / EIR-BEP-TIDP-MIDP / buildingSMART IFC4 Certification. **Phase 4 exit gate = buildingSMART certification GREEN by S84** (without it, BIM 2.0 marketing positioning collapses). If the master plan is extended to cover Phase 4, end-week shifts from week 79 → ~103 (~24 months past today). **Wave 8-20 covers Phases 1-3 ONLY**; Phase 4 needs a future Wave 21-32 ledger. Recommended: open Wave 21-32 plan once Wave 20 close is < 6 months out.

### §0.0.14 — Cross-references (where to read more)

| Topic | Where to read |
|---|---|
| Live verifiers + ground truth measurements | `../03-CURRENT-STATE.md §1` |
| Round-2 commandBus consumption deep-dive | `../03-CURRENT-STATE.md §13` + this file §0.6 |
| Round-3 21-folder + 12-deliverable + 25-facet tables | `../03-CURRENT-STATE.md §14` + this file §0.7 |
| Round-4 final findings (TS=0, citations rotted, 5 plugins lack recipe, runtime-composer 0 tests) | `../03-CURRENT-STATE.md §15` + this file §0.0 |
| Per-wave detailed sprint plan (Waves 1-7, done) | files 02..07 in this folder |
| Discipline + DoD rules | `12-DISCIPLINE-AND-DOD.md` |
| Risk register R-1..R-11 | `13-RISK-REGISTER.md` |
| Verifier catalog (every shell command) | `14-VERIFIERS-CATALOG.md` + this file §0.0.10 |

---

## §0.0.15 — AS-IS vs TO-BE: L2 Command / Event Bus and batch element creation

### AS-IS

| Area | Current state |
|---|---|
| Command surface | 264 command classes remain in `src/commands/` across 30+ subdomains. |
| Handler shape | 187 handlers across 46 plugins already exist; the system still needs triage to the ~110-handler target. |
| Mutation discipline | Mixed: structured snapshots, ad-hoc mutation, partial patch use, and legacy direct writes still coexist. |
| Undo | Snapshot-heavy and memory-expensive in legacy paths; patch undo is not yet the universal contract. |
| Wire format | Internal command/event transport is not yet the single canonical MessagePack + ULID event stream. |
| Audit | Event provenance is incomplete; not every mutation is fully queryable in a single event log. |
| Cross-tab | Convergence is not yet guaranteed by one authoritative CRDT document across all flows. |
| Batch creation | Wall batch creation is command-driven, but geometry build still happens synchronously in the wall builder path; `SlabFragmentBuilder` has the queue/drain pattern, `WallFragmentBuilder` does not. |

### TO-BE

| Area | Target state |
|---|---|
| Command surface | ~110 handlers across ~25 plugin packages after DROP / MERGE / PORT / PLUGIN-LIFT triage. |
| Mutation discipline | Every handler uses `produceWithPatches`; forward + inverse patches are mandatory. |
| Undo | Patch-pair undo stack (`{ forward[], inverse[] }`) becomes the canonical mechanism and replaces snapshot restore costs. |
| Wire format | MessagePack-encoded events with ULIDs become the shared wire format for undo, persistence, sync, audit, and public WS API. |
| Audit | Every event carries `actorId`, `projectId`, `timestamp`, `clientId`, and is queryable from `event_log`. |
| Cross-tab | Yjs document is the source of truth; tabs converge deterministically. |
| CI gate | `tests/commands/affected-stores.test.ts` hard-fails any handler without `affectedStores`. |
| Batch creation | Batch element creation is a command-bus transaction with deferred geometry/registration work, not a long synchronous builder pass. |

### Gap analysis for batch element creation

Current wall creation already shows the intended shape:
- commands wrap slab loops in `batchCoordinator.runBatch(...)`;
- store mutations are batched;
- registrations are drained after geometry completes;
- the final sweep fires once.

But the geometry side is still uneven:
- `SlabFragmentBuilder` uses `getFrameScheduler()` and a per-frame drain queue;
- `WallFragmentBuilder` still builds synchronously inside the batch loop;
- that means wall batches can still create long main-thread blocks even when the command bus envelope is correct.

### Implementation plan

#### Wave L2.1 — command/event bus hardening
1. Freeze the command contract: every new handler must declare `affectedStores`.
2. Make `produceWithPatches` mandatory for all write handlers.
3. Move undo to patch pairs only.
4. Standardize event payloads on ULID + MessagePack.

#### Wave L2.2 — batch creation pipeline
1. Keep batch creation inside a command-bus transaction.
2. Split geometry build from registration flush.
3. Add a deferred build queue to `WallFragmentBuilder` matching slab scheduling.
4. Drain queued wall geometry on `getFrameScheduler()` `'pre-render'` ticks.
5. Call `signalBuildQueueDrained()` only after the geometry queue is empty.

#### Wave L2.3 — audit and convergence
1. Add event-log provenance fields to every emitted mutation.
2. Route cross-tab state through Yjs only.
3. Add CI coverage for `affectedStores`, patch emission, and forbidden direct mutation.
4. Retire legacy snapshot-only undo paths once patch parity is complete.

### Recommended order

1. Finish command-handler triage to the ~110 target.
2. Lock patch/undo/event format contracts.
3. Refactor wall batch geometry to use queued frame-drain builds.
4. Extend the existing batch verifier to cover large wall creation bursts.
5. Only then push more UI wiring onto the new bus surface.

---

## §0.5 — HONEST CORRECTION applied 2026-04-30 (same-day, post archive + Phase 1B/1C re-read)

**The first draft of this file (§0–§3 as originally written) carried a fundamental architectural error that the founder caught the same afternoon and demanded brutal honesty about. This section names the error and supersedes the wrong parts.**

### What I got wrong

| First-draft claim (WRONG) | Architectural ground truth (per AS-IS-VS-TO-BE §3+§4 and PHASE-1B/1C) |
|---|---|
| Element families migrate to `packages/elements/<family>/` (a new package namespace I proposed Wave 8 would create). | **Element families ARE L7 plugins, NOT L1 packages.** The destination is `plugins/<elem>/{store, handlers/, committer, tool, intent, errors}.ts` + the PURE half at `packages/geometry-kernel/producers/<elem>.ts` + the THREE-coupled commit dispatcher at `packages/scene-committer/`. **`packages/elements/` is not in the architecture — it never was.** |
| `src/commands/` (34k LOC, 265 files) → `packages/command-bus/handlers/` per file. | **264 commands → ~110 handlers across plugins** (per AS-IS-VS-TO-BE §4: DROP 13 / MERGE 47 / PORT 169 / LIFT 35). Each command lives at `plugins/<elem>/handlers/<Verb><Element>.ts`. `packages/command-bus/` stays small (the BUS infrastructure, ~900 LOC). It does NOT host the 265 handlers. |
| 33 destination packages need population over Waves 9–11. | The **plugin shells already exist and are populated** for 17 element families. The truly missing destinations are 4 packages (`physics-host`, `input-host`, `renderer-three`, `legacy-shim/migration`) + 6 stub plugins (5 AI + 1 element `floor`). |
| `packages/elements/`, `packages/physics-host/`, `packages/input-host/`, `packages/renderer-three/` are 4 missing destinations claimed in Wave 7. | Only **3 of those 4 are actually missing** (physics-host, input-host, renderer-three). `packages/elements/` is a destination **I invented** that the architecture never asked for. |
| Wave 9 spends 2 sprints migrating 85k LOC to 13 new element-family sub-packages. | Wave 9 spends those sprints on **strangler-fig deletion** of `src/elements/<family>/` once each `plugins/<elem>/` reaches importer-parity (it already does for 16 of 17). The "migration" is mostly **import-rewriting** of `src/ui/`, `src/commands/`, internal-`src/` callers — not LOC creation. |

### Per-plugin recipe-completeness ground truth (measured 2026-04-30)

The **17 of 18 element-family plugins** below have ALL FIVE recipe pieces (`store.ts` + `handlers/` ≥ 4 files + `committer/` + `tool.ts` + `intent.ts`) per the PHASE-1B canonical recipe:

| Plugin | LOC | Handlers | Recipe complete? | Spec'd src/ counterpart LOC | Coverage |
|---|---:|---:|:---:|---:|---:|
| `wall` | 4,175 | 15 | ✅ all five | `src/elements/walls/` 9,197 | 45 % (parity proven, deletion-ready after import-rewrite) |
| `curtain-wall` | 1,711 | 13 | ✅ | `src/elements/curtainwalls/` 4,781 | 36 % |
| `roof` | 1,226 | 11 | ✅ | `src/elements/roofs/` 2,095 | 59 % |
| `door` | 1,165 | 6 | ✅ | `src/elements/doors/` 2,362 | 49 % |
| `furniture` | 1,165 | 7 | ✅ | `src/elements/furniture/` 15,293 | 8 % (DROP/MERGE expected per triage) |
| `slab` | 1,123 | 8 | ✅ | `src/elements/slabs/` 5,403 | 21 % |
| `rooms` | 1,297 | 9 | ✅ | `src/elements/rooms/` 6,208 | 21 % |
| `window` | 944 | 5 | ✅ | `src/elements/windows/` 2,087 | 45 % |
| `stair` | 899 | 9 | ✅ | `src/elements/stairs/` 8,419 | 11 % |
| `structural` | 781 | 7 | ✅ | `src/elements/structural/` 666 | **117 % — already exceeds source** |
| `column` | 715 | 5 | ✅ | `src/elements/columns/` 1,673 | 43 % |
| `lighting` | 712 | 5 | ✅ | `src/elements/lighting/` 1,600 | 45 % |
| `grid` | 667 | 4 | ✅ | `src/elements/grids/` 133 | **501 % — already exceeds source** |
| `beam` | 660 | 5 | ✅ | `src/elements/beams/` 614 | **107 % — already exceeds source** |
| `handrail` | 641 | 6 | ✅ | `src/elements/handrails/` 754 | 85 % |
| `plumbing` | 602 | 4 | ✅ | `src/elements/plumbing/` 2,247 | 27 % |
| `ceiling` | 590 | 4 | ✅ | `src/elements/ceilings/` 2,713 | 22 % |
| **`floor` (THE ONE TRUE STUB)** | **26** | **0** | **❌ NONE** | `src/elements/floors/` 3,230 | **0.8 %** |

**Total element-family plugin handlers shipped = 123** across 17 spec-compliant plugins. (Spec target was ~110 across the same families. We are **slightly OVER target**, not under — meaning the triage backlog runs `DROP 13 / MERGE 47` on plugin handlers, not the other direction.)

The view/sheet/schedule plugins (different recipe — they own a packages/stores/ store rather than embedding one) are also substantially populated:

| Plugin | LOC | Handlers | Note |
|---|---:|---:|---|
| `sheets` | 4,841 | 11 | Uses `packages/stores/SheetStore.ts` + `TitleBlockStore.ts` per spec |
| `plan-view` | 3,614 | 0 | Renderer-heavy plugin; commands handled at intent layer |
| `schedules` | 2,709 | 6 | Uses `packages/stores/ScheduleStore.ts` |
| `bcf` | 1,439 | 0 | Interop plugin |
| `annotations` | 863 | 8 | Uses `packages/stores/AnnotationStore.ts` |
| `dimensions` | 851 | 6 | Uses `packages/stores/DimensionStore.ts` |
| `section-view` | 598 | 6 | Uses `packages/stores/SectionStore.ts` |

### The REAL gap (not the imagined one)

After this correction, the actual remaining work is **~3× smaller** than the first draft estimated:

1. **1 stub element-family plugin** (`floor` 26 LOC) needs the recipe lifted from `src/elements/floors/` (3,230 LOC). **~2 engineer-days.**
2. **5 AI plugin stubs** (`ai-floorplan` 218, `ai-generative` 48, `ai-query` 51, `ai-rules` 39, `ai-voice` 45 = 401 LOC total) need the spec'd LIFT of 18 AI commands from `src/ai/` (14,987 LOC). The destinations `apps/ai-worker/` (3,444 LOC), `packages/ai-host/` (2,620 LOC), `packages/ai-cost/` (571 LOC), `packages/ai-spend/` (432 LOC) **already exist and are partially populated**. The migration is real but the destinations are real too.
3. **6 interop/IO stub plugins** (`dxf` 27, `export-pdf` 27, `geospatial` 27, `navigate` 28, `render` 27, `visibility-intent` 55 LOC) need real implementations. Most have spec'd LIFT counts of 3–4 commands each.
4. **3 (not 4) actually-missing packages**: `physics-host`, `input-host`, `renderer-three`. (`packages/elements/` is **NOT** missing — it was never supposed to exist.)
5. **3 empty packages** to populate: `bench-visual-diff`, `eslint-plugin-pryzm`, `release`.
6. **Strangler-fig deletion** of `src/elements/`, `src/commands/`, `src/core/`, `src/styles/`, etc. — not LOC creation, but **import-rewriting** at the ~280 callsites in `src/ui/` and ~265 callsites in `src/commands/`. Once every importer points to `@pryzm/<plugin>` instead of relative `../elements/<family>/`, the legacy folder is delete-safe.
7. **Plugin handler triage** (the OPPOSITE of what I claimed): there are **187 handlers across 46 plugins**; the AS-IS-VS-TO-BE §4 spec target is **~110**. We need to **DROP 13 / MERGE 47** existing handlers (the very triage the AS-IS-VS-TO-BE prescribed), not create new ones.

### What this means for Waves 8–15 calendar

The original 14-month / +40-week extension was based on the inflated gap. With the truthful gap:

| Original Wave 8–15 estimate | Corrected estimate |
|---|---|
| Wave 8 (creates `packages/elements/` + 13 sub-packages) | **DELETED**. The package namespace doesn't exist in the architecture. Wave 8 just creates the 3 truly missing packages (`physics-host`, `input-host`, `renderer-three`) + populates 3 empty packages. **1 sprint, not 1.** |
| Wave 9 (2 sprints to migrate 85k `src/elements/` LOC) | **2 sprints become 1 sprint** for `floor` plugin completion + strangler-fig deletion of 16 of 17 already-parity element families. The 85k LOC isn't migrated; it's **deleted** once importers are rewritten. |
| Wave 10 (3 sprints for `src/core/` 76k + `src/commands/` 34k + `src/styles/` 31k) | **2 sprints**. `src/commands/` 34k is mostly DELETED (the 187 handlers in plugins already cover the surface; triage cuts to ~110). `src/styles/` 31k is largely already in `packages/family-runtime/` or the per-family schemas. `src/core/` 76k is the real work — still ~2 sprints of import-rewriting + strangler-fig deletion. |
| Wave 11 (3 sprints AI + tools + renderer + import/export) | **2 sprints**. AI destinations (apps/ai-worker, ai-host, ai-cost, ai-spend) all exist. Tools migration to `packages/input-host/tools/` is the only real LOC creation. THREE-confinement to `packages/renderer-three/` is the real architectural work. |
| Wave 12 (3 sprints — 46 plugins to L6-only) | **3 sprints stays** — this work doesn't shrink. |
| Wave 13 (3 sprints — 17 NFTs) | **3 sprints stays**. |
| Wave 14 (3 sprints — final UI decomposition) | **3 sprints stays**. |
| Wave 15 (2 sprints — final cleanup) | **2 sprints stays**. |
| **Original total** | **+22 sprints / +40 weeks** |
| **Corrected total** | **+17 sprints / +34 weeks** (~8 months past Wave 7, not ~10) |

**Functional day-1 lands at week ~54, not week 60.**

### What stands from the first draft

- §1 (the honest "would Wave 7 close = perfect?") — **STANDS**. The answer is still NO; the structural-vs-functional distinction is still right.
- §2's measurement of `src/` LOC by folder — **STANDS** (the numbers are correct).
- §2's "destination LOC today" column — **WRONG for 13 of 35 rows** (where the destination was named as `packages/elements-*` or as `packages/command-bus/handlers/` for 34k LOC). **See §2-CORRECTED below.**
- §3's wave structure — **WRONG on Wave 8 (deleted), Wave 9 (1 sprint not 2), Waves 10–11 (down 1 sprint each)**. See §3-CORRECTED and **§3-CORRECTED-ROUND-2 (below)** for the additional Waves 16–18.
- §4 calendar grammar — **STANDS**, but functional day-1 moves from week 60 to week 54 — and **truly-wired day-1 to week 66** (Round-2 finding §0.6 below).
- §5 residual gaps after Wave 15 — **STANDS**.
- §6 three new discipline rules — **STANDS** (still useful: destination-readiness, no-new-src-folders, LOC-parity).
- §7 risk register — **STANDS** + 3 new entries from Round-2 (§0.6).

The wrong parts below are left in place (struck through in spirit, not literally edited out, per Rule 1's "no rogue files" intent — the canonical doc shows its own correction history) so that future readers can see the architectural error and the recovery.

---

## §0.7 — ROUND-3 full-scope coverage + Phase-deliverable wireup audit (added 2026-04-30 PM-late, after THIRD founder demand)

> Round-2 fixed commandBus consumption. Round-3 widens the lens to **(a) every src/ folder vs the plan and (b) every Phase 1/2/3 deliverable's consumption status**. Five new gap categories surface. Full Round-3 analysis lives in `../03-CURRENT-STATE.md §14`. This section captures plan-forward implications: Wave 16 scope expansion (+1 sprint) + NEW Wave 19 + NEW Wave 20 = +5 sprints / +10 weeks beyond Wave 18.

### The five Round-3 findings that change the plan

1. **21 of 35 src/ folders are UNMAPPED in the plan.** 24,000 LOC across `src/{snapping, rendering, spatial, constraints, topology, monetization, migration, utils, generative, collaboration, physics, persistence, dev, geospatial, cde, types, portfolio, visibility, features, api, history}` are implicitly swept under "small folders in Wave 11" with no destination named. Most map to existing 0-importer packages. Three need NEW packages: `packages/snapping/`, `packages/spatial-index/`, expanded `packages/physics-host/`. **Full destination table in `../03-CURRENT-STATE.md §14.1`.**
2. **6 of 12 Phase 1/2/3 deliverables are built-but-not-consumed.** Phase 2B plan-view (3,614 LOC NOT WIRED), Phase 2C sheets+schedules (4,841 + 2,709 LOC NOT WIRED) AND `apps/export-worker` DOES NOT EXIST (Phase 2C app deliverable missing entirely), Phase 2D sync (`runtime.sync = 0` reaches), Phase 3A visibility (`runtime.visibility = 0` reaches; AI plugins are 5 stubs at 401 LOC), Phase 3B IFC plugins (5 NOT WIRED), Phase 3D 4 hardening packages (telemetry empty + crash-reporter/perf-budgets/wcag-audit all 0-importer everywhere). **`packages/plugin-sdk` has ZERO plugin importers** (CRITICAL — 46 plugins violate L7→L6 layering by importing command-bus/scene-committer/geometry-kernel DIRECTLY, bypassing the SDK).
3. **14 of 25 `runtime.*` facets unconsumed by src/.** runtime.{commandBus, commands, workspace, visibility, sync, geometry, renderer, physics, input, audit, cost, spend, schemas} all return 0 reaches when ripgrep'd against src/. Wave 16 only addresses commandBus (971 callsites); 13 other facets need parallel codemod tracks.
4. **`src/render` vs `src/rendering` duplicate-folder tripwire.** Two top-level folders look identical: `src/render/` (225 LOC, single file `PhysicsOverlayRenderer.ts`) and `src/rendering/` (2,585 LOC, the real renderer + pipeline). The morning's plan named one and ignored the other.
5. **apps/editor's direct package imports are TYPE-only and live only in 5 dead bootstrap variants.** The live `apps/editor/src/main.ts` + `PluginRegistry.ts` consume packages exclusively through `composeRuntime()`. The Phase 1 vision of "apps/editor as the thick consumer of packages" is abandoned today. Wave 17 must decide: revive the bootstrap pattern (thick apps/editor) OR formalize src/main.ts as live entry forever (thin apps/editor).

### §3-CORRECTED-ROUND-3 — Wave 16 scope expansion + NEW Waves 19 + 20

| Wave | Round-2 status | Round-3 change | Sprints | Weeks |
|---|---|---|---:|---:|
| Wave 9 | (covers src/elements 85k) | + explicit destination table for src/structural, src/furniture (delete-only) | unchanged | 23-26 |
| Wave 10 | (covers src/core, commands, styles, services) | + src/migration → packages/persistence-client/migrations | unchanged | 27-32 |
| Wave 11 | (covers src/ai, tools, render, import, export, small folders) | + explicit destinations for the 21 unmapped folders (§14.1 table). Resolve src/render vs src/rendering duplicate. Migrate src/physics → packages/physics-host. Promote src/geospatial → plugins/geospatial. Distribute src/utils across destinations. | unchanged | 33-38 |
| **Wave 16 SCOPE EXPANSION** | (commandBus codemod 3 sprints) | +1 sprint to ALSO migrate the 13 other unconsumed `runtime.*` facets (workspace, visibility, sync, geometry, renderer, physics, input, audit, cost, spend, schemas, commands, undoStack-deep) | 4 (was 3) | 55-62 (was 55-60) |
| **NEW Wave 19 — Phase 2C+2D+3A+3D closeout** | (did not exist) | Create `apps/export-worker` (Phase 2C deliverable missing). Wire runtime.sync from packages/sync-client. Wire runtime.visibility from packages/visibility. Wire 4 hardening packages (telemetry promote-from-stub + crash-reporter + perf-budgets + wcag-audit) into apps/editor; register runtime.audit. Boolean: `pnpm pryzm-3-phase-23-deliverables-consumed` returns full green. | 2 | 67-70 |
| **NEW Wave 20 — Plugin-SDK migration codemod (the 46-plugin layering fix)** | (did not exist) | Codemod every plugin's direct `from '@pryzm/command-bus'` / `'@pryzm/scene-committer'` / `'@pryzm/geometry-kernel'` import to `from '@pryzm/plugin-sdk'` re-exports. **326 plugin importer files** today bypass the SDK. Promote packages/plugin-sdk from passive type-package to canonical L7→L6 boundary. ESLint rule blocking direct L6 imports from `plugins/*/`. Boolean: 46 of 46 plugins use only @pryzm/plugin-sdk. | 2 | 71-74 |

**Revised TOTALS (after Round-3)**:

| Phase | Sprints past today | End week | Calendar |
|---|---:|---:|---|
| Original Wave 1-7 | (complete) | 20 | today |
| Wave 8-15 (PM-corrected) | +17 | 54 | ~13 months |
| Round-2 Wave 16-18 | +6 | 66 | ~16 months |
| **Round-3 Wave 16 expansion + Wave 19-20** | **+5** | **74** | **~18 months past today** |

### §0.7.1 — Day-1 ladder (Round-3 final)

- **Structural day-1** = Wave 7 close = today (week 20). Composition root + safety nets.
- **Functional day-1** = Wave 15 close = week 54. Architecture built end-to-end.
- **Truly-wired day-1 (Round-2)** = Wave 18 close = week 66. CommandBus consumed + boot unified + plugins auto-discovered.
- **Fully Phase-1/2/3-consumed day-1 (Round-3)** = Wave 20 close = week 74. All 12 phase deliverables actually consumed by the live editor, all 35 src/ folders explicitly mapped, plugin-SDK boundary enforced.

**The founder's literal question — "would everything be aligned at the end of the last wave? would the solution be perfect? all wired in the UI?" — maps to Wave 20 close, not Wave 18 and not Wave 15.**

### §0.7.2 — Three additional risk-register entries (R-15, R-16, R-17)

- **R-15 (Round-3)**: Wave 19's `apps/export-worker` creation requires lifting the `CanvasHost` and `SceneCommitter` for headless Node operation (per Phase 2C spec §0). This is the second time `@pryzm/headless` is tested in a new server context — first was apps/bake-worker in Phase 1D. If headless rendering breaks under Node 20+ changes, Wave 19 ships without PDF export.
- **R-16 (Round-3)**: Wave 20's plugin-SDK codemod must preserve type narrowness — today plugins import typed handler signatures directly from command-bus. The SDK re-exports must NOT widen types to `unknown`. Proof-by-construction: Wave 20 D1 must compile-test plugins/wall through the SDK shim before scaling to all 46.
- **R-17 (Round-3)**: the 21-folder destination table (§14.1) names 3 packages that don't exist (`packages/snapping`, `packages/spatial-index`, expanded `packages/physics-host`). Wave 8 (which creates 3 missing packages: physics-host, input-host, renderer-three) must extend to create these 3 too — otherwise Wave 11's per-folder migration has no destination ready.

---

## §0.6 — ROUND-2 deep audit (added 2026-04-30 PM, after second founder demand for re-walk)

> The §0.5 correction fixed the architectural error. **Round-2 went one level deeper and measured CONSUMPTION** — i.e. of the architecture that already exists in `packages/` + `plugins/`, how much is the live `src/` codebase actually using? The answer is **almost none of it**, and that gap was invisible to both prior audits.
>
> Full Round-2 analysis lives in `../03-CURRENT-STATE.md §13` (the live boot-path map, 971-callsite consumption gap, 28-unwired-plugins table, strangler-fig importer-count tables). This section captures the **plan-forward implications**: three additional waves (16–18) at +6 sprints / +12 weeks beyond Wave 15.

### The three Round-2 findings that change the plan

1. **Dual-boot still alive.** `src/main.ts` calls BOTH `composeRuntime()` (the new graph) AND `workspaceMount.ensure() → startEngine() → EngineBootstrap.boot()` (the legacy 2,066-LOC god file with 118 importers). Then it side-channel-injects the new runtime into 10+ legacy singletons via `panelManager.setRuntime(runtime)`, `UiPreferences.setRuntime(runtime)`, etc. Wave 7 D.4 promises to "DELETE in D.4" — but D.4 is unscheduled and the 118 importers are not deflected. **Needs Wave 17.**
2. **The new typed command-bus has ZERO consumers in `src/`.** `commandManager` (legacy, untyped, singleton) reaches in `src/` = **971**. `CommandManager` (any reach) = **392**. `commandBus` (the new typed bus from `packages/command-bus/`) reaches in `src/` = **0**. `runtime.commandBus.dispatch` reaches = **0**. **The architecture is BUILT but NOT CONSUMED.** Even after Waves 8–15 finish all migration, the UI still dispatches through the legacy bus. **Needs Wave 16 (the 971-callsite rewrite).**
3. **28 of 46 plugins are runtime-unregistered.** `apps/editor/src/PluginRegistry.ts` registers exactly 18 plugins (12 element-family + 5 non-canonical + 1 view). The other 28 — including the substantial ones `plan-view` (3,614 LOC), `sheets` (4,841 LOC, 11 handlers), `schedules` (2,709 LOC, 6 handlers), `annotations` (863 LOC, 8 handlers), `lighting` (712 LOC, 5 handlers, full recipe) — exist on disk but are invisible to the runtime. There is no auto-discovery; every plugin requires a manual import + array entry in PluginRegistry.ts. **Needs Wave 18.**

### §3-CORRECTED-ROUND-2 — Three new waves added beyond Wave 15

| Wave | Sprints | Weeks | What it actually does |
|---|---|---:|---|
| **Wave 16 — Command-bus consumption (the 971-callsite rewrite)** | S108-S110-WIRE | 55-60 (3 sprints) | Codemod every `commandManager.execute('X', ...)` callsite to `runtime.commandBus.dispatch({id: 'X', ...})`. Per-batch verification (~325 callsites/sprint). Delete legacy `CommandManager.ts` (392 reaches) at end of S110. **Boolean delta**: typed-command-coverage flips from 0 % to 100 % of UI dispatches. |
| **Wave 17 — Boot unification (delete EngineBootstrap dual-boot)** | S111-S112-WIRE | 61-64 (2 sprints) | Replace the 118 EngineBootstrap importers with new-runtime equivalents. Replace the 10+ post-hoc `setRuntime(runtime)` injections in `src/main.ts` with constructor injection through `composeRuntime`. Delete `EngineBootstrap.ts` (the 2,066 LOC god file, line item D.4). Promote `apps/editor/` to live entry OR delete the 4 unused bootstrap variants (today: `apps/editor/src/{bootstrap, bootstrap.data, bootstrap.everything, bootstrap.render, bootstrap.render.everything}.ts` are ALL dead; `mountEditor` and `apps/editor/src/main` have 0 callers). Run `pnpm pryzm-3-day-1-functional` — expects full green. **Boolean delta**: dual-boot flag flips OFF. |
| **Wave 18 — Plugin auto-discovery + unwired-plugin registration** | S113-WIRE | 65-66 (1 sprint) | Add a `pryzm` descriptor field to every `plugins/*/package.json` (storeKey, handlerSetFactory, intent-prefix). Generate `apps/editor/src/PluginRegistry.ts` from workspace scan at build time (vite plugin or `pnpm` postinstall). Wire the 5 substantial unwired plugins explicitly first (plan-view, sheets, schedules, annotations, lighting). The 23 stub/interop plugins follow the auto-discovery path once their handler sets exist. **Boolean delta**: plugin-runtime-coverage flips from 39 % (18/46) to 100 %. |

### Revised TOTAL plan beyond Wave 7

| Phase | Sprints | Weeks past Wave 7 close (week 20) | Calendar end |
|---|---:|---:|---|
| Original Wave 1-7 | (already complete) | week 0 | today |
| Morning's Wave 8-15, PM-corrected | +17 | week 54 | ~13 months past today |
| **Round-2 Wave 16-18 (NEW)** | **+6** | **week 66** | **~16 months past today, ~33 months past project start** |

### §0.6.1 — The seven founder questions, RE-ANSWERED with Round-2 evidence

| Question | Round-1 (morning) answer | Round-2 (PM) corrected answer |
|---|---|---|
| Aligned at end of Wave 15? | YES | **PARTIAL** — 971 commandManager callsites + dual-boot still alive. |
| Perfect at end of Wave 15? | YES | **NO** — apps/editor parallel-scaffold + plugin auto-discovery + 28 unwired plugins not addressed. |
| Ready to use in preview? | YES today | YES today (on the LEGACY boot path — EngineBootstrap god file is alive). |
| Everything wired in UI at Wave 14? | YES | **NO** — even after Wave 14 wires 150+ panels, dispatches still flow through legacy `commandManager`. |
| All bottlenecks resolved at Wave 15? | "12 of 16 worst files done by Wave 14" | **NO** — the dual-boot dependency on EngineBootstrap and the 971-callsite legacy bus are bigger bottlenecks than any single file. |
| All Phase 1/2/3 wired? | NO at Wave 7, YES at Wave 15 | **PARTIAL even at Wave 15** — Phase 1 handlers registered ✅, but UI dispatches through legacy `commandManager.execute('wall-create', ...)` not `runtime.commandBus`. End-to-end consumption not closed. |
| Core engine files (`src/engine/`) solved/replaced? | YES at Wave 7 (D.4 deletes EngineBootstrap) | **NO until Wave 17** — D.4 unscheduled; 118 importers undeflected; god file lives. |
| All wired in UI? | YES at Wave 14 | **YES at Wave 18** (Wave 14 wires panels to view-registry; Wave 16 rewrites command flow; Wave 17 unifies boot; Wave 18 wires the 28 missing plugins). |

**Functional day-1 = end of Wave 15 = week 54** (architecture built end-to-end).
**TRULY-WIRED day-1 = end of Wave 18 = week 66** (architecture built AND consumed AND boot-unified AND plugin-auto-discoverable).

The user's literal question maps to **Wave 18 close**, not Wave 15.

### §0.6.2 — Three new risks added to §7 register

- **R-12 (Round-2)**: codemod for the 971 `commandManager.execute(...)` callsites must handle the untyped → typed transition. Many legacy callsites pass `any`-typed payloads. Wave 16 needs a per-command-id audit of payload shape, then a typed payload migration. If skipped, Wave 16 ships with `as any` casts and the typed-command win is lost.
- **R-13 (Round-2)**: the apps/editor 5-bootstrap-variant cleanup (Wave 17) requires founder decision — promote `apps/editor/` to live entry (vite root change + index.html move) OR demote it to a library subpath. Either choice is fine; non-decision is the risk.
- **R-14 (Round-2)**: plugin auto-discovery (Wave 18) introduces a build-time codegen step. If the codegen breaks, the editor boots with 0 plugins. Mitigation: keep the static PluginRegistry.ts as a fallback under a feature flag; auto-discovery output goes to a sibling file the build prefers.

---

---

## §0 — Why this file exists

`11-WAVE-7-CLEANUP-PHASE-F.md §2` (WS-A: Structural cleanup) contains a folder-deletion table that says:

| Order | Folder | Replaced by | LOC deleted |
|---:|---|---|---:|
| 1 | `src/elements/` | `packages/elements/` (already exists) | **~8,400** |
| ... | ... | ... | ... |
| 9-35 | the remaining 27 folders | various `packages/*/` and `apps/*/` | **~12,000 cumulative** |

The 2026-04-30 deep audit re-measured every line of every file and found:

| Claim in WS-A | Reality measured 2026-04-30 |
|---|---|
| `src/elements/` ≈ **8,400 LOC** | **85,073 LOC** (300 files) — **10.1× under-counted** |
| `packages/elements/` "already exists" | **Does not exist** (no folder, no package.json) |
| `src/services/persistence/` ≈ 3,200 LOC | `src/services/` total = 1,534 LOC (8 files); persistence subset is smaller |
| `src/data/` ≈ 2,100 LOC | **`src/data/` does not exist** (the data pipeline lives in `src/core/`) |
| `src/tools/` ≈ 5,800 LOC | **10,905 LOC** (31 files) — 1.9× under-counted |
| `src/physics/` ≈ 1,700 LOC | 433 LOC (2 files) — 4× over-counted |
| 9-35 remaining 27 folders ≈ **12,000 LOC** | **~290,000 LOC** across the remaining folders — **24× under-counted** |
| **Total `src/` LOC accounted for in WS-A** | **~33,500 LOC** of the **391,598 LOC** that actually exists (8.6 % coverage) |

**Net: 358,000 LOC of `src/` code is unaccounted for in the Wave 1–7 plan.** Booleans #1 and #5 cannot turn ✅ at end of Wave 7 because the destination packages either do not exist (`packages/elements/`) or are 200-3,000 LOC stubs of what needs to be a 10k-90k LOC implementation.

This file documents the gap and schedules the additional waves that close it. **Without this extension, `pnpm pryzm-3-day-1` at end of Wave 7 returns RED on `legacy_src_folders == 1`** because the 391k LOC under `src/` cannot be deleted while production still depends on it.

---

## §1 — Honest answer to "would Wave 7 close = perfect, aligned, fully wired?"

The user's literal question (2026-04-30): *"would everything be aligned at the end of the last wave? would the solution would be perfect? ready to use in preview, everything wired, all bottlenecks resolved? flowing really nice? all the job done in original phase 1, 2, 3 wired? all the core architecture, engine files in `src/` that they were collapsing the performance of the solution solved and replaced? all wired in the UI?"*

| Question | Honest answer at end of Wave 7 (S87-WIRE, week 20) |
|---|---|
| Aligned? | **PARTIALLY.** The composition root is `composeRuntime()`, the runtime is fully typed, the router is live, but `src/` still contains ~290k LOC of orphaned legacy because 33 of 35 destination packages are stubs. |
| Perfect? | **NO.** 33 packages need population (Waves 9–11). 41 of 46 plugins still violate L7 boundary (Wave 12). 17 NFT benches not yet running (Wave 13). |
| Ready to use in preview? | **YES** — preview already works on port 5000 today (the migration completed); Wave 7 close does not regress this. But the preview at end of Wave 7 still runs through ~290k LOC of `src/` legacy alongside `packages/`, with the same UX as today. **The user-visible improvements (faster cold boot, smaller bundle, reactive panels) land in Waves 9–13, not Wave 7.** |
| Everything wired? | **NO.** Wave 6 wires 39 panels + 30 toolbars (= ~69 wireup points). The actual UI surface (per the live audit) has ~140 panels in `src/ui/` (66 in `src/ui/property-panel/` alone) and ~80 toolbars/menus. Wave 6 wires roughly half. |
| All bottlenecks resolved? | **PARTIALLY.** EngineBootstrap (the god file) is dismantled in Waves 2–3. The 2,070 casts go to 0 in Waves 5+7. The 68 rAF owners go to 1 in Wave 7. **But the top 14 files in `src/ui/` (40,238 LOC across 14 files, biggest = PropertyPanel.ts at 3,347 LOC) are only partially decomposed — Wave 7 WS-B touches 5 of those 14 files.** The other 9 stay as monoliths until Wave 14. |
| Phase 1/2/3 wired? | **NO.** Phase 1's `packages/domain/` is named in the plan but the actual `packages/` listing has `schemas/` (3,016 LOC) and `stores/` (1,750 LOC) — together ~4,800 LOC. The Phase 1 spec implies a domain layer of ~30k+ LOC. Phase 2's `packages/drawing-engine/` is referenced but does not exist as a workspace. Phase 3's `packages/visibility/` exists at 1,228 LOC; spec implies ~5k+. |
| Core engine files solved? | **YES, the god file IS solved** — D.4.1–D.4.5 dismantle EngineBootstrap.ts in Waves 2–3. **NO, the broader engine surface is not** — `src/engine/subsystems/initUI.ts` (the 2,770 LOC initialization sequence) is referenced for deletion in Wave 7 WS-B but no engineer-day budget is allocated for the 80+ subsystem hooks it contains. |
| All wired in UI? | **NO.** Phase B (panels) and Phase C (toolbars) are real-bound in Wave 6, but the Phase D wiring of contextual-edit-bars, the Phase E wiring of inspectors with `runtime.workspace`, and the Phase G wiring of the data-workbench (1,810 LOC, 11 internal panels) are not in any wave. |

**End of Wave 7 = "PRYZM 3 day-1 STRUCTURAL"** — the composition root is right, the safety nets are on, the god file is gone. **End of Wave 15 (proposed in §3 below) = "PRYZM 3 day-1 FUNCTIONAL"** — `src/` is `ui legacy` for real, all bottlenecks resolved, all panels and toolbars bound, all 17 NFTs hit target, all 46 plugins on L7-only.

---

## §2 — Destination-package readiness audit (the precondition for any folder deletion)

For each of the 35 `src/<folder>` directories that Wave 7 WS-A claims to delete, the destination must be a real, working, well-typed package (not a stub). Audit measured 2026-04-30:

| `src/<folder>` | Live LOC | Wave 7 destination | Destination LOC today | Gap | Wave that populates |
|---|---:|---|---:|---:|:---:|
| `src/ui/` | 99,389 | **stays** (the white UI per Vision §1) | n/a | n/a | n/a |
| `src/elements/` | 85,073 | `packages/elements/` (claimed exists) | **0 — folder does not exist** | **85,073** | **Wave 9** (must create + populate) |
| `src/core/` | 76,197 | split across `stores`, `view-state`, `scene-committer`, `schemas`, `geometry-kernel`, `command-bus` | 1,750 + 565 + 750 + 3,016 + 12,260 + 905 = 19,246 | ~57k | **Wave 10** |
| `src/commands/` | 34,048 | `packages/command-bus/handlers/` | 905 | 33,143 | **Wave 10** |
| `src/styles/` | 30,977 | `packages/family-runtime/styles/` (BIM styles, not CSS) | 1,069 | 29,908 | **Wave 10** |
| `src/ai/` | 14,987 | `apps/ai-worker/` + `packages/ai-host/` + `packages/ai-cost/` + `packages/ai-spend/` | 0 + 2,620 + 571 + 432 = 3,623 | 11,364 | **Wave 11** |
| `src/engine/` | 12,036 | dismantled by D.4.1-D.4.5 (Waves 2-3) → fragments → `renderer`, `physics-host`, `input-host`, `picking`, `runtime-composer` | 1,815 + 0 + 0 + 919 + 2,688 = 5,422 | 6,614 | **Waves 2-3 + 11** |
| `src/tools/` | 10,905 | `packages/input-host/tools/` (D.4.4) | 0 — package does not exist | 10,905 | **Wave 11** (must create + populate) |
| `src/export/` | 6,636 | spread across `plugins/export-pdf`, `plugins/dxf`, `plugins/ifc-export`, `apps/headless`, `packages/file-format` | already in plugins (untracked LOC) | unknown | **Wave 11** |
| `src/import/` | 4,294 | `plugins/ifc-import`, `plugins/rhino-import`, `packages/file-format` | already in plugins | unknown | **Wave 11** |
| `src/snapping/` | 3,387 | `packages/picking/snapping/` | picking has 919 total | ~3,000 | **Wave 9** |
| `src/rendering/` | 2,585 | `packages/renderer/`, `packages/renderer-three/` | renderer 1,815, no `renderer-three` package | ~2,500 | **Wave 11** |
| `src/spatial/` | 1,738 | `packages/geometry-kernel/spatial/` | geometry-kernel has 12,260 — may already cover | ~0-1,500 | **Wave 9** |
| `src/services/` | 1,534 | split: `persistence-client`, `sync-client`, `apps/api-gateway` | 5,107 + 1,313 + (apps) | ~0 (likely covered) | **Wave 10** |
| `src/constraints/` | 1,089 | `packages/constraint-solver/` | 845 | ~250 | **Wave 9** |
| `src/topology/` | 909 | `packages/geometry-kernel/topology/` | (subset of 12,260) | ~0-700 | **Wave 9** |
| `src/migration/` | 604 | `packages/legacy-shim/migration/` | legacy-shim has 28 LOC | ~600 | **Wave 11** |
| `src/monetization/` | 604 | `apps/marketplace-api/billing/`, `packages/ai-spend/` | 432 + (apps) | ~200-500 | **Wave 12** |
| `src/utils/` | 571 | `packages/types-builtin/utils/` | 806 | ~0 | **Wave 11** |
| `src/generative/` | 489 | `plugins/ai-generative/`, `plugins/ai-floorplan/` | (in plugins, untracked) | unknown | **Wave 11** |
| `src/collaboration/` | 434 | `apps/sync-server/`, `packages/sync-client/` | 1,313 + (apps) | ~0 | **Wave 10** |
| `src/physics/` | 433 | `packages/physics-host/` (D.4.3) | 0 — package does not exist | 433 | **Wave 3** (creates) **+ Wave 11** (populates) |
| `src/persistence/` | 367 | `packages/persistence-client/` (D.4.2) | 5,107 — already covered | ~0 | **Wave 2** |
| `src/structural/` | 375 | `plugins/structural/` | (in plugins) | unknown | **Wave 11** |
| `src/dev/` | 243 | `tools/dev/` (gated `import.meta.env.DEV`) | 0 | 243 | **Wave 15** |
| `src/render/` | 225 | absorb into `packages/renderer/` | 1,815 | ~0 | **Wave 11** |
| `src/geospatial/` | 202 | `plugins/geospatial/` | (in plugins) | unknown | **Wave 11** |
| `src/types/` | 164 | `packages/types-builtin/` | 806 | ~0 | **Wave 11** |
| `src/cde/` | 166 | `packages/protocol/cde/` | 76 | ~150 | **Wave 11** |
| `src/portfolio/` | 147 | `packages/family-runtime/portfolio/` | 1,069 | ~150 | **Wave 11** |
| `src/visibility/` | 106 | `packages/visibility/` | 1,228 — already covered | ~0 | **Wave 11** |
| `src/furniture/` | 78 | `plugins/furniture/` | (in plugins) | ~0 | **Wave 11** |
| `src/features/` | 67 | `plugins/furniture/` | (in plugins) | ~0 | **Wave 11** |
| `src/api/` | 63 | `packages/protocol/` or `apps/api-gateway/` | 76 + (apps) | ~0 | **Wave 11** |
| `src/history/` | 47 | `packages/runtime-undo-stack/` | 188 | ~0 | **Wave 11** |
| `src/main.ts` | 332 | shrinks to ≤ 50 (Wave 4) | n/a | n/a | **Wave 4** |
| **TOTAL src/ LOC** | **391,598** | | **~85,000 LOC in destinations** | **~306,000 LOC to migrate** | |

**Take-away:** before any `src/<folder>` can be deleted (Wave 7 WS-A), the destination must reach functional parity. **Today, only 4 destinations (`persistence-client`, `sync-client`, `geometry-kernel`, `visibility`) have enough LOC to plausibly host the source folder.** The other 30+ need explicit population work, which is what Waves 9–11 schedule.

Additionally:
- **3 packages are completely empty**: `bench-visual-diff/` (0 files), `eslint-plugin-pryzm/` (0 files), `release/` (0 files).
- **2 destination packages do not exist**: `packages/elements/`, `packages/physics-host/`, `packages/input-host/`. (D.4.3 and D.4.4 in Wave 3 must create these.)
- **`packages/renderer-three/` does not exist** — referenced in the plan as the only THREE.js owner (P2), but today THREE imports happen in `packages/renderer/`, in `src/rendering/`, in `src/elements/`, in `plugins/*`.

---

## §3 — Extended Waves 8–15 (the work the original plan did not schedule)

Anchored to the same calendar grammar as Waves 1–7. Each wave has a single sprint name (S88-WIRE, S89-WIRE…), a sprint duration, an exit verifier, and a boolean delta. **All 8 new waves run after Wave 7 close (S87-WIRE = end of week 20).**

### Wave 8 — Destination Package Audit + Stub Creation (S88-WIRE, weeks 21–22)

**Goal**: every `src/<folder>` named in §2 has a real destination package with a `package.json`, a `src/index.ts`, a `tsconfig.json`, and a placeholder export. **No code migration yet** — just the empty containers.

- Create `packages/elements/` with sub-packages per element family (`packages/elements-wall/`, `packages/elements-door/`, ..., `packages/elements-stair/`) — 13 sub-packages, each ~50 LOC stub.
- Create `packages/physics-host/`, `packages/input-host/`, `packages/renderer-three/`.
- Populate the 3 empty packages: `bench-visual-diff/`, `eslint-plugin-pryzm/` (move existing rules from inline ESLint config), `release/`.
- Add per-package `tsconfig.references.json` entries.
- Add per-package vitest workflow.
- Update `pnpm-workspace.yaml`.
- **Exit verifier**: `pnpm -r build` succeeds; every `src/<folder>` named in §2 has a non-empty corresponding `packages/<destination>/` directory.
- **Boolean delta**: none (infra wave, like Wave 1).

### Wave 9 — Geometry & Spatial Migration (S89-S90-WIRE, weeks 23–26, **2 sprints**)

**Goal**: migrate the geometry, spatial, snapping, constraints, topology code from `src/` to `packages/geometry-kernel/`, `packages/picking/`, `packages/constraint-solver/`. This is the L1 layer per ARCH §4.

- **S89-WIRE** (week 23–24):
  - `src/spatial/` (1,738 LOC) → `packages/geometry-kernel/spatial/` (per-file PR; 5 files = 5 PRs).
  - `src/topology/` (909 LOC) → `packages/geometry-kernel/topology/` (2 PRs).
  - `src/constraints/` (1,089 LOC) → `packages/constraint-solver/` (2 PRs).
  - `src/snapping/` (3,387 LOC) → `packages/picking/snapping/` (17 files = 5 batched PRs).
- **S90-WIRE** (week 25–26):
  - **`src/elements/` (85,073 LOC) → `packages/elements-<family>/` (13 packages)**. This is the largest single migration in the entire plan. Strategy: per-element-family PR (13 PRs), each migrating ~6,500 LOC + inline tests. Codemod `tools/codemod/rewrite-elements-imports.ts` updates the ~280 importer files in `src/ui/`, `src/commands/`, `plugins/*`.
  - Each element-family PR runs the existing element-specific workflow (e.g. `family-editor-quality-gates`) before merge.
- **Exit verifier**: `! [ -d src/elements ] && ! [ -d src/spatial ] && ! [ -d src/topology ] && ! [ -d src/constraints ] && ! [ -d src/snapping ]` AND every importer of those modules now imports from `@pryzm/elements-*` / `@pryzm/geometry-kernel` / `@pryzm/picking` / `@pryzm/constraint-solver`.
- **Boolean delta**: none directly; reduces `src/` LOC by ~92,000 (~24 % of `src/`).

### Wave 10 — Domain, Commands, Stores, Styles Migration (S91-S93-WIRE, weeks 27–32, **3 sprints**)

**Goal**: migrate the L1 domain + L2 services + the BIM-styles bundle. This is the bulk of the remaining `src/` after Wave 9.

- **S91-WIRE**: `src/core/` (76,197 LOC, 228 files). **Single largest internal migration.** Audit the 228 files first, then split-by-purpose:
  - `src/core/stores/*` → `packages/stores/`
  - `src/core/view-state/*` → `packages/view-state/`
  - `src/core/scene-committer/*` → `packages/scene-committer/`
  - `src/core/schemas/*` → `packages/schemas/`
  - `src/core/geometry/*` → `packages/geometry-kernel/`
  - `src/core/commands-internal/*` → `packages/command-bus/internal/`
  - `src/core/utils/*` → `packages/types-builtin/utils/`
  - **Strategy**: 12 PRs over 2 weeks, one per top-level subdirectory.
- **S92-WIRE**: `src/commands/` (34,048 LOC, 265 files).
  - 265 individual commands → `packages/command-bus/handlers/<command>.ts` per file.
  - Each handler registers via `commandBus.register('<id>', handler)` typed `Command<T>`.
  - **This grows the typed-command registry from ~30 to ~295.** (Wave 6 grows to 280 with new typed commands; Wave 10 adds the migrated 265.)
  - Codemod rewrites every dispatcher call in `src/ui/` to `runtime.commandBus.dispatch({ id, ... })`.
  - 11 PRs (~25 commands each).
- **S93-WIRE**:
  - `src/styles/` (30,977 LOC, 44 files) → `packages/family-runtime/styles/`. These are BIM styles (text-style, dimension-style, line-style, material-style…), not CSS. 4 PRs.
  - `src/services/` (1,534 LOC) → `packages/persistence-client/`, `packages/sync-client/`, `apps/api-gateway/services/`. 3 PRs.
  - `src/collaboration/` (434 LOC) → `apps/sync-server/`, `packages/sync-client/`. 1 PR.
- **Exit verifier**: `! [ -d src/core ] && ! [ -d src/commands ] && ! [ -d src/styles ] && ! [ -d src/services ] && ! [ -d src/collaboration ]`.
- **Boolean delta**: none directly; reduces `src/` LOC by ~143,000 (additional ~37 % of `src/`).

### Wave 11 — AI, Tools, Renderer, Import/Export, Misc Migration (S94-S96-WIRE, weeks 33–38, **3 sprints**)

**Goal**: migrate the remaining 25+ small folders. After Wave 11, `src/` should contain only `src/ui/`, `src/legacy/`, `src/main.ts`, and the residual orphans.

- **S94-WIRE**:
  - `src/ai/` (14,987 LOC, 37 files) → split between `apps/ai-worker/`, `packages/ai-host/`, `packages/ai-cost/`, `packages/ai-spend/`. The user-facing AI request pipeline goes to `apps/ai-worker/`; the typed contracts to `packages/ai-host/`; cost accounting to `ai-cost/`/`ai-spend/`. 6 PRs.
  - `src/tools/` (10,905 LOC, 31 files) → `packages/input-host/tools/`. Each tool (Wall, Slab, Door, Window, Stair, Furniture, Selection, Pan, Zoom, Section, Dimension, Annotation, Move, Rotate, Mirror, Array, Trim, Extend, Offset, Boolean, Loft, Sweep, Revolve, Extrude, Fillet, Chamfer, Group, Ungroup, Lock, Unlock) → `packages/input-host/tools/<tool-name>/`. 31 PRs (or 6 batched).
- **S95-WIRE**:
  - `src/rendering/` (2,585 LOC, 10 files) → `packages/renderer/` and `packages/renderer-three/`. **Move all `import * as THREE from 'three'` exclusively to `packages/renderer-three/`.** This is when P2 (renderer is swappable, THREE confined) lands.
  - `src/render/` (225 LOC) → `packages/renderer/`. 1 PR.
  - `src/import/` (4,294 LOC, 34 files) → `plugins/ifc-import/`, `plugins/rhino-import/`, `packages/file-format/`. 4 PRs.
  - `src/export/` (6,636 LOC, 35 files) → `plugins/ifc-export/`, `plugins/dxf/`, `plugins/export-pdf/`, `apps/headless/export/`, `packages/file-format/`. 5 PRs.
- **S96-WIRE** (the small-folder sweep — 1 PR each):
  - `src/migration/` → `packages/legacy-shim/migration/`
  - `src/monetization/` → `apps/marketplace-api/billing/`, `packages/ai-spend/`
  - `src/utils/` → `packages/types-builtin/utils/`
  - `src/generative/` → `plugins/ai-generative/`, `plugins/ai-floorplan/`
  - `src/physics/` → `packages/physics-host/` (Wave 3 created the package; Wave 11 finishes the population)
  - `src/structural/` → `plugins/structural/`
  - `src/geospatial/` → `plugins/geospatial/`
  - `src/types/` → `packages/types-builtin/`
  - `src/cde/` → `packages/protocol/cde/`
  - `src/portfolio/` → `packages/family-runtime/portfolio/`
  - `src/visibility/` → `packages/visibility/`
  - `src/furniture/`, `src/features/` → `plugins/furniture/`
  - `src/api/` → `packages/protocol/`, `apps/api-gateway/`
  - `src/history/` → `packages/runtime-undo-stack/`
  - `src/persistence/` → `packages/persistence-client/`
- **Exit verifier**:
  ```bash
  [ "$(ls src/ | grep -v '^ui$\|^legacy$\|^main.ts$' | wc -l)" -eq 0 ]
  ```
- **Boolean delta**: **#1 turns ✅ for real** (`legacy_src_folders == 1` — only `ui/` + the `legacy/` shim) AND **#5 stays ✅** (EngineBootstrap deleted in Wave 7) AND **THREE.js confined to `renderer-three` only** (P2 enforced).

### Wave 12 — Plugin L7 Boundary Conformance (S97-S99-WIRE, weeks 39–44, **3 sprints**)

**Goal**: every plugin imports only from `@pryzm/plugin-sdk` (the L6 surface). Today there are **176 L0-L4 boundary violations** across 41 of the 46 plugins. The Wave 4 transitional allowlist of 5 plugins drops to 0.

- **S97-WIRE** (element family plugins, 17 plugins):
  - Migrate `plugins/wall`, `plugins/door`, `plugins/window`, `plugins/stair`, `plugins/slab`, `plugins/roof`, `plugins/beam`, `plugins/column`, `plugins/floor`, `plugins/ceiling`, `plugins/curtain-wall`, `plugins/furniture`, `plugins/lighting`, `plugins/plumbing`, `plugins/handrail`, `plugins/grid`, `plugins/levels` to consume only `@pryzm/plugin-sdk`.
  - For each plugin: delete L0-L4 imports; add SDK contract imports; if the SDK doesn't expose what the plugin needs, file an SDK-extension PR (gated on Phase F sub-track).
  - 17 PRs.
- **S98-WIRE** (view/sheet/AI plugins, 14 plugins):
  - Migrate `plugins/plan-view`, `plugins/section-view`, `plugins/sheets`, `plugins/schedules`, `plugins/annotations`, `plugins/dimensions`, `plugins/rooms`, `plugins/ai-floorplan`, `plugins/ai-generative`, `plugins/ai-query`, `plugins/ai-rules`, `plugins/ai-voice`, `plugins/multiplayer`, `plugins/visibility-intent`.
  - 14 PRs.
- **S99-WIRE** (interop + platform plugins, 15 plugins):
  - Migrate `plugins/bcf`, `plugins/ifc-import`, `plugins/ifc-export`, `plugins/ifc-inspector`, `plugins/rhino-import`, `plugins/dxf`, `plugins/export-pdf`, `plugins/geospatial`, `plugins/selection`, `plugins/navigate`, `plugins/view`, `plugins/render`, `plugins/structural`, `plugins/cross`, `plugins/toy-cube`.
  - The Wave 4 transitional allowlist drops to 0 entries — `pryzm/no-l7-allowlist-grow` rule is now `pryzm/no-l7-cross-layer-imports` at error level.
  - 15 PRs.
- **Exit verifier**:
  ```bash
  [ "$(rg -l "from '@pryzm/(domain|geometry-kernel|renderer|scene-committer|view-state|persistence-client|stores)" plugins/ | wc -l)" -eq 0 ]
  ```
- **Boolean delta**: **#7 advances** (plugin SDK exercised by 46 real plugins, validates the SDK surface).

### Wave 13 — 17 NFT Benches + Performance Hardening (S100-S102-WIRE, weeks 45–50, **3 sprints**)

**Goal**: the 17 non-functional targets in `01-VISION.md §3` have running benches in `apps/bench/` that fail CI if regressed beyond budget.

> **Scope amendment (2026-04-30 holistic-review)**: Wave 13 was originally framed as **"60 benches across 3 sprints"** (the brute-force enumeration of every NFT × every fixture × every device-class combination). Per the founder-authored Round-6 §15.12 descope and corroborated by `03-CURRENT-STATE.md §10` evening entry's "harness already exists" finding, the realistic Wave 13 scope is **the 17 NFT canonical benches** (one per NFT row in `01-VISION.md §3`). The other ~43 fixture/device combinations are **deferred to Wave 18+ (post-GA performance hardening)** where they can be authored as deliberate regression-band widenings rather than as gating budgets. Day-budget impact: Wave 13 shrinks from ~60 bench files (~2 days/file = ~120 days, infeasible in 3 sprints) to **17 bench files (~3 days/file = ~50 days, fits in 3 sprints with slack for the existing-harness extension work named in §10 (4))**.

- **S100-WIRE** (the 6 most user-visible NFTs):
  1. NFT-1 cold-boot wall-clock to interactive (target ≤ 2.5 s on M1 Mac, Chrome 130, throttled fast 4G)
  2. NFT-2 frame budget under interaction (target ≥ 55 fps median on 1k-element project)
  3. NFT-3 tool-switch latency (target ≤ 80 ms input-to-paint)
  4. NFT-4 selection-set update (target ≤ 16 ms for 1k-element selection)
  5. NFT-5 panel mount/unmount (target ≤ 50 ms)
  6. NFT-6 command-dispatch round-trip (target ≤ 5 ms commit; ≤ 16 ms paint)
- **S101-WIRE** (the 6 backend NFTs):
  7. NFT-7 persistence write throughput (target ≥ 10 MB/s)
  8. NFT-8 sync-client latency p95 (target ≤ 200 ms)
  9. NFT-9 IFC export 1k elements (target ≤ 8 s)
  10. NFT-10 IFC import 1k elements (target ≤ 12 s)
  11. NFT-11 family-load (1 family = ≤ 100 ms)
  12. NFT-12 plan-view render (1k elements = ≤ 200 ms)
- **S102-WIRE** (the 5 system NFTs):
  13. NFT-13 memory ceiling at 10k elements (target ≤ 1.2 GB heap)
  14. NFT-14 bundle size (editor app ≤ 4 MB gzipped)
  15. NFT-15 GC pause p99 (target ≤ 100 ms during interaction)
  16. NFT-16 worker pool saturation (target: AI request never blocks input thread)
  17. NFT-17 crash-loop recovery (target: bad-state crash auto-recovers in ≤ 3 s)
- Each NFT bench in `apps/bench/src/nft-N-*.ts` runs in CI. `pnpm bench:nft` runs all 17. Budget regressions block merge.
- **Exit verifier**:
  ```bash
  pnpm bench:nft   # all 17 within budget
  ```
- **Boolean delta**: none directly; closes NFT preconditions for GA-2.

### Wave 14 — Final UI Decomposition + Real Binding Round 2 (S103-S105-WIRE, weeks 51–56, **3 sprints**)

**Goal**: Wave 6 wired ~69 panels/toolbars. Live count is ~140 panels + ~80 toolbars. Wave 14 finishes the remaining ~150 wireup points AND decomposes the 14 worst files in `src/ui/` (the AIVT §3 "30 worst files" list, of which Wave 7 WS-B touched 5).

- **S103-WIRE**: decompose the 9 remaining top-LOC files in `src/ui/`:
  - `src/ui/PropertyInspector.ts` (2,852)
  - `src/ui/platform/PlatformShell.ts` (2,433)
  - `src/ui/icons/PryzmIcons.ts` (2,209) — this is a registry; split per-icon-family
  - `src/ui/furniture-carousel/FurnitureCategoryRegistry.ts` (2,114)
  - `src/ui/Layout.ts` (1,958)
  - `src/ui/ai/FloorPlanImportPanel.ts` (1,874)
  - `src/ui/inspect/AuditStack.ts` (1,846)
  - `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` (1,820)
  - `src/ui/furniture-carousel/FurnitureGeometryFactory.ts` (1,811)
  - `src/ui/dataworkbench/DataWorkbench.ts` (1,810)
- **S104-WIRE**: real-bind the remaining ~71 panels (Wave 6 did 39; total panel surface ≈ 110, leaving ~71). Each panel: `runtime.viewRegistry.activate(...)` on mount, Vitest `.toHaveBeenCalledWith({...})` test.
- **S105-WIRE**: real-bind the remaining ~50 toolbars and contextual-edit-bars.
- **Exit verifier**:
  ```bash
  [ "$(find src/ui apps/editor/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1>1200 {n++} END {print n+0}')" -eq 0 ]
  pnpm test:phase-b-binding   # green for ALL panels (not just Wave 6's 39)
  pnpm test:phase-c-binding   # green for ALL toolbars (not just Wave 6's 30)
  ```
- **Boolean delta**: none directly; achieves "all wired in UI" answer = YES.

### Wave 15 — Final Cleanup + PRYZM 3 day-1 FUNCTIONAL (S106-S107-WIRE, weeks 57–60, **2 sprints**)

**Goal**: turn `pnpm pryzm-3-day-1` GREEN for **functional** day-1 (not just structural). All booleans #1–#9 either ✅ or in active development with v1.0 surfaces.

- **S106-WIRE**:
  - Delete every empty `src/<folder>` left behind. After Wave 11, this should be every folder except `src/ui/`, `src/legacy/`, `src/main.ts`, `src/browser-entry.tsx`, `src/browser.css`.
  - Move `src/browser-entry.tsx`, `src/browser.css` to `apps/editor/src/`.
  - Delete `src/familyCreatorPlaceholder.ts`.
  - `src/dev/` → `tools/dev/` (gated DEV).
  - Delete `src/main.ts` (now subsumed into `apps/editor/src/main.tsx`).
  - **Final state**: `ls src/` = `legacy ui` (exactly 2 entries).
- **S107-WIRE**:
  - Remove the 3 `(window as any)` shim allowlist entries that should never have been there.
  - Final boundary lint: 0 cross-layer violations across all 46 plugins.
  - Final NFT regression sweep: all 17 within budget.
  - Final workflow sweep: 9/9 green.
  - GA-2 hardening: enterprise pilot test-readiness, security audit, sovereignty validation.
- **Exit verifier**:
  ```bash
  pnpm pryzm-3-day-1-functional   # the new top-level verifier
  ```
  Returns:
  ```
  ✓ ls src/                                  =  ui legacy
  ✓ rg -c '(window as any)' src/             =     0  (shim has 40, exempt)
  ✓ rg -l 'requestAnimationFrame'            =     1
  ✓ EngineBootstrap-related symbols          =     0
  ✓ all 9 workflows green                    =     ✓
  ✓ all 17 NFT benches within budget         =     ✓
  ✓ all 46 plugins on L7-only                =     ✓
  ✓ all panels real-bound (Phase B)          =     ✓ (139/139)
  ✓ all toolbars real-bound (Phase C)        =     ✓ (78/78)
  ✓ all CI gates at error level              =     ✓
  ✓ packages/ LOC ≥ 350,000                  =     ✓
  ✓ src/ LOC ≤ 100,000 (only src/ui/)        =     ✓

  PRYZM 3 day-1 FUNCTIONAL — 9 of 9 booleans ✅ (or v1.0 surfaces published)
  ```
- **Boolean delta**: **all 9 ✅** (or in v1.0 active dev for #7, #8, #9 per Phase F continuation).

---

## §4 — Revised honest calendar

The Wave 1–7 plan as originally written: **20 weeks, ends week 20 = ~5 months**. The Wave 1–7 plan honestly accounts for **≈ 8.6 % of the migration LOC**.

The full Wave 1–15 plan: **60 weeks total, ends week 60 = ~14 months**. Adds 8 waves and 21 sprints to the original 7 waves and 7 sprints (Wave 7 itself is 4 sprints).

| Wave | Sprint(s) | Weeks | Cumulative weeks | What it delivers | Boolean delta |
|---|---|---:|---:|---|---|
| 1 | S78-WIRE | 1–2 | 2 | tripwires + de-quarantine | (infra) |
| 2 | S79-WIRE | 3–4 | 4 | D.4.1 + D.4.2 | toward #4 |
| 3 | S80-WIRE | 5–6 | 6 | D.4.3 + D.4.4 + D.4.5 | **#4 ✅** |
| 4 | S81-WIRE | 7–8 | 8 | slot typing + PlatformRouter | (typing) |
| 5 | S82-WIRE | 9–10 | 10 | cast 2070 → 670 | toward #2 |
| 6 | S83-WIRE | 11–12 | 12 | Phase B + C real-bind, **6/9 convergence** | (binding) |
| 7 | S84-S87 | 13–20 | 20 | EngineBootstrap deleted, cast 670 → 0, rAF 68 → 1, **structural day-1** | **#2 ✅, #3 ✅, #5 ✅, #6 ✅** |
| **8** | **S88** | **21–22** | **22** | **destination package stub creation** | (infra) |
| **9** | **S89-S90** | **23–26** | **26** | **geometry + spatial + elements migration (~92k LOC out of `src/`)** | (LOC) |
| **10** | **S91-S93** | **27–32** | **32** | **core + commands + styles + services migration (~143k LOC out of `src/`)** | (LOC) |
| **11** | **S94-S96** | **33–38** | **38** | **AI + tools + renderer + import/export + small folders (~50k LOC out)** | **#1 ✅ for real** |
| **12** | **S97-S99** | **39–44** | **44** | **all 46 plugins on L7-only, 0 boundary violations** | (P5 P7) |
| **13** | **S100-S102** | **45–50** | **50** | **17 NFT benches in CI** | (NFTs locked) |
| **14** | **S103-S105** | **51–56** | **56** | **all panels + toolbars real-bound; 14 worst UI files split** | (UI complete) |
| **15** | **S106-S107** | **57–60** | **60** | **PRYZM 3 day-1 FUNCTIONAL** | **all 9 ✅ or v1.0** |

**Total: 60 weeks (~14 months) from S78-WIRE start.** Project start to Wave 15 close = ~M40 (calendar month 40), which aligns with `01-VISION.md` GA-2 target of ~M42.

---

## §5 — What still won't be perfect at end of Wave 15

Even with the extension, four classes of work continue beyond Wave 15:

1. **Phase F continuation** (S108-WIRE → S125-WIRE, ~18 sprints / ~9 months): SDK v1.0 → v2.0, marketplace external developer onboarding at scale, headless REST/WS at scale, billing + revenue share. **Booleans #7, #8, #9 reach `v2.0` but the marketplace ecosystem (≥ 20 third-party plugins) is a multi-year cultivation.**
2. **GA-3 features** (post-S125): sovereign-cloud deployment, SOC 2 Type II audit, regional data-residency compliance, FedRAMP if pursued.
3. **Long-tail performance**: NFT benches enforce a budget but real-world workloads (50k-element projects, 100-user concurrent sessions) reveal new hot paths. Continuous optimization.
4. **Doc rot prevention**: discipline rule 1 must be enforced indefinitely. The risk is that the team gets comfortable and starts writing `*-AUDIT-2026-MM-DD.md` again. Quarterly Rule-1 audit with founder sign-off.

---

## §6 — Discipline addenda specific to this extension

The 6 binding rules in `12-DISCIPLINE-AND-DOD.md` apply unchanged. **Three additional rules introduced by this gap discovery:**

7. **Destination-readiness rule.** No `src/<folder>` may be deleted (Wave 7 WS-A through Wave 11) until the destination package's exports cover ≥ 95 % of the importer-side use sites. Verifier: `tools/codemod/check-destination-coverage.ts <src-folder> <dest-package>` returns ≥ 0.95.

8. **No new src/ folders rule.** From Wave 8 onward, `pryzm/no-new-src-top-level-folder` ESLint rule blocks PRs that add a new top-level `src/<folder>` directory. New work goes to `packages/` or `apps/`.

9. **LOC parity rule.** At each wave close from Wave 9 onward, `pnpm ga-gate` verifies `src_loc(N) ≤ src_loc(N-1)` (LOC monotonically decreases) and `packages_loc(N) ≥ packages_loc(N-1) - 5%` (slight decrease tolerated for refactoring; large drops indicate dead-code creation rather than real migration).

---

## §7 — Risks specific to Waves 8–15

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Element-family migration (Wave 9 S90) breaks user-visible BIM behaviour because element semantics drift between `src/elements/` and `packages/elements-*/` | Medium-High | Catastrophic | Per-element-family golden-file test: dump 100 representative elements before/after migration, byte-compare. Block merge on diff. |
| `src/core/` (76k LOC) split (Wave 10 S91) is harder than estimated because of internal cross-references | High | High | Time-box S91 to 2 weeks; if not done, descope S92's command migration to S94 and re-plan. |
| Plugin L7 conformance (Wave 12) reveals SDK gaps requiring SDK v0.5/v0.6 emergency releases mid-wave | High | Medium | Reserve 1 SDK engineer-day per wave as buffer for emergency SDK extension PRs. |
| NFT benches (Wave 13) reveal regressions caused by Waves 8-12 migrations | Medium | Medium | Run NFT bench in shadow mode from Wave 9 onward (not yet blocking, just reporting). Catch regressions earlier. |
| Founder pressure to ship marketplace v1.0 before Wave 14 completes | High | High | Phase F gate (rule 4, `12-DISCIPLINE-AND-DOD.md`) extends to require Wave 12 close. |
| Engineer fatigue over 14-month structural-only program | Medium-High | Medium | Per-wave demo-able milestone: Wave 9 demos new `packages/elements-wall/` working with the wall plugin; Wave 11 demos a 30 % cold-boot improvement; Wave 13 demos NFT dashboard. **No more 5-month "trust us, then judge us" stretches.** |

---

## §8 — Pointers

| If you need... | Read... |
|---|---|
| The honest "is it done at Wave 7?" answer | §1 of this file |
| The destination-package readiness state | §2 of this file |
| The day-by-day wave plan for Waves 8–15 | §3 of this file |
| The honest 14-month calendar | §4 of this file |
| The original (now-corrected) WS-A folder-deletion table | `./11-WAVE-7-CLEANUP-PHASE-F.md §2` |
| The §1 live metrics that triggered this audit | `../03-CURRENT-STATE.md §1` and §12 |
| The discipline addenda (rules 7, 8, 9) | §6 of this file (subsumed into next revision of `./12-DISCIPLINE-AND-DOD.md`) |
