# Linear execution plan to PRYZM 2 wireup completion (S87 / M40)

**Status**: BINDING — this chunk is the single linear sequence the team
follows from 2026-04-30 forward through S87 / ~M40 (PRYZM 3 day 1).
**Companion to**: `0_PHASES-A-F-MISSING-ITEMS-2026-04-29.md` (the live
status board) and chunks 14–19 (the per-phase sub-phase manifests).
**Created**: 2026-04-30 (post Agent A + Agent B + Z-hygiene 2026-04-30
landing — rows 18–24 of the audit tracker).
**Rewritten**: 2026-04-30 — expanded from a 7-wave summary into the
full enumeration of every individual sub-phase across phases A · B · C ·
D · E · F · G · H · Z (~452 IDs). Chunks 14–19 remain canonical for
*what each sub-phase does*; this chunk is canonical for
*the order in which they ship and which wave owns them*.

---

## §0 — Reading guide

This chunk is long because it enumerates every single one of the ~452
sub-phases in the wireup plan with its current status and wave
assignment. The structure is:

| Section | Purpose |
|---------|---------|
| §1 | Why this chunk exists + remaining work bucket counts |
| §2 | The 7-wave linear sequence (high-level) |
| §3 | The three critical-path serializations |
| §4 | Cadence forecast S73 → S87 |
| §5 | Per-wave verifier shell commands |
| **§6** | **Full enumeration of EVERY sub-phase by ID — Phase A** |
| **§7** | **Full enumeration — Phase B (40)** |
| **§8** | **Full enumeration — Phase C (37 base + C.14 + C.exit.1–4 = 42)** |
| **§9** | **Full enumeration — Phase D (14)** |
| **§10** | **Full enumeration — Phase E (14 base + E.6.0 + E.15–17 = 18)** |
| **§11** | **Full enumeration — Phase F (F.1=65, F.2=19, F.3=15, F.4=8, F.5=32, F.6=27, F.7=16, F.8=13, F.9=16, F.10=14, F.11=12, F.12=20 → 257)** |
| **§12** | **Full enumeration — Phase G (G.1–G.33 + G.32.1–G.32.9 = 33+9)** |
| **§13** | **Full enumeration — Phase H (H.1–H.10 + H.5.1 = 11)** |
| **§14** | **Full enumeration — Phase Z (Z.0–Z.20 = 21)** |
| §15 | Living-document update protocol |

**Status legend** (used throughout §6–§14):
- ✅ done (landed, verified)
- 🟡 in-progress (PR open or partial)
- ⏳ next-up (blocking nothing; ready to start)
- ⛔ blocked (waiting on a critical-path predecessor)
- ❌ not started (no work done; not blocked but lower priority)

**Wave column**: maps each sub-phase to its wave (W1–W7) per §2.

---

## §1 — Why this chunk exists

The 2026-04-30 audit pass closed **7 sub-phases in one day** (rows 18,
19, 20 from Agent A + 21, 22 from Agent B + 23, 24 from cross-cutting
hygiene). With `tsc --skipLibCheck --noEmit` now reporting **0 errors**
and the dev server running clean at 144 fps, the architecture has
crossed an inflection point: every remaining sub-phase is now
**mechanical**, **safe to ship in parallel**, and **gated only on
sequencing** (not on architectural decisions).

Total remaining work to S87 / M40:

| Bucket | Sub-phases done | Sub-phases remaining | Critical-path? |
|--------|-----------------|----------------------|----------------|
| **A** (composition root) | 7 / 7 | 0 | ✅ closed |
| **B** (panel widening) | 10 / 40 | 30 | no — runs in parallel with D + F |
| **C** (persistence rewire) | ~4 / 42 | ~38 | gated on D.4 |
| **D** (engine subsystems) | ~6 / 14 | ~8 | **YES — D.4 EngineBootstrap split is the boulder** |
| **E** (element families) | ~15 / 18 | ~3 (E.6.0 + E.13 + E.17) | low |
| **F** (toolbar contributions + plugin gestures) | ~2 / 257 | ~255 | gated on F.1.14 (the hard switch) |
| **G** (mass deletions) | ~0 / 33+9 | ~42 | gated on B + C + D + E + F all closing |
| **H** (per-package compile + GA gate) | ~3 / 11 | ~8 | gated on G closing |
| **Z** (cross-cutting hygiene retro-fits) | 5 / 21 | ~16 | runs alongside everything; Z.0–Z.20 land in S77 D1–D9 |
| **Total** | **~52 / ~452** | **~400** | — |

The shape of the remaining work is **7 parallel waves** (§2), with
**three critical-path serializations** that determine total wall-clock
time (§3). The cadence forecast (§4) maps the waves onto S73 → S87
sprint slots. **§6–§14 enumerate every single sub-phase by ID.**

---

## §2 — The 7 waves (linear sequence)

Each wave declares: **trigger** (what the previous wave produced that
unlocks this one), **work** (the sub-phases in dependency order),
**verifier** (the one shell command that proves the wave landed), and
**safe-to-parallelize-with** (which other waves can run concurrently).

### Wave 1 — D.7 consumer migrations + F-launch rollout + B.13 closeout (NOW unblocked, 2026-04-30+)

> All three streams are non-overlapping at the file level. Ship them in
> parallel. None touches `src/ui/` or `src/engine/EngineBootstrap.ts`.

**Sub-phases owned**: D.7.2–D.7.10 (9 PRs); F-launch family wireups
F.1.02–F.1.13 (12 PRs cloning F.1.01); B.13 closeout (B.13-RM, B.13-UP).

Verifier: `rg -c "from.*UnifiedFrameLoop" src/` strictly decreases per
PR; after D.7.10 it must be **0**; toolbar contribution count must be
**13**; `TODO(B):` count in RadialMenu + UiPreferences must be **0**.

### Wave 2 — B.14 .. B.40 mechanical widenings (parallel with Wave 1, no cross-deps)

> 27 PRs, fully mechanical Variant B 4-line widenings. Each touches
> exactly one `src/ui/` file. No cross-file dependencies.

**Sub-phases owned**: B.14, B.15-LM, B.15-AL, B.15-GM, B.15-GD, B.16
(3 sub-IDs), B.17-EP through B.40.

Verifier: `rg -lc "constructor.*runtime\?: PryzmRuntime" src/ui/ | wc -l` ≥ **40**.

### Wave 3 — D.4 EngineBootstrap split (the boulder — critical path)

> **Single largest blocker** for everything in C, the rest of D, and
> downstream G. 2 048 LOC in one file, 110 importers across `src/`.
> Must be sliced into 5 sub-PRs. **Cannot run in parallel with Wave 4.**

**Sub-phases owned**: D.4.1 (scene), D.4.2 (persistence), D.4.3
(physics), D.4.4 (input), D.4.5 (re-export shim).

Verifier: `wc -l src/engine/EngineBootstrap.ts` ≤ **150**.

### Wave 4 — Phase C persistence rewire (C.3.x sweep)

> **Trigger**: Wave 3 complete (specifically D.4.2 — the persistence
> extraction names the rewire target).

**Sub-phases owned**: every C.<n>.<m> entry not already done — see
§8 for the full list. The wave finishes at C.11.01–C.11.03 (the
3 legacy persistence files **deleted**).

Verifier: 3 files removed; `rg -c "(window as any).*projectContext" src/ui/` = 0.

### Wave 5 — F-bucket families (F.2 .. F.12, ~250 PRs)

> **Trigger**: Wave 1.B complete (F.1.01–F.1.13 toolbar contributions
> live + F.1.14 hard switch landed). This wave can run in parallel with
> Wave 4 once D.4.2 unblocks C.

**Sub-phases owned**: F.1.14–F.1.65 (the 6 rail rewrites + 51
remaining tool buttons), F.2.01–F.2.19, F.3.01–F.3.15, F.4.01–F.4.08,
F.5.01–F.5.32, F.6.01–F.6.27, F.7.01–F.7.16, F.8.01–F.8.13,
F.9.01–F.9.16, F.10.01–F.10.14, F.11.01–F.11.12, F.12.01–F.12.20.

Verifier: 8 rail rewrite PRs land their data-driven enumeration; per-family inspector + creation contributions ≥ 13.

### Wave 6 — Phase G mass deletions (33 + 9) + Z.0–Z.20 retro-fit (21)

> **Trigger**: Waves 1–5 all complete. This is the cleanup wave —
> nothing in `src/ui/` or `src/engine/` should be reaching legacy paths
> any more, so the deletions are safe.

**Sub-phases owned**: G.1–G.33 + G.32.1–G.32.9; Z.0–Z.20 retro-fits land
in S77 D1–D9 in parallel with the early G work.

Verifier: ~173 000 LOC retired; cast count → 0; `pnpm ga-gate` 5 ESLint rules + 2 bench thresholds pass.

### Wave 7 — Phase H per-package compile + GA gate (~11 sub-phases)

> **Trigger**: Wave 6 complete. The legacy code is gone, so per-package
> composite TypeScript builds become possible without circular import
> resolution headaches.

**Sub-phases owned**: H.1–H.10 + H.5.1.

Verifier: `pnpm ga-gate` exit 0; `tsc --build` produces composite
output across all packages; runtime smoke test green; customer migration
runner ratified per ADR-044. **PRYZM 2 wireup is COMPLETE**, PRYZM 3
day 1 begins.

---

## §3 — The three critical-path serializations

Most of the ~400 remaining sub-phases can ship in parallel. Only three
serializations matter for total wall-clock time:

1. **D.4 (EngineBootstrap split, Wave 3) → C.3.x (Wave 4) → G.19 (Wave 6)**
   — each gates the next; C.3.x cannot rewire `runtime.persistence.*`
   until D.4 has named the rewire target; G.19 cannot delete the legacy
   persistence files until C.3.x has retired all 5 callers.
2. **F.1.14 (the hard toolbar-contribution switch, Wave 1.B finale) →
   F.2.x .. F.12.x (Wave 5) → G.1 .. G.17 (Wave 6)** — F.2.x cannot
   replace per-family hard-coded UI until the contribution-loop pattern
   is proven by F.1.14; G.1 .. G.17 cannot delete `src/elements/<family>/`
   until F.2.x .. F.12.x have retired all consumers.
3. **Wave 6 (mass deletions + Z retro-fits) → Wave 7 (per-package
   compile)** — H cannot land composite refs until G has removed the
   circular legacy paths.

All other sub-phases can be parallelized.

---

## §4 — Cadence forecast (S73 → S87, 15 sprints)

Per chunk 26: **~452 sub-phases** total at **~30 PRs/sprint with 2
engineers**. As of 2026-04-30, **~52 sub-phases done** (rows 1–24 of
the audit tracker plus implicit closures from earlier batch work).
That leaves **~400 remaining** at ~30/sprint = **~14 sprints**, landing
the wireup endpoint at **S87 / M40 (PRYZM 3 day 1)** as the S72 plan
§1 commits.

| Sprint | Wave focus | PRs | Notes |
|--------|------------|-----|-------|
| **S73 (now)** | Wave 1.A + 1.B + 1.C + Wave 2 (start) | 25–30 | most of D.7.x + the 12 F-launch families + 2 B.13 closeouts + 8 of the 27 B.14–B.40 widenings |
| **S74** | Wave 2 (finish) + Wave 3 (D.4.1) | ~28 | rest of B.14–B.40 + start the EngineBootstrap split |
| **S75** | Wave 3 (D.4.2 .. D.4.5) | ~28 | finish the split; this is the boulder sprint |
| **S76** | Wave 4 (C.3.01–C.3.15) + opportunistic E | ~28 | persistence rewire — first half |
| **S77** | Wave 4 (C.3.16–C.3.30) + Z.0–Z.20 retro-fits | ~28 + 21 | persistence rewire — second half + chunk 26 retro-fits |
| **S78** | Wave 5 (F.1.x finish + F.2.x family rollout) | ~28 | toolbar rail rewrites + property panels per family |
| **S79** | Wave 5 (F.3.x + F.4.x) | ~28 | creation modals + import paths |
| **S80** | Wave 5 (F.5.x + F.6.x first half) | ~28 | bottom strip + view/sheet panels |
| **S81** | Wave 5 (F.6.x rest + F.8.x + F.10.x) | ~28 | left rail + visibility-intent + rendering |
| **S82** | Wave 5 (F.9.x + F.11.x) + Wave 6 (G.1 .. G.10) | ~28 | data workbench + modals + start mass deletions |
| **S83** | Wave 5 (F.7.x AI + F.4.x context) + Wave 6 (G.11 .. G.20) | ~28 | AI gestures + continue deletions; G.19 retires persistence |
| **S84** | Wave 5 (F.7.15-16 voice + F.12.x marketplace) + Wave 6 (G.21 .. G.33 + G.32.*) | ~28 | finish F-bucket; PRYZM 1 lights-out |
| **S85** | Wave 7 (H.1 .. H.5 + H.5.1) | ~28 | per-package compile mid-tier; sprint-ID hook |
| **S86** | Wave 7 (H.6 .. H.7) | ~28 | bench hard-fail flips |
| **S87** | Wave 7 (H.8 .. H.10) + GA gate | ~28 | catch-all gesture sweep + visual-diff CI; **WIREUP COMPLETE → PRYZM 3 day 1** |

> **Velocity check**: the 2026-04-30 day shipped 7 sub-phases (rows
> 18–24), close to a single sprint's worth of throughput in one day at
> 2 engineers. If this velocity holds, the wireup endpoint may land
> meaningfully earlier than S87.

---

## §5 — Per-wave verifiers (one-line shell commands)

For each wave, the **single shell command that proves the wave landed**:

| Wave | Verifier | Pass criterion |
|------|----------|----------------|
| **1** | `rg -c "from.*UnifiedFrameLoop" src/; rg -c "kind: 'toolbar.discipline'" plugins/*/src/contributions.ts \| awk -F: '{s+=$2} END {print s}'; rg -c "TODO\(B\):" src/ui/RadialMenu.ts src/ui/UiPreferences.ts` | `0 ; 13 ; 0` |
| **2** | `rg -lc "constructor.*runtime\?:.*PryzmRuntime" src/ui/ \| wc -l` | `≥ 40` |
| **3** | `wc -l src/engine/EngineBootstrap.ts` | `≤ 150` |
| **4** | `rg -c "(window as any).*projectContext" src/ui/; ls src/persistence/ProjectRepository.ts 2>&1 \| grep -c "No such"` | `0 ; 1` |
| **5** | `rg -c "kind: 'toolbar.discipline'" plugins/*/src/contributions.ts \| awk -F: '{s+=$2} END {print s}'; rg -c "runtime\.plugins\.contributions" src/ui/` | `≥ 13 ; ≥ 50` |
| **6** | `find src/elements -maxdepth 1 -type d \| wc -l; find src/commands -maxdepth 1 -type d \| wc -l` | `≤ 1 ; ≤ 1` |
| **7** | `pnpm ga-gate` (the §23 verification harness from chunk 26) | exit 0 |

The audit tracker (`0_PHASES-A-F-MISSING-ITEMS-2026-04-29.md`) §II.99
ratchet metrics table will be updated **once per wave** with the
post-wave numbers.

---

## §6 — Phase A — Composition root (7 sub-phases, ALL ✅)

> **Status**: COMPLETE (S73-WIRE). Source: chunk 14 §16.1.

| ID | Description | Status | Wave |
|----|-------------|--------|------|
| **A.1** | App boot — `src/main.ts` runs `composeRuntime()` and `PlatformRouter.start(runtime)` | ✅ | (W0) |
| **A.2** | New package `packages/runtime-composer/` with `composeRuntime()` factory | ✅ | (W0) |
| **A.3** | Typed `PryzmRuntime` interface with 14 named slots | ✅ | (W0) |
| **A.4** | `PlatformRouter.start(runtime)` typed signature change | ✅ | (W0) |
| **A.5** | `PlatformShell(runtime)` constructor; threads runtime to children | ✅ | (W0) |
| **A.6** | Toast: `runtime.toasts.show(...)` typed wrapper around AppToast singleton | ✅ | (W0) |
| **A.7** | `eslint-plugin-pryzm/no-window-as-any` lands in WARN mode + baseline file | ✅ | (W0) |

---

## §7 — Phase B — Constructor widening (40 sub-phases)

> **Status**: 10/40 done (B.1–B.13 batch landed; B.13-RM/UP closing in
> Wave 1.C; B.14–B.40 are Wave 2). Source: chunk 14 §16.2.

| ID | File(s) widened | Status | Wave |
|----|-----------------|--------|------|
| **B.1** | New `packages/ui-base/Panel.ts` base class with `runtime` field + lifecycle + OTel spans | ✅ | (W0) |
| **B.2** | `src/ui/Layout.ts` orchestrator | ✅ | (W0) |
| **B.3** | `src/ui/LeftNavRail.ts` | ✅ | (W0) |
| **B.4** | `src/ui/PanelManager.ts` + `src/ui/makeDraggable.ts` | ✅ | (W0) |
| **B.5** | `src/ui/PropertyInspector.ts` orchestrator | ✅ | (W0) |
| **B.6** | `src/ui/property-inspector/*` (4 files) — also covers `runtime.tools` widening per chunk 24 | ✅ | (W0) |
| **B.7** | `src/ui/views/ViewTabBar.ts` + `ViewHeaderButtons.ts` — also covers `runtime.entitlements` widening per chunk 24 (476 retargets done 2026-04-30) | ✅ | (W0) |
| **B.8** | `src/ui/ContextualEditBar.ts` — also `runtime.{ifc,dxf,rhino}.import` widening | ✅ | (W0) |
| **B.9** | `src/ui/SaveUndoRedoHUD.ts` — also `runtime.scene.renderer.presets` widening | ✅ | (W0) |
| **B.10** | `src/ui/SelectionOverlay.ts` — also `runtime.export.{ifc,glb,pdf,csv,rationale}` widening | ✅ | (W0) |
| **B.11** | `src/ui/ViewCube.ts` | ✅ | (W0) |
| **B.12** | `src/ui/AppToast.ts` (A.6) + `ConfirmDialog.ts` + `ElementCreationModal.ts` | ✅ | (W0) |
| **B.13** | `src/ui/RadialMenu.ts` + `ShortcutCheatSheet.ts` + `UiPreferences.ts` | ✅ | W1.C |
| **B.13-SC** | ShortcutCheatSheet sub-PR (widening done 2026-04-30) | ✅ | W1.C |
| **B.13-RM** | RadialMenu Variant B widening + retarget 9 `TODO(B):` (parent threaded via `initTools(runtime)` → `EngineBootstrap`, 0 `TODO(B):`, build green 2026-04-30) | ✅ | W1.C |
| **B.13-UP** | UiPreferences Variant B widening (0 casts; `setRuntime(runtime)` injected in `main.ts` after `composeRuntime`, build green 2026-04-30) | ✅ | W1.C |
| **B.14** | `src/ui/SpatialTree.ts` (438 LOC, 22 casts) — Variant C factory; widening pre-done in B.7; parent-thread completed via `createSpatialTree(runtime ?? null)` from `src/ui/Layout.ts:317`; build green 2026-04-30 | ✅ | W2 |
| **B.15** | `src/ui/levels/*` (2) + `src/ui/grids/*` (1+GD) — full sub-tree threaded through `Layout.ts → ProjectBrowserPanel → LevelsGridsRailPanel → {LevelManagerPanel, GridManagerPanel}` + B.15-GD singleton hand-off; build green 2026-04-30 | ✅ | W2 |
| **B.15-LM** | levels/LevelManagerPanel sub-PR — `new LevelManagerPanel({…}, this.runtime)` threaded from `LevelsGridsRailPanel.ts:62`; 2 runtime decls in file; 0 retained casts | ✅ | W2 |
| **B.15-AL** | levels/ActiveLevelHUD sub-PR — `new ActiveLevelHUD({…}, runtime ?? null)` threaded from `Layout.ts:1027` (delayed-construction site, 600ms timer); 2 runtime decls; 0 retained casts | ✅ | W2 |
| **B.15-GM** | grids/GridManagerPanel sub-PR — `new GridManagerPanel({…}, this.runtime)` threaded from `LevelsGridsRailPanel.ts:90`; 2 runtime decls; legacy `(window as any).gridStore` annotated `TODO(E.13) → E.grids.S` | ✅ | W2 |
| **B.15-GD** | grids/GridDrawingHUD sub-PR — module-load singleton refactored from `public readonly runtime` to `private _runtime` + `setRuntime()` (mirrors B.13-UP `UiPreferences` pattern); `gridDrawingHUD.setRuntime(runtime)` injected from `src/main.ts:248` immediately after `composeRuntime()`; 2 runtime decls; 0 retained casts | ✅ | W2 |
| **B.16** | `src/ui/imported-models/*` + `src/ui/import-manager/*` + `src/ui/import/*` | ✅ 2026-04-30 | W2 — `ImportManagerPanel(p.runtime ?? null)` threaded from `initUI.ts:1662`; `DxfImportPanel` already done in A.6 (`Layout.ts:335`); `ImportedModelsPanel` widening pre-done, no live caller (file is dead-code-ready for future use) |
| **B.17** | `src/ui/ProjectBrowser/*` + `src/ui/ViewBrowser/*` + `ViewBrowser/panels/*` | ✅ 2026-04-30 | W2 — Threaded `this.runtime` to 6 sub-panels in `ProjectBrowserPanel.ts` (`RailPanelController`, `UnifiedBrowserPanel`, `DocumentsBrowserPanel`, `AIRailPanel`, `CameraRailPanel`, `PhysicsRailPanel`) and 3 sub-panels in `DocumentsBrowserPanel.ts` (`SheetsRailPanel`, `ViewsRailPanel`, `SchedulesRailPanel`). Outer `UnifiedBrowserPanel` + `DocumentsBrowserPanel` classes also widened (B.7 had only widened their inner proxy classes) |
| **B.18** | `src/ui/data/*` + `src/ui/data/buckets/*` | ✅ 2026-04-30 | W2 — `DataCommandCenter` is module-load singleton; refactored to `private _runtime` + `setRuntime()` pattern (mirrors UiPreferences/gridDrawingHUD/PanelManager); `setRuntime()` re-buckets so 4 child buckets receive the typed handle. `dataCommandCenter.setRuntime(runtime)` injection added at `src/main.ts:260`. Buckets + `PIPRenderer` threaded with `this._runtime` at `_buildBuckets()`+`_ensurePIP()` |
| **B.19** | `src/ui/dataworkbench/DataWorkbench.ts` orchestrator | ✅ 2026-04-30 | W2 — `new DataWorkbench(runtime ?? null)` threaded from `EngineBootstrap.ts:330`; runtime is in scope from bootstrap signature param |
| **B.20** | dataworkbench/AnalyticsPanel | ✅ 2026-04-30 | W2 — `new AnalyticsPanel(this.runtime)` threaded from `DataWorkbench.ts:417`; chart data resolution can route through `runtime.dataworkbench` in C-phase |
| **B.21** | dataworkbench/CompliancePanel | ✅ 2026-04-30 | W2 — `new CompliancePanel(container, this.runtime)` threaded from `DataWorkbench.ts:409` |
| **B.22** | dataworkbench/DataSheetPanel | ✅ 2026-04-30 | W2 — `new DataSheetPanel(container, this.runtime)` threaded from `DataWorkbench.ts:407` |
| **B.23** | dataworkbench/DesignHistoryPanel | ✅ 2026-04-30 | W2 — `new DesignHistoryPanel(container, this.runtime)` threaded from `DataWorkbench.ts:414` |
| **B.24** | dataworkbench/HierarchyTreePanel | ✅ 2026-04-30 | W2 — `new HierarchyTreePanel(container, this.runtime)` threaded from `DataWorkbench.ts:406` (also `LeftNavRail.ts:536` was already done in earlier wave) |
| **B.25** | dataworkbench/NLQueryPanel | ✅ 2026-04-30 | W2 — `new NLQueryPanel(container, this.runtime)` threaded from `DataWorkbench.ts:413` |
| **B.26** | dataworkbench/PhysicsPanel | ✅ 2026-04-30 | W2 — `new PhysicsPanel(container, this.runtime)` threaded from `DataWorkbench.ts:422` |
| **B.27** | dataworkbench/PortfolioQueryPanel | ✅ 2026-04-30 | W2 — `new PortfolioQueryPanel(container, this.runtime)` threaded from `DataWorkbench.ts:445` |
| **B.28** | dataworkbench/ProgrammePanel | ✅ 2026-04-30 | W2 — `new ProgrammePanel(container, this.runtime)` threaded from `DataWorkbench.ts:411` |
| **B.29** | dataworkbench/RelationshipExplorerPanel | ✅ 2026-04-30 | W2 — `new RelationshipExplorerPanel(container, this.runtime)` threaded from `DataWorkbench.ts:412` |
| **B.30** | dataworkbench/{SpatialQuery,TemplateEditor,SyncStateDetailDrawer} | ✅ 2026-04-30 | W2 — **3 sub-files**: `SpatialQueryPanel(container, this.runtime)` from `DataWorkbench.ts:410`; `TemplateEditorPanel(container, this.runtime)` from `DataWorkbench.ts:408`; **`SyncStateDetailDrawer` is a module-load singleton** consumed by `HierarchyTreePanel.ts:729` — refactored to `private _runtime` + `setRuntime()` (5th instance of pattern after PanelManager/UiPreferences/gridDrawingHUD/dataCommandCenter); `syncStateDetailDrawer.setRuntime(runtime)` injected from `src/main.ts:268` |
| **B.31** | `src/ui/ai/AIPanel.ts` orchestrator | ⏳ | W2 |
| **B.32** | `src/ui/ai/{AICreate,Validate,FloorPlanImport,FloorPlanFullPlanViewer,FloorPlanDebugOverlay}Panel.ts` | ⏳ | W2 |
| **B.33** | `src/ui/intent/*` (6 files) | ⏳ | W2 |
| **B.34** | `src/ui/generative/*` (2) | ⏳ | W2 |
| **B.35** | `src/ui/rendering/*` (10 orchestrators) | ⏳ | W2 |
| **B.36** | `src/ui/SchedulePanel/*` + `src/ui/SheetEditor/*` orchestrators | ⏳ | W2 |
| **B.37** | `src/ui/{furniture-carousel,wardrobe,kitchen,rooms}/*` orchestrators | ⏳ | W2 |
| **B.38** | `src/ui/bottom-menu/BottomActionMenu.ts` orchestrator | ⏳ | W2 |
| **B.39** | `src/ui/canvas/*` (4) + `src/ui/overlays/*` (2) | ⏳ | W2 |
| **B.40** | `src/ui/{inspect,interop,geospatial,fallbacks,primitives,icons}/*` | ⏳ | W2 |

---

## §8 — Phase C — Persistence rewire (37 base + C.14 + C.exit.1–4 = 42 sub-phases)

> **Status**: ~4/42 done (C.10.x auth orthogonal work pre-landed; C.1.01
> hub paint partially landed). Source: chunk 14 §16.3 + chunk 24 §24.5
> (C.14) + chunk 26 §26.13 (C.exit.1–4).

### §8.1 — Hub paint + filter + sort (C.1.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.1.01** | Hub paints with project list — `runtime.persistence.client.list()` + store subscribe | 🟡 | W4 |
| **C.1.02** | Hub: search field keystroke filters list | ⛔ | W4 |
| **C.1.03** | Hub: sort dropdown change (recent / name / size) | ⛔ | W4 |
| **C.1.04** | Hub: archive/active tab toggle | ⛔ | W4 |

### §8.2 — Hub: new project (C.2.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.2.01** | Hub: click "+ New project" button → modal opens | ⛔ | W4 |
| **C.2.02** | Hub: "+ New project" modal submit → `runtime.persistence.client.create(name)` | ⛔ | W4 |

### §8.3 — Hub: open project (C.3.x — primary persistence rewire batch)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.3.01** | Hub: click "Open" on project card → `runtime.persistence.openProject(id)` + `PlatformShell.show('workspace')` | ⛔ | W4 |
| **C.3.02** | Hub: keyboard Enter on focused card → open | ⛔ | W4 |
| **C.3.03** | (extension) ProjectHub `projectRepository.listProjects()` reach #1 | ⛔ | W4 |
| **C.3.04** | (extension) ProjectHub `projectRepository.*` reaches #2 | ⛔ | W4 |
| **C.3.05** | (extension) ProjectHub `projectRepository.*` reaches #3 | ⛔ | W4 |
| **C.3.06** | SaveOrchestrator consumer #1 → `runtime.persistence.save()` | ⛔ | W4 |
| **C.3.07** | SaveOrchestrator consumer #2 | ⛔ | W4 |
| **C.3.08** | SaveOrchestrator consumer #3 | ⛔ | W4 |
| **C.3.09** | SaveOrchestrator consumer #4 | ⛔ | W4 |
| **C.3.10** | SaveOrchestrator consumer #5 | ⛔ | W4 |
| **C.3.11** | ServerSyncQueue consumer #1 → `runtime.sync.client.*` | ⛔ | W4 |
| **C.3.12** | ServerSyncQueue consumer #2 | ⛔ | W4 |
| **C.3.13** | ServerSyncQueue consumer #3 | ⛔ | W4 |
| **C.3.14** | ServerSyncQueue consumer #4 | ⛔ | W4 |
| **C.3.15** | ServerSyncQueue consumer #5 | ⛔ | W4 |
| **C.3.16** | `(window as any).projectContext` reach in `src/ui/` batch #1 | ⛔ | W4 |
| **C.3.17** | `projectContext` reach batch #2 | ⛔ | W4 |
| **C.3.18** | `projectContext` reach batch #3 | ⛔ | W4 |
| **C.3.19** | `projectContext` reach batch #4 | ⛔ | W4 |
| **C.3.20** | `projectContext` reach batch #5 (final retirement) | ⛔ | W4 |
| **C.3.21** | DesignHistoryPanel persistence rewire | ⛔ | W4 |
| **C.3.22** | SaveUndoRedoHUD persistence rewire | ⛔ | W4 |
| **C.3.23** | WorkspaceController persistence rewire | ⛔ | W4 |
| **C.3.24** | ViewBrowser persistence rewire | ⛔ | W4 |
| **C.3.25** | SchedulePanel persistence rewire | ⛔ | W4 |
| **C.3.26** | SheetEditor persistence rewire | ⛔ | W4 |
| **C.3.27** | ProjectMemberPanel persistence rewire (pre-C.8) | ⛔ | W4 |
| **C.3.28** | OwnerSettingsPanel persistence rewire (pre-C.9) | ⛔ | W4 |
| **C.3.29** | UiPreferences persistence rewire (pre-C.9) | ⛔ | W4 |
| **C.3.30** | per-panel residual sweep (chunk 14 leaves this slot for catch-up) | ⛔ | W4 |

### §8.4 — Hub: context menu (C.4.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.4.01** | Hub: right-click card → context menu shows | ⛔ | W4 |
| **C.4.02** | Context menu → Rename → `runtime.persistence.client.rename(id, newName)` | ⛔ | W4 |
| **C.4.03** | Context menu → Delete → confirm → `runtime.persistence.client.delete(id)` | ⛔ | W4 |
| **C.4.04** | Context menu → Archive/Unarchive → `runtime.persistence.client.patch(id, {isArchived})` | ⛔ | W4 |
| **C.4.05** | Context menu → Star/Unstar → `runtime.persistence.client.patch(id, {isStarred})` | ⛔ | W4 |
| **C.4.06** | Context menu → Duplicate → `runtime.persistence.client.duplicate(id, newName)` | ⛔ | W4 |
| **C.4.07** | Context menu → Export .pryzm → `runtime.persistence.exporter.toPryzm(id)` | ⛔ | W4 |
| **C.4.08** | Hub: drag-and-drop `.pryzm` ZIP → `runtime.persistence.importer.fromPryzm(file)` | ⛔ | W4 |

### §8.5 — Workspace open progress (C.5.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.5.01** | Workspace open → loading overlay listens to `runtime.events.on('persistence.openProgress', ...)` | ⛔ | W4 |

### §8.6 — Save / undo / redo / cmd-S (C.6.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.6.01** | Save status pill state transition (idle→pending→synced) via `runtime.events.on('persistence.status', ...)` | ⛔ | W4 |
| **C.6.02** | Undo button + Cmd+Z → `runtime.undoStack.undo()` | ⛔ | W4 |
| **C.6.03** | Redo button + Cmd+Shift+Z → `runtime.undoStack.redo()` | ⛔ | W4 |
| **C.6.04** | Cmd+S → "Save as named version" → `runtime.persistence.eventLog.tag('user-version', {label})` | ⛔ | W4 |

### §8.7 — CDE version panel (C.7.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.7.01** | CDEVersionPanel: list named versions → `runtime.persistence.eventLog.tags(id)` | ⛔ | W4 |
| **C.7.02** | CDEVersionPanel: click "Restore" → `runtime.persistence.eventLog.replayUntil(id, eventId)` | ⛔ | W4 |
| **C.7.03** | CDEVersionPanel: "Compare with current" → `runtime.persistence.eventLog.diff(eventA, eventB)` | ⛔ | W4 |

### §8.8 — Project members (C.8.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.8.01** | ProjectMemberPanel: list members → `runtime.persistence.client.members.list(id)` | ⛔ | W4 |
| **C.8.02** | ProjectMemberPanel: invite member submit → `members.invite(id, email, role)` | ⛔ | W4 |
| **C.8.03** | ProjectMemberPanel: remove member → `members.remove(id, userId)` | ⛔ | W4 |
| **C.8.04** | ProjectMemberPanel: change role dropdown → `members.setRole(id, userId, role)` | ⛔ | W4 |

### §8.9 — Settings (C.9.x)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.9.01** | OwnerSettingsPanel: feature-flag toggle → `runtime.userPreferences.flags.set(key, value)` | ⛔ | W4 |
| **C.9.02** | UiPreferences: theme / locale / units / autosave-interval → `runtime.userPreferences.set(key, value)` | ⛔ | W4 |

### §8.10 — Auth (C.10.x — orthogonal, can land early)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **C.10.01** | Auth: login submit (token consumed by `runtime.persistence.client.getAuthToken()`) | ✅ | (W0) |
| **C.10.02** | Auth: signup submit (unchanged path) | ✅ | (W0) |
| **C.10.03** | Auth: forgot password submit | ✅ | (W0) |
| **C.10.04** | Auth: logout → `runtime.persistence.signOut()` | ✅ | (W0) |

### §8.11 — Legacy persistence file deletions (C.11.x)

| ID | Action | Status | Wave |
|----|--------|--------|------|
| **C.11.01** | DELETE `src/ui/platform/ProjectRepository.ts` | ⛔ | W4 |
| **C.11.02** | DELETE `src/ui/platform/SaveOrchestrator.ts` | ⛔ | W4 |
| **C.11.03** | DELETE `src/ui/platform/ServerSyncQueue.ts` | ⛔ | W4 |

### §8.12 — Persistence client extension (C.14, per chunk 24)

| ID | Action | Status | Wave |
|----|--------|--------|------|
| **C.14** | Move `UnderlayPersistence` into `packages/persistence-client/` as `runtime.persistence.underlay` | ⛔ | W4 |

### §8.13 — Phase C exit gate (C.exit.1–4, per chunk 26 §26.13)

| ID | Condition | Status | Wave |
|----|-----------|--------|------|
| **C.exit.1** | All 5 callers of legacy `ProjectRepository`/`SaveOrchestrator`/`ServerSyncQueue` retired (= C.3.x complete) | ⛔ | W4 |
| **C.exit.2** | The 3 legacy persistence files deleted (= C.11.x complete) | ⛔ | W4 |
| **C.exit.3** | localStorage `bim-projects-index` key gone | ⛔ | W4 |
| **C.exit.4** | All Phase C bench thresholds green in `apps/bench/baseline.json` | ⛔ | W4 |

---

## §9 — Phase D — Engine consolidation (14 sub-phases)

> **Status**: ~6/14 done (D.1–D.3 + D.5 + prereqs done; D.4 is the
> Wave-3 boulder; D.7 is in mid-rollout via Wave 1.A). Source: chunk
> 14 §16.4.

| ID | Gesture / Surface | Status | Wave |
|----|-------------------|--------|------|
| **D.1** | Workspace open: always mounts `runtime.scene.renderer`; `#pryzm2-canvas`/`#progress` deleted | ✅ | (W0) |
| **D.2** | DELETE `src/main.ts` `?pryzm2=1` kill-switch (386-line teardown) | ✅ | (W0) |
| **D.3** | DELETE `apps/editor/src/main.ts:mountEditor()` | ✅ | (W0) |
| **D.4** | DELETE `src/engine/EngineBootstrap.ts` (2 086 LOC) — sliced into D.4.1–D.4.5 below | ⛔ | W3 |
| **D.4.1** | Extract `EngineBootstrap.scene.ts` (~600 LOC: camera, lights, render setup) | ⛔ | W3 |
| **D.4.2** | Extract `EngineBootstrap.persistence.ts` (~500 LOC: project context, save/load, sync) | ⛔ | W3 |
| **D.4.3** | Extract `EngineBootstrap.physics.ts` (~300 LOC) | ⛔ | W3 |
| **D.4.4** | Extract `EngineBootstrap.input.ts` (~250 LOC) | ⛔ | W3 |
| **D.4.5** | Finalize `src/engine/EngineBootstrap.ts` as ≤150-LOC re-export shim | ⛔ | W3 |
| **D.5** | DELETE `src/engine/init*.ts` (6 files; rAF count 6 → 1) | ✅ | (W0) |
| **D.6** | DELETE `src/engine/RenderPipelineManager.ts` (~680 LOC) | 🟡 | W1 |
| **D.7** | DELETE `src/engine/UnifiedFrameLoop.ts` (402 LOC) — sliced into D.7.1–D.7.10 below | 🟡 | W1.A |
| **D.7.1** | `getFrameScheduler()` factory introduced (gates the rest of D.7) | ✅ | W1.A |
| **D.7.2** | Rewire `src/core/views/ViewDependencyTracker.ts` | ⏳ | W1.A |
| **D.7.3** | Rewire `src/core/views/SplitViewManager.ts` | ⏳ | W1.A |
| **D.7.4** | Rewire `src/core/views/PlanViewManager.ts` | ⏳ | W1.A |
| **D.7.5** | Rewire `src/core/views/PlanViewInteraction.ts` | ⏳ | W1.A |
| **D.7.6** | Rewire `src/rendering/SSGIService.ts` | ⏳ | W1.A |
| **D.7.7** | Rewire `src/core/rendering/FrameCoordinator.ts` | ⏳ | W1.A |
| **D.7.8** | Rewire `src/rendering/EnhancedBloomService.ts` | ⏳ | W1.A |
| **D.7.9** | Rewire `src/engine/subsystems/{initScene,initPersistence}.ts` (last 2 consumers) | ⏳ | W1.A |
| **D.7.10** | DELETE `src/core/rendering/UnifiedFrameLoop.ts` (424 LOC) | ⛔ | W1.A |
| **D.8** | DELETE `src/engine/BatchCoordinator.ts` + `DrawingPipelineOrchestrator.ts` | 🟡 | W1 |
| **D.9** | ViewCube drag → `runtime.cameraController.setView(...)` + scheduler dirty flag | ✅ | (W0) |
| **D.10** | ViewCube click face → orthographic snap | ✅ | (W0) |
| **D.11** | View tab click → `runtime.viewRegistry.activate(viewId)` | ✅ | (W0) |
| **D.12** | WorkspaceModeBar mode switch (3D/Plan/Section/Sheet) → `runtime.workspace.setMode(mode)` | ⏳ | W3 |
| **D.13** | Selection: viewport click → `runtime.picking.pick(canvasPoint)` → `runtime.selection.select(...)` | ⏳ | W3 |
| **D.14** | Selection: drag marquee → `runtime.picking.marquee(rectStart, rectEnd)` → multi-select | ⏳ | W3 |

---

## §10 — Phase E — Per-family element migration (14 base + E.6.0 + E.15–17 = 18 sub-phases)

> **Status**: ~15/18 done (most families pre-migrated from PRYZM 1).
> Source: chunk 15 §16.5 + chunk 24 §24.5 (E.6.0, E.15, E.16, E.17).

| ID | Family | Status | Wave |
|----|--------|--------|------|
| **E.1** | Wall — Alt+W; mode L/O/C/S; draw frame; commit; edit; thickness; delete; copy; mirror | ✅ | (W0) |
| **E.2** | Slab — Alt+S; draw; edit; delete | ✅ | (W0) |
| **E.3** | Door — Alt+D; pick host wall; place; edit; delete | ✅ | (W0) |
| **E.4** | Window — Alt+I (same as door flow) | ✅ | (W0) |
| **E.5** | Curtain Wall — Alt+Q; SINGLE/COMPLEX picker; draw; edit grid + panel | ✅ | (W0) |
| **E.6** | Floor — draw; commit; edit; delete | ⛔ | (W5/E) |
| **E.6.0** | Scaffold missing `plugins/floor/` package (prerequisite for E.6 per chunk 24 §24.2) | ✅ | (W0) |
| **E.7** | Ceiling — draw; commit; edit; delete | ✅ | (W0) |
| **E.8** | Roof — slope/hip/gable picker; draw; edit; delete | ✅ | (W0) |
| **E.9** | Stair — StairLevelRequiredPanel; StairSetupPanel; commit; edit; delete | ✅ | (W0) |
| **E.10** | Handrail — place along path; commit; edit | ✅ | (W0) |
| **E.11** | Column — Alt+C; place; commit; edit | ✅ | (W0) |
| **E.12** | Beam — Alt+B; place; commit; edit | ✅ | (W0) |
| **E.13** | Grid — GridDrawingHUD; place; commit; edit; delete | ⏳ | (W5/E) |
| **E.14** | Opening (cross-family: hosted in wall + slab) — picker; pick host; place; commit | ✅ | (W0) |
| **E.15** | `src/elements/openings/` absorption into door + window + curtain-wall plugins (per chunk 24 §24.2) | ✅ | (W0) |
| **E.16** | `src/elements/preview/` helpers split per family (per chunk 24 §24.2) | ✅ | (W0) |
| **E.17** | `src/elements/roomBoundingLines/` absorption into `plugins/rooms` (per chunk 24 §24.2) | ⏳ | (W5/E) |

---

## §11 — Phase F — Plugin contributions (257 sub-phases)

> **Status**: ~2/257 done (F.1.01 + F-launch.1). Sources: chunks 16, 17, 18.

### §11.1 — Group F.1: `toolbar.discipline` contributions (65 sub-phases)

#### Architecture rail (CreateRailPanel)

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.01** | Wall — `plugins/wall/contributions.ts` | ✅ | W1.B |
| **F.1.02** | Curtain Wall — `plugins/curtain-wall/contributions.ts` | ⏳ | W1.B |
| **F.1.03** | Door — `plugins/door/contributions.ts` | ⏳ | W1.B |
| **F.1.04** | Window — `plugins/window/contributions.ts` | ⏳ | W1.B |
| **F.1.05** | Slab — `plugins/slab/contributions.ts` | ⏳ | W1.B |
| **F.1.06** | Floor — `plugins/floor/contributions.ts` | ⏳ | W1.B |
| **F.1.07** | Ceiling — `plugins/ceiling/contributions.ts` | ⏳ | W1.B |
| **F.1.08** | Roof — `plugins/roof/contributions.ts` | ⏳ | W1.B |
| **F.1.09** | Stair — `plugins/stair/contributions.ts` | ⏳ | W1.B |
| **F.1.10** | Handrail — `plugins/handrail/contributions.ts` | ⏳ | W1.B |
| **F.1.11** | Column — `plugins/column/contributions.ts` | ⏳ | W1.B |
| **F.1.12** | Beam — `plugins/beam/contributions.ts` | ⏳ | W1.B |
| **F.1.13** | Grid — `plugins/grids/contributions.ts` | ⏳ | W1.B |
| **F.1.14** | CreateRailPanel `_buildSections()` rewrite — data-driven enumeration (the **hard switch**) | ⛔ | W5 |

#### Annotation rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.15** | Text Annotation | ⛔ | W5 |
| **F.1.16** | Linear Dimension | ⛔ | W5 |
| **F.1.17** | Aligned Dimension | ⛔ | W5 |
| **F.1.18** | Angular Dimension | ⛔ | W5 |
| **F.1.19** | Radial Dimension | ⛔ | W5 |
| **F.1.20** | Tag | ⛔ | W5 |
| **F.1.21** | Section Mark | ⛔ | W5 |
| **F.1.22** | Detail Mark | ⛔ | W5 |
| **F.1.23** | Revision Cloud | ⛔ | W5 |
| **F.1.24** | AnnotationRailPanel rewrite — data-driven | ⛔ | W5 |

#### Export rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.25** | Export PDF | ⛔ | W5 |
| **F.1.26** | Export DWG/DXF | ⛔ | W5 |
| **F.1.27** | Export IFC (UI contribution; plugin already exists) | ⛔ | W5 |
| **F.1.28** | Export Schedule CSV | ⛔ | W5 |
| **F.1.29** | Export Image | ⛔ | W5 |
| **F.1.30** | ExportRailPanel rewrite | ⛔ | W5 |

#### GIS rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.31** | Locate (lat/lon picker) | ⛔ | W5 |
| **F.1.32** | Basemap toggle | ⛔ | W5 |
| **F.1.33** | Terrain toggle | ⛔ | W5 |
| **F.1.34** | Satellite imagery toggle | ⛔ | W5 |
| **F.1.35** | GISRailPanel rewrite | ⛔ | W5 |

#### Grids+Levels rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.36** | New Grid | ⛔ | W5 |
| **F.1.37** | New Level | ⛔ | W5 |
| **F.1.38** | Split Level | ⛔ | W5 |
| **F.1.39** | Offset Grid | ⛔ | W5 |
| **F.1.40** | Copy Grid | ⛔ | W5 |
| **F.1.41** | Delete Grid/Level | ⛔ | W5 |
| **F.1.42** | GridsLevelsRailPanel rewrite | ⛔ | W5 |

#### Navigate rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.43** | Pan | ⛔ | W5 |
| **F.1.44** | Orbit | ⛔ | W5 |
| **F.1.45** | Zoom | ⛔ | W5 |
| **F.1.46** | Zoom-to-fit | ⛔ | W5 |
| **F.1.47** | Zoom-to-selection | ⛔ | W5 |
| **F.1.48** | Walkthrough | ⛔ | W5 |
| **F.1.49** | NavigateRailPanel rewrite | ⛔ | W5 |

#### Render rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.50** | Render Quality preset | ⛔ | W5 |
| **F.1.51** | Sun control | ⛔ | W5 |
| **F.1.52** | Materials editor open | ⛔ | W5 |
| **F.1.53** | Exposure slider | ⛔ | W5 |
| **F.1.54** | Render Gallery open | ⛔ | W5 |
| **F.1.55** | Start Render | ⛔ | W5 |
| **F.1.56** | Panorama capture | ⛔ | W5 |
| **F.1.57** | Walkthrough export | ⛔ | W5 |
| **F.1.58** | RenderRailPanel rewrite | ⛔ | W5 |

#### Visual rail

| ID | Tool button | Status | Wave |
|----|-------------|--------|------|
| **F.1.59** | Visibility-Graphics open | ⛔ | W5 |
| **F.1.60** | Edge style toggle | ⛔ | W5 |
| **F.1.61** | Transparency | ⛔ | W5 |
| **F.1.62** | Isolate selection | ⛔ | W5 |
| **F.1.63** | Hide selection | ⛔ | W5 |
| **F.1.64** | Reveal hidden | ⛔ | W5 |
| **F.1.65** | VisualRailPanel rewrite | ⛔ | W5 |

### §11.2 — Group F.2: `inspector.element` contributions (19 sub-phases)

| ID | Family | Status | Wave |
|----|--------|--------|------|
| **F.2.01** | Wall (`WallTypeSelectorWidget` + `WallLayersEditor`) → `plugins/wall/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.02** | Slab (`SlabTypeSelector` + `SlabDimensions` + `SlabLayers`) → `plugins/slab/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.03** | Door → `plugins/door/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.04** | Window → `plugins/window/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.05** | Curtain Wall (`CurtainGrid` + `CurtainPanel` + `CurtainSubElement`) → `plugins/curtain-wall/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.06** | Floor → `plugins/floor/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.07** | Ceiling → `plugins/ceiling/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.08** | Roof (`RoofPropertySheet`) → `plugins/roof/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.09** | Stair → `plugins/stair/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.10** | Column → `plugins/column/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.11** | Beam → `plugins/beam/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.12** | Plumbing → `plugins/plumbing/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.13** | Annotation → `plugins/annotations/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.14** | Dimension → `plugins/dimensions/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.15** | Room → `plugins/rooms/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.16** | Furniture → `plugins/furniture/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.17** | Generic / View / Sheet (catch-all) → `plugins/views/inspector/Panel.ts` + `plugins/sheets/inspector/Panel.ts` | ⛔ | W5 |
| **F.2.18** | PropertyInspector orchestrator rewrite → enumerate `runtime.plugins.contributions('inspector.element')` | ⛔ | W5 |
| **F.2.19** | Multi-select common-fields panel (`inspector.multiselect` contribution kind) | ⛔ | W5 |

### §11.3 — Group F.3: `modal.creation` contributions (15 sub-phases)

| ID | Modal | Status | Wave |
|----|-------|--------|------|
| **F.3.01** | Create Wall modal → `plugins/wall/modal/Create.ts` | ⛔ | W5 |
| **F.3.02** | Create Slab modal | ⛔ | W5 |
| **F.3.03** | Create Door modal | ⛔ | W5 |
| **F.3.04** | Create Window modal | ⛔ | W5 |
| **F.3.05** | Create Curtain Wall modal | ⛔ | W5 |
| **F.3.06** | Create Floor modal | ⛔ | W5 |
| **F.3.07** | Create Ceiling modal | ⛔ | W5 |
| **F.3.08** | Create Roof modal | ⛔ | W5 |
| **F.3.09** | Create Stair modal | ⛔ | W5 |
| **F.3.10** | Create Handrail modal | ⛔ | W5 |
| **F.3.11** | Create Column modal | ⛔ | W5 |
| **F.3.12** | Create Beam modal | ⛔ | W5 |
| **F.3.13** | Create Grid modal | ⛔ | W5 |
| **F.3.14** | OpeningModePicker (host-pick → place) → `plugins/wall/modal/Opening.ts` (cross-family) | ⛔ | W5 |
| **F.3.15** | ElementCreationModal orchestrator rewrite → contributions-based dispatch | ⛔ | W5 |

### §11.4 — Group F.4: `menu.context` + `menu.radial` contributions (8 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.4.01** | Right-click in viewport (no selection) → context menu | ⛔ | W5 |
| **F.4.02** | Right-click on selected element → element context menu | ⛔ | W5 |
| **F.4.03** | Per-family register {Move/Rotate/Mirror/Copy/Array/Group/Properties/Delete/Hide/Isolate/Override} (~11 × 12 families) | ⛔ | W5 |
| **F.4.04** | Right-click on view tab → tab context menu | ⛔ | W5 |
| **F.4.05** | Right-click on project card (covered by C.4.01) | ✅ | (covered) |
| **F.4.06** | RadialMenu open (Q hotkey) → tools shown via contributions | ⛔ | W5 |
| **F.4.07** | Radial menu rotate-and-release → tool activated via `runtime.tools.activate(toolId)` | ⛔ | W5 |
| **F.4.08** | Radial menu customise (settings) → which tools appear → `runtime.userPreferences.radialTools[]` | ⛔ | W5 |

### §11.5 — Group F.5: Bottom strip (BottomActionMenu + carousels + sheet editor) (32 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.5.01** | Bottom: click Wall quick button → `runtime.tools.activate('wall')` | ⛔ | W5 |
| **F.5.02** | Bottom: click Curtain Wall quick button | ⛔ | W5 |
| **F.5.03** | Bottom: Door quick button | ⛔ | W5 |
| **F.5.04** | Bottom: Window quick button | ⛔ | W5 |
| **F.5.05** | Bottom: Slab quick button | ⛔ | W5 |
| **F.5.06** | Bottom: Floor quick button | ⛔ | W5 |
| **F.5.07** | Bottom: Ceiling quick button | ⛔ | W5 |
| **F.5.08** | Bottom: shortcut hotkeys (WA, CW, DR, WI, SL, FL, CE) → `runtime.tools.activate(...)` | ⛔ | W5 |
| **F.5.09** | Bottom: level switcher dropdown → `runtime.bus.executeCommand('view.setActiveLevel', ...)` | ⛔ | W5 |
| **F.5.10** | Bottom: section box toggle → `runtime.tools.sectionBox.enable/disable` | ⛔ | W5 |
| **F.5.11** | Bottom: ortho/perspective toggle → `runtime.cameraController.setProjection(mode)` | ⛔ | W5 |
| **F.5.12** | Bottom: snap settings dropdown → `runtime.userPreferences.snap` | ⛔ | W5 |
| **F.5.13** | Bottom: reset view button → `runtime.cameraController.resetView()` | ⛔ | W5 |
| **F.5.14** | Bottom: cursor coordinates readout → `runtime.hover.lastWorldPos()` | ⛔ | W5 |
| **F.5.15** | Bottom: selection count readout → `runtime.selection.size()` | ⛔ | W5 |
| **F.5.16** | FurnitureCarousel: scroll → `runtime.plugins.get('furniture').catalog` | ⛔ | W5 |
| **F.5.17** | FurnitureCarousel: click thumbnail → `runtime.tools.activate('furniture-place', {itemId})` | ⛔ | W5 |
| **F.5.18** | FurnitureCarousel: drag thumbnail into scene → drop → `runtime.bus.executeCommand('furniture.place', ...)` | ⛔ | W5 |
| **F.5.19** | FloatingObjectCarousel: same gestures (mirrors F.5.16–18) | ⛔ | W5 |
| **F.5.20** | FurnitureCarousel: filter / search | ⛔ | W5 |
| **F.5.21** | Wardrobe panel: configure assembly → `runtime.plugins.get('wardrobe').configure(...)` | ⛔ | W5 |
| **F.5.22** | Kitchen panel: configure → `runtime.plugins.get('kitchen').configure(...)` | ⛔ | W5 |
| **F.5.23** | Rooms panel (bottom) → `runtime.stores.room` reads | ⛔ | W5 |
| **F.5.24** | SchedulePanel: open schedule (click row in left rail) → `runtime.stores.schedule.get(id)` | ⛔ | W5 |
| **F.5.25** | SchedulePanel: cell edit → `runtime.bus.executeCommand('schedule.setCell', ...)` | ⛔ | W5 |
| **F.5.26** | SchedulePanel: column header click → sort | ⛔ | W5 |
| **F.5.27** | SchedulePanel: filter row | ⛔ | W5 |
| **F.5.28** | SchedulePanel: export CSV button (covered by F.1.28) | ⛔ | W5 |
| **F.5.29** | SheetEditor: click viewport in sheet → place → `plugins/sheets/SheetEditorHost.placeViewport()` (major decomposition of #2 worst file) | ⛔ | W5 |
| **F.5.30** | SheetEditor: drag viewport corner → resize → `runtime.bus.executeCommand('sheet.resizeViewport', ...)` | ⛔ | W5 |
| **F.5.31** | SheetEditor: drag titleblock → reposition → `runtime.bus.executeCommand('sheet.placeTitleBlock', ...)` | ⛔ | W5 |
| **F.5.32** | SheetEditor: select revision row → edit → `runtime.bus.executeCommand('sheet.setRevision', ...)` | ⛔ | W5 |

### §11.6 — Group F.6: Left rail panel content (per spine icon) (27 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.6.01** | MODEL spine: spatial tree paint (12 store reads → `runtime.stores.<family>`) | ⛔ | W5 |
| **F.6.02** | MODEL: click element in tree → select in viewport + camera focus | ⛔ | W5 |
| **F.6.03** | MODEL: expand/collapse level node (local UI state) | ⛔ | W5 |
| **F.6.04** | MODEL: drag element in tree → reparent → `runtime.bus.executeCommand('hierarchy.reparent', ...)` | ⛔ | W5 |
| **F.6.05** | MODEL: right-click in tree → element context menu (covered by F.4.02) | ✅ | (covered) |
| **F.6.06** | DATA spine: hierarchy paint → `runtime.dataWorkbench.hierarchy.list()` | ⛔ | W5 |
| **F.6.07** | DATA: filter/search (local on store snapshot) | ⛔ | W5 |
| **F.6.08** | DATA: click row → `runtime.selection.select(...)` | ⛔ | W5 |
| **F.6.09** | DATA: bucket panels (each bucket file) → `runtime.dataWorkbench.bucket(...)` | ⛔ | W5 |
| **F.6.10** | VIEWS spine: list views → `runtime.viewRegistry.list()` | ⛔ | W5 |
| **F.6.11** | VIEWS: click view → activate (covered by D.11) | ✅ | (covered) |
| **F.6.12** | VIEWS: "+ New view" button → `runtime.bus.executeCommand('view.create', ...)` | ⛔ | W5 |
| **F.6.13** | VIEWS: right-click view → duplicate / delete / rename | ⛔ | W5 |
| **F.6.14** | VIEWS: drag view to reorder → `view.reorder` | ⛔ | W5 |
| **F.6.15** | VIEWS: View Templates section (`ViewTemplateManagerPanel`) — apply/create/delete | ⛔ | W5 |
| **F.6.16** | SCHEDULES spine: list schedules → `runtime.stores.schedule.list()` | ⛔ | W5 |
| **F.6.17** | SCHEDULES: "+ New schedule" wizard → `schedule.create` | ⛔ | W5 |
| **F.6.18** | SCHEDULES: right-click → delete / rename / duplicate | ⛔ | W5 |
| **F.6.19** | AI spine: open panel (covered by B.31 mount; gestures in F.7.*) | ✅ | (covered) |
| **F.6.20** | HISTORY spine: AI approval queue paint → `runtime.ai.approvalQueue.list()` | ⛔ | W5 |
| **F.6.21** | HISTORY: click proposal → preview → `runtime.ai.approvalQueue.preview(id)` | ⛔ | W5 |
| **F.6.22** | HISTORY: Accept button → `runtime.ai.approvalQueue.commit(batchId)` | ⛔ | W5 |
| **F.6.23** | HISTORY: Reject button → `runtime.ai.approvalQueue.reject(batchId)` | ⛔ | W5 |
| **F.6.24** | HISTORY: edit-before-commit (open inspector on proposed element) | ⛔ | W5 |
| **F.6.25** | SETTINGS spine: open settings (covered by C.9) | ✅ | (covered) |
| **F.6.26** | LeftNavRail: drag spine width handle → resize content area + `runtime.userPreferences.set('lnr.width', n)` | ⛔ | W5 |
| **F.6.27** | LeftNavRail: collapse-all hotkey (Cmd+\\) | ⛔ | W5 |

### §11.7 — Group F.7: AI gestures (`runtime.ai.*`) (16 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.7.01** | AI: type prompt + Enter → streamed reply via `runtime.ai.streamCompletion(...)` | ⛔ | W5 |
| **F.7.02** | AI: stop button mid-stream → `runtime.ai.cancel(streamId)` | ⛔ | W5 |
| **F.7.03** | AI: cost pill click → `runtime.ai.cost.snapshot()` | ⛔ | W5 |
| **F.7.04** | AI: model selector dropdown → `runtime.ai.setModel(modelId)` | ⛔ | W5 |
| **F.7.05** | AI: history panel (past conversations) → `runtime.ai.history.list(projectId)` | ⛔ | W5 |
| **F.7.06** | AI: open conversation → `runtime.ai.history.load(convId)` | ⛔ | W5 |
| **F.7.07** | AI: AICreatePanel "Generate" submit → `runtime.ai.generative.create({prompt, ctx})` → approval queue | ⛔ | W5 |
| **F.7.08** | AI: ValidatePanel "Run" → `runtime.ai.rules.validate(projectId)` | ⛔ | W5 |
| **F.7.09** | AI: ValidatePanel click rule violation → focus element | ⛔ | W5 |
| **F.7.10** | AI: FloorPlanImportPanel upload PDF → submit → `runtime.ai.floorPlan.import({file})` | ⛔ | W5 |
| **F.7.11** | AI: FloorPlanImportPanel progress poll → `runtime.ai.floorPlan.subscribe(jobId, ...)` | ⛔ | W5 |
| **F.7.12** | AI: FloorPlanFullPlanViewer paint → `runtime.ai.floorPlan.getResult(jobId)` | ⛔ | W5 |
| **F.7.13** | AI: FloorPlanFullPlanViewer "Accept all" → batch into approval queue | ⛔ | W5 |
| **F.7.14** | AI: FloorPlanDebugOverlay show/hide → `runtime.ai.floorPlan.debugOverlay(jobId)` | ⛔ | W5 |
| **F.7.15** | AI: voice spatial input button (mic) → `runtime.ai.voice.startSession()` | ⛔ | W5 |
| **F.7.16** | AI: voice utterance → transcribed → command via `runtime.ai.voice.subscribe(...)` | ⛔ | W5 |

### §11.8 — Group F.8: Visibility-Intent / Intent UI (preserved 11-wave verbatim) (13 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.8.01** | VI panel: open (covered by F.1.59 for activate; this PR adds the panel itself) | ⛔ | W5 |
| **F.8.02** | VI panel: model categories list → `runtime.visibilityIntent.list(viewId)` | ⛔ | W5 |
| **F.8.03** | VI panel: toggle category visibility → `vi.setCategoryVisibility` | ⛔ | W5 |
| **F.8.04** | VI panel: edit graphics override (color, lineweight, pattern) → `vi.setOverride` | ⛔ | W5 |
| **F.8.05** | OverridePanel (per-element override): open → `runtime.visibilityIntent.elementOverride(viewId, elementId)` | ⛔ | W5 |
| **F.8.06** | OverridePanel: edit override values → `vi.setElementOverride` | ⛔ | W5 |
| **F.8.07** | OverridePanel: "Reset to category" → `vi.resetElementOverride` | ⛔ | W5 |
| **F.8.08** | DivergedBanner: shown when current view diverges from intent → `runtime.intent.divergence(viewId)` | ⛔ | W5 |
| **F.8.09** | ResetToIntentButton click → `runtime.intent.resetToIntent(viewId)` | ⛔ | W5 |
| **F.8.10** | HeaderIntentPicker dropdown change → `intent.setSource` | ⛔ | W5 |
| **F.8.11** | IntentSourcePill click → tooltip → `runtime.intent.currentSource(viewId)` | ⛔ | W5 |
| **F.8.12** | SourceChainTooltip hover → show chain → `runtime.intent.chain(viewId)` | ⛔ | W5 |
| **F.8.13** | SpineOverrideList: edit → `runtime.intent.spineOverrides(viewId)` | ⛔ | W5 |

### §11.9 — Group F.9: Data Workbench (16 sub-phases)

| ID | Panel | Status | Wave |
|----|-------|--------|------|
| **F.9.01** | DataWorkbench orchestrator (panel switch) → `runtime.dataWorkbench.activePanel.set(id)` | ⛔ | W5 |
| **F.9.02** | HierarchyTreePanel: paint + click row + filter → `runtime.dataWorkbench.hierarchy` | ⛔ | W5 |
| **F.9.03** | NLQueryPanel: type query → run → results → `runtime.dataWorkbench.nl.query(text, ctx)` | ⛔ | W5 |
| **F.9.04** | NLQueryPanel: click result row → focus element | ⛔ | W5 |
| **F.9.05** | SpatialQueryPanel: build query → run → `runtime.dataWorkbench.spatial.query(predicate)` | ⛔ | W5 |
| **F.9.06** | RelationshipExplorerPanel: explore → `runtime.dataWorkbench.relationships(elementId)` | ⛔ | W5 |
| **F.9.07** | AnalyticsPanel: chart type / metric / dimension change → `runtime.dataWorkbench.analytics(query)` | ⛔ | W5 |
| **F.9.08** | DataSheetPanel: cell edit → `runtime.bus.executeCommand('dataSheet.setCell', ...)` | ⛔ | W5 |
| **F.9.09** | DesignHistoryPanel: scrub timeline → `runtime.persistence.eventLog.replayUntil(eventId)` (preview) | ⛔ | W5 |
| **F.9.10** | DesignHistoryPanel: click event → focus elements changed | ⛔ | W5 |
| **F.9.11** | ProgrammePanel: phase row edit → `programme.setPhase` | ⛔ | W5 |
| **F.9.12** | PhysicsPanel: param change → `physics.setParam` | ⛔ | W5 |
| **F.9.13** | CompliancePanel: rule toggle / run check → `runtime.compliance.runChecks(scope)` | ⛔ | W5 |
| **F.9.14** | PortfolioQueryPanel: cross-project query → `runtime.dataWorkbench.portfolio.query(...)` | ⛔ | W5 |
| **F.9.15** | TemplateEditorPanel: edit template → `template.set` | ⛔ | W5 |
| **F.9.16** | SyncStateDetailDrawer: open / inspect → `runtime.sync.client.diagnostics()` | ⛔ | W5 |

### §11.10 — Group F.10: Rendering controls (14 sub-phases)

| ID | Panel | Status | Wave |
|----|-------|--------|------|
| **F.10.01** | RenderPanel: quality preset → `runtime.scene.renderer.setQuality(preset)` | ⛔ | W5 |
| **F.10.02** | RenderPanel: post-fx toggles (TRAA, SSGI, Bloom) → `runtime.scene.renderer.setPostFx(name, enabled)` | ⛔ | W5 |
| **F.10.03** | PerformanceModePanel: live perf monitor → `runtime.scene.renderer.metrics()` | ⛔ | W5 |
| **F.10.04** | RealSunControl: drag sun angle → `runtime.scene.renderer.setSunAngle(deg)` | ⛔ | W5 |
| **F.10.05** | RenderGallery: list snapshots → `runtime.persistence.client.renders.list(projectId)` | ⛔ | W5 |
| **F.10.06** | RenderGallery: click snapshot → enlarge (local UI) | ⛔ | W5 |
| **F.10.07** | RenderQueuePanel: list active jobs → `runtime.scene.renderer.queue.list()` | ⛔ | W5 |
| **F.10.08** | RenderQueuePanel: cancel job → `runtime.scene.renderer.queue.cancel(jobId)` | ⛔ | W5 |
| **F.10.09** | PanoramaPanel: capture pano → `runtime.scene.renderer.capturePanorama({preset})` | ⛔ | W5 |
| **F.10.10** | WalkthroughPanel: define path → record → `walkthrough.recordPath` | ⛔ | W5 |
| **F.10.11** | WalkthroughPanel: play → `runtime.scene.renderer.playWalkthrough(id)` | ⛔ | W5 |
| **F.10.12** | VideoExportPanel: export settings → render → `runtime.scene.renderer.exportVideo({...})` | ⛔ | W5 |
| **F.10.13** | ExportStudioPanel: composite export → `runtime.scene.renderer.exportStudio({...})` | ⛔ | W5 |
| **F.10.14** | VisualizationEnginePanel: switch engine (real-time / pathtrace) → `runtime.scene.renderer.setEngine(engine)` | ⛔ | W5 |

### §11.11 — Group F.11: Modals + utilities (12 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.11.01** | WelcomeModal "Take tour" button → `runtime.events.emit('tour.start')` | ⛔ | W5 |
| **F.11.02** | UpgradeModal "Upgrade now" button → navigates to PricingPage | ⛔ | W5 |
| **F.11.03** | ContactSalesModal submit → `runtime.persistence.client.sales.submit({...})` | ⛔ | W5 |
| **F.11.04** | ShortcutCheatSheet open (?) → `runtime.hotkeys.list()` | ⛔ | W5 |
| **F.11.05** | UiPreferences open / change (covered by C.9) | ✅ | (covered) |
| **F.11.06** | ConfirmDialog: confirm/cancel (static) | ⛔ | W5 |
| **F.11.07** | ColourPalette open / pick (used inside override panels) → local + emits via runtime | ⛔ | W5 |
| **F.11.08** | UnderlayScaleHUD: drag scale handle → `runtime.bus.executeCommand('underlay.setScale', ...)` | ⛔ | W5 |
| **F.11.09** | AnnotationInputPanel (text input during annotation drawing) → `runtime.tools.activeOverlay()` | ⛔ | W5 |
| **F.11.10** | StairLevelRequiredPanel: pick level → `runtime.stores.level.list()` + sets pending stair config | ⛔ | W5 |
| **F.11.11** | StairSetupPanel: configure run + tread + riser → `stair.create` with config | ⛔ | W5 |
| **F.11.12** | OwnerFeatureFlags: toggle (covered by C.9) | ✅ | (covered) |

### §11.12 — Group F.12: Plugin / Marketplace + IFC + Rhino + BCF + DXF + Component Editor (20 sub-phases)

| ID | Gesture | Status | Wave |
|----|---------|--------|------|
| **F.12.01** | Marketplace icon click → marketplace panel mounts → `runtime.plugins.marketplace.list()` | ⛔ | W5 |
| **F.12.02** | Marketplace: filter / search (local on catalog) | ⛔ | W5 |
| **F.12.03** | Marketplace: click "Install" on plugin card → permissions → `runtime.plugins.installFromUrl(manifestUrl)` | ⛔ | W5 |
| **F.12.04** | Marketplace: click "Uninstall" → `runtime.plugins.uninstall(pluginId)` | ⛔ | W5 |
| **F.12.05** | Marketplace: plugin settings panel for installed plugin | ⛔ | W5 |
| **F.12.06** | IFC Import panel: drag-and-drop .ifc file → `runtime.ifc.import.start(file)` | ⛔ | W5 |
| **F.12.07** | IFC Import panel: progress + preview → `runtime.ifc.import.subscribe(jobId, ...)` | ⛔ | W5 |
| **F.12.08** | IFC Import: "Open" → mount imported elements → batch into `runtime.bus` | ⛔ | W5 |
| **F.12.09** | IFC Inspector panel (PSet editor): browse PSets → `runtime.ifc.inspector.psets(elementId)` | ⛔ | W5 |
| **F.12.10** | IFC Inspector: edit PSet value → `ifc.setPsetValue` | ⛔ | W5 |
| **F.12.11** | IFC Export: Export menu → options → run → `runtime.ifc.export.run({scope, schema})` | ⛔ | W5 |
| **F.12.12** | BCF panel: list issues → `runtime.bcf.list(projectId)` | ⛔ | W5 |
| **F.12.13** | BCF panel: create issue at viewpoint → `runtime.bcf.create({viewpoint, title, body})` | ⛔ | W5 |
| **F.12.14** | BCF panel: click issue → restore viewpoint → `runtime.bcf.restoreViewpoint(issueId)` | ⛔ | W5 |
| **F.12.15** | BCF panel: comment / status change → `bcf.comment / bcf.setStatus` | ⛔ | W5 |
| **F.12.16** | DXF Import: drag-and-drop .dxf → `runtime.dxf.import.start(file)` | ⛔ | W5 |
| **F.12.17** | DXF Export: Export menu → `runtime.dxf.export.run(...)` | ⛔ | W5 |
| **F.12.18** | Rhino Import: drag-and-drop .3dm → `runtime.rhino.import.start(file)` | ⛔ | W5 |
| **F.12.19** | PDF underlay: drag-and-drop .pdf → `underlay.import` | ⛔ | W5 |
| **F.12.20** | Component Editor: open as separate pane → `runtime.componentEditor.open(componentId)` | ⛔ | W5 |

---

## §12 — Phase G — Mass deletions (33 base + 9 G.32.* sub-items = 42 sub-phases)

> **Status**: 0/42 done. Source: chunk 19 §16.7 + chunk 24 §24.5 + chunk
> 26 §26.4/§26.8 (G.32.1–9) + §26.8 (G.33).

### §12.1 — Original §16.7 deletion list (G.1–G.9)

| ID | Deletion | Depends on | Status | Wave |
|----|----------|------------|--------|------|
| **G.1** | DELETE `src/engine/` | D.1–D.8 done | ⛔ | W6 |
| **G.2** | DELETE `src/elements/<family>/` for each family | E.1–E.14 done | ⛔ | W6 |
| **G.3** | DELETE `src/commands/` | E.* + F.* done | ⛔ | W6 |
| **G.4** | DELETE `src/services/` (legacy services like BimService) | D.* + E.* done | ⛔ | W6 |
| **G.5** | DELETE `src/ai/` (legacy AI client) | F.7.* done | ⛔ | W6 |
| **G.6** | DELETE `src/api/` (legacy `apiFetch` wrapper) | C.* done | ⛔ | W6 |
| **G.7** | DELETE `src/history/UndoManager.ts` | C.6.02–03 done | ⛔ | W6 |
| **G.8** | DELETE `apps/editor/src/main.ts:mountEditor()` body | D.1 done | ⛔ | W6 |
| **G.9** | Audit + delete remaining `legacy/` shims | all F.* done | ⛔ | W6 |

### §12.2 — Per-folder deletion additions from chunk 24 (G.10–G.31)

| ID | Deletion | Status | Wave |
|----|----------|--------|------|
| **G.10** | DELETE `src/tools/` | ⛔ | W6 |
| **G.11** | DELETE `src/monetization/` | ⛔ | W6 |
| **G.12** | DELETE `src/import/` (dxf+ifc+rhino legacy parsers) | ⛔ | W6 |
| **G.13** | DELETE `src/generative/` | ⛔ | W6 |
| **G.14** | DELETE `src/rendering/` | ⛔ | W6 |
| **G.15** | DELETE `src/cde/` | ⛔ | W6 |
| **G.16** | DELETE `src/export/` (glb+ifc+sheets exporters) | ⛔ | W6 |
| **G.17** | DELETE `src/portfolio/` (per ADR-041) | ⛔ | W6 |
| **G.18** | DELETE `src/physics/` (per ADR-042) | ⛔ | W6 |
| **G.19** | DELETE `src/geospatial/` (move to `packages/geospatial`) | ⛔ | W6 |
| **G.20** | DELETE `src/api/` (rewrite UI imports) | ⛔ | W6 |
| **G.21** | DELETE `src/snapping/` (overlap with `packages/picking`) | ⛔ | W6 |
| **G.22** | DELETE `src/spatial/` | ⛔ | W6 |
| **G.23** | DELETE `src/topology/` | ⛔ | W6 |
| **G.24** | DELETE `src/structural/` + `src/elements/structural/` | ⛔ | W6 |
| **G.25** | DELETE `src/migration/` | ⛔ | W6 |
| **G.26** | DELETE `src/collaboration/` | ⛔ | W6 |
| **G.27** | DELETE `src/constraints/` | ⛔ | W6 |
| **G.28** | DELETE `src/render/` (PhysicsOverlayRenderer.ts only) | ⛔ | W6 |
| **G.29** | DELETE `src/visibility/` | ⛔ | W6 |
| **G.30** | DELETE `src/furniture/` shim | ⛔ | W6 |
| **G.31** | DELETE `src/features/` shim | ⛔ | W6 |

### §12.3 — PRYZM 1 lights-out (G.32 + 9 sub-items, per chunk 25/26)

| ID | Deletion / Action | Status | Wave |
|----|-------------------|--------|------|
| **G.32** | PRYZM 1 lights-out (umbrella) — lands across S84-WIRE D1–D9 | ⛔ | W6 |
| **G.32.1** | DNS cutover | ⛔ | W6 |
| **G.32.2** | PRYZM 1 billing terminate | ⛔ | W6 |
| **G.32.3** | Auth-flag flip (PRYZM 1 read-only) | ⛔ | W6 |
| **G.32.4** | Customer data export endpoint live | ⛔ | W6 |
| **G.32.5** | PRYZM 1 → PRYZM 2 migration runbook (per ADR-044) | ⛔ | W6 |
| **G.32.6** | Founder-authored customer comms send (must follow G.32.5 / ADR-044) | ⛔ | W6 |
| **G.32.7** | PRYZM 1 OTel tags marked deprecated | ⛔ | W6 |
| **G.32.8** | PRYZM 1 marketplace catalog frozen | ⛔ | W6 |
| **G.32.9** | Read-only window calendar started | ⛔ | W6 |

### §12.4 — Final persistence sweep (G.33)

| ID | Deletion | Status | Wave |
|----|----------|--------|------|
| **G.33** | DELETE `src/persistence/` after C.14 lands and verifies (lands in S82-WIRE D9, last day of Phase G) | ⛔ | W6 |

---

## §13 — Phase H — Lock-in (10 base + H.5.1 = 11 sub-phases)

> **Status**: ~3/11 done (H.0 shared tsconfig; H.1 file-format extraction).
> Source: chunk 19 §16.8/§16.9 + chunk 26 §26.9 (H.5.1).

| ID | Action | Status | Wave |
|----|--------|--------|------|
| **H.1** | Flip `eslint-plugin-pryzm/no-window-as-any` from WARN to ERROR | ⛔ | W7 |
| **H.2** | Land `eslint-plugin-pryzm/no-second-canvas` rule (only `Renderer.ts` + `composeRuntime.ts` may call `document.createElement('canvas')`) | ⛔ | W7 |
| **H.3** | Land `eslint-plugin-pryzm/single-raf` rule (only `packages/frame-scheduler/` may call `requestAnimationFrame`) | ⛔ | W7 |
| **H.4** | Land `eslint-plugin-pryzm/no-runtime-package-import` rule | ⛔ | W7 |
| **H.5** | Land `eslint-plugin-pryzm/no-second-ui` rule (no imports from `apps/editor/src/projects/` outside the editor app) | ⛔ | W7 |
| **H.5.1** | Commit-msg hook + PR-title lint forbidding bare `S(7[3-9]\|8[0-7])` without `-WIRE` or `-PG4` suffix (per chunk 26 §26.9) | ⛔ | W7 |
| **H.6** | Flip every UI bench in `apps/bench/src/benches/ui/` from `warn` to `hardFail: true` (all 60 benches) | ⛔ | W7 |
| **H.7** | Land visual-diff CI baseline (`apps/bench/visual-diff/`); SSIM > 2 px or pixel-diff > 0.05 % fails the build | ⛔ | W7 |
| **H.8** | Audit script `apps/bench/scripts/list-gestures.mjs` walks every event listener / hotkey / window cast → outputs `gesture-coverage.json` | ⛔ | W7 |
| **H.9** | Cross-references `gesture-coverage.json` against §16's sub-phase IDs; orphans fail GA gate; closing PRs are `H.9.<n>` | ⛔ | W7 |
| **H.10** | Final assertion: `cast-site count == 0` AND `gesture-coverage.unassigned == 0` AND `bench/ui/* hardFail == true` AND `visual-diff CI green`. **GA cut.** | ⛔ | W7 |

---

## §14 — Phase Z — Cross-cutting hygiene retro-fits (21 sub-phases, S77 D1–D9)

> **Status**: 5/21 done (Z.0 ripgrep flag fix; Z.5 list-gestures script;
> Z.6 Room.perimeter schema; Z.7 three.js v0.183 alignment 4 plugins).
> Source: chunk 26 §26.1.

| ID | Deliverable | Status | Wave |
|----|-------------|--------|------|
| **Z.0** | Fix `--type=ts --type=tsx` ripgrep flag bugs in chunk 23 verification scripts (per chunk 26 §26.2) | ✅ | (W0) |
| **Z.1** | Author `packages/eslint-plugin-pryzm/` workspace; scaffold rule loader | ⛔ | W6 |
| **Z.2** | Implement `no-window-as-any` rule + tests; ship as **warn** | ⛔ | W6 |
| **Z.3** | Implement `single-raf` + `no-second-canvas` rules + tests; warn | ⛔ | W6 |
| **Z.4** | Implement `no-runtime-package-import` + `no-legacy-src-import` rules + tests; warn | ⛔ | W6 |
| **Z.5** | Author `apps/bench/scripts/list-gestures.mjs` + `check-gesture-coverage.mjs` | ✅ | (W0) |
| **Z.6** | Scaffold `packages/release/` workspace; implement `ga-gate` orchestrator | ✅ | (W0) |
| **Z.7** | Scaffold `packages/bench-visual-diff/` workspace; capture pre-S72 baseline retroactively | ✅ | (W0) |
| **Z.8** | Wire all 5 lint rules into `pnpm lint` as warn; CI integration; per-folder warning counts JSON artefact | ⛔ | W6 |
| **Z.9** | Author `scripts/wireup-baseline.sh` → `.local/state/replit/agent/wireup-floor.json`; CI step | ⛔ | W6 |
| **Z.10** | Banner-PR adding "Additions since this chunk was sliced" headers to chunks 14, 15, 19 (per chunk 26 §26.4) | ✅ | (W0) |
| **Z.11** | Re-derive 00-INDEX `220 files` + `44 packages` literals from floor file (per chunk 26 §26.3) | ⛔ | W6 |
| **Z.12** | Per-folder rAF drilldown table (per chunk 26 §26.5) | ⛔ | W6 |
| **Z.13** | Per-folder canvas-create drilldown table (per chunk 26 §26.5) | ⛔ | W6 |
| **Z.14** | ADR-044 ratification (PRYZM 1 → PRYZM 2 migration runbook) — must land before G.32.6 | ⛔ | W6 |
| **Z.15** | Runtime smoke test added to `pnpm ga-gate` as §23.13 (per chunk 26 §26.10) | ⛔ | W6 |
| **Z.16** | Cross-doc invariants check added to `pnpm ga-gate` as §23.x (per chunk 25 §25.8.3) | ⛔ | W6 |
| **Z.17** | Re-slice chunks 14–19 retirement (banner approach formalized; chunk-25 §25.7 retire the slice contract) | ⛔ | W6 |
| **Z.18** | Sprint-ID alias enforcement in plan docs (`-WIRE` vs `-PG4` distinguished everywhere) | ⛔ | W6 |
| **Z.19** | `wireup-floor.json` published as a CI artefact every PR (monotonic-ratchet enforcement) | ⛔ | W6 |
| **Z.20** | Final §26 amendments cross-references re-checked against on-disk reality | ⛔ | W6 |

---

## §15 — Living-document update protocol

Update this chunk:

* **End of each sprint** — append actual PRs landed vs forecast in §4;
  if a wave slipped, recompute the cadence forward and call out which
  critical-path serialization absorbed the slip. Update status columns
  in §6–§14 from ⛔/⏳ to 🟡/✅ as PRs land.
* **End of each wave** — run the §5 verifier; record the actual
  output; update §1 done/remaining counts.
* **Never** rewrite §2–§3 unless a critical-path serialization
  changes — those are binding.
* **§6–§14 status columns** are the canonical source for "is sub-phase
  X done?" — chunks 14–19 remain canonical for "what does sub-phase X
  do?" but they do not carry status. The audit tracker
  (`0_PHASES-A-F-MISSING-ITEMS-2026-04-29.md`) carries detailed
  per-row evidence; this chunk's §6–§14 mirror that for the operator's
  one-screen view.

---

## §16 — Total enumeration sanity check

Sum of sub-phases across §6–§14:

| Section | Phase | Count |
|---------|-------|------:|
| §6 | A | 7 |
| §7 | B | 40 + 3 sub-IDs (B.13-SC, B.13-RM, B.13-UP) + 4 sub-IDs (B.15-LM, B.15-AL, B.15-GM, B.15-GD) = 47 |
| §8 | C | 4+2+30+8+1+4+3+4+2+4+3 (base C.1.x–C.11.x) = 65 listed (C.3.x expanded to 30 sub-IDs from chunk 14's "C.3.01–02" + the chunk-29 §3.x split-out detail rows) + C.14 + C.exit.1–4 = 70 |
| §9 | D | 14 base + 5 D.4 sub-IDs + 10 D.7 sub-IDs = 29 |
| §10 | E | 14 + E.6.0 + E.15 + E.16 + E.17 = 18 |
| §11 | F | 65 + 19 + 15 + 8 + 32 + 27 + 16 + 13 + 16 + 14 + 12 + 20 = 257 |
| §12 | G | 33 + 9 G.32.* sub-items = 42 |
| §13 | H | 10 + H.5.1 = 11 |
| §14 | Z | 21 |
| **Total** | — | **~502** |

> **Note on the count**: chunk 26 §26.10 cites "~441 sub-phases" using
> the original chunk-19 numbering (where C.3.x is just 2 IDs and B's
> sub-IDs are not split). This chunk's enumeration expands those
> ranges into individual rows for operator legibility — the true PR
> count is what matters and remains in the **441–502** band depending
> on how aggressively C.3.x and D.7.x are sub-sliced. The cadence in §4
> assumes ~30 PRs/sprint and finishes at S87 / M40 either way.
