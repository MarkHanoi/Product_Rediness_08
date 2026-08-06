/**
 * activeSlabDrawMode — §FEAT-SLAB-DRAW-MODES (founder, 2026-08-06).
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for the slab boundary
 * drawing mode the user has selected (`linear` | `ortho` | `curved`).
 *
 * WHY A STORE AND NOT THE PICKER INSTANCE (the L-98 lesson, applied before it
 * bites): there is not ONE `SlabModePicker`. `BottomActionMenu` constructs one and
 * `CreateRailPanel` constructs another, so a mode chosen from the bottom bar would
 * be invisible to a handler reading the rail's instance — the exact class of
 * defect `activeWallSystemType.ts` was written to close for wall system types.
 * The mode is a property of the SLAB TOOL, not of whichever panel happened to
 * offer it, so it lives here, outliving every picker instance.
 *
 * Both slab drawing surfaces (the plan overlay via `SlabPlanToolHandler`, and the
 * 3D `SlabTool`) resolve the constraint from here, so a polyline slab drawn in
 * plan and one drawn in 3D obey the SAME constraint (C11 §3 — parity by
 * construction).
 *
 * The MEANING of each mode is not defined here: `BoundaryDrawMode` and its ortho
 * constraint / arc gesture come from `@pryzm/geometry-slab`, shared with the
 * floor-finish and ceiling tools.
 */

import { trace } from '@opentelemetry/api';
import { isBoundaryDrawMode, type BoundaryDrawMode } from '@pryzm/geometry-slab';

const _slabDrawModeTracer = trace.getTracer('@pryzm/editor.active-slab-draw-mode', '0.1.0');

/**
 * LINEAR is the default — the freeform polyline the slab tool has always drawn.
 * A user who never opens the picker gets exactly the previous behaviour rather
 * than silently acquiring a constraint they did not choose.
 */
let _activeSlabDrawMode: BoundaryDrawMode = 'linear';

/**
 * Record the selected slab drawing mode. Called by `SlabModePicker` when the user
 * picks Linear / Orthogonal / Curved (from ANY panel instance).
 *
 * Non-boundary picker modes (2-point, region, hollow, pick-walls) are their own
 * gestures and deliberately do NOT touch this value, so returning to the polyline
 * family restores the constraint the user last chose.
 *
 * P8: emits `pryzm.slab.set_active_draw_mode`.
 */
export function setActiveSlabDrawMode(mode: unknown): void {
    _slabDrawModeTracer.startActiveSpan('pryzm.slab.set_active_draw_mode', (span) => {
        try {
            if (isBoundaryDrawMode(mode)) _activeSlabDrawMode = mode;
            span.setAttribute('pryzm.slab.draw_mode', _activeSlabDrawMode);
            span.setAttribute('pryzm.slab.applied', isBoundaryDrawMode(mode));
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve the active slab drawing mode. Read fresh on every click/mousemove by the
 * tool handlers (the `WallModePicker.getActiveMode()` contract) so the user can
 * switch mode mid-draw without re-activating the tool.
 *
 * P8: emits `pryzm.slab.resolve_active_draw_mode`.
 */
export function resolveActiveSlabDrawMode(): BoundaryDrawMode {
    return _slabDrawModeTracer.startActiveSpan('pryzm.slab.resolve_active_draw_mode', (span) => {
        try {
            span.setAttribute('pryzm.slab.draw_mode', _activeSlabDrawMode);
            return _activeSlabDrawMode;
        } finally {
            span.end();
        }
    });
}

/** Test seam — restore the default so one spec cannot leak its mode into the next. */
export function __resetActiveSlabDrawModeForTests(): void {
    _activeSlabDrawMode = 'linear';
}
