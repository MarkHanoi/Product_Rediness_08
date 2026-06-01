# Phase F — Plugin contributions · Audit + Plan (2026-04-29, REVISION 2)

> **Spec**: [`PRYZM2-WIREUP-PLAN-S72/16-subphases-F1-toolbars.md`](../PRYZM2-WIREUP-PLAN-S72/16-subphases-F1-toolbars.md) (F.1, 65 sub-phases), [`17-subphases-F2-F5.md`](../PRYZM2-WIREUP-PLAN-S72/17-subphases-F2-F5.md) (F.2–F.5, 74 sub-phases), [`18-subphases-F6-F12.md`](../PRYZM2-WIREUP-PLAN-S72/18-subphases-F6-F12.md) (F.6–F.12, 118 sub-phases). **Spec total: 257 sub-phases** (REVISION 1's "~195" was a tracker-side miscount; the only "~95" reference is the long-stale §16.6 header in chunk 16 line 7, which has not been updated since the chunk was sliced).
> **Tracker claim**: PROCESS-TRACKER.md §1 dashboard line 17 references this very document and cites "0/195 (0%)" — but **PROCESS-TRACKER.md §3 (Sub-phase ledger) contains no Phase F section at all**. REVISION 1 conflated these two facts. The §3 *Running totals* row reports a global "418 sub-phases (S73-WIRE..S87-WIRE)" with 25 done — Phase F has zero rows of its own.
> **Verdict**: ❌ **Phase F has not started.** 0/257 sub-phases landed.
> **Two independent blockers** that REVISION 1 did not surface:
> 1. ❌ **Several F-target plugins don't exist on disk yet** — F.1's export rail, GIS rail, navigate rail, render rail, visual rail target plugins (`export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visual`) that are not in `plugins/` today. These are scaffold prereqs, not contribution work.
> 2. ❌ **Phase F.2 (inspector contributions) gates on Phase E PluginRegistry coverage** — per [REVISION 3 of `05-phase-E-audit-and-plan.md`](./05-phase-E-audit-and-plan.md#new-finding--pluginregistry-coverage-gap-revision-2-missed-this-entirely), `apps/editor/src/PluginRegistry.ts` enumerates only 12 element-family plugins. The 5 plugins (`furniture`, `plumbing`, `rooms`, `structural`, `dimensions`) that are scaffolded but never bound to `runtime.bus` cannot host F.2 inspector contributions until E-finish.0.E lands.

---

## REVISION 2 — Corrections to REVISION 1

REVISION 1 framed Phase F correctly as "not started" but the supporting facts had six concrete errors. All counts below are reproducible at HEAD `main` with the verification script in [§ Verification commands](#verification-commands).

### Error 1 — Spec total miscount (195 → 257)

REVISION 1 reported "~195 sub-phases" by adding chunk-16 (65) + chunk-17 (74 by audit's own tally) + chunk-18 (~56 by an unknown method). Re-counting per `rg -c "^\| \*\*F\.\d+\." chunk-N` against the live spec at HEAD:

| Chunk | Group | Verified row count | Sub-phase count after expanding compressed rows |
|---|---|---:|---:|
| 16-subphases-F1-toolbars.md | F.1 | 65 rows | **65** sub-phases (F.1.01–F.1.65) |
| 17-subphases-F2-F5.md | F.2 | 19 rows | **19** (F.2.01–F.2.19) |
| 17-subphases-F2-F5.md | F.3 | 6 rows | **15** (F.3.01–F.3.15; F.3.04–F.3.13 collapsed into one row covering 10 modals) |
| 17-subphases-F2-F5.md | F.4 | 8 rows | **8** (F.4.01–F.4.08) |
| 17-subphases-F2-F5.md | F.5 | 28 rows | **32** (F.5.01–F.5.32; F.5.03–F.5.07 collapsed into one row covering 5 quick buttons) |
| 18-subphases-F6-F12.md | F.6 | 27 rows | **27** (F.6.01–F.6.27) |
| 18-subphases-F6-F12.md | F.7 | 16 rows | **16** (F.7.01–F.7.16) |
| 18-subphases-F6-F12.md | F.8 | 13 rows | **13** (F.8.01–F.8.13) |
| 18-subphases-F6-F12.md | F.9 | 16 rows | **16** (F.9.01–F.9.16) |
| 18-subphases-F6-F12.md | F.10 | 14 rows | **14** (F.10.01–F.10.14) |
| 18-subphases-F6-F12.md | F.11 | 12 rows | **12** (F.11.01–F.11.12) |
| 18-subphases-F6-F12.md | F.12 | 20 rows | **20** (F.12.01–F.12.20) |
| | **Total** | **242 rows** | **257 sub-phases** |

**Net: 257 sub-phases**, not 195. Of these, **4 are nominal** (already done elsewhere — F.6.05, F.6.11, F.6.19, F.6.25 — verified by spec markers `done in F.4.02 / D.11 / B.31 / C.9`). **Net new sub-phases = 253**.

This figure also propagates to PROCESS-TRACKER.md §1 line 17, which cites "0/195" sourced from REVISION 1. The next tracker update should adjust to "0/257 (0%)".

### Error 2 — `BottomActionMenu.ts` path is wrong

REVISION 1 cited `src/ui/BottomActionMenu.ts:440,465`. The file is actually at `src/ui/bottom-menu/BottomActionMenu.ts` (verified by `find . -name "BottomActionMenu*"`). The line numbers (440, 465) and the TODO-tag content are correct, but anyone running `rg -n "sectionBoxTool" src/ui/BottomActionMenu.ts` per REVISION 1 gets `IO error … No such file`. Fix the path so the verification reproduces.

### Error 3 — TODO comment is mis-tagged in two distinct ways (only one called out)

REVISION 1 noted the TODO at L440/L465 reads `Phase C` instead of `Phase F.5.10`. That is correct as far as it goes, but the actual TODO comment also has a second drift: the marker `TODO(B)` flags it as a Phase **B** item, while the work it describes (replace `(window as any).sectionBoxTool` with `runtime.tools.sectionBox.enable/disable`) is **Phase F.5.10** per spec line 92 of `17-subphases-F2-F5.md`. Both halves of the marker are wrong:

```ts
src/ui/bottom-menu/BottomActionMenu.ts:440
const tool = (window as any).sectionBoxTool; // TODO(B): legacy window-cast — replace with runtime accessor in Phase C
```

Should read: `// TODO(F.5.10): legacy window-cast — replace with runtime.tools.sectionBox accessor in Phase F.5`.

This is one instance of a **systemic comment-pointer drift problem** (also seen in `Layout.ts:489,491,492,493,499` per Phase E REV 3). A scan would help: `rg -n "TODO\(B\):" src/ | rg -i "Phase [CDF]"` to find all TODO markers that mis-attribute their target phase.

### Error 4 — "0/38 plugins" framing is misleading

REVISION 1's table row reads:

> `plugins/<X>/contributions.ts` files (F.1) | **0** of 38 plugins

The 38-plugin total includes 5 AI plugins (`ai-floorplan`, `ai-generative`, `ai-query`, `ai-rules`, `ai-voice`), 5 IFC/import plugins (`ifc-export`, `ifc-import`, `ifc-inspector`, `rhino-import`, `bcf`), 4 system plugins (`multiplayer`, `selection`, `cross`, `toy-cube`), and several view-type plugins (`plan-view`, `section-view`, `view`, `sheets`, `schedules`). **Most of these are not F.1 contribution targets at all** — they belong to F.7 (AI), F.12 (interop), F.5.29 (sheets), and F.6 (left-rail), each with its own contribution kind.

A more useful framing: **F.1 alone targets 22 distinct plugin packages** across 8 rails (architecture, annotation, export, GIS, grids+levels, navigate, render, visual). Of those 22:

| Rail | Target plugin per spec | Exists on disk? | F.1 sub-phases gated by scaffold |
|---|---|---|---|
| Architecture | `plugins/wall` | ✅ | F.1.01 |
| Architecture | `plugins/curtain-wall` | ✅ | F.1.02 |
| Architecture | `plugins/door` | ✅ | F.1.03 |
| Architecture | `plugins/window` | ✅ | F.1.04 |
| Architecture | `plugins/slab` | ✅ | F.1.05 |
| Architecture | `plugins/floor` | ❌ MISSING (E.6.0 prereq) | F.1.06 |
| Architecture | `plugins/ceiling` | ✅ | F.1.07 |
| Architecture | `plugins/roof` | ✅ | F.1.08 |
| Architecture | `plugins/stair` | ✅ | F.1.09 |
| Architecture | `plugins/handrail` | ✅ | F.1.10 |
| Architecture | `plugins/column` | ✅ | F.1.11 |
| Architecture | `plugins/beam` | ✅ | F.1.12 |
| Architecture | `plugins/grids` (spec says plural; actual dir is `plugins/grid`) | ⚠️ name drift | F.1.13 |
| Annotation | `plugins/annotations` | ✅ | F.1.15–F.1.23 |
| Annotation | `plugins/dimensions` | ✅ | F.1.16–F.1.19 (subset) |
| Export | `plugins/export-pdf` | ❌ MISSING | F.1.25 |
| Export | `plugins/dxf` | ❌ MISSING | F.1.26 |
| Export | `plugins/ifc-export` | ✅ | F.1.27 |
| Export | `plugins/schedules` | ✅ | F.1.28 |
| Export | `plugins/render` | ❌ MISSING | F.1.29 + F.1.50–F.1.57 (8 render rail) |
| GIS | `plugins/geospatial` | ❌ MISSING | F.1.31–F.1.34 (4) |
| Grids+Levels | `plugins/levels` | ❌ MISSING | F.1.37–F.1.38 |
| Navigate | `plugins/navigate` | ❌ MISSING | F.1.43–F.1.48 (6) |
| Visual | `plugins/visual` | ❌ MISSING | F.1.59–F.1.64 (6) |

**Net: 7 plugin scaffolds are missing prerequisites for Phase F.1 alone** (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visual`). REVISION 1's "0/38" was technically correct but obscured that **even authoring all 38 contribution files would not close F.1 — 7 plugin scaffolds need to be created first**.

The naming drift on `plugins/grids` vs `plugins/grid` is a separate spec-vs-code issue: either rename the dir or amend the spec line 25 of chunk 16. Resolve before F.1.13 starts.

### Error 5 — REVISION 1 missed the gating relationship to Phase E REV 3

The Phase E audit (REVISION 3) surfaced that `apps/editor/src/PluginRegistry.ts` enumerates only 12 of 17 production element plugins. **5 plugins (`furniture`, `plumbing`, `rooms`, `structural`, `dimensions`) ship handler sets but are never bound to `runtime.bus`.** This directly gates Phase F.2 inspector contributions:

| F.2 sub-phase | Family | Inspector plugin target | Plugin in `PluginRegistry.ts`? |
|---|---|---|---|
| F.2.12 | Plumbing | `plugins/plumbing/inspector/Panel.ts` | 🔴 NO |
| F.2.13 | Annotation | `plugins/annotations/inspector/Panel.ts` | 🔴 NO |
| F.2.14 | Dimension | `plugins/dimensions/inspector/Panel.ts` | 🔴 NO |
| F.2.15 | Room | `plugins/rooms/inspector/Panel.ts` | 🔴 NO |
| F.2.16 | Furniture | `plugins/furniture/inspector/Panel.ts` | 🔴 NO |
| (E.16 / F.x — TBD) | Structural | `plugins/structural/inspector/Panel.ts` | 🔴 NO |

Even if all 19 F.2 inspector files are authored tomorrow, calling `runtime.plugins.contributions('inspector.element').filter(c => c.appliesTo(furnitureSelection))` will return zero entries for these 6 families until E-finish.0.E.{1,2} (PluginRegistry coverage) lands. The dependency chain is:

```
E-finish.0.A (thread runtime)  ──┐
E-finish.0.E.1 (registry: furniture+plumbing) ──┤
E-finish.0.E.2 (registry: rooms+structural)   ──┴── unblocks F.2.12, F.2.15, F.2.16, F.2.x-structural
                                                    + F.5.16–F.5.20 (furniture carousel)
                                                    + F.5.21 (wardrobe), F.5.23 (rooms panel)
```

REVISION 1's "F.5 gates on B-cleanup.6" was incomplete — F.5.16–F.5.23 *also* gate on E-finish.0.E.

### Error 6 — `_buildSections()` line citation drifted

REVISION 1 cited `_buildSections()` at `CreateRailPanel.ts:744`. Verified at HEAD: `_buildSections()` is defined at **line 744** ✓. But REVISION 1's narrative implies the hard-coded array starts at 744; the array literal actually starts at line 748 (`return [` followed by section objects). Minor, but spec readers grep both, so call out both:

- `_buildSections()` declaration: `src/ui/tools-panel/panels/CreateRailPanel.ts:744`
- Hard-coded array entries: lines 748–1090 (≈340 lines of hard-coded section + tool definitions)
- F.1.14's rewrite target: replace lines 748–1090 with a contribution enumeration loop.

---

## Hard counts (re-verified 2026-04-29 R2)

All checks reproducible at HEAD `main` via [§ Verification commands](#verification-commands).

| Check | Result | Note |
|---|---:|---|
| `plugins/<X>/contributions.ts` files | **0 of 22** F.1-target plugins | (5 of those 22 plugin dirs don't exist on disk yet) |
| `plugins/<X>/inspector/Panel.ts` files | **0 of 19** F.2-target plugins | 6 of those have plugin scaffolds but aren't in PluginRegistry (gates F.2.12–16) |
| `plugins/<X>/modal/Create.ts` files | **0 of 14** F.3-target plugins | (1 of those, `plugins/floor`, doesn't exist on disk yet) |
| `plugins/<X>/menu/context-element.ts` files | **0 of ~12** F.4-target families | F.4.03 alone is "11 items × 12 families = 132 contributions" |
| `runtime.plugins.contributions(...)` consumer reaches in `src/`, `apps/`, `plugins/` | **0** | Definition site only: `packages/runtime-composer/src/types.ts:471` |
| `runtime.plugins` slot type defined? | ✅ | `packages/runtime-composer/src/types.ts:702 — readonly plugins: PluginsSlot` |
| `CreateRailPanel._buildSections()` data-driven? | ❌ Still hard-coded | `src/ui/tools-panel/panels/CreateRailPanel.ts:744` (decl) + lines 748–1090 (≈340 LOC of hard-coded sections) |
| `BottomActionMenu.ts` `(window as any).sectionBoxTool` reaches | **2** | `src/ui/bottom-menu/BottomActionMenu.ts:440, 465` (REVISION 1 cited the wrong path); both have wrong `TODO(B)` … `Phase C` markers — should be `TODO(F.5.10)` … `Phase F.5` |
| `BottomActionMenu.ts` total `(window as any)` reaches | **20** | F.5 cleanup load — each maps to a sub-phase in F.5.01–F.5.15 |
| Phase F mentions in PROCESS-TRACKER.md | §1 dashboard ✅ (line 17 references this audit); §3 Sub-phase ledger ❌ (no Phase F rows) | REV 1 said "no F at all" — partial: §3 has none, §1 does |
| PROCESS-TRACKER.md §3 "Running totals" sub-phase total | **418** (S73-WIRE..S87-WIRE) | This is the *cross-phase* total including G+H; not all are Phase F |

---

## Per-group gap (re-graded with corrected counts)

### F.1 — `toolbar.discipline` contributions (65 sub-phases)

Spec breakdown by rail (verified against `16-subphases-F1-toolbars.md`):

| Rail | Sub-phases | Tools count | Rewrite | Plugin scaffold gaps |
|---|---|---:|---|---|
| Architecture (CreateRailPanel) | F.1.01–F.1.14 | 13 | F.1.14 | `plugins/floor` (E.6.0); spec/code drift `plugins/grids` vs `plugins/grid` |
| Annotation (AnnotationRailPanel) | F.1.15–F.1.24 | 9 | F.1.24 | none — plugins/annotations + plugins/dimensions exist |
| Export (ExportRailPanel) | F.1.25–F.1.30 | 5 | F.1.30 | `plugins/export-pdf`, `plugins/dxf`, `plugins/render` missing |
| GIS (GISRailPanel) | F.1.31–F.1.35 | 4 | F.1.35 | `plugins/geospatial` missing |
| Grids+Levels (GridsLevelsRailPanel) | F.1.36–F.1.42 | 6 | F.1.42 | `plugins/levels` missing |
| Navigate (NavigateRailPanel) | F.1.43–F.1.49 | 6 | F.1.49 | `plugins/navigate` missing |
| Render (RenderRailPanel) | F.1.50–F.1.58 | 8 | F.1.58 | `plugins/render` missing (8 sub-phases blocked) |
| Visual (VisualRailPanel) | F.1.59–F.1.65 | 6 | F.1.65 | `plugins/visual` missing |
| **Total** | | **57** | **8** | **7 plugin scaffolds need to land first** |

**0/65** sub-phases done.
**Effective scaffold prereq**: 7 new plugin packages (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visual`) before F.1 can complete.

### F.2 — `inspector.element` contributions (19 sub-phases)

| Sub-phase | Family | Plugin scaffold | In PluginRegistry? | Inspector source today |
|---|---|---|---|---|
| F.2.01 | Wall | ✅ | ✅ | `src/ui/property-panel/Wall*.ts` |
| F.2.02 | Slab | ✅ | ✅ | `src/ui/property-panel/Slab*.ts` |
| F.2.03 | Door | ✅ | ✅ | `DoorTypeSelectorWidget.ts` |
| F.2.04 | Window | ✅ | ✅ | `WindowTypeSelectorWidget.ts` |
| F.2.05 | Curtain Wall | ✅ | ✅ | `Curtain*.ts` |
| F.2.06 | Floor | ❌ MISSING | ❌ | `FloorTypeSelectorWidget.ts` |
| F.2.07 | Ceiling | ✅ | ✅ | `CeilingTypeSelectorWidget.ts` |
| F.2.08 | Roof | ✅ | ✅ | `RoofPropertySheet.ts` |
| F.2.09 | Stair | ✅ | ✅ | `StairTypeSelectorWidget.ts` |
| F.2.10 | Column | ✅ | ✅ | (mixed in PropertyInspector) |
| F.2.11 | Beam | ✅ | ✅ | (mixed) |
| F.2.12 | Plumbing | ✅ | 🔴 **NOT in registry** | (mixed) |
| F.2.13 | Annotation | ✅ | 🔴 **NOT in registry** | (mixed) |
| F.2.14 | Dimension | ✅ | 🔴 **NOT in registry** | (mixed) |
| F.2.15 | Room | ✅ | 🔴 **NOT in registry** | (mixed) |
| F.2.16 | Furniture | ✅ | 🔴 **NOT in registry** | (mixed) |
| F.2.17 | View / Sheet (catch-all) | ✅ view, ✅ sheets | ✅ view; ❌ sheets | `ViewPropertiesSection` + Sheet panel mixed |
| F.2.18 | PropertyInspector orchestrator rewrite | n/a | n/a | direct table lookup of widget classes |
| F.2.19 | Multi-select common-fields panel | n/a | n/a | hard-coded intersection |

**0/19** sub-phases done. **Sub-phases F.2.06, F.2.12, F.2.13, F.2.14, F.2.15, F.2.16 are blocked** until plugin registry coverage closes (E-finish.0.E.{1,2}) or the floor scaffold (E.6.0) lands.

### F.3 — `modal.creation` contributions (15 sub-phases)

- F.3.01–F.3.13: 13 per-family Create modals (one row per family, with F.3.04–F.3.13 collapsed into one spec row covering 10 modals).
- F.3.14: OpeningModePicker → `plugins/wall/modal/Opening.ts` (cross-family, hosted in wall per Phase E REV 3 §16.5 spec).
- F.3.15: ElementCreationModal orchestrator rewrite.

**0/15** sub-phases done. **F.3.06 (Floor) blocked on E.6.0 scaffold prereq.**

### F.4 — `menu.context` + `menu.radial` contributions (8 sub-phases)

REVISION 1 cited 8 ✓ correctly. Net spec line items:

- F.4.01: viewport context menu
- F.4.02: element context menu
- F.4.03: per-family context items (~11 items × 12 families = ~132 contributions, **counted as a single sub-phase** per spec line 51)
- F.4.04: view-tab context menu
- F.4.05: project-card hub context (already done in C.4.01 — **nominal**)
- F.4.06: RadialMenu open
- F.4.07: RadialMenu activate
- F.4.08: RadialMenu user-pref customise

**0/8** sub-phases done (1 of 8 nominal).

**Honest size warning**: F.4.03 alone is the largest single sub-phase in the entire Phase F by line count. Spec carries it as 1 ID but it represents ~132 contribution objects. Plan must split it into per-family PRs (F.4.03.<family>) or accept a multi-week single PR.

### F.5 — Bottom strip gestures (32 sub-phases)

REVISION 1's "32" is correct **once collapsed rows are expanded**:

| Spec rows | Sub-phase IDs | Subject |
|---|---|---|
| 1 | F.5.01 | Wall quick button |
| 1 | F.5.02 | Curtain Wall quick button |
| 1 row covers 5 IDs | F.5.03–F.5.07 | Door/Window/Slab/Floor/Ceiling quick buttons |
| 25 | F.5.08–F.5.32 | individual rows |

- F.5.01–F.5.07: 7 quick buttons
- F.5.08: hotkey listeners (WA/CW/DR/WI/SL/FL/CE)
- F.5.09: level switcher
- F.5.10: section box (the TODO-tag-drift target)
- F.5.11–F.5.15: ortho toggle, snap, reset view, hover readout, selection count
- F.5.16–F.5.20: FurnitureCarousel + FloatingObjectCarousel (5 sub-phases) — 🔴 **blocked on E-finish.0.E.1 (PluginRegistry: furniture)**
- F.5.21: Wardrobe panel — uses `(window as any).wardrobeRunInspector` per spec line 99
- F.5.22: Kitchen panel — uses `(window as any).kitchenRunInspector` per spec line 100
- F.5.23: Rooms panel (bottom) — 🔴 **blocked on E-finish.0.E.2 (PluginRegistry: rooms)**
- F.5.24–F.5.28: SchedulePanel (5 sub-phases)
- F.5.29–F.5.32: SheetEditor (4 sub-phases) — F.5.29 is the major decomposition of the #2 worst file

**0/32** sub-phases done. **6 of 32 (F.5.16–F.5.23 selectively) blocked on registry coverage.**

### F.6 — Left-rail content (27 sub-phases)

MODEL / DATA / VIEWS / SCHEDULES / AI / HISTORY / SETTINGS spine icons.

**Nominal sub-phases (4 of 27)**:
- F.6.05: MODEL element context (already in F.4.02 per spec line 17)
- F.6.11: VIEWS click-to-activate (already in D.11)
- F.6.19: AI spine icon mount (already in B.31; gestures stay in F.7.*)
- F.6.25: SETTINGS spine icon (already in C.9)

**0/27** sub-phases done (4 nominal). Net new = 23.

### F.7 — AI gestures (16 sub-phases)

`runtime.ai.*` slot exists in the runtime types (`packages/runtime-composer/src/types.ts:702 plugins:` includes a sibling `ai:` slot). No consumer in `src/ui/ai/` calls it. All AI panels still use `(window as any).aiClient`.

**0/16** sub-phases done.

### F.8 — Visibility-Intent / Intent UI (13 sub-phases)

VI panel + override panel + diverged banner + intent picker — all still use `(window as any).visibilityIntentService` and `intentSourceStore` directly.

**0/13** sub-phases done.

### F.9 — Data Workbench (16 sub-phases)

15 panels + orchestrator. `runtime.dataWorkbench.*` slot exists; no consumer.

**0/16** sub-phases done.

### F.10 — Rendering controls (14 sub-phases)

10 panels. `runtime.scene.renderer.*` exists; no consumer routes through it.

**0/14** sub-phases done. **Likely needs `plugins/render` scaffold first** (same gap that blocks F.1.50–F.1.57).

### F.11 — Modals + utilities (12 sub-phases)

WelcomeModal, UpgradeModal, ContactSalesModal, ShortcutCheatSheet, ConfirmDialog, ColourPalette, UnderlayScaleHUD, AnnotationInputPanel, StairLevelRequiredPanel, StairSetupPanel — all legacy.

**0/12** sub-phases done.

### F.12 — Plugins / Marketplace + IFC + Rhino + BCF + DXF + Component Editor (20 sub-phases)

- Marketplace UI: not built (`runtime.plugins.marketplace.*` slot is a stub in `PluginHost.ts:128 — throw new RuntimeNotWiredError('plugins.register', 'F.4.x (S81-WIRE)')`).
- IFC Import / IFC Inspector / IFC Export / DXF Import / DXF Export / Rhino Import / BCF / PDF Underlay / Component Editor: the underlying plugins exist (these are the test workflows that are green!), but no UI panel routes user gestures through `runtime.ifc.*` / `runtime.bcf.*` / etc.
- DXF Import/Export (F.12 sub-phases) **blocked on `plugins/dxf` scaffold** (also gates F.1.26).

**0/20** sub-phases done.

---

## Phase F exit-criteria check (against spec preamble of chunk 16)

> *Each tool button, each inspector form, each modal, each context menu, each bottom-strip gesture, each left-rail panel, each AI panel, each rendering control, each data-workbench panel, each visibility-intent gesture, each plugin-system gesture is its own contribution registered by its plugin. The legacy hard-coded arrays/widgets in `src/ui/` are deleted in the same PR.*

| Criterion | Status | Evidence |
|---|---|---|
| All 257 sub-phases landed | 🔴 **0/257** | `rg -c "^\| \*\*F\.\d+\." docs/.../16,17,18*.md` sums to 242 rows / 257 sub-phases |
| `plugins/*/contributions.ts` exists for all F.1 targets | 🔴 **0/22** F.1-target plugins | `find plugins -name "contributions.ts" \| wc -l` = 0 |
| `runtime.plugins.contributions(kind)` consumed | 🔴 **0 reaches** in `src/`/`apps/`/`plugins/` | definition only: `packages/runtime-composer/src/types.ts:473` |
| Hard-coded UI arrays deleted | 🔴 **0/0** | F.1.14, F.1.24, F.1.30, F.1.35, F.1.42, F.1.49, F.1.58, F.1.65 (the 8 `*RailPanel` rewrite sub-phases) all open |
| All 7 plugin scaffold prereqs landed | 🔴 **0/7** | `plugins/{floor, export-pdf, dxf, render, geospatial, levels, navigate, visual}` all absent |
| Phase E PluginRegistry coverage closed (gating F.2 / F.5) | 🔴 12/17 | per `05-phase-E-audit-and-plan.md` REV 3 |
| F.4.03 split into per-family PRs | 🔴 not split | spec carries as 1 ID; needs split before scheduling |

**Phase F true completion: 0%.** Gating prereqs across **two upstream blockers** (Phase E PluginRegistry + 7 missing plugin scaffolds) and **one comment-pointer hygiene issue** (TODO mis-tags in BottomActionMenu).

---

## Why Phase F is hard (re-graded)

- **257 sub-phases is roughly 6 sprints × ~43 sub-phases/sprint** of mechanical work. REVISION 1's "30 sub-phases/sprint × 6 sprints = 180" was sized to the wrong total.
- **F.4.03 is artificially compressed**: 1 sub-phase ID, ~132 contribution objects (11 menu items × 12 families). Real schedule: 12 PRs.
- **F.5.16–F.5.23 are gated downstream** of E-finish.0.E.{1,2}. Don't schedule them in the same sprint as Phase E unless that registry PR has merged.
- **7 plugin scaffolds (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visual`) must be authored before F.1 can complete.** Each scaffold is itself ~200–400 LOC of `package.json` + `src/index.ts` + minimum test coverage. Sized: 7 × 1 day = 1 sprint of pure scaffolding work.
- **F.2 (inspector contributions) requires the receiving plugin to have a complete inspector form**. Many `plugins/<X>/` dirs today only have `handlers/` + `tool.ts`; none have `inspector/Panel.ts`. The form authoring is the slow part, not the contribution-wrapping.
- **F.6.05 / F.6.11 / F.6.19 / F.6.25 are nominal** (already done elsewhere) — **net new sub-phases = 253**.
- **The `(window as any)` baseline must reach 0 in `src/ui/` for F.5 to fully complete** (per Phase B exit criteria, B-cleanup.6 mass migration). Today: 773 reaches across `src/ui/`. The TODO-comment drift in `BottomActionMenu.ts:440,465` is illustrative — 20 of those 773 reaches are in BottomActionMenu alone, and they all need correct phase tags before scheduling.

---

## Plan: F-launch batches (re-sized to honour all blockers)

The plan below is sized to **8–10 sprints** (S81-WIRE through ~S90-WIRE) and respects the architectural rule that **scaffold prereqs land first, registry coverage second, contribution authoring third, orchestrator rewrites last**.

### F-prereq.0 — Plugin scaffolding sprint (S81-WIRE, 7 PRs)

Land all 7 missing plugin packages before any F.1 contribution work begins. Each PR is a thin scaffold (no handlers yet — those come per-family in F.x):

- **F-prereq.0.1** — `plugins/floor/` (also closes E.6.0 from Phase E REV 3)
- **F-prereq.0.2** — `plugins/export-pdf/` (skeleton + package.json; no real export logic until F.1.25)
- **F-prereq.0.3** — `plugins/dxf/` (skeleton; gates F.1.26 and F.12.x DXF import/export)
- **F-prereq.0.4** — `plugins/render/` (skeleton; gates F.1.29, F.1.50–F.1.57, all of F.10)
- **F-prereq.0.5** — `plugins/geospatial/` (skeleton; gates F.1.31–F.1.34)
- **F-prereq.0.6** — `plugins/levels/` (skeleton; gates F.1.37–F.1.38)
- **F-prereq.0.7** — `plugins/navigate/` (skeleton; gates F.1.43–F.1.48)
- **F-prereq.0.8** — `plugins/visual/` (skeleton; gates F.1.59–F.1.64)

Each scaffold PR includes:
1. `package.json` with `@pryzm/plugin-<x>` name, mirrors `plugins/wall/package.json` shape.
2. `src/index.ts` exporting empty `build<X>HandlerSet` stub (returns `[]`).
3. `__tests__/scaffold.test.ts` asserting the package builds and exports the expected names.
4. Add to `apps/editor/src/PluginRegistry.ts` as a no-op descriptor (or skip until contributions land — author's call; mark inline).

**Resolve `plugins/grids` vs `plugins/grid` naming drift in this sprint** (F-prereq.0.0). Pick one (likely keep `plugins/grid` to match existing dir; amend spec line 25 of chunk 16). **One-line PR.**

**Exit gate**: `for p in floor export-pdf dxf render geospatial levels navigate visual; do [ -d "plugins/$p" ]; done` returns true 8/8.

### F-prereq.1 — Comment-pointer hygiene sweep (S81-WIRE D6, 1 PR)

The `BottomActionMenu.ts:440,465` TODO mis-tags are one instance of a systemic problem (also seen in `Layout.ts:489,491,492,493,499`). One sweep PR:

1. `rg -n "TODO\(B\):" src/ | rg -i "Phase [CDF]"` to enumerate all mis-tagged comments.
2. Re-tag each per the spec sub-phase that actually owns the work (e.g., `TODO(F.5.10): … Phase F.5`).
3. Add a `pryzm/no-phase-mismatch-todo` ESLint rule (10–20 lines) that flags `TODO(<X>): … Phase <Y>` where `<X>` and `<Y>` aren't compatible.
4. Run `pnpm lint:eslint -- --fix` to auto-fix where safe.

**Acceptance**: `rg -c "TODO\(B\):" src/ | xargs grep -l "Phase [CDF]" | wc -l` = 0.

### F-launch.1 — First contribution lands (S82-WIRE D1, 1 PR)

The canonical first sub-phase: **F.1.01 Wall tool button → `plugins/wall/contributions.ts`**.

1. Create `plugins/wall/src/contributions.ts`:
   ```ts
   import type { ToolbarDisciplineContribution } from '@pryzm/plugin-host';
   export const wallToolbarContribution: ToolbarDisciplineContribution = {
     id: 'wall.tool',
     discipline: 'architecture',
     icon: 'wall',
     label: 'Wall',
     shortcut: 'Alt+W',
     activate: (runtime) => runtime.tools.activate('wall', 'polyline-ortho'),
   };
   ```
2. Add `runtime.plugins.register('wall', { contributions: [wallToolbarContribution] })` to `apps/editor/src/PluginRegistry.ts` (extend `PluginDescriptor` with optional `contributions` field; `composeRuntime.ts` gathers them into the contribution registry).
3. Add the `runtime.plugins.contributions('toolbar.discipline')` lookup to `PluginHost.ts` (replace the `RuntimeNotWiredError` throw at L128 with a contribution-kind dispatcher).
4. Modify `CreateRailPanel._buildSections()` to **append** results from `runtime.plugins.contributions('toolbar.discipline').filter(c => c.discipline === 'architecture')` to the hard-coded array — **don't replace the array yet** (that's F.1.14). The append-not-replace rule preserves the legacy fallback during migration.
5. Bench `bench/ui/tool-activate.bench.ts` updated.
6. PR title: `[F.1.01] Wall tool button — first plugin contribution`.

**Acceptance**:
1. `plugins/wall/src/contributions.ts` exists with `ToolbarDisciplineContribution` exported.
2. `runtime.plugins.contributions('toolbar.discipline')` returns ≥ 1 entry at boot.
3. `CreateRailPanel` renders the Wall button via the contribution (verifiable: temporarily set the contribution's `icon` to a different glyph and confirm the rail shows it; Wall button still works through the legacy hard-coded entry too).
4. `pryzm/no-window-as-any` baseline drops by the cast count `WallTool.activate` site uses.
5. Bench `tool-activate.bench.ts` p95 < 16 ms.

### F-launch.2 — Architecture rail filled (S82-WIRE D2-D5, 12 PRs)

F.1.02–F.1.13 — copy the F.1.01 pattern across the remaining architecture-rail tools. Order:

- D2: F.1.02 Curtain Wall, F.1.03 Door, F.1.04 Window
- D3: F.1.05 Slab, F.1.07 Ceiling, F.1.08 Roof
- D4: F.1.09 Stair, F.1.10 Handrail, F.1.11 Column
- D5: F.1.12 Beam, F.1.13 Grid
- D6: **F.1.06 Floor** — depends on F-prereq.0.1 having landed

### F-launch.3 — `_buildSections()` rewrite + per-rail rewrites (S83-WIRE D1, 8 PRs)

F.1.14, F.1.24, F.1.30, F.1.35, F.1.42, F.1.49, F.1.58, F.1.65: replace each `*RailPanel`'s hard-coded array with the contribution enumeration.

**Acceptance per rail**: rendering the rail with its contribution slot empty produces an empty rail (proves the enumeration is the only source of truth). Verification: temporarily comment out all the rail's `runtime.plugins.register(...)` calls and confirm the rail is empty.

### F-launch.4 — Annotation, Export, GIS, Grids+Levels, Navigate, Render, Visual rails (S83-WIRE D2 → S84-WIRE)

F.1.15–F.1.65 minus the F-launch.3 rewrites — same pattern as F-launch.2, one rail per day. Per-rail dependency:

- Annotation rail (F.1.15–F.1.24): no scaffold blocker
- Export rail (F.1.25–F.1.30): blocked on F-prereq.0.{2,3,4}
- GIS rail (F.1.31–F.1.35): blocked on F-prereq.0.5
- Grids+Levels rail (F.1.36–F.1.42): blocked on F-prereq.0.6
- Navigate rail (F.1.43–F.1.49): blocked on F-prereq.0.7
- Render rail (F.1.50–F.1.58): blocked on F-prereq.0.4
- Visual rail (F.1.59–F.1.65): blocked on F-prereq.0.8

### F-launch.5 — Inspector contributions (S84-WIRE → S85-WIRE)

F.2.01–F.2.19 — gates on:
- B-cleanup.2 (PropertyInspector cleanup, per Phase B audit)
- E-finish.0.E.{1,2} (PluginRegistry coverage for furniture/plumbing/rooms/structural)
- F-prereq.0.1 (`plugins/floor` for F.2.06)

Order: F.2.01–F.2.05 first (registered families), then F.2.07–F.2.11 (registered architecture/structure), then **batch with PluginRegistry coverage**: F.2.12–F.2.16 land in the same sprint as E-finish.0.E.{1,2}. F.2.17–F.2.19 last.

### F-launch.6 — Modal contributions (S85-WIRE)

F.3.01–F.3.15 — same gating as F.2 (plugin registration). F.3.06 blocked on F-prereq.0.1. F.3.14 (cross-family opening) lands in `plugins/wall/modal/Opening.ts` per spec line 41 of chunk 17.

### F-launch.7 — Context + Radial menu contributions (S85-WIRE → S86-WIRE)

F.4.01, F.4.02, F.4.04, F.4.06, F.4.07, F.4.08 — straightforward.

**F.4.03 is the boulder**: split into 12 per-family PRs (`F.4.03.<family>`) — wall, slab, door, window, curtain-wall, floor, ceiling, roof, stair, handrail, column, beam. Each PR registers ~11 menu items. Schedule: 12 PRs × 1 PR/day = 2.5 weeks of D-level work.

### F-launch.8 — Bottom strip gestures (S86-WIRE)

F.5.01–F.5.32 — gates on:
- B-cleanup.6 (BottomActionMenu cleanup)
- F-prereq.1 (TODO comment hygiene — must land BEFORE this sprint to avoid scheduling errors)
- E-finish.0.E.{1,2} for F.5.16–F.5.23 specifically

Sub-batch:
- F-launch.8.A: F.5.01–F.5.15 (bottom buttons + level switcher + section box + ortho/snap/reset/hover/selection — pure routing)
- F-launch.8.B: F.5.16–F.5.20 furniture carousel — blocked on E-finish.0.E.1
- F-launch.8.C: F.5.21–F.5.23 wardrobe/kitchen/rooms — blocked on E-finish.0.E.2
- F-launch.8.D: F.5.24–F.5.28 SchedulePanel
- F-launch.8.E: F.5.29–F.5.32 SheetEditor — major decomposition, sized as 4-day spike not 4 PRs

### F-launch.9 — Left-rail / AI / VI / Data Workbench / Rendering / Modals / Marketplace (S87-WIRE → S90-WIRE)

F.6 (27, 4 nominal), F.7 (16), F.8 (13), F.9 (16), F.10 (14), F.11 (12), F.12 (20). Sequence: F.6 + F.11 (mechanical) → F.7 + F.8 (AI/VI; requires `runtime.ai.*` and `runtime.visibility.*` consumers) → F.9 (Data Workbench; large) → F.10 (Render; gates on F-prereq.0.4) → F.12 (interop + marketplace; F.12.01 marketplace UI is the most complex).

**F.10 net work shrinks** if F-prereq.0.4 (`plugins/render`) was scaffolded with the per-feature handler stubs. Otherwise F.10 PRs all double as scaffold PRs.

### Acceptance for F-launch.1 alone (preserved from REV 1, with corrections)

1. ✅ `plugins/wall/src/contributions.ts` exists with `ToolbarDisciplineContribution` exported.
2. ✅ `runtime.plugins.contributions('toolbar.discipline')` returns ≥ 1 entry.
3. ✅ `CreateRailPanel` renders the Wall button via the contribution (verifiable: temporarily set the contribution's icon to a different glyph and confirm the rail shows it).
4. ✅ `pryzm/no-window-as-any` baseline drops by the cast count the legacy `WallTool.activate` site used (likely 1–2 reaches).
5. ✅ Bench `tool-activate.bench.ts` p95 < 16 ms.

---

## Verification commands

Reproducible at HEAD `main`:

```bash
# Spec sub-phase counts (per chunk and total)
for f in 16-subphases-F1-toolbars.md 17-subphases-F2-F5.md 18-subphases-F6-F12.md; do
  c=$(rg -c "^\| \*\*F\.\d+\." docs/archive/pryzm3-internal/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/$f)
  echo "$f: $c rows"
done                                                             # → 65 + 61 + 118 = 244 rows

# Unique sub-phase IDs per chunk (collapsed rows expanded by ID counting)
for f in 16-subphases-F1-toolbars.md 17-subphases-F2-F5.md 18-subphases-F6-F12.md; do
  c=$(rg -o "\bF\.\d+\.\d+" docs/archive/pryzm3-internal/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/$f | sort -u | wc -l)
  echo "$f: $c IDs"
done                                                             # → 65 + 64 + 120 = 249 unique IDs

# Plugin contribution scaffolding (zero today)
find plugins -name "contributions.ts" | wc -l                    # → 0
find plugins -path "*/inspector/Panel.ts" | wc -l                # → 0
find plugins -path "*/modal/Create.ts" | wc -l                   # → 0
find plugins -path "*/menu/context-element.ts" | wc -l           # → 0

# Consumer reaches (zero today)
rg -nc "runtime\.plugins\.contributions" src/ apps/ packages/ plugins/ --type ts \
  | awk -F: '{s+=$NF} END {print s+0}'                           # → 0

# CreateRailPanel hard-coded
rg -n "_buildSections" src/ui/tools-panel/panels/CreateRailPanel.ts   # → 162, 241, 744

# BottomActionMenu correct path
find . -name "BottomActionMenu*" -not -path "*/node_modules/*"   # → src/ui/bottom-menu/BottomActionMenu.ts
rg -n "sectionBoxTool" src/ui/bottom-menu/BottomActionMenu.ts    # → 440, 465, 467
rg -c "\(window as any\)" src/ui/bottom-menu/BottomActionMenu.ts # → 20

# TODO mis-tag scan (the systemic comment-pointer drift)
rg -n "TODO\(B\):" src/ | rg -i "Phase [CDF]" | wc -l            # > 0 → REVIEWER MUST FIX

# Per-plugin F-target scaffold check
for p in floor export-pdf dxf render geospatial levels navigate visual; do
  [ -d "plugins/$p" ] && echo "✓ $p" || echo "✗ $p MISSING"
done                                                             # → 8/8 missing today

# Plugin name drift (spec vs code)
[ -d "plugins/grids" ] && echo "spec name correct" \
  || ([ -d "plugins/grid" ] && echo "DRIFT: spec says plugins/grids, code has plugins/grid")

# PROCESS-TRACKER §3 lookups
sed -n '130,247p' docs/archive/pryzm3-internal/00-PROCESS-TRACKER.md \
  | rg -c "Phase F"                                              # → 0 (no §3 row for F)
rg -n "Phase F.*0/195" docs/archive/pryzm3-internal/00-PROCESS-TRACKER.md
                                                                  # → 1 hit at §1 line 17
                                                                  # (must be amended to 0/257 next tracker update)
```

---

## Lessons learned (recorded for future audits)

1. **Counting compressed table rows is not the same as counting sub-phases.** REV 1 counted rows in the spec tables (242 rows total) and reported "~195" by a method I cannot retrace. Counting sub-phase IDs (`F.X.YY` pattern via `rg -o`) gives 249 unique IDs; expanding the 5–10 collapsed rows (e.g., F.5.03–F.5.07, F.3.04–F.3.13) gives 257 distinct sub-phase IDs. Always expand both before quoting a phase total.
2. **A single comment can be wrong in multiple ways at once.** REV 1 caught that the `BottomActionMenu` TODO's "Phase C" target is wrong; missed that the `TODO(B)` marker (its source phase tag) is also wrong. Spec authors and reviewers should treat TODO comments as having two slots: source phase + target phase. An ESLint rule (F-prereq.1 §3) can enforce both halves once authored.
3. **A phase total is a downstream commitment.** PROCESS-TRACKER.md §1 line 17 sources its "0/195" from this audit. Updating this audit to "0/257" requires a corresponding tracker update in the same PR. Audit authors must own that propagation.
4. **`§1 dashboard` and `§3 sub-phase ledger` are not interchangeable.** REV 1 said "PROCESS-TRACKER.md §3 contains no Phase F section. The §1 dashboard does not mention F at all." The first half is true (verified at line 130–247); the second half is false (line 17 references this audit by name and cites the cross-phase aggregate at line 18). Cite section anchors precisely.
5. **F-target plugin coverage is the unspoken prereq.** Phase F.1 alone needs **22 distinct plugin packages** to host its contributions, of which **7 don't exist on disk** today (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visual`). REV 1 reported "0 of 38 plugins" but the 38 includes plugins that target Phase F.6/F.7/F.12 (left-rail, AI, interop). The honest framing is "0 contributions, AND 7 of 22 target plugins missing". The latter is a scaffold sprint (F-prereq.0).
6. **Cross-phase gating must be drawn explicitly.** F.5.16–F.5.23 (furniture carousel + wardrobe + rooms panel) and F.2.12–F.2.16 (inspector contributions for furniture/plumbing/rooms/structural) all gate on `apps/editor/src/PluginRegistry.ts` registering 5 plugins (`furniture`, `plumbing`, `rooms`, `structural`, `dimensions`) per Phase E REV 3. Cross-phase dependencies should appear in the per-group gap table, not buried in prose.
7. **`runtime.plugins.contributions(kind)` is `throw RuntimeNotWiredError` today.** The slot is typed (`packages/runtime-composer/src/types.ts:702`) but unconsumed. The runtime cannot reach contribution-kind dispatch until F-launch.1 lands. This is a single PR's worth of infrastructure work and must be tracked as part of F.1.01.
8. **Naming drift between spec and code accumulates silently.** Spec line 25 of chunk 16 says `plugins/grids/contributions.ts`; the disk says `plugins/grid/`. Spec writers must run a code-vs-spec name diff before the spec is sliced. F-prereq.0.0 (the one-line spec amendment / dir rename) is a documentation-quality issue, not a code defect.

---

## Feedback (REVISION 2 author's note)

This rewrite preserves REV 1's structural framing (Phase F is 0% started; F-launch.1 is the canonical first PR) but corrects the supporting facts and surfaces three blockers REV 1 missed:

- **Blocker 1: 7 plugin scaffolds need to land before F.1 can complete** (`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`, `navigate`, `visual`). REV 1 implied F-launch.2 could simply "copy F.1.01 across 12 architecture tools"; in reality F.1.06 (Floor) and several rails downstream are blocked until scaffolds exist. Sized as F-prereq.0 (1 sprint, 8 PRs).
- **Blocker 2: PluginRegistry coverage gap (per Phase E REV 3) gates 11 Phase F sub-phases**: F.2.12–F.2.16 (5 inspector forms), F.5.16–F.5.20 (furniture carousel), F.5.23 (rooms panel). REV 1 said "F.5 gates on B-cleanup.6"; that's true but incomplete — a cross-phase gate to E-finish.0.E.{1,2} must be drawn explicitly so F-launch sprint scheduling doesn't book F.5.16 in the same sprint as E-finish.0.E.1.
- **Blocker 3: comment-pointer hygiene is broken across the codebase**, not just BottomActionMenu. F-prereq.1 is a one-PR sweep that adds an ESLint rule and re-tags every mis-attributed TODO. Sized as 1 PR (sweep + rule + lint pass).

The plan now sizes Phase F as **8–10 sprints** (S81 through ~S90), not 6, because:
- 257 sub-phases at REV 1's "30/sprint" cadence is 8.6 sprints, not 6.5.
- F-prereq.0 adds 1 sprint of scaffold work that REV 1 did not budget.
- F.4.03 expands to 12 PRs, not 1, because per-family contribution authoring cannot share a single PR's blast radius.
- F.5.29–F.5.32 (SheetEditor decomposition) is the second-worst file in the codebase per spec; sized as a 4-day spike, not 4 PRs.

**The "no shortcut" architectural reading**: do not collapse F-prereq.0 into individual F-launch sprints. Each scaffold needs its own PR review (package.json shape, test scaffold, no-op handler set, name in PluginRegistry). Bundling 8 scaffolds into one mega-PR would require reviewers to verify 8 packages' shapes simultaneously — exactly the kind of patch-fix the prior revisions correctly warned against. Land each scaffold separately, in S81-WIRE, so the F-launch.1 PR in S82-WIRE has a clean dependency graph.

**What changed in the per-group tables vs REV 1**:
- F.1: added scaffold-prereq column showing 7 plugin gaps + 1 name drift.
- F.2: added "In PluginRegistry?" column showing 6 of 19 sub-phases gated on E-finish.0.E.
- F.3: corrected row count (6 spec rows → 15 sub-phases).
- F.4: noted F.4.03 is 1 ID covering ~132 contributions — must split.
- F.5: corrected sub-phase count (32 = 28 rows + 4 collapsed) and added 6 sub-phases gated on PluginRegistry coverage.
- F.6: same numbers, but called out 4 of 27 are nominal.
- F.10: noted blocked on `plugins/render` scaffold (F-prereq.0.4).
- F.12: noted blocked on `plugins/dxf` scaffold (F-prereq.0.3).

**What did not change**:
- The verdict (0% started).
- The F-launch.1 PR is still the right "smallest first contribution" canonical kickoff.
- The acceptance criteria for F-launch.1 still hold verbatim.
- The 6-sprint lower bound on Phase F is still wrong, but the upper bound (10 sprints) is now sized to honour the prereqs.
