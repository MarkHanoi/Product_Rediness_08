#!/usr/bin/env tsx
/**
 * Wave 1 task 3 — requestAnimationFrame owner-file tripwire.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §4
 * Anchor: docs/03_PRYZM3/01-VISION.md §2 P3;
 *         docs/03_PRYZM3/04-PLAN-FORWARD/07-WAVE-7-CLEANUP-PHASE-F.md §2 (S85-WIRE)
 *
 * Hard-fail if owner-file count > HARD_FAIL (regression gate).
 * Soft-warn if > SOFT_WARN (Wave 7 absolute target = 1: the Scheduler).
 *
 * Counts .ts files (anywhere in repo) containing the literal token
 * `requestAnimationFrame(`. Excludes node_modules, dist, build outputs.
 */
import { execSync } from 'node:child_process';

// Wave 7 ceiling, ratcheted 2026-04-30 evening:
//   • S85.D-finish.2 (UnifiedFrameLoop migration):   69 → 68
//   • S85.D-finish.3 (5-file batch + scheduleOnce()): 68 → 63
//     - `packages/frame-scheduler/src/FrameScheduler.ts` gained a new
//       `scheduleOnce(reason, callback, priority?)` API as the canonical
//       architectural replacement for the one-shot `rAF(cb)` pattern.
//     - 5 files migrated:
//         src/core/rendering/ViewportPathTracer.ts        (continuous pump → addTickListener)
//         src/core/presentation/ViewportPreviewRenderer.ts (one-shot   → scheduleOnce)
//         src/core/persistence/ProjectIsolationAudit.ts    (one-shot   → scheduleOnce)
//         src/core/views/PlanElementDragController.ts      (coalesced  → scheduleOnce)
//         src/core/sync/SyncStateEngine.ts                 (coalesced  → scheduleOnce)
//   • S85.D-finish.4 (4-file core/* coalescer batch):  63 → 59
//     - 4 files migrated, all using `scheduleOnce`:
//         src/core/batch/BatchCoordinator.ts      (recursive drain      → scheduleOnce 'pre-render')
//         src/core/views/SplitViewManager.ts      (drag-flush-cancel    → scheduleOnce 'overlay')
//         src/core/drawing/ElementSpatialIndex.ts (upsert coalesce      → scheduleOnce)
//         src/core/DependencyResolver.ts          (2 sites: per-event   → scheduleOnce
//                                                  + cascade flush)     → scheduleOnce
//     - Closes the `src/core/` rAF long tail: only `src/ui/` and `src/engine/`
//       owners remain (the D.7.5+ slice). All `src/core/` rAF call sites now
//       go through `getFrameScheduler()`.
//   • D.7.5 batch #1 (13-file src/ui/ + src/services/ + src/tools/ sweep): 59 → 46
//     - 13 single-callsite, one-shot deferral migrations using `scheduleOnce`:
//         src/ui/ConfirmDialog.ts                          (focus button)
//         src/ui/AnnotationInputPanel.ts                   (focus input)
//         src/ui/platform/ContactSalesModal.ts             (apply visible class for transition)
//         src/ui/LeftNavRail.ts                            (dispatch resize on collapse)
//         src/ui/dataworkbench/NLQueryPanel.ts             (yield to event loop before query)
//         src/ui/ai/AIPanel.ts                             (scroll transcript bottom)
//         src/ui/WorkspaceController.ts                    (dispatch resize on mode switch)
//         src/ui/views/ViewTemplateManagerPanel.ts         (focus rename input)
//         src/ui/ViewBrowser/panels/SheetsRailPanel.ts     (focus create-sheet input)
//         src/ui/ViewBrowser/panels/ViewsRailPanel.ts      (focus create-view input)
//         src/services/SheetIndexService.ts                (window.print after layer mount)
//         src/tools/FloorPlanUnderlayTool.ts               (clear hit flag next frame)
//         src/ui/interop/InteropFidelityReport.ts          (apply slide-in transform)
//     - All 13 are pure cosmetic deferrals (focus / class toggle / resize / print)
//       with no captured handle and no `cancelAnimationFrame` cleanup, so the
//       drop-in `scheduleOnce(reason, cb)` recipe applies cleanly.
//   • D.7.5 batch #2 (2-file multi-callsite UI sweep): 46 → 44
//     - 2 multi-callsite owners migrated:
//         src/ui/platform/EngineLoadingOverlay.ts (6 sites: 2 continuous self-rescheduling
//             rAF loops with captured handles + cancelAnimationFrame — pyramid 3-D rotation
//             and progress-bar fill — migrated to `addTickListener('engine-loading-pyramid'
//             | 'engine-loading-progress', cb, 'overlay')`. The disposer returned by
//             addTickListener replaces cancelAnimationFrame; private fields retyped from
//             `number` to `TickListenerDisposer | null`. Pyramid tick now consumes the
//             scheduler-supplied `deltaMs` directly so the previous `last`-tracking is
//             eliminated. Progress animate self-disposes once `elapsed >= TOTAL_MS`.)
//         src/ui/SheetEditor/SheetEditorPanel.ts (6 sites: all one-shot deferrals
//             — center canvas, attach preview, "view not found" placeholder, attach focus
//             interaction, code-input focus, thumbnail capture — migrated via
//             `scheduleOnce(reason, cb)`).
//     - Drains the tail of the largest-callsite UI owners; remaining src/ui/ sites
//       are scattered 1-4 callsite files plus src/elements/ + src/engine/ (D.7.6 scope).
//   • D.7.5 batch #3 (3-file 4-callsite UI + elements sweep): 44 → 41
//     - 3 multi-callsite owners migrated (10 sites total):
//         src/ui/property-panel/PropertyPanel.ts (4 sites: 1 self-rescheduling
//             forever-loop `syncHandles` (drag-handle position tracker for the panel
//             bounding box) collapsed into a single `addTickListener(
//             'property-panel-sync-handles', cb, 'overlay')` registration — the inner
//             self-reschedule and the outer kickoff merged into one call (disposer
//             discarded to match pre-existing no-destroy semantics, TODO logged);
//             plus 3 one-shot deferrals — pre-draw position `place`, default-view
//             repositioning — via `scheduleOnce(reason, cb)`.)
//         src/elements/curtainwalls/CurtainWallBuilder.ts (4 sites: 2 build-queue
//             drain rAFs (kickoff + re-arm in `_drainBuildQueue`) migrated to
//             `scheduleOnce('curtainwall-drain-builds', () => this._drainBuildQueue())`
//             keyed by the existing `_rafHandle` field (retyped `number` →
//             `TickListenerDisposer | null`); plus 2 shadow-reactivation drain rAFs
//             (kickoff + per-slice re-arm) migrated to
//             `scheduleOnce('curtainwall-shadow-reactivate', drainSlice)`.)
//         src/ui/bottom-menu/BottomActionMenu.ts (2 sites: 1 continuous level-explode
//             tween (self-rescheduling rAF with captured handle + cancelAnimationFrame
//             — lerps every level mesh's Y to `bamTargetY` until convergence) migrated
//             to `addTickListener('bam-level-animation', tick, 'overlay')`. The tick
//             callback now self-disposes once every mesh is within the convergence
//             threshold; private `_raf` field retyped `number` → `TickListenerDisposer
//             | null`; the matching `cancelAnimationFrame` calls in
//             `_restoreLevelTransforms` and `_startLevelAnimation`'s reset path replaced
//             by `this._raf()` disposer invocations.)
//     - Continues draining the largest-callsite owners outside `src/engine/`. After
//       this slice the remaining tripwire pool is ~22 files in `src/ui/`,
//       `src/elements/`, and `src/tools/` (mostly 1–2-callsite owners), plus the
//       ~10-file `src/engine/` shard (D.7.6 scope).
//   • D.7.5 batch #4 (7-file 2-callsite UI + elements sweep): 41 → 34
//     - 7 multi-callsite owners migrated (14 sites total) using a uniform recipe
//       per pattern:
//
//       Pattern A — continuous self-rescheduling render loop with captured handle
//                   + cancelAnimationFrame stop method
//                   → `addTickListener(reason, cb, 'render' | 'overlay')`,
//                   field retyped `number | -1 | null` → `TickListenerDisposer | null`,
//                   `cancelAnimationFrame(x)` → `x()`:
//         src/ui/data/PIPRenderer.ts (2 sites: `_animId` field; `_startLoop` /
//             `_stopLoop` — sub-viewport mini-render — `addTickListener(
//             'pip-renderer-loop', () => this._render(), 'render')`. Inner
//             self-reschedule and outer kickoff merged into the single registration.)
//         src/ui/furniture-carousel/FloatingObjectCarousel.ts (2 sites: `rafId`
//             field; `_startRenderLoop` / `_stopRenderLoop` — `addTickListener(
//             'floating-object-carousel-loop', () => this._tick(), 'overlay')`.)
//         src/elements/stairs/stairPath/StairPathToolController.ts (3 sites:
//             `_rafId` field; `_startRaf` / `_stopRaf` — preserves the original
//             loop's `if (state === 'idle') return;` early-out by self-disposing
//             from inside the tick when state transitions to idle, so callers
//             that relied on the natural termination remain correct;
//             `addTickListener('stair-path-tool-loop', loop, 'render')`.)
//
//       Pattern B — continuous self-rescheduling tween with no captured handle
//                   and a natural in-tick termination (e.g. velocity threshold)
//                   → `addTickListener` with locally-scoped disposer that the
//                   tick itself invokes on convergence:
//         src/ui/furniture-carousel/FurnitureCarousel.ts (2 sites: drag-inertia
//             tick — `let disposer: TickListenerDisposer | null = null;` then
//             `disposer = addTickListener('furniture-carousel-inertia', tick,
//             'overlay');` with `if (disposer) disposer();` inside the snap branch.)
//
//       Pattern C — build-queue drain rAFs (kickoff + re-arm) keyed by an existing
//                   handle field, identical to the CurtainWallBuilder recipe from
//                   batch #3:
//         src/elements/slabs/SlabFragmentBuilder.ts (2 sites: `_rafHandle` field;
//             `updateSlab` kickoff + `_drainBuildQueue` re-arm — both migrated to
//             `scheduleOnce('slab-drain-builds', () => this._drainBuildQueue())`.
//             The `_rafHandle` field becomes the disposer slot.)
//
//       Pattern D — one-shot post-mount or one-shot post-tool-activation deferrals
//                   with no captured handle:
//         src/ui/dataworkbench/SyncStateDetailDrawer.ts (2 sites: `_open` and
//             `_openNoData` post-mount panel positioning — `scheduleOnce(
//             'sync-state-detail-position', () => this._position(panel, anchorRect))`.)
//         src/ui/Layout.ts (2 sites: post-`_origActivateWall` panel rebuild
//             `scheduleOnce('layout-wall-tool-pre-draw', cb)`; post-
//             `_origActivatePlumbingTool` panel rebuild
//             `scheduleOnce('layout-plumbing-tool-pre-draw', cb)`.)
//
//     - All 7 owners now go through `getFrameScheduler()`. After this slice the
//       remaining tripwire pool is ~24 files: ~10 single-callsite UI/tools/export
//       owners, the ~10-file `src/engine/` shard (D.7.6 scope), plus the
//       ScrollMomentum/PointerCoalescer-style polish targets that survive in
//       `src/elements/` and `src/dev/`.
//   • D.7.6 (engine long tail — 6 files, 22 sites): 24 → 18.
//     - All `src/engine/` rAF call sites now go through `getFrameScheduler()`.
//   • D.7.8 (tripwire scope correction — 2026-04-30 evening, FINAL slice):
//     18 → 1.  No further migrations were needed: every remaining
//     `requestAnimationFrame(` literal in the repo after D.7.6 was either
//     (a) the canonical owner `packages/frame-scheduler/src/RafAdapter.ts`,
//     (b) a piece of intentional scaffolding that MUST contain the literal
//         (the tripwire itself, the no-raf eslint rule fixtures and rule
//          test, the legacy-shim `raf.bad.ts` fixture),
//     (c) a user upload in `attached_assets/` (not in any build path),
//     or (d) source in the standalone `editor/` sibling sub-project — which
//         has its own `turbo` build, its own `biome` linter, its own port
//         (3002), is NOT listed in `pnpm-workspace.yaml`, NOT in the root
//         `package.json` `workspaces[]`, and NOT touched by `pnpm build`.
//     The tripwire's previous rg invocation conflated PRYZM 3 build
//     artifacts with all four of those out-of-scope pools, so the number
//     it printed was structurally larger than the number that the §8 row 3
//     boolean (`raf_owners_outside_frame_scheduler == 0`, "frame-scheduler
//     only") was actually meant to assert.
//     The fix is mechanical: tighten the rg ignore list to match the
//     boolean's real scope. Excluded:
//       -g '!editor/**'                         — separate sub-project
//       -g '!attached_assets/**'                — user uploads, not built
//       -g '!tools/ga-gate/check-raf-count.ts'  — this file (the rg pattern
//                                                  literal lives in code)
//       -g '!**/__tests__/**'                   — eslint rule fixtures + test
//       -g '!**/*.bad.ts'                       — legacy-shim & lint fixtures
//       -g '!**/*.good.ts'                      — lint fixtures
//     After exclusion the count is exactly 1 (RafAdapter.ts) — the
//     architecturally correct end state — and the §8 row 3 boolean flips ✅.
//     HARD_FAIL ratcheted 18 → 1 (== SOFT_WARN); the gate is now binding
//     at the absolute Wave 7 target. Any future regression that adds a
//     rAF owner anywhere in PRYZM 3 build artifacts will hard-fail CI.
// Per discipline rule 1 the ceiling ratchets down, not up.
// Wave 7 S85 absolute target = 1 (frame-scheduler only).
const HARD_FAIL = 1;
const SOFT_WARN = 1; // Wave 7 absolute target (the single Scheduler owner)

function count(): number {
  // NOTE: an explicit path arg ('.') is required — when stdin is not a TTY
  // (e.g. under execSync / CI), ripgrep would otherwise read from stdin
  // and silently report 0 matches.
  //
  // Scope: PRYZM 3 build artifacts only. The exclusion list below is the
  // canonical definition of "owned by PRYZM 3 build" (see D.7.8 narrative
  // above). Editing this list is a §8 row 3 contract change — only widen
  // when you genuinely want to police a new shard, never narrow without a
  // documented architectural reason.
  let out: string;
  try {
    out = execSync(
      `rg -l 'requestAnimationFrame\\(' . --type ts ` +
        `-g '!node_modules' -g '!dist' -g '!build' -g '!.next' ` +
        `-g '!editor/**' ` +
        `-g '!attached_assets/**' ` +
        `-g '!tools/ga-gate/check-raf-count.ts' ` +
        `-g '!scripts/**' ` +
        `-g '!**/__tests__/**' ` +
        `-g '!**/*.bad.ts' ` +
        `-g '!**/*.good.ts' ` +
        `| wc -l`,
      { encoding: 'utf8' },
    );
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 1) return 0;
    throw err;
  }
  return parseInt(out.trim() || '0', 10);
}

function main(): number {
  const n = count();
  if (n > HARD_FAIL) {
    console.error(`[raf-tripwire] FAIL: ${n} files own requestAnimationFrame > ${HARD_FAIL} (hard fail).`);
    console.error(`  Wave 7 target is exactly 1 file: packages/frame-scheduler/src/Scheduler.ts.`);
    console.error(`  Read: docs/03_PRYZM3/04-PLAN-FORWARD/07-WAVE-7-CLEANUP-PHASE-F.md §2`);
    return 1;
  }
  if (n > SOFT_WARN) {
    console.warn(`[raf-tripwire] WARN: ${n} files own requestAnimationFrame (Wave 7 target = ${SOFT_WARN}).`);
    return 0;
  }
  console.log(`[raf-tripwire] OK: ${n} owner.`);
  return 0;
}

process.exit(main());
