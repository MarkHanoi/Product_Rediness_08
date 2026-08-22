/**
 * activePoolDrawMode — §FIX-POOL-UNREACHABLE / §FEAT-POOL-SHAPE-MODES (L-5210).
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for the pool boundary
 * drawing mode the user has selected.
 *
 * THE FOUNDER'S ASK, verbatim:
 *   "on creation it should have, like the wall: linear, ortho — but also
 *    circular, ellipse, rectangular shape creation options."
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ NOT ONE NEW SHAPE WORD IS MINTED HERE.
 * ═══════════════════════════════════════════════════════════════════════════
 * The mode union below is the UNION OF TWO VOCABULARIES THAT ALREADY EXIST, both
 * from `@pryzm/geometry-slab`:
 *
 *   • `BoundaryDrawMode` = 'linear' | 'ortho' | 'curved'      (boundaryPath.ts)
 *   • `BoundaryLoopMode` = 'rectangular' | 'circular' | 'elliptical'
 *                                                              (boundaryLoops.ts)
 *
 * Those are the SAME two modules the slab, floor-finish and ceiling tools resolve
 * their modes from, and `boundaryLoopVertices()` is the SAME generator that turns
 * a circular/elliptical/rectangular gesture into real vertices. So the pool's mode
 * strip cannot offer a shape the generator does not implement — the lesson
 * §FIX-STAIR-SHAPE-DESYNC paid for, applied before it could bite a sixth time.
 *
 * ⛔ A sixth private shape picker was the obvious way to build this and would have
 * been the hand-copy defect this repo keeps paying for. `SlabToolMode` was declared
 * THREE times (C92 SL-Voc-2) before it was collapsed to one; the pool does not add
 * a fourth.
 *
 * WHY A STORE AND NOT A PICKER INSTANCE (the L-98 lesson, applied before it bites):
 * there is not ONE panel that offers pool modes. `CreateRailPanel` and
 * `CreatePanelLayout` are two live create surfaces, and `DrawingModeBar` is a third
 * surface mounted by `ToolsAreaLayout`. A mode chosen from one would be invisible to
 * a handler reading another's instance — exactly the defect `activeWallSystemType.ts`
 * and `activeSlabDrawMode.ts` were written to close. The mode is a property of the
 * POOL TOOL, not of whichever panel happened to offer it, so it lives here and
 * outlives every picker instance.
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION. `PoolPlanToolHandler` re-reads this on
 * every click and mousemove, so switching mode mid-draw applies to the very next
 * click without re-activating the tool (which would destroy the in-progress stroke —
 * the whole point of §FEAT-PERSISTENT-MODE-BAR).
 */

import { trace } from '@opentelemetry/api';
import {
    isBoundaryDrawMode,
    isBoundaryLoopMode,
    type BoundaryDrawMode,
    type BoundaryLoopMode,
} from '@pryzm/geometry-slab';

const _poolDrawModeTracer = trace.getTracer('@pryzm/editor.active-pool-draw-mode', '0.1.0');

/**
 * Every mode the pool tool offers — the founder's five plus `curved`, which comes
 * free with `BoundaryDrawMode` and would be strange to withhold from a pool when
 * the slab, floor and ceiling all have it.
 *
 * ⚠ This is a TYPE ALIAS over two imported unions, deliberately NOT a fresh
 * `type PoolDrawMode = 'linear' | 'ortho' | ...` literal union. A hand-typed copy
 * would silently stop tracking `@pryzm/geometry-slab` the moment a mode is added or
 * renamed there, which is precisely how `SlabToolMode` acquired three definitions.
 */
export type PoolDrawMode = BoundaryDrawMode | BoundaryLoopMode;

/** Narrowing guard composed from the two canonical guards — never a third list. */
export function isPoolDrawMode(v: unknown): v is PoolDrawMode {
    return isBoundaryDrawMode(v) || isBoundaryLoopMode(v);
}

/**
 * LINEAR is the default — the freeform polygon. A user who never opens the mode
 * strip gets the plainest gesture rather than silently acquiring a constraint or a
 * closed shape they did not choose.
 */
let _activePoolDrawMode: PoolDrawMode = 'linear';

/**
 * Record the selected pool drawing mode. Called by whichever surface offers it
 * (`DrawingModeBar` via `ToolsAreaLayout`, or a create panel).
 *
 * ⚠ An unrecognised value is IGNORED rather than stored, so a typo in a caller
 * leaves the previous valid mode in place instead of putting the tool into a state
 * no arm handles. The guard's verdict is recorded on the span so a silently-dropped
 * write is visible in a trace rather than invisible everywhere.
 *
 * P8: emits `pryzm.pool.set_active_draw_mode`.
 */
export function setActivePoolDrawMode(mode: unknown): void {
    _poolDrawModeTracer.startActiveSpan('pryzm.pool.set_active_draw_mode', (span) => {
        try {
            const applied = isPoolDrawMode(mode);
            if (applied) _activePoolDrawMode = mode;
            span.setAttribute('pryzm.pool.draw_mode', _activePoolDrawMode);
            span.setAttribute('pryzm.pool.applied', applied);
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve the active pool drawing mode. Read fresh on every click/mousemove by
 * `PoolPlanToolHandler` (the `WallModePicker.getActiveMode()` contract) so the user
 * can switch mode mid-draw.
 *
 * P8: emits `pryzm.pool.resolve_active_draw_mode`.
 */
export function resolveActivePoolDrawMode(): PoolDrawMode {
    return _poolDrawModeTracer.startActiveSpan('pryzm.pool.resolve_active_draw_mode', (span) => {
        try {
            span.setAttribute('pryzm.pool.draw_mode', _activePoolDrawMode);
            return _activePoolDrawMode;
        } finally {
            span.end();
        }
    });
}

/**
 * The closed-loop mode, or `null` when the active mode is a path-drawing one.
 *
 * ⭐ THE ONE PLACE THAT SPLITS THE TWO AXES. `PoolPlanToolHandler` asks this rather
 * than carrying its own `m === 'rectangular' ? ... : null` ladder — the ladder the
 * ceiling and floor handlers each carry a copy of, and which is where their
 * historic `'rectangle'` / `'rectangular'` divergence lives (L-1322). The pool
 * starts with one copy and the canonical spelling, so it has nothing to reconcile
 * later.
 */
export function activePoolLoopMode(): BoundaryLoopMode | null {
    const m = resolveActivePoolDrawMode();
    return isBoundaryLoopMode(m) ? m : null;
}

/** Test seam — restore the default so one spec cannot leak its mode into the next. */
export function __resetActivePoolDrawModeForTests(): void {
    _activePoolDrawMode = 'linear';
}
