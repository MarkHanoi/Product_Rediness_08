# LANE 7B1b — F-P5-02 / F-P5-03: `__pryzmScreenToWorld` assigned nowhere

Date: 2026-08-31 · File under edit: `apps/editor/src/PluginRegistry.ts` ONLY.

## (1) Confirmed at HEAD — the key is still assigned nowhere

Scoped greps (apps/, packages/, plugins/, src/, server/, scripts/, tools/, index.html, server.js):
exactly **4 hits, all in `apps/editor/src/PluginRegistry.ts`** — comments at :1024/:1051,
READS at :1055/:1063. **Zero assignments anywhere.** The comment "the engine sets
`window.__pryzmScreenToWorld` during `initTools()`" is FALSE — `initTools.ts` contains no
`screenToWorld` at all (grep: 0 hits). The real conversions are per-view closures
(PlanViewToolOverlay / SvpPlanToolOverlay / PlanViewInteraction, PlanCamera-based) and
per-tool raycasts (OBC TextNoteTool, engine LightingTool) — none global, none exported.

## (F-P5-03) offsetX vs clientX — CONFIRMED as a contract mismatch

- `plugins/grid/src/tool.ts:15`, `plugins/lighting/src/tool.ts:13`,
  `plugins/structural/src/tool.ts:16` — all three declare
  `screenToWorld(ev: { clientX, clientY, pointerId })` and pass that `ev` straight in.
- `PluginRegistry.ts:1062` `eventScreenToWorld` reads `ev.offsetX / ev.offsetY` —
  properties the contract does not promise (undefined on a contract-shaped literal).
- Direction of fix is UNDECIDABLE: the annotation plugin's convention comment
  (`plugins/annotations/src/tool.ts:16-20`) says projectors take CANVAS-LOCAL
  (offset-like) coords; the placement-tool contracts promise CLIENT coords; the
  underlying `fn` does not exist, so there is no ground truth for which space it
  expects. Mismatch is real; the "fix" has no referent. Resolved by DELETION for
  three families; REFUSED for structural (below).

## (2) Live-alternative measurement per family

| Family | PluginRegistry construction | Activation sinks for the family id | LIVE alternative | Verdict |
|---|---|---|---|---|
| grid (`'grid:tool'`) | GridPlacementTool :1178 | **NONE** (matrix declares `grid`, not `grid:tool`; gate comment: "grid is safe: PluginRegistry binds grid:tool, a DIFFERENT id") | `ToolsAreaLayout.ts:356` `runtime.tools.register('grid', () => tm.activateGrid())` → `packages/input-host/src/ToolManager.ts:1091` → GridPlanToolHandler (dispatches `grid.add`, GridPlanToolHandler.ts:235/:253/:901); UI: `GridsLevelsRailPanel.ts:229`, `PlanViewToolOverlay.ts:801`, `SvpPlanToolOverlay.ts:873` | **DEAD RIVAL — removed** |
| lighting (`'lighting'`) | LightingPlacementTool :1193, **clobbers `window.lightingTool`** (the ENGINE LightingTool, `initTools.ts:842-843`) | **LIVE**: chat matrix row `elementCreationMatrix.ts:819` → `chatPlacementActivation.ts:379` `tools.activate('lighting')` lands HERE (last-registration-wins; ToolsAreaLayout deliberately did not re-register — ToolsAreaLayout.ts:340-346) | `CreateRailPanelLighting.ts:282-283` → `ToolManager.activateLighting` (`packages/input-host/src/ToolManager.ts:1002`, §LIGHT121/L-11900) — arms engine LightingTool (3D) + LightingPlanToolHandler (plan) in one call | **DEAD RIVAL — construction replaced by a DELEGATE to `ToolManager.activateLighting(m ?? 'downlight')`.** Cannot delete outright: `tools/ga-gate/check-tool-activator-coverage.ts` ARM A requires matrix id `lighting` registered, and PluginRegistry is its ONLY register site. Default `'downlight'` matches `LightingTool.ts:56` and `LightingPlanToolHandler.ts:29`. |
| structural (`'structural'`) | StructuralPlacementTool :1208 (brace/footing/connection via `structural.create`) | **NONE** (no matrix row; no panel; chat classifies `structural.create` class B "needs design" — `ChatCommandClassification.ts:67`) | **NONE.** No `activateStructural` in ToolManager; no StructuralPlanToolHandler; bus verb registered (`engineLauncher.ts:704`) but nothing user-visible dispatches it. Beam/Column are DIFFERENT families (`beam.create`/`column.create`). | **REFUSED — see below** |
| text-note (`'annotation'`) | TextNoteTool :1086 (fallback) — **constructed WITHOUT its required `canvas` option → TypeError at `this.canvas.addEventListener` (`plugins/annotations/src/tool.ts:97-98`); the "bails gracefully" comment was false.** Primary branch reads `window.annotationTool` — assigned ONLY by this fallback itself → first activation always crashes. | **NONE** (nothing calls `activate('annotation')`) | `AnnotationRailPanel.ts:134-136` `case 'text-note': toolManager.activateTextNote()` → `packages/input-host/src/ToolManager.ts:712` → engine textNoteTool wired at `initTools.ts:3753` (`setTextNoteTool(annotationManager.textNoteTool)`) — the OBC TextNoteTool with its own raycast projection | **DEAD RIVAL — removed** |

Additional dead-at-every-layer evidence: `window.gridPlacementTool` and
`window.structuralTool` have ZERO consumers outside PluginRegistry.ts, and none of the
three placement tools attaches a DOM listener — nothing ever calls their
`onPointerDown`. Even a real screenToWorld would leave them pointer-dead.

## (4) REFUSED — `structural`, by name, for the founder

The brief's wire-branch ("no alternative exists → wire the real screenToWorld") is
unsatisfiable within this lane's scope, on three measurements:

1. **No adoptable conversion exists.** Every live conversion is a per-view closure
   (PlanCamera inside the plan overlays) or a per-tool raycast owning its camera.
   Nothing is exported or global. Adopting from compose-time L7 registry code would
   mean MINTING a new projection path — explicitly forbidden by the brief.
2. **Wiring would be committed-but-unreachable.** The 'structural' family has zero
   activation sinks (no matrix row, no panel, chat-blocked) and zero pointer pumps
   (no consumer of `window.structuralTool`, no DOM listener in the tool). A wired
   screenToWorld would run nowhere — the exact §COMMITTED-IS-NOT-REACHABLE failure.
3. **Making it reachable requires files outside my scope** (a matrix row +
   StructuralPlanToolHandler à la §LIGHT121, or a panel button — all outside
   `PluginRegistry.ts`).

Founder options: (a) give structural the §LIGHT121 treatment (ToolManager.activateStructural
+ StructuralPlanToolHandler + matrix row + rail card); or (b) rule the brace/footing/connection
family a rival of beam/column and delete plugin-side placement. Until then the registration
and the `eventScreenToWorld` bridge (its only remaining user) stay AS-IS, annotated.

## (3) Edits made (PluginRegistry.ts only)

- Deleted imports: `TextNoteTool`/`ScreenToWorldFn` (plugin-annotations), `GridPlacementTool`,
  `LightingPlacementTool`. Kept `StructuralPlacementTool` (refused family).
- Deleted `annotationScreenToWorld`; kept `eventScreenToWorld` ONLY for the refused
  structural registration, re-commented with the measured truth (dead key + offsetX/clientX
  contract mismatch + no ground truth for the fix direction).
- `'annotation'` registration → tombstone naming the live path.
- `'grid:tool'` registration → tombstone naming the live path.
- `'lighting'` registration → delegate to `ToolManager.activateLighting(m ?? 'downlight')`,
  honest warn when ToolManager is not yet booted (no construction, no clobber).
- `'structural'` registration → unchanged + dated REFUSED annotation.
- Header comment corrected (families list; the false "engine sets `__pryzmScreenToWorld`"
  bullet replaced with the measurement).

## Gates consulted (none raised, none disabled, no debt entries)

- `tools/ga-gate/check-tool-activator-coverage.ts` — ARM A forces keeping a `'lighting'`
  registration (only register site); ARM B allows-but-does-not-require `annotation` /
  `grid:tool` / `structural` / `dimension` (PSEUDO_FAMILIES — the deleted `dimension`
  precedent, Wave 4c). Registered-floor 30 remains far exceeded.
- `annotationToolActivatorCoverage.spec.ts` — pins AnnotationRailPanel/ToolManager/
  initAnnotationTools, NOT PluginRegistry; unaffected.
- `lightingPlacementArming.spec.ts` — pins CreateRailPanelLighting → activateLighting
  and ToolManager source strings; unaffected (my delegate ADOPTS that same path).

## Executed proof + root tsc — EXECUTED, all green

**Probe** (`scratchpad/probe-7b1b-activators.mts`, run via `npx tsx` from repo root,
foreground, RC=0): drives the REAL `registerAllPluginToolActivators` with a stub
runtime and a window shim.

- P1a/P1b — `annotation` and `grid:tool` NO LONGER registered (24 families remain:
  ai-floorplan, ai-query, ai-voice, bcf, cross, dxf, export-pdf, furniture,
  ifc-export, ifc-import, ifc-inspector, levels, lighting, multiplayer, navigate,
  plan-view, rooms, schedules, section-view, selection, sheets, structural,
  toy-cube, view).
- P2 — `lighting` registered (gate ARM A requirement held).
- P3a/P3b — `activate('lighting')` delegates to `ToolManager.activateLighting`:
  default `'downlight'`, explicit mode `'pendant'` forwarded.
- P4 — `window.lightingTool` identity PRESERVED across activation (the clobber is gone).
- P3c — with no ToolManager: warn, no throw, no construction.
- **C1 falsification control** — simulating the OLD construction shape (overwrite
  `window.lightingTool`) makes the P4 detector FIRE, so the probe is proven able to fail.
- P5 — `structural` still registered (refused family untouched).

**Root tsc**: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
→ **TSC_RC=0** (run three times: after the main edits, after the log-line fix, after
the comment rewording — RC captured directly, never through a pipe).

## ⚠ Discovery 1 — `check-tool-activator-coverage.ts` is COMMENT-BLIND (gate defect, NOT fixed here)

The gate's `registeredToolIds` regex (`tools\.register\(\s*'…'`, gate :323) matches
register calls **inside comments**. Proven live: my first tombstone wording spelled the
deleted calls out literally and the gate counted them — registered total read 51 with
the phantoms, 48 after rewording; the pre-existing `dimension` tombstone had been
counted as a live registration since Wave 4c. Worst case: a comment naming
`register('grid', …)` would MASK a real future deletion of the matrix id `grid`
(§RAF-GATE-COMMENT-BLIND, the exact recurrence). I reworded all four comment mentions
in PluginRegistry.ts so no comment matches the regex, and noted the constraint at the
tombstones. **The gate itself is outside my file scope — flagging for a gate lane:**
strip comments before matching, and plant a comment-mention control.

## ⚠ Discovery 2 — the gate is RED at HEAD on 4 ids THIS LANE NEVER TOUCHED (pre-existing)

`npx tsx tools/ga-gate/check-tool-activator-coverage.ts` → RC=1, ARM A uncovered 4/0:
`balcony`, `bathroom-pod`, `boundary-line`, `pool`. **Proven pre-existing** by running
the same gate against a pristine HEAD snapshot of its three subjects via its own
`GA_GATE_REPO_ROOT` knob → identical finding list, RC=1. Set-math agrees: the matrix
declared all 4 at HEAD; neither register file registered any of them at HEAD; the
exemption map is empty. These are the plan-only families (`activatePlanOnlyTool.ts`
routes them around `runtime.tools` by design — its own doc-comment says a naive
`runtime.tools` row "would not have helped"), so the right fix is likely NAMED
`ACTIVATOR_EXEMPT` entries or plan-only bridges — a decision for the owning lane, in
files outside this lane's scope. **No ceiling raised, no baseline touched, nothing
absorbed — reported instead.**

## Shared-tree note for the orchestrator

`git diff --stat` during this session showed 57 files changed — this lane changed ONLY
`apps/editor/src/PluginRegistry.ts` (and this audit file + scratchpad probes). The mass
deletions of `plugins/*/src/tool.ts`, `packages/geometry-wall/src/OpeningTool.ts`,
`GeometryCacheStore.ts` etc. are OTHER lanes' concurrent work in the shared tree. My
final tsc RC=0 was taken over the combined tree.
