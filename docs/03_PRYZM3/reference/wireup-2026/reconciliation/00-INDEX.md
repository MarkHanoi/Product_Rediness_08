# PRYZM 2 Wireup — Phases A–F Reconciliation Audit (2026-04-29)

> **Trigger**: Founder asked for a clean check of "is everything done in phases A, B, C, D, E and F" before more code lands.
> **Method**: Compare the spec (`PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md`, `15-subphases-E-families.md`, `16-subphases-F1-toolbars.md`, `17-subphases-F2-F5.md`, `18-subphases-F6-F12.md`) against on-disk code, with hard counts — files present/deleted, identifier reaches, lint-baseline numbers.
> **Headline finding**: The PROCESS-TRACKER §1 dashboard line "Phase B — DONE; Phase C — DONE" is **wrong**. Only the *scaffolding* sub-phases of B/C landed (B.1, C.6.02–C.6.03, partial C.10.04). The bulk of B/C is queued. Phase F is a flat **0/95**.

This folder is the audit artifact. The companion fix is a PROCESS-TRACKER rewrite that makes the live dashboard match these numbers — see §"Fix landed" below.

---

## §1  Gap matrix (one row per phase)

| Phase | Spec sub-phases | Landed | % | Status vs tracker | Detail |
|---|---:|---:|---:|---|---|
| **A** — Composition root | 7 | 7 | 100% | **Tracker correct** | All 7 functionally landed (composeRuntime, 14-slot `PryzmRuntime`, `PlatformRouter.start(runtime)`, `pryzm/no-window-as-any` rule armed). [Detail](./01-phase-A-audit.md) |
| **B** — Constructor widening | 40 | **1** | **2.5%** | **Tracker WRONG** ("DONE"). Only B.1 (`@pryzm/ui-base/Panel` package) actually landed. **0** files in `src/ui/` extend `Panel`. Cast count **773 / 778 baseline** (only 5 retired). [Detail](./02-phase-B-audit-and-plan.md) |
| **C** — Persistence rewire | 33 | **~3** | **~9%** | **Tracker WRONG** ("DONE"). C.6.02/C.6.03 (undo/redo via `runtime.undoStack`) and a partial signOut wire landed. **All 3 legacy files (1 118 LOC) STILL ON DISK**: `ProjectRepository.ts`, `SaveOrchestrator.ts`, `ServerSyncQueue.ts`. ProjectHub still calls `projectRepository.listProjects()` 16+ times. [Detail](./03-phase-C-audit-and-plan.md) |
| **D** — Engine consolidation | 14 | 5–6 | ~40% | **Tracker correct** ("D.1 ✓ D.2 ✓; D.3/D.4 queued"). Bonus: D.6 + D.8 already partly landed (legacy `RenderPipelineManager`/`UnifiedFrameLoop`/`BatchCoordinator`/`DrawingPipelineOrchestrator` deleted from `src/engine/`; replacement lives in `packages/renderer/` + `src/core/rendering/`). `EngineBootstrap.ts` still **2 035 LOC**. D.9–D.14 (gesture routing through runtime) untouched — but those overlap Phase E.13 which is also queued. [Detail](./04-phase-D-audit-and-plan.md) |
| **E** — Per-family element migration | 18 × 3 lanes (routing + bus + delete) = 54 | **15 routing only** | ~28% | **Tracker partially correct** (claims "15/18" — true for routing). Bus dispatch lane: **0/18** (`runtime.bus.executeCommand` has 0 reaches). Legacy deletion lane: **0/18** (23 dirs in `src/elements/`, 31 dirs in `src/commands/` still on disk). [Detail](./05-phase-E-audit-and-plan.md) |
| **F** — Plugin contributions | ~95 | **0** | **0%** | **Tracker silent** (no §3 ledger section yet). **0/38 plugins** have `contributions.ts`; **0** plugins have `inspector/Panel.ts` or `modal/Create.ts`; `CreateRailPanel._buildSections()` still hard-codes 13 tools; `runtime.plugins.contributions(...)` has **0 consumer reaches**. [Detail](./06-phase-F-audit-and-plan.md) |

**Aggregate**: spec calls for **207 sub-phases** across A-F; landed = **~31** (15%).

---

## §2  Why the tracker drifted

`PROCESS-TRACKER.md` line 7 says (paraphrasing):
> *Phase A — DONE; Phase B — DONE (constructor widening; @pryzm/ui-base/Panel base class + 39 follow-ups); Phase C — DONE (command-bus binding; ProjectHub reads runtime.persistence; 264 handler bindings live).*

Three failure modes converged:

1. **Scope mis-attribution.** B.1 landed the *Panel base class*. Lines 156-176 of the tracker accurately list B.2–B.40 as `[ ]` queued, but the §1 "Reality reconciliation" header says "Phase B — DONE" — these contradict each other inside the same file.
2. **`runtime.persistence` plumbing was conflated with consumer migration.** `runtime.persistence.client` is wired in `composeRuntime.ts` (Phase A, line A.3), and `ProjectHub.signOut()` calls it (one site). That isn't C.1.01–C.4.06 ("hub paints / search / sort / open / rename / delete" — every ProjectHub gesture should go through runtime).
3. **Files-deleted gate was never enforced.** C.11.01–C.11.03 requires the 3 legacy persistence files to be removed; all three are 100+ LOC and actively imported.

The fix is below.

---

## §3  Suggested execution order (what to do next)

Sized so each block is one engineer-week max. Numbers continue from existing chunk numbering.

### §3.1  Tracker correction (this PR — already applied)

- PROCESS-TRACKER.md header rewritten to **match reality**: B = 1/40, C = ~3/33, D = D.1+D.2+partial D.6/D.7/D.8, E = 15/54 (routing only), F = 0/95.
- §3 sub-phase ledger: add Phase C, Phase E (routing-only column already there), Phase F empty grid.
- Aggregate "landed" count revised from 25 → **~31** (the routing column for Phase E is already counted, but B/C/D/F numbers were missing).

### §3.2  B-cleanup batch — kill the cast inventory (sized: ~6 sprints)

The Panel base class exists; the work is now mechanical. **Do NOT attempt 40 sub-phases at once** — batch by directory:

| Batch | Files | Cast count today | Notes |
|---|---|---:|---|
| **B-cleanup.1** | `src/ui/Layout.ts` + `LeftNavRail.ts` + `PanelManager.ts` | 50 | Single PR. Highest-fan-in panels — unblocks downstream. |
| **B-cleanup.2** | `src/ui/PropertyInspector.ts` + `src/ui/property-panel/*` | ~140 | PropertyInspector alone: 87 casts. |
| **B-cleanup.3** | `src/ui/views/*` + `src/ui/ContextualEditBar.ts` + `src/ui/SaveUndoRedoHUD.ts` (already partly done) + `src/ui/SelectionOverlay.ts` + `src/ui/ViewCube.ts` | ~80 | View bar + HUD pass. |
| **B-cleanup.4** | `src/ui/ProjectBrowser/*` + `src/ui/ViewBrowser/*` + `src/ui/SpatialTree.ts` | ~120 | Browser/tree pass. |
| **B-cleanup.5** | `src/ui/dataworkbench/*` (15 panels) | ~150 | One file per sub-PR; the orchestrator first. |
| **B-cleanup.6** | `src/ui/rendering/*` + `src/ui/canvas/*` + `src/ui/SchedulePanel/*` + `src/ui/SheetEditor/*` + remainder | ~233 | Tail. |

**Acceptance**: each batch lands `(window as any)` count strictly lower than before; lint baseline file `eslint-baseline-window-as-any.json` regenerated and committed; bench files for the touched panels stay green.

### §3.3  C-deletion batch — make the file-delete gate land (sized: 1 sprint)

Three legacy files (1 118 LOC total) cannot be deleted because they have live consumers. The order is forced by import topology:

1. **C-cleanup.1** (`ServerSyncQueue.ts`) — 5 importers (`PlatformShell`, `ProjectHub`, `ExistingProjectsPanel`, `SaveOrchestrator`, `ProjectRepository`). Replace each with `runtime.persistence.client.*` calls. Hardest because of the `_planRejectsSync` latch (S78 PERF P-1 added behaviour the new client must inherit).
2. **C-cleanup.2** (`SaveOrchestrator.ts`) — only consumed by `PlatformShell` and `ProjectHub` after step 1. Replace `SaveOrchestrator.onSaveStatusChange` with `runtime.events.on('persistence.status', ...)` (already an unused event bus slot).
3. **C-cleanup.3** (`ProjectRepository.ts`) — replace 16+ `projectRepository.listProjects()` calls in `ProjectHub.ts` with `runtime.persistence.projectListStore.snapshot()`. The store already exists; only the consumer site is missing.

**Acceptance**: `ls src/ui/platform/{ProjectRepository,SaveOrchestrator,ServerSyncQueue}.ts` returns 3 "no such file" errors; `pnpm test` green; `npm run dev` boots with the project hub painting at p95 < 500 ms.

### §3.4  D-finish batch — close engine-consolidation (sized: 2-3 sprints)

D.3, D.4, D.9–D.14 remain. The big rock is **D.4 (`EngineBootstrap.ts` deletion, 2 035 LOC)**. Strategy:

- **D.3** — already mostly done (renderer mounts in `#container` from boot). Audit: confirm there is no `#pryzm2-canvas` element anywhere (`rg "pryzm2-canvas" src apps`).
- **D.4** — split EngineBootstrap into named subsystem files. The `src/engine/subsystems/init*.ts` files already exist (initBuilders, initCollaboration, initDataPlatform, initPersistence, initScene, initStores, initTools, initUI). Move the orchestration into `composeRuntime.ts` and delete the file. **Size**: 4 PRs (init-by-init), one PR per subsystem move.
- **D.9–D.14** — overlap with Phase E.13 (grid) and the gesture-routing tail. Defer until after E-deletion.

### §3.5  E-deletion batch — delete legacy element/command dirs (sized: 2 sprints)

Per Phase E exit criteria. 23 element dirs + 31 command dirs to remove. Order:

1. **E-bus.1** — wire ONE family (Wall) all the way through `runtime.bus.executeCommand('wall.*')`. This validates the dispatch slot under load.
2. **E-bus.2..E-bus.18** — repeat per family.
3. **E-delete.1..E-delete.18** — delete `src/elements/<family>/` + `src/commands/<family>/` after each family's bus dispatch confirms.

**Acceptance**: `commandManager.execute(` reach count drops from **202** to **0**; `src/elements/` only contains shared utilities (no per-family folders); `src/commands/` only contains the framework (no per-family folders).

### §3.6  F-launch batch — first plugin contribution lands (sized: 1 sprint to start)

Phase F is **enormous** (95 sub-phases). Don't try to land it in one go. **F.1.01 (Wall tool button → `plugins/wall/contributions.ts`)** is the canonical first sub-phase. Once it's green:

- copy the pattern across F.1.02–F.1.13 (the architecture rail) — 12 PRs of one file each.
- F.1.14 (`CreateRailPanel._buildSections()` rewrite to enumerate contributions) is the unblocker for the rest of F.1 — schedule it as soon as the architecture rail is data-driven.
- F.2, F.3, F.4 follow the same rhythm but each plugin gets an `inspector/`, `modal/`, `menu/` subfolder respectively.

**Acceptance** (just for F.1 start): `runtime.plugins.contributions('toolbar.discipline')` returns ≥ 1 entry; `CreateRailPanel` renders the Wall button via the contribution rather than the hard-coded array; `pryzm/no-window-as-any` baseline drops by the cast count `WallTool.activate` site uses.

---

## §4  What this audit does NOT change

- No code edits in this PR beyond the PROCESS-TRACKER correction. The 6 per-phase docs in this folder are pure documentation.
- The `npm run build` chain stays green (verified end-to-end on 2026-04-29).
- The 9 plugin/persistence/visibility test workflows are unchanged by this audit.

---

## §5  Cross-references

- Spec: [`PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md`](../PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md), [`15-subphases-E-families.md`](../PRYZM2-WIREUP-PLAN-S72/15-subphases-E-families.md), [`16-subphases-F1-toolbars.md`](../PRYZM2-WIREUP-PLAN-S72/16-subphases-F1-toolbars.md), [`17-subphases-F2-F5.md`](../PRYZM2-WIREUP-PLAN-S72/17-subphases-F2-F5.md), [`18-subphases-F6-F12.md`](../PRYZM2-WIREUP-PLAN-S72/18-subphases-F6-F12.md)
- Adjacent live ledgers: [`PRYZM2-WIREUP-PLAN-S72/27-phase-H-extraction-ledger.md`](../PRYZM2-WIREUP-PLAN-S72/27-phase-H-extraction-ledger.md), [`PRYZM2-WIREUP-PLAN-S72/28-commandManager-execute-migration.md`](../PRYZM2-WIREUP-PLAN-S72/28-commandManager-execute-migration.md)
- Live tracker: [`PROCESS-TRACKER.md`](../../03_STATUS/01-PROCESS-TRACKER.md)
