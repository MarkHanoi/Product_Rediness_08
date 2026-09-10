/**
 * activeSiteworksAuthoring — the SURFACE-INDEPENDENT authoring state for the siteworks
 * draw tool: which ROLE the next surface carries, and which GESTURE draws it.
 *
 * C116 §2 / §11 · ADR-0384 D1 (one kind, three roles) · D2 (the ring is derived).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ NOT ONE NEW SHAPE WORD IS MINTED HERE, AND NOT ONE NEW ROLE WORD EITHER.
 * ═══════════════════════════════════════════════════════════════════════════
 * The gesture union is `BOUNDARY_LINE_DRAW_MODES` — the same union the boundary line
 * spreads, which is itself `BoundaryDrawMode | BoundaryLoopMode` from
 * `@pryzm/geometry-slab`, the module that turns each gesture into real vertices. So
 * the siteworks mode strip cannot offer a shape the generator does not implement
 * (§FIX-STAIR-SHAPE-DESYNC's lesson, applied before it could bite an eighth time),
 * and `PlanPolylineStroke` — the ONE stroke both families drive — needs no siteworks
 * arm at all.
 *
 * The role union is `SITEWORKS_ROLES` from `@pryzm/schemas`, the L0 authority. A
 * fourth spelling here is how `railing`/`handrail` happened (L-4601).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ FORM IS **NOT** STORED, AND THAT IS THE DESIGN, NOT AN OMISSION
 * ═══════════════════════════════════════════════════════════════════════════
 * `Siteworks.form` is `'linear' | 'areal'`, and ADR-0384 makes it ORTHOGONAL to role —
 * six valid combinations. A fourth control asking the architect to declare the form
 * BEFORE drawing would be a control whose answer the gesture already contains:
 *
 *     an OPEN finish (double-click, or Enter on a chain)   → `linear` — centreline + width
 *     a CLOSED finish (Enter on a ring, or rect/circ/ellip) → `areal`  — boundary ring
 *
 * So the form is read off the finish, in `SiteworksPlanToolHandler`. The alternative —
 * a stored `form` flag — can DISAGREE with the gesture the architect just made, and a
 * mode flag that decides what the next click means is exactly what ADR-0386 D6 refused
 * on the envelope spine ("the intent is an ARGUMENT to the arm … so it can never be a
 * stale flag").
 *
 * ⛔ AND THE SWEPT RING IS NEVER STORED. C116: a stored ring is a cache that goes stale
 * on the next `setWidth`. `sweepCentrelineToRing` in `@pryzm/geometry-siteworks` is the
 * family's one authority, and the preview calls THAT rather than sweeping its own.
 *
 * WHY A STORE AND NOT A PICKER INSTANCE (the L-98 / L-255 / L-9302 lesson): there is
 * not ONE panel that offers these. `CreateRailPanel` and `CreatePanelLayout` are two
 * live create surfaces and `DrawingModeBar` is a third. A role or mode chosen from one
 * would be invisible to a handler reading another's instance.
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION. The stroke re-reads it on every click and
 * mousemove, so switching mid-draw applies to the very next click without
 * re-activating the tool (which would destroy the in-progress stroke).
 */

import { trace } from '@opentelemetry/api';
import {
    isBoundaryLineDrawMode,
    isBoundaryLineLoopMode,
    type BoundaryLineDrawMode,
    type BoundaryLineLoopMode,
} from '@pryzm/geometry-boundary-line';
import { SITEWORKS_ROLES, type SiteworksRole } from '@pryzm/schemas';

const _tracer = trace.getTracer('@pryzm/editor.active-siteworks-authoring', '0.1.0');

/** The gesture vocabulary, re-exported under this family's name — never re-declared. */
export type SiteworksDrawMode = BoundaryLineDrawMode;
export type SiteworksLoopMode = BoundaryLineLoopMode;

/**
 * LINEAR is the default gesture — the freeform polyline, which is the founder's
 * *"linear design — like a wall"* for a road. A user who never opens the mode strip
 * gets the plainest gesture rather than silently acquiring a constraint or a closed
 * shape they did not choose.
 */
let _mode: SiteworksDrawMode = 'linear';

/**
 * ROAD is the default role, and it is the schema's own default
 * (`Siteworks.role.default('road')`), not a second opinion. Every rail entry sets the
 * role explicitly before arming, so this value is only ever seen by a caller that
 * armed the tool without saying which surface it wanted.
 */
let _role: SiteworksRole = 'road';

export function setActiveSiteworksDrawMode(mode: unknown): void {
    _tracer.startActiveSpan('pryzm.siteworks.set_active_draw_mode', (span) => {
        try {
            // ⚠ An unrecognised value is IGNORED rather than stored, so a typo in a
            // caller leaves the previous VALID mode in place instead of putting the
            // tool into a state no arm handles. The guard's verdict goes on the span so
            // a silently-dropped write is visible in a trace rather than nowhere.
            const applied = isBoundaryLineDrawMode(mode);
            if (applied) _mode = mode;
            span.setAttribute('pryzm.siteworks.draw_mode', _mode);
            span.setAttribute('pryzm.siteworks.mode_applied', applied);
        } finally {
            span.end();
        }
    });
}

export function resolveActiveSiteworksDrawMode(): SiteworksDrawMode {
    return _mode;
}

/**
 * The closed-loop gesture, or `null` when the active mode draws a path.
 *
 * ⭐ THE ONE PLACE THAT SPLITS THE TWO AXES, so neither the stroke nor the handler
 * carries its own `m === 'rectangular' ? … : null` ladder — the ladder whose copies
 * are where the `'rectangle'` / `'rectangular'` divergence lives (L-1322).
 */
export function activeSiteworksLoopMode(): SiteworksLoopMode | null {
    return isBoundaryLineLoopMode(_mode) ? _mode : null;
}

export function setActiveSiteworksRole(role: unknown): void {
    _tracer.startActiveSpan('pryzm.siteworks.set_active_role', (span) => {
        try {
            const applied = typeof role === 'string'
                && (SITEWORKS_ROLES as readonly string[]).includes(role);
            if (applied) _role = role as SiteworksRole;
            span.setAttribute('pryzm.siteworks.role', _role);
            span.setAttribute('pryzm.siteworks.role_applied', applied);
        } finally {
            span.end();
        }
    });
}

export function resolveActiveSiteworksRole(): SiteworksRole {
    return _role;
}

/** Test seam — restore the defaults so one spec cannot leak state into the next. */
export function __resetActiveSiteworksAuthoringForTests(): void {
    _mode = 'linear';
    _role = 'road';
}
