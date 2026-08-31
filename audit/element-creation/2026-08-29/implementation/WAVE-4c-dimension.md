# WAVE 4c — dimension activator. Disposition: REMOVE (not WIRE).

## Ladder
AUTHORED yes / REACHABLE **NO — first failing link** / COMPOSABLE n/a / CERTIFIED n/a.

## Capability search (mandatory, by what it DOES not what it is named)
Question asked: "what, in production, lets a user place a dimension that renders?"

LIVE PATH FOUND — the row is about a DEAD SIBLING, not a missing capability:
  AnnotationRailPanel.ts:_dispatchTool('linear-dimension')
    -> toolManager.activateLinearDimAnnotation()
    -> CreateAnnotationCommand(type 'linear-dim') -> annotationStore._dims
    -> PlanViewAnnotationRenderer (renders) + ProjectSerializer.ts:1793 (persists)
Also live: applyAutoDimensions.ts / applyElevationAutoDimensions.ts -> same 'linear-dim' sink;
dimensionSelectionPanel.ts + annotationDragIntent.ts + reconcileDimensions.ts all read it.

## Dead on BOTH ends — measured
SOURCE (assignment): grep 'dimensionTool' over repo -> 3 hits, ALL apps/editor/src/PluginRegistry.ts
  (:961 comment, :1048 comment, :1051 the READ). ZERO assignments. Contrast furnitureTool, the
  sibling in the SAME comment, which IS assigned at engine/initTools.ts:690 — so the comment's
  claim "engine-provided after initTools()" is true for furniture and FALSE for dimension.
SINK (activation): grep "activate('dimension'" over apps/editor/src, plugins, packages -> NO hits.
  Nothing ever calls runtime.tools.activate('dimension'). hasActivator has zero production callers.
No Window['dimensionTool'] declaration. No test names the 'dimension' activator.

## Rivals confirmed unreachable (do NOT wire any of them)
1. plugins/dimensions/src/tool.ts DimensionTool — NOT exported from the plugin barrel
   (plugins/dimensions/src/index.ts exports store/errors/intent/handlers only); zero importers.
2. plugins/dimensions/src/committer/dimension-committer.ts — 'new DimensionCommitter' -> no output.
3. packages/drawing-primitives commitDimensions — only caller PlanViewCanvasHost, constructed
   only in plugins/plan-view/__tests__.
4. packages/stores/src/DimensionStore.ts — constructed by its own tests only.
5. NEW (not in the audit row): apps/editor/src/ui/toolbar/DimensionToolbar.ts — 11 buttons on
   verbs 'dimension-aligned'/'dimension-linear'/... (kebab, NOT the bus 'dimension.*' family),
   every one gated by refuseUnbacked(). Zero importers outside its own spec: never mounted.

## Why WIRE is HARD STOP 3
Assigning window.dimensionTool would arm a SECOND dimension-placement tool dispatching
'dimension.create' into ctx.stores.dimension — a store applyAutoDimensions.ts:12-24 states in
production source is never read by the plan renderer, that no exporter carries, and that
ProjectSerializer never writes. It would deliver created-but-invisible dimensions alongside a
working annotation path. That is a rival of a live path.

## Change made
Deleted the register('dimension', ...) block in apps/editor/src/PluginRegistry.ts and corrected
the two doc comments that asserted the non-existent assignment. Left a tombstone naming the live
path so the bridge is not re-minted.

## Honesty note (§CONTEXT-DATA-HONESTY / L-4600, same file)
Before: activate('dimension') ran an activator that warned "not yet initialised" and returned
ran=true — a startup race that can never resolve, reported as a success.
After: no activator is registered, so buildToolsStub's activate() returns ran=false and warns with
the registered set. The failure now looks like a failure.

## INDEPENDENT CORROBORATION that the capability is not lost
docs/04-reference/ISSUE-LOG.md:1165, written BEFORE this audit:
  "Placing a linear dimension — OK. UI button (AnnotationRailPanel ->
   toolManager.activateLinearDimAnnotation) and the D+I shortcut both arm
   LinearDimensionAnnotationTool, whose commit dispatches CreateAnnotationCommand via
   commandManager into the subsystem annotationStore that the render layer reads and
   ProjectSerializer persists. Verified end-to-end. String/chained dims OK."
Implementation confirmed real, not a stub: packages/input-host/src/ToolManager.ts:243
`async activateLinearDimAnnotation()` -> activateTool('linear-dim') -> _linearDimAnnotationTool.activate().
So the deleted bridge was a DEAD SIBLING of a working capability, never the capability itself.

## Numbers BEFORE -> AFTER
runtime.tools.register() calls in PluginRegistry.ts ....... 28 -> 27
dead `dimension` activator (permanent else-branch) ........  1 ->  0
window.dimensionTool assignments repo-wide ................  0 ->  0 (never existed)
runtime.tools.activate('dimension') callers ...............  0 ->  0 (never existed)
check-cast-count.ts ....................................... RC=0 -> RC=0
   repo-wide 100/100 both sides; scoped 0 (would ratchet 3->0). The removed cast was
   `(window as unknown as Record<string, unknown>)`, which the tripwire's stripped
   counter does not score as a `(window as any)`, so no ratchet movement. No ceiling
   raised, no baseline touched, no gate-debt entry.
packages/runtime-composer toolsSlot.activateHonesty.test.ts .. 7/7 PASS (governs the
   post-deletion behaviour: :68 "returns FALSE when NO activator is registered")
root tsc --noEmit ......................................... 1 error, BOTH sides, NOT MINE:
   packages/ai-host/src/graph/GraphQueryService.ts(261,27) TS2536. `git status` shows that
   file ` M` and `git diff` shows another lane's in-flight L-12860 TYPED_TARGET_READERS
   work at that exact region. Zero errors mention PluginRegistry.ts. Shared-tree rule: not
   my file, not touched.

## Disposition
REMOVE. Not WIRE — wiring was HARD STOP 3 (rival of a live path).
