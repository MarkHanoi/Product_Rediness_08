/**
 * boundaryPath — §FEAT-SLAB-DRAW-MODES (2026-08-06)
 *
 * THE ONE path-authoring model for every slab-family boundary the user DRAWS:
 * slabs, floor finishes and ceilings. It is deliberately the WALL tool's model —
 * `linear` / `ortho` / `curved` with the wall's exact constraint maths — lifted
 * into a layer all three tools can import, rather than copied a fourth time.
 *
 * WHY THIS FILE EXISTS (founder, 2026-08-06):
 *   "During SLAB creation, FLOOR FINISH creation and CEILING creation I want the
 *    SAME OPTIONS as during WALL creation — ORTHO, LINEAR, CURVE etc."
 *
 * Before this module the three tools disagreed three ways:
 *   • WallPlanToolHandler._snapOrtho  — snaps the DIRECTION to the nearest 90°
 *     cardinal and PRESERVES the radial distance (a diagonal drag of 3 m gives a
 *     3 m orthogonal segment).
 *   • Floor/CeilingPlanToolHandler._orthoSnap — a private copy that instead
 *     PROJECTED onto the dominant axis (a diagonal drag of 3 m gave a ~2.1 m
 *     segment). Visually orthogonal, numerically NOT what the wall tool does.
 *   • SlabPlanToolHandler — no ortho mode at all, and SlabTool (3D) applied an
 *     always-on 45°/90° `snapToAxisOrDiagonal` the user could not turn off.
 *
 * `orthoConstrain` below is the WALL rule, verbatim, and is now the only ortho
 * rule any slab-family boundary tool may use (C11 §3 — parity by construction).
 *
 * ARC SEGMENTS reuse `boundaryArc.ts` (already the shared wall-identical arc
 * model); boundaries remain POLYGONS by schema and an arc enters by
 * TESSELLATION, the established pattern (SlabRegionTracer, RoomDetectionEngine).
 * No schema change, so P5 holds and no second arc representation is introduced.
 *
 * Pure math + a pure reducer — no THREE, no DOM, no store access, no `window`.
 * (Span-free by the same precedent as `boundaryArc.ts` / `floorFinishDefaults.ts`:
 * the C10 §2 OTel gate scopes to `plugins/&#42;/src/handlers/`, not pure geometry.)
 */

import { arcSegmentThroughMidpoint, type ArcVertex2D } from './boundaryArc';
// §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT — THE ortho rule, consumed from the kernel
// (C73 §2.2 pattern: a rule the whole repo must answer identically is not re-minted
// at the call site). The kernel is the only home that is not inside the
// geometry-slab ↔ geometry-wall dependency cycle.
import { orthoConstrainXZ } from '@pryzm/geometry-kernel';

export type { ArcVertex2D };

/**
 * The drawing modes every slab-family boundary tool MUST offer, named exactly as
 * the wall tool names them (`WallPickerMode`) so a mode string is portable.
 * Tools may offer ADDITIONAL modes of their own (rectangle / auto / region /
 * hollow / pickWalls); they may not offer a DIFFERENT spelling of these three.
 */
export type BoundaryDrawMode = 'linear' | 'ortho' | 'curved';

export const BOUNDARY_DRAW_MODES: readonly BoundaryDrawMode[] = ['linear', 'ortho', 'curved'] as const;

/** Type guard — narrows an arbitrary picker string to a shared boundary mode. */
export function isBoundaryDrawMode(v: unknown): v is BoundaryDrawMode {
  return v === 'linear' || v === 'ortho' || v === 'curved';
}

/**
 * THE ortho constraint for every slab-family boundary — now an ADAPTER onto the ONE
 * implementation in `@pryzm/geometry-kernel`.
 *
 * ⛔ §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT (FOUNDER RULING, 2026-08-24) — THE
 * SEMANTIC CHANGED HERE, AND IT MOVES SEVEN TOOLS AT ONCE.
 *
 * This function used to ROTATE: snap the DIRECTION to the nearest 90° cardinal while
 * PRESERVING the radial distance `|raw − start|`. It now PROJECTS — the endpoint is
 * the cursor's perpendicular FOOT on the nearer axis, so sideways cursor motion no
 * longer changes the length. Measured before the change, on a 5 m drag:
 *
 *     cursor 30°   ROTATE 5000 mm   PROJECT 4330 mm   Δ  670 mm
 *     cursor 45°   ROTATE 5000 mm   PROJECT 3536 mm   Δ 1464 mm   ← worst, 29.3%
 *     axial frozen at 4.000 m, cursor swept sideways to 3.9 m:
 *                  ROTATE 4000 → 5587 mm      PROJECT 4000 mm throughout
 *
 * The founder's reasoning is his own ruling turned back on itself — ORTHO IS A MODE,
 * NOT AN AID. Under rotation a 5 m drag at 80°, a gesture almost entirely
 * PERPENDICULAR to the chosen axis, still produced a 5 m wall: the mode
 * REINTERPRETING a magnitude the user never made along that axis.
 *
 * ⭐ THE 2026-08-06 DIRECTIVE IN THIS FILE'S HEADER STILL HOLDS. It said the slab,
 * floor and ceiling tools must offer the SAME OPTIONS as walls — they must AGREE.
 * They still do, and now the 3-D wall tool (which that pass missed, and which had
 * projected all along) agrees too. What changed is WHICH rule they agree on — the
 * question 2026-08-06 never asked.
 *
 * ⛔ The body is DELEGATED, not copied: `geometry-slab` and `geometry-wall` depend on
 * each other, so neither can host the shared rule without a module-init cycle. The
 * kernel depends on neither. One implementation, three names, no cycle.
 */
export function orthoConstrain(start: ArcVertex2D, raw: ArcVertex2D): ArcVertex2D {
  const v = orthoConstrainXZ(start, raw);
  return { x: v.x, z: v.z };
}

/**
 * The vertex a click at `raw` actually commits, given the mode and the previous
 * vertex. `curved` resolves as `linear` here — a curved segment is authored by
 * the 3-click midpoint gesture handled by `BoundaryPathAuthor`, not by
 * constraining a single point.
 */
export function resolveBoundaryVertex(
  mode: BoundaryDrawMode,
  last: ArcVertex2D | null,
  raw: ArcVertex2D,
): ArcVertex2D {
  if (mode === 'ortho' && last) return orthoConstrain(last, raw);
  return { x: raw.x, z: raw.z };
}

/** What a click did, so the caller can drive its HUD/preview without re-deriving state. */
export type BoundaryClickOutcome =
  /** A vertex was appended to the boundary. */
  | 'vertex'
  /** CURVED mode: the arc MIDPOINT was captured; the next click supplies the arc END. */
  | 'arc-midpoint'
  /** CURVED mode: the arc END was supplied; a tessellated run was appended. */
  | 'arc-segment';

/**
 * BoundaryPathAuthor — the shared click/preview state machine for drawing a
 * slab-family boundary polygon in `linear` / `ortho` / `curved` mode.
 *
 * It owns ONLY the path: no elevation, no thickness, no system type, no commit.
 * The caller decides when the path is complete and what command to dispatch, so
 * P6 (commands are the only mutation path) is untouched — this class never
 * dispatches and never writes a store.
 *
 * Gesture semantics, identical across slab / floor / ceiling / wall:
 *   linear  — click → vertex.
 *   ortho   — click → vertex, direction snapped to 90° from the previous vertex.
 *   curved  — click → arc MIDPOINT, click → arc END; the quadratic Bézier through
 *             the midpoint is tessellated (16 chords) and appended.
 */
export class BoundaryPathAuthor {
  private _points: ArcVertex2D[] = [];
  private _arcMid: ArcVertex2D | null = null;

  /** The committed boundary vertices, oldest first. Returns a copy. */
  get points(): ArcVertex2D[] {
    return this._points.map(p => ({ x: p.x, z: p.z }));
  }

  get pointCount(): number {
    return this._points.length;
  }

  /** The pending arc midpoint in CURVED mode, or null. */
  get pendingArcMidpoint(): ArcVertex2D | null {
    return this._arcMid ? { x: this._arcMid.x, z: this._arcMid.z } : null;
  }

  /** True while a gesture is in progress (drives `PlanToolHandler.hasActiveStroke`). */
  get isDrawing(): boolean {
    return this._points.length > 0 || this._arcMid !== null;
  }

  private get _last(): ArcVertex2D | null {
    return this._points.length > 0 ? this._points[this._points.length - 1]! : null;
  }

  /**
   * Apply a click. Returns what the click did so the caller can update its hint
   * text without duplicating the state machine.
   */
  click(mode: BoundaryDrawMode, raw: ArcVertex2D): BoundaryClickOutcome {
    const last = this._last;

    if (mode === 'curved' && last) {
      if (!this._arcMid) {
        this._arcMid = { x: raw.x, z: raw.z };
        return 'arc-midpoint';
      }
      for (const v of arcSegmentThroughMidpoint(last, this._arcMid, { x: raw.x, z: raw.z })) {
        this._points.push(v);
      }
      this._arcMid = null;
      return 'arc-segment';
    }

    this._points.push(resolveBoundaryVertex(mode, last, raw));
    return 'vertex';
  }

  /**
   * The vertices the rubber-band preview should draw between the last committed
   * vertex and the cursor: one straight point normally, or the tessellated arc
   * run when a CURVED midpoint is pending. Empty when there is nothing to trail.
   */
  previewTail(mode: BoundaryDrawMode, cursor: ArcVertex2D | null): ArcVertex2D[] {
    if (!cursor) return [];
    const last = this._last;
    if (mode === 'curved' && this._arcMid && last) {
      return arcSegmentThroughMidpoint(last, this._arcMid, { x: cursor.x, z: cursor.z });
    }
    if (mode === 'ortho' && last) return [orthoConstrain(last, cursor)];
    return [{ x: cursor.x, z: cursor.z }];
  }

  /**
   * Backspace. Discards a pending arc midpoint FIRST (so the user can re-pick the
   * bulge without losing the vertex), otherwise pops the last vertex.
   * Returns true if anything was undone.
   */
  undo(): boolean {
    if (this._arcMid) {
      this._arcMid = null;
      return true;
    }
    if (this._points.length > 0) {
      this._points.pop();
      return true;
    }
    return false;
  }

  /**
   * True when the path may be closed into a polygon. A pending arc midpoint
   * BLOCKS closing — the founder's "dbl-click ate my arc end click" defect.
   */
  canClose(): boolean {
    return this._arcMid === null && this._points.length >= 3;
  }

  reset(): void {
    this._points = [];
    this._arcMid = null;
  }
}
