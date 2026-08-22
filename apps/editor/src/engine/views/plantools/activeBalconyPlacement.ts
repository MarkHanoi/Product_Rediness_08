/**
 * activeBalconyPlacement — §FEAT-BALCONY-COMPOUND (L-5605) · C103 §8 · ADR-0333.
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for BOTH balcony placement
 * axes: the drawing MODE, and the parametric SIZE the tool places at.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ WHY A STORE AND NOT A FIELD ON THE TOOL — THE LESSON, APPLIED BEFORE IT BITES
 * ═══════════════════════════════════════════════════════════════════════════
 * `elementCreationMatrix.ts` names this defect eight times over: L-239 (wall layers),
 * L-240 (floor-finish inner face), L-243 (stair config), L-246, L-251, L-255 (the
 * finish elevation), L-260 (door type) and the founder's original floor-finish report.
 * Every one is the same shape — a MODE or a PARAMETER stored on ONE surface's tool
 * INSTANCE, so the other surface cannot read it and a plan-drawn element silently
 * differs from a 3-D-drawn one of the "same" type.
 *
 * There is not ONE panel that offers balcony options. `CreateRailPanel` and
 * `CreatePanelLayout` are two live create surfaces and `DrawingModeBar` is a third.
 * A width chosen from one would be invisible to a handler reading another's instance.
 * So both axes live HERE, below the tools, and outlive every picker instance. When a
 * 3-D balcony tool lands it inherits the identical truth for free — which is the
 * whole reason this file exists before that tool does.
 *
 * ─── ⚠ WHY THE SIZE LIVES HERE AND THE DEFAULT DOES NOT ────────────────────────
 * `BALCONY_DIMENSION_DEFAULTS` in `@pryzm/geometry-balcony` remains the ONLY place a
 * balcony DEFAULT is written (L-127). This store holds the user's CURRENT CHOICE for
 * the next placement, seeded FROM that table — never a second copy of it. A
 * `width = 1.0` literal here would fork the dimensional truth, so there is not one:
 * the seed is an import.
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION. `BalconyPlanToolHandler` re-reads this on
 * every click and mousemove (the `WallModePicker.getActiveMode()` contract), so
 * switching mode mid-draw applies to the very next click without re-activating the
 * tool — which would destroy the in-progress stroke (§FEAT-PERSISTENT-MODE-BAR).
 */

import { trace } from '@opentelemetry/api';
import { BALCONY_DIMENSION_DEFAULTS } from '@pryzm/geometry-balcony';

const _tracer = trace.getTracer('@pryzm/editor.active-balcony-placement', '0.1.0');

/**
 * The two ways to place a balcony.
 *
 *   'hosted'  — hover a wall, see the parametric rectangle snap to it, click once.
 *               This is the founder's request verbatim: *"The user can hosted as you
 *               host a door on a wall with a preview of the space."*
 *   'outline' — click vertices to draw an arbitrary balcony outline, double-click or
 *               Enter to close. The host wall is then MEASURED from the ring rather
 *               than assumed, exactly as it is after a profile edit.
 *
 * ⚠ TWO MODES, AND BOTH ARE REAL. A third ("circular", say) would be easy to add to
 * this union and impossible to serve, which is §FIX-STAIR-SHAPE-DESYNC's defect: a
 * strip offering a shape the generator does not implement. The union is exactly what
 * `BalconyPlanToolHandler` has an arm for, and `elementCreationMatrix.spec.ts`
 * compares the declared mode set against it.
 */
export type BalconyDrawMode = 'hosted' | 'outline';

const BALCONY_DRAW_MODES: readonly BalconyDrawMode[] = ['hosted', 'outline'];

export function isBalconyDrawMode(v: unknown): v is BalconyDrawMode {
  return typeof v === 'string' && (BALCONY_DRAW_MODES as readonly string[]).includes(v);
}

/**
 * HOSTED is the default — the founder's stated gesture. A user who never opens the
 * mode strip gets a one-click, wall-snapped, correctly-sized balcony.
 */
let _mode: BalconyDrawMode = 'hosted';

/** The size the NEXT balcony is placed at. Seeded from the ONE default table. */
export interface BalconyPlacementConfig {
  /** Clear span along the host wall, metres. */
  readonly width: number;
  /** Projection away from the host wall, metres. */
  readonly projection: number;
  /** Railing height above the finished floor, metres. */
  readonly railingHeight: number;
}

let _config: BalconyPlacementConfig = {
  width: BALCONY_DIMENSION_DEFAULTS.width,
  projection: BALCONY_DIMENSION_DEFAULTS.projection,
  railingHeight: BALCONY_DIMENSION_DEFAULTS.railingHeight,
};

/** Smallest balcony the tool will place, metres. Below this it is not a balcony. */
export const MIN_BALCONY_DIMENSION_M = 0.1;
/** Step used by the keyboard nudges, metres. */
export const BALCONY_NUDGE_M = 0.1;

/**
 * Record the selected balcony drawing mode.
 *
 * ⚠ An unrecognised value is IGNORED rather than stored, so a typo in a caller leaves
 * the previous valid mode in place instead of putting the tool into a state no arm
 * handles. The guard's verdict rides on the span, so a silently-dropped write is
 * visible in a trace rather than invisible everywhere.
 *
 * P8: emits `pryzm.balcony.set_draw_mode`.
 */
export function setActiveBalconyDrawMode(mode: unknown): void {
  _tracer.startActiveSpan('pryzm.balcony.set_draw_mode', (span) => {
    try {
      const applied = isBalconyDrawMode(mode);
      if (applied) _mode = mode;
      span.setAttribute('pryzm.balcony.draw_mode', _mode);
      span.setAttribute('pryzm.balcony.applied', applied);
    } finally {
      span.end();
    }
  });
}

/**
 * Resolve the active balcony drawing mode. Read fresh on every click/mousemove so the
 * user can switch mid-draw.
 *
 * P8: emits `pryzm.balcony.resolve_draw_mode`.
 */
export function resolveActiveBalconyDrawMode(): BalconyDrawMode {
  return _tracer.startActiveSpan('pryzm.balcony.resolve_draw_mode', (span) => {
    try {
      span.setAttribute('pryzm.balcony.draw_mode', _mode);
      return _mode;
    } finally {
      span.end();
    }
  });
}

/**
 * The size the next balcony will be placed at.
 *
 * P8: emits `pryzm.balcony.get_placement_config`.
 */
export function getBalconyPlacementConfig(): BalconyPlacementConfig {
  return _tracer.startActiveSpan('pryzm.balcony.get_placement_config', (span) => {
    try {
      span.setAttribute('pryzm.balcony.width', _config.width);
      span.setAttribute('pryzm.balcony.projection', _config.projection);
      return _config;
    } finally {
      span.end();
    }
  });
}

/**
 * Change the size the next balcony will be placed at.
 *
 * ⚠ Every field is CLAMPED to `MIN_BALCONY_DIMENSION_M` rather than accepted and
 * refused later: a zero-width balcony fails the schema's non-degeneracy refine at
 * dispatch, which would surface to the user as a mysterious refusal several seconds
 * after the keystroke that caused it. Clamping keeps the preview and the placement
 * agreeing at all times, which is the property the door's §FIX-DOOR-PREVIEW-EXACT
 * had to be retrofitted with.
 *
 * P8: emits `pryzm.balcony.set_placement_config`.
 */
export function setBalconyPlacementConfig(next: Partial<BalconyPlacementConfig>): void {
  _tracer.startActiveSpan('pryzm.balcony.set_placement_config', (span) => {
    try {
      const clamp = (v: number | undefined, prev: number): number =>
        typeof v === 'number' && Number.isFinite(v) ? Math.max(MIN_BALCONY_DIMENSION_M, v) : prev;
      _config = {
        width: clamp(next.width, _config.width),
        projection: clamp(next.projection, _config.projection),
        railingHeight: clamp(next.railingHeight, _config.railingHeight),
      };
      span.setAttribute('pryzm.balcony.width', _config.width);
      span.setAttribute('pryzm.balcony.projection', _config.projection);
      span.setAttribute('pryzm.balcony.railing_height', _config.railingHeight);
    } finally {
      span.end();
    }
  });
}

/** Test seam — restore the defaults so one spec cannot leak into the next. */
export function __resetActiveBalconyPlacementForTests(): void {
  _mode = 'hosted';
  _config = {
    width: BALCONY_DIMENSION_DEFAULTS.width,
    projection: BALCONY_DIMENSION_DEFAULTS.projection,
    railingHeight: BALCONY_DIMENSION_DEFAULTS.railingHeight,
  };
}
