/**
 * activeBoundaryLineDrawMode — §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7930) · C105 §2.1.
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for the drawing mode the user
 * has selected for the construction / setting-out line.
 *
 * THE FOUNDER'S ASK, verbatim:
 *   *"The UI should be like the wall, with the same modes for creation — line, ortho,
 *    rectangle, ellipse, curve, circle etc."*
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ NOT ONE NEW SHAPE WORD IS MINTED HERE.
 * ═══════════════════════════════════════════════════════════════════════════
 * The union is `BOUNDARY_LINE_DRAW_MODES` from `@pryzm/geometry-boundary-line`, which
 * is itself the union of two vocabularies that ALREADY EXIST in
 * `@pryzm/geometry-slab`:
 *
 *   • `BoundaryDrawMode` = 'linear' | 'ortho' | 'curved'       (boundaryPath.ts)
 *   • `BoundaryLoopMode` = 'rectangular' | 'circular' | 'elliptical'  (boundaryLoops.ts)
 *
 * Those are the SAME two modules the wall, slab, floor-finish, ceiling and pool tools
 * resolve their modes from, and `boundaryLoopVertices()` is the SAME generator that
 * turns a rectangular / circular / elliptical gesture into real vertices. So the
 * boundary line's mode strip cannot offer a shape the generator does not implement —
 * the lesson §FIX-STAIR-SHAPE-DESYNC paid for, applied before it could bite a seventh
 * time. `boundaryLineDrawModeVocabulary.test.ts` compares the three declarations as
 * SETS in both directions.
 *
 * WHY A STORE AND NOT A PICKER INSTANCE (the L-98 / L-255 lesson, applied before it
 * bites): there is not ONE panel that offers boundary-line modes. `CreateRailPanel`
 * and `CreatePanelLayout` are two live create surfaces, and `DrawingModeBar` is a
 * third, mounted by `ToolsAreaLayout`. A mode chosen from one would be invisible to a
 * handler reading another's instance — exactly the defect `activeWallSystemType.ts`,
 * `activeSlabDrawMode.ts` and `activePoolDrawMode.ts` were each written to close. The
 * mode is a property of the TOOL, not of whichever panel happened to offer it.
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION. `BoundaryLinePlanToolHandler` re-reads this
 * on every click and mousemove (the `WallModePicker.getActiveMode()` contract), so
 * switching mode mid-draw applies to the very next click without re-activating the
 * tool — which would destroy the in-progress stroke, the whole point of
 * §FEAT-PERSISTENT-MODE-BAR.
 */

import { trace } from '@opentelemetry/api';
import {
    isBoundaryLineDrawMode,
    isBoundaryLineLoopMode,
    type BoundaryLineDrawMode,
    type BoundaryLineLoopMode,
} from '@pryzm/geometry-boundary-line';

const _tracer = trace.getTracer('@pryzm/editor.active-boundary-line-draw-mode', '0.1.0');

export type { BoundaryLineDrawMode, BoundaryLineLoopMode };

/**
 * LINEAR is the default — the freeform polyline. A user who never opens the mode strip
 * gets the plainest gesture rather than silently acquiring a constraint or a closed
 * shape they did not choose.
 */
let _mode: BoundaryLineDrawMode = 'linear';

/**
 * ⭐ THE FOUNDER'S VOLUME BOOL, AT AUTHORING TIME.
 *
 *   *"The line could have volume also, via a bool setting on Visibility Intent."*
 *
 * Two things are true and they are NOT the same thing (C105 §5):
 *   1. the VIEW's visibility intent (`ElementGraphicsRules.solid`) decides how a line
 *      is DRAWN in a given view, and it wins where it has an opinion;
 *   2. the RECORD's `hasVolume` is the element's own authored intent, and it is the
 *      fallback for every view whose intent says nothing.
 *
 * THIS store holds what the next line DRAWN will be created with, i.e. an authoring
 * default for (2). It is deliberately a separate variable from the mode: a user who
 * switches from `linear` to `circular` has not said anything about volume.
 */
let _hasVolume = false;

export function setActiveBoundaryLineDrawMode(mode: unknown): void {
    _tracer.startActiveSpan('pryzm.boundary_line.set_active_draw_mode', (span) => {
        try {
            // ⚠ An unrecognised value is IGNORED rather than stored, so a typo in a
            // caller leaves the previous VALID mode in place instead of putting the
            // tool into a state no arm handles. The guard's verdict goes on the span so
            // a silently-dropped write is visible in a trace rather than invisible
            // everywhere.
            const applied = isBoundaryLineDrawMode(mode);
            if (applied) _mode = mode;
            span.setAttribute('pryzm.boundary_line.draw_mode', _mode);
            span.setAttribute('pryzm.boundary_line.applied', applied);
        } finally {
            span.end();
        }
    });
}

export function resolveActiveBoundaryLineDrawMode(): BoundaryLineDrawMode {
    return _tracer.startActiveSpan('pryzm.boundary_line.resolve_active_draw_mode', (span) => {
        try {
            span.setAttribute('pryzm.boundary_line.draw_mode', _mode);
            return _mode;
        } finally {
            span.end();
        }
    });
}

/**
 * The closed-loop mode, or `null` when the active mode is a path-drawing one.
 *
 * ⭐ THE ONE PLACE THAT SPLITS THE TWO AXES, so the handler does not carry its own
 * `m === 'rectangular' ? … : null` ladder — the ladder the ceiling and floor handlers
 * each carry a copy of, and which is where their historic `'rectangle'` /
 * `'rectangular'` divergence lives (L-1322).
 */
export function activeBoundaryLineLoopMode(): BoundaryLineLoopMode | null {
    const m = resolveActiveBoundaryLineDrawMode();
    return isBoundaryLineLoopMode(m) ? m : null;
}

/** Whether the NEXT boundary line drawn is authored with volume. */
export function activeBoundaryLineHasVolume(): boolean {
    return _hasVolume;
}

export function setActiveBoundaryLineHasVolume(on: unknown): void {
    if (typeof on === 'boolean') _hasVolume = on;
}

/** Test seam — restore the defaults so one spec cannot leak state into the next. */
export function __resetActiveBoundaryLineDrawModeForTests(): void {
    _mode = 'linear';
    _hasVolume = false;
}
