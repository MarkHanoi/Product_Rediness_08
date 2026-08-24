/**
 * WallPlanToolHandler — Sprint 2 Phase 5 (Contract 19)
 *
 * Wall creation tool for plan view. Supports four drawing modes, read live from
 * window.wallModePicker.getActiveMode() on every mouse move:
 *
 *   linear   — Free-angle straight polyline (original behaviour, unchanged)
 *   ortho    — Snaps end point to nearest 90° cardinal axis from start
 *   curved   — 3-click arc: start → arc midpoint → end; commits a WallCurve (quadratic Bézier)
 *   byslab   — Not applicable in plan view; falls back to linear
 *
 * Any-angle mode (configurable degree snap) is applied when mode === 'ortho' with
 * a step from wallModePicker.getAngleStep() (falls back to 90°). This matches the
 * contract spec which uses 'ortho' as the primary constrained mode.
 *
 * State machine:
 *   State 0: _wallFirstPoint === null — idle
 *   State 1: _wallFirstPoint set, _arcMidPt === null — awaiting next point
 *            • linear/ortho: click → commit + chain (remains in state 1)
 *            • curved: click → save _arcMidPt → state 2
 *   State 2: _arcMidPt set — awaiting end point (curved only)
 *            • click → commit arc + chain → back to state 1
 */


import { WallDimensionInput } from '@pryzm/geometry-wall';
// §C83-S1 — the wall-side occupancy gate. apps/editor is L7, so this edge is
// DOWNWARD and adds nothing to check-layer-boundaries.
import { gateWallPlacement } from '@app/engine/consequence/wallPlacementGate';
import { createId } from '@pryzm/schemas';
// §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — pure alignment inference mirrored from
// the 3D tool's WallAlignmentGuide, consumed here for the plan-view wall tool.
import {
    computeWallAlignmentInference,
    type AlignReference,
    type AlignGuide,
} from '@pryzm/snapping';
import { isStrongSnap, type PlanToolHandler, type PlanToolDrawContext, type WorldPoint } from './PlanToolHandler';
// §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP (L-935) — the "is this actually a conflict?" test.
// CONSUMED from the kernel's declared tolerance policy (C73 §2.2), never minted here.
import { COINCIDENT_M, orthoConstrainXZ } from '@pryzm/geometry-kernel';
import { computeSetOutDimensions, solveSetOutPoint, type SetOutSegment, type SetOutDimension } from './setOutDimensions';
// §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — surface-independent active wall system type, so a
// wall drawn in the SPLIT plan pane carries the same layered systemTypeId as the MAIN view.
import { resolveActiveWallSystemTypeId } from './activeWallSystemType';
// §FEAT-WALL-SHAPE-MODES (founder, 2026-08-19) — the SHARED closed-loop
// generators, with the WALL density policy. ⚠ Walls use `WALL_LOOP_DENSITY`, NOT
// the plate policy: every chord of a wall run is a REAL ELEMENT with an id, a
// schedule row and two junctions, so a 20 mm-tolerance circle would emit ~64
// walls of ~390 mm. The module states that reasoning where the numbers live.
import {
    boundaryLoopVertices, boundaryLoopRefusal, BOUNDARY_LOOP_GESTURE,
    BOUNDARY_LOOP_LABELS, WALL_LOOP_DENSITY, type BoundaryLoopMode,
} from '@pryzm/geometry-slab';
// §P2.1 (IMPL-PLAN-2026-05-17): CreateWallCommand + window.commandManager bridge (P4.4).
// Wall creation is now bus-only; no @pryzm/command-registry import needed here.

const WALL_DEFAULT_HEIGHT    = 2.7;
const WALL_DEFAULT_THICKNESS = 0.2;
const ARC_SEGMENTS           = 16;
const DEG                    = Math.PI / 180;
// §WALL-SETOUT (founder 2026-06-21) — set-out dimension colour. Reuses the existing
// in-progress length-label blue (#1e40af). Per C18 §2.4 a set-out dimension is a
// functional MEASUREMENT, not a creation ghost, so it is OUT of the unified-purple
// preview rule (§41) — but we still source ONE colour rather than invent a new hex.
const SETOUT_BLUE = '#1e40af';
// §WALL-SETOUT-4SIDE (founder 2026-07-06) — the SECONDARY set-out pair (the farther
// wall on each axis, newly projected to the two other sides) renders in GREY so the
// user distinguishes it from the PRIMARY (blue) pair. Grey is a neutral non-brand
// tint (slate-500), consistent with C18 §2.4 "functional measurement" state colours.
const SETOUT_GREY = '#64748b';
// §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — alignment guide colours mirror the 3D
// WallAlignmentGuide (blue single-axis lock, cyan double-lock / intersection) so
// the two surfaces read identically. These are inference REFERENCES (a functional
// alignment aid, like the set-out dims), not the creation ghost — out of the
// unified-purple preview rule (§41), same as §WALL-SETOUT.
const ALIGN_GUIDE_BLUE = '#0088ff';
const ALIGN_GUIDE_CYAN = '#00ccff';
// Soft-snap tolerance for the alignment inference, in SCREEN pixels. Converted to
// world metres per-frame via planCanvas.getPixelsPerUnit() so the "tendency to
// stop" feels the same at every zoom level. ~10 px ≈ the 3D tool's 0.15 m feel.
const ALIGN_SNAP_PX = 10;
// §RULING-ORTHO-IS-A-MODE-NOT-AN-AID — the colour of the "the snap was projected onto
// the ortho ray" chip. AMBER, not the brand purple: like §WALL-SETOUT's blue this is a
// FUNCTIONAL statement about the constraint solve, not a creation ghost, so it is out
// of the unified-purple preview rule (C18 §41). Amber-600, a neutral caution tint.
// (Was `ORTHO_YIELD_AMBER` under L-935, when the chip announced the opposite verdict.)
const SNAP_PROJECTED_AMBER = '#d97706';

/**
 * §FEAT-WALL-SHAPE-MODES — the wall picker's mode mapped onto the SHARED closed-loop
 * vocabulary, or `null` for a path-drawing mode.
 *
 * ⭐ WHY THESE ARE *PLAN* SHAPES AND NOT ELEVATION PROFILES. "Circular wall" is
 * ambiguous three ways: (a) an arc in plan — that is `wall.curve`, and it already
 * exists; (b) a wall whose FACE is a circle — that is `wallProfile`, which also
 * already exists and is authorable through `WallTool.enterProfileEditMode`; and
 * (c) a closed RUN of walls forming a circular room. The founder listed
 * `rectangular / circular / elliptical` as PEERS, and only (c) makes them peers:
 * under (a) "rectangular" is incoherent, and under (b) it is the ABSENT profile —
 * i.e. asking for nothing. So (c) is what these modes build, and (a) and (b) are
 * untouched and still reachable.
 */
function _wallLoopMode(mode: string): BoundaryLoopMode | null {
    return mode === 'rectangular' ? 'rectangular'
         : mode === 'circular'    ? 'circular'
         : mode === 'elliptical'  ? 'elliptical'
         : null;
}

/**
 * ⛔ §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT (FOUNDER RULING, 2026-08-24) — THIS
 * FUNCTION'S SEMANTIC CHANGED, AND IT IS THE ONE THE FOUNDER SAW.
 *
 * It used to ROTATE: snap the DIRECTION to the nearest cardinal and PRESERVE the
 * radial distance, so a 5 m drag gave a 5 m wall at ANY cursor angle. It now
 * PROJECTS onto the perpendicular foot. On his own fixture, at 45°, that is
 * 5000 mm → 3536 mm — a 1464 mm difference, 29.3% of the drag.
 *
 * Now an ADAPTER over the kernel's single implementation, translating `WorldPoint`
 * to the pure `{x,z}` the shared rule speaks. ⛔ Do not re-inline the maths: a
 * private copy here is exactly how the plan tool and the 3-D tool came to commit
 * two different lengths for one gesture.
 */
function _snapOrtho(start: WorldPoint, raw: WorldPoint): WorldPoint {
    const v = orthoConstrainXZ(
        { x: start.worldX, z: start.worldZ },
        { x: raw.worldX,   z: raw.worldZ   },
    );
    return { worldX: v.x, worldZ: v.z };
}

function _snapAngle(start: WorldPoint, raw: WorldPoint, stepDeg: number): WorldPoint {
    const dx    = raw.worldX - start.worldX;
    const dz    = raw.worldZ - start.worldZ;
    const angle   = Math.atan2(dz, dx);
    const step    = stepDeg * DEG;
    const snapped = Math.round(angle / step) * step;
    const dist    = Math.hypot(dx, dz);
    return {
        worldX: start.worldX + Math.cos(snapped) * dist,
        worldZ: start.worldZ + Math.sin(snapped) * dist,
    };
}

/**
 * Compute a Canvas2D quadratic Bézier control point from three world points.
 * The control point ensures the Bézier curve passes through `midThrough` at t=0.5.
 *   P(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2 = midThrough
 *   ⟹ P1 = 2·midThrough − 0.5·(P0 + P2)
 */
function _bezierControl(
    start: WorldPoint,
    midThrough: WorldPoint,
    end: WorldPoint,
): { x: number; z: number } {
    return {
        x: 2 * midThrough.worldX - 0.5 * (start.worldX + end.worldX),
        z: 2 * midThrough.worldZ - 0.5 * (start.worldZ + end.worldZ),
    };
}

export class WallPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;

    private _wallFirstPoint: WorldPoint | null     = null;
    private _polylineFirstPoint: WorldPoint | null = null;
    private _arcMidPt: WorldPoint | null           = null;   // Phase 5: curved mode mid-click
    private _wallSegmentCount = 0;

    // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per
    // PlanToolHandler.hasActiveStroke?(). The wall tool's chained-polyline mode
    // accumulates segments via _wallFirstPoint + _polylineFirstPoint + arc-mode
    // _arcMidPt. While ANY of these is non-null the user has uncommitted state
    // and a temporary cursor excursion to the toolbar (e.g. picking a system
    // type) must NOT wipe the stroke.
    hasActiveStroke(): boolean {
        return this._wallFirstPoint !== null
            || this._polylineFirstPoint !== null
            || this._arcMidPt !== null;
    }
    private _wallCursorPoint: WorldPoint | null    = null;
    private _wallStatusOverlay: HTMLElement | null = null;
    private _dimInput: WallDimensionInput | null   = null;   // §04-12: typed dimension input

    // §WALL-SETOUT-TAB-INPUT (L-126) — TAB-to-edit numeric entry for set-out dims.
    // When active the user is typing an exact set-out distance (mm) into ONE of the
    // dim fields; the live vertex is back-solved (solveSetOutPoint) so that set-out
    // equals the typed value. Continued TAB cycles the focused field (primary → …
    // → secondary); ENTER commits through the normal wall-creation command (P6).
    private _setOutEditActive = false;
    private _setOutDims: SetOutDimension[] = [];   // snapshot captured on TAB entry
    private _setOutEditIndex = 0;                  // which dim currently has focus
    private _setOutBuffer = '';                    // typed digits (mm) for the focused field
    private _setOutEditPoint: WorldPoint | null = null; // accumulating back-solved vertex

    // §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — the dashed inference guides + label
    // for the CURRENT cursor position, recomputed each mouse-move. Empty ⇒ no
    // inference this frame (flag OFF, no start point, or no candidate in tolerance).
    private _alignGuides: AlignGuide[] = [];
    private _alignLabel: string | null = null;

    /**
     * §RULING-ORTHO-IS-A-MODE-NOT-AN-AID (founder 2026-08-24) — the record of an
     * over-constrained second point whose conflict was resolved IN FAVOUR OF ORTHO.
     *
     * ⭐ THIS IS L-935's NOTE, INVERTED BY FOUNDER RULING — same information, opposite
     * verdict. It used to be `_orthoYield` and it recorded "ortho was DROPPED, the snap
     * won". The founder saw that chip live on 2026-08-24 and ruled the state out of
     * existence (see `_resolveConstrainedPoint` for the ruling, verbatim). What survives
     * is the DISCLOSURE, because the failure L-935 measured — a wall committed 636 mm
     * from the click with NO trace — must not come back in the other direction either.
     *
     * Non-null only while the live/committing point is a strong object snap that does
     * NOT lie on the ortho ray. Carries both numbers: how far the snapped point sits
     * from the axis-aligned point actually committed (`missM`), and how far off the
     * nearest cardinal axis the SNAP was (`offAxisDeg`). `at` is the COMMITTED point, so
     * a commit through a different path (polyline close, typed length) can never inherit
     * a stale note.
     */
    private _snapProjected: { at: WorldPoint; missM: number; offAxisDeg: number; snapType: string } | null = null;

    /**
     * §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR (founder 2026-08-24) — THE MODE SOURCE, and
     * why it no longer answers `'linear'` when it cannot read one.
     *
     * FOUNDER: "if the wall MODE: is ORTHO — it can not -not draw ortho — it can not fall
     * back to linear."
     *
     * This used to be a module function ending `?? 'linear'`. That single `??` turned THREE
     * different facts into one value: "the user picked linear", "`window.wallModePicker`
     * does not exist on this surface", and "the picker exists but exposes no
     * `getActiveMode`". The first is a choice; the other two are wiring failures — and
     * `'linear'` is the LEAST-CONSTRAINED mode, so a failure to read the mode silently
     * produced exactly the free-angle wall the founder reported, with the UI still showing
     * ORTHO. C01 §6 rule 6: ABSENT and a legitimate value must not be the same value.
     *
     * ⚠ This global is ALREADY KNOWN to carry the wrong mode between tools —
     * `CurtainWallPlanToolHandler.ts:14,28` records CW-1 (2026-04), an "always ortho" bug
     * caused by that handler sharing `window.wallModePicker`. A source with that history
     * must not fail silently.
     *
     * WHAT IT DOES INSTEAD, and why it is not a refusal. A missing mode source is not a
     * reason to refuse to draw a wall — the user's gesture is valid and the tool is armed.
     * So: the LAST MODE ACTUALLY READ survives (an armed ORTHO stays ORTHO across a frame
     * where the picker is unreachable — that is the founder's rule, literally), and the
     * absence is REPORTED BY NAME, once per gap, naming which half was missing. Only when
     * no mode has EVER been read does it fall to `'linear'`, and that case is reported too.
     *
     * ⛔ IT IS AN INSTANCE FIELD, NOT MODULE STATE, AND THAT IS LOAD-BEARING (C13 / the
     * `check:isolation` candidate sweep). A `let` at module scope survives a PROJECT
     * SWITCH: the ortho armed in project A would be the mode held for a first stroke in
     * project B, silently. The memory belongs to the drawing session, so it lives on the
     * handler that owns that session and dies with it — nothing to declare, nothing to
     * leak, no teardown hook to forget.
     *
     * ⛔ Do not "simplify" this back to `?? 'linear'`, and do not lift it to module scope
     * to "share it between surfaces".
     */
    private _lastReadMode: string | null = null;
    private _modeSourceReported = false;

    private _getMode(): string {
        const picker = window.wallModePicker;
        const raw = picker?.getActiveMode?.();
        if (typeof raw === 'string' && raw.length > 0) {
            this._lastReadMode = raw;
            this._modeSourceReported = false;   // the gap closed; re-arm for the next one
            return raw;
        }
        if (!this._modeSourceReported) {
            this._modeSourceReported = true;
            console.error(
                '[WallPlanToolHandler] §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — the wall mode ' +
                `source is UNREADABLE (window.wallModePicker ${picker ? 'exists but getActiveMode() ' +
                `returned ${JSON.stringify(raw)}` : 'is ABSENT'}). This is a WIRING failure, not a user ` +
                'choice: "cannot read the mode" and "the user picked free-angle" are opposite facts. ' +
                `Holding the last mode actually read: ${JSON.stringify(this._lastReadMode ?? 'linear (none ever read)')}.`,
            );
        }
        return this._lastReadMode ?? 'linear';
    }


    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._dimInput           = new WallDimensionInput(ctx.overlayCanvas);
        this._syncCreationHud();
    }

    deactivate(): void {
        this._removeWallStatusOverlay();
        this._clearOverlay();
        this._dimInput?.dispose();
        this._dimInput           = null;
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._resetSetOutEdit();
        this._resetAlignGuides();
        this._snapProjected = null;   // §RULING-ORTHO-IS-A-MODE-NOT-AN-AID (was L-935)
        this._ctx = null;
    }

    /** §WALL-SETOUT-TAB-INPUT — leave set-out numeric-edit mode (keep the wall stroke). */
    private _resetSetOutEdit(): void {
        this._setOutEditActive = false;
        this._setOutDims       = [];
        this._setOutEditIndex  = 0;
        this._setOutBuffer     = '';
        this._setOutEditPoint  = null;
    }

    onMouseMove(pt: WorldPoint): void {
        // §WALL-SETOUT-TAB-INPUT — while typing an exact set-out distance the vertex
        // is locked to the back-solved point; ignore raw cursor motion so the typed
        // value is not overwritten (Escape / a fresh TAB returns to cursor control).
        if (this._setOutEditActive) return;
        const mode = this._getMode();
        const resolved = this._resolveConstrainedPoint(pt, mode, /* captureGuides */ true);
        this._wallCursorPoint = resolved;
        if (this._wallFirstPoint) {
            this._drawWallPreview();
        } else {
            // §WALL-SETOUT — BEFORE the first click, show the set-out distances from the
            // hovered start point to the surrounding walls (the founder's core ask: an
            // internal partition's start has no reference to existing walls). Mirrors the
            // during-drawing overlay ownership (clears + redraws, snap markers coexist).
            this._drawSetOutPreviewOnly(resolved);
        }
    }

    onClick(pt: WorldPoint): void {
        const mode = this._getMode();
        // §FIX-WALL-PREVIEW-COMMIT-LENGTH-LOCK (founder 2026-08-06) — the click commit
        // resolves through the SAME `_resolveConstrainedPoint` the preview uses, so what
        // the preview drew IS what commits. Before this fix, `onClick` hand-rolled a copy
        // of the mouse-move constraint chain and OMITTED the typed-length lock — with a
        // typed length active the preview drew the wall at the locked distance while a
        // CLICK committed the raw, unlocked cursor point. That is the founder's report
        // verbatim: "the preview computes the correct joint, the commit does not". The
        // committed endpoint then lands an arbitrary cursor-distance off the intended
        // corner, which is how a wall drawn INTO an existing corner ends up tens–hundreds
        // of mm away from it and the junction solver sees a near-but-not-coincident
        // cluster instead of a shared vertex. One shared resolution function; no second
        // hand-rolled copy to diverge again.
        const resolved = this._resolveConstrainedPoint(pt, mode, /* captureGuides */ false);

        // ── CLOSED-LOOP wall runs — 2 clicks, N walls ────────────────────────
        // §FEAT-WALL-SHAPE-MODES. The anchor still resolves through the shared
        // constraint chain, so a drum can be snapped onto existing geometry.
        const loopMode = _wallLoopMode(mode);
        if (loopMode) {
            if (!this._wallFirstPoint) {
                this._wallFirstPoint     = resolved;
                this._polylineFirstPoint = resolved;
                this._arcMidPt           = null;
                this._wallSegmentCount   = 0;
                this._syncCreationHud();
                return;
            }
            this._commitLoopRun(loopMode, this._wallFirstPoint, resolved);
            return;
        }

        if (!this._wallFirstPoint) {
            this._wallFirstPoint     = resolved;
            this._polylineFirstPoint = resolved;
            this._arcMidPt           = null;
            this._wallSegmentCount   = 0;
            this._syncCreationHud();
            console.log('[WallPlanToolHandler] Polyline start point set', resolved, 'mode:', mode);
            return;
        }

        if (mode === 'curved' && !this._arcMidPt) {
            // State 1 → State 2: store arc midpoint
            this._arcMidPt = pt; // no snap for midpoint — free placement
            this._wallCursorPoint = null;
            this._syncCreationHud();
            console.log('[WallPlanToolHandler] Arc midpoint set', pt);
            return;
        }

        this._commitWall(resolved);
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (this._wallFirstPoint) this._closePolyline();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        const mode = this._getMode();

        // §WALL-SETOUT-TAB-INPUT — TAB enters set-out numeric-edit mode (or cycles the
        // focused dim once in it). Only while a start point exists and not in curved mode.
        if (e.key === 'Tab' && this._wallFirstPoint && mode !== 'curved') {
            e.preventDefault();
            this._handleSetOutTab();
            return true;
        }

        // §WALL-SETOUT-TAB-INPUT — while editing a set-out distance, keystrokes drive the
        // focused field (digits / backspace → live back-solve; Enter → commit; Esc → exit).
        // This takes precedence over the §04-12 length input so the two never collide.
        if (this._setOutEditActive) {
            return this._handleSetOutEditKey(e);
        }

        // §04-12: typed dimension input — capture digits/period/backspace/Escape
        // Only active in drawing state (first point set) and not in curved mode
        if (this._wallFirstPoint && this._dimInput && mode !== 'curved') {
            const consumed = this._dimInput.handleKey(e.key);
            if (consumed) {
                e.preventDefault();
                // Update preview with the locked end point
                if (this._wallCursorPoint) {
                    const locked = this._computeLockedEndPoint(this._wallFirstPoint, this._wallCursorPoint);
                    if (locked) {
                        this._wallCursorPoint = locked;
                        this._drawWallPreview();
                    }
                }
                return true;
            }
        }

        if (e.key === 'Enter') {
            // §04-12: if a length is typed, commit at the locked end point
            if (this._dimInput?.isActive && this._wallFirstPoint && this._wallCursorPoint) {
                const locked = this._computeLockedEndPoint(this._wallFirstPoint, this._wallCursorPoint);
                if (locked) {
                    e.preventDefault();
                    this._dimInput.reset();
                    this._commitWall(locked);
                    return true;
                }
            }

            const canClose = this._wallSegmentCount >= 2
                && !!this._polylineFirstPoint
                && !!this._wallFirstPoint;
            if (canClose) {
                e.preventDefault();
                this._closePolyline();
                return true;
            } else if (this._wallFirstPoint && this._wallCursorPoint) {
                this._commitWall(this._wallCursorPoint);
                return true;
            }
        }
        if (e.key === 'Escape') {
            if (this._arcMidPt) {
                // Back from state 2 to state 1
                this._arcMidPt = null;
                this._clearOverlay();
                return true;
            }
        }
        return false;
    }

    cancel(): void {
        this._dimInput?.reset();
        this._resetSetOutEdit();
        this._resetAlignGuides();
        this._snapProjected = null;   // §RULING-ORTHO-IS-A-MODE-NOT-AN-AID (was L-935)
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._syncCreationHud();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._wallFirstPoint && this._wallCursorPoint) this._drawWallPreview();
    }

    /**
     * §FEAT-WALL-SHAPE-MODES — a closed run of walls from ONE two-click gesture.
     *
     * ⭐ IT DISPATCHES NOTHING OF ITS OWN. Every edge goes through `_commitWall`,
     * the ONE wall-creation path this handler already owns — so the C83 spatial
     * gate, the system-type resolution, the layer stamping, the id minting and the
     * `wall.create` dispatch are all inherited rather than re-implemented. That is
     * the same structural claim `handrailRunGenerators` makes for railings: a
     * multi-segment run IS N two-point elements, and pretending otherwise is how a
     * second record shape gets minted.
     *
     * `_commitWall` already CHAINS (`this._wallFirstPoint = endPt` on success), so
     * walking the ring in order and finishing back at vertex 0 closes the loop with
     * no special case for the closing edge.
     *
     * ⚠ A per-edge refusal from the spatial gate is NOT fatal to the run: that edge
     * is skipped with the gate's own sentence and the remaining edges still build.
     * Abandoning the whole loop because one edge crossed a door would be a worse
     * answer than a partial drum the author can see and fix.
     */
    private _commitLoopRun(
        loopMode: BoundaryLoopMode,
        anchor: WorldPoint,
        second: WorldPoint,
    ): void {
        const first = { x: anchor.worldX, z: anchor.worldZ };
        const sec   = { x: second.worldX, z: second.worldZ };
        const ring  = boundaryLoopVertices(loopMode, first, sec, WALL_LOOP_DENSITY);

        if (ring.length < 3) {
            // ⛔ C16 CA-18 / §L955 — name the reason; never fall back to a rectangle.
            console.warn(
                '[WallPlanToolHandler] §FEAT-WALL-SHAPE-MODES —',
                boundaryLoopRefusal(loopMode, first, sec, WALL_LOOP_DENSITY),
            );
            return;
        }

        const mk = (v: { x: number; z: number }): WorldPoint =>
            ({ ...second, worldX: v.x, worldZ: v.z, snapType: undefined } as WorldPoint);

        this._arcMidPt       = null;
        this._wallFirstPoint = mk(ring[0]);
        for (let i = 1; i <= ring.length; i++) {
            this._commitWall(mk(ring[i % ring.length]));
        }

        // End the run: a closed loop has no dangling start point to continue from.
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._wallCursorPoint    = null;
        this._arcMidPt           = null;
        this._syncCreationHud();
        this._clearOverlay();
        console.log(
            `[WallPlanToolHandler] §FEAT-WALL-SHAPE-MODES committed a ${loopMode} run of ${ring.length} walls`,
        );
    }

    private _commitWall(endPt: WorldPoint): void {
        const startPt = this._wallFirstPoint;
        if (!startPt || !this._ctx) return;

        const dx = endPt.worldX - startPt.worldX;
        const dz = endPt.worldZ - startPt.worldZ;
        if (Math.hypot(dx, dz) < 0.01) {
            console.warn('[WallPlanToolHandler] Wall too short — skipped');
            this._arcMidPt = null;
            return;
        }

        const levelId = this._ctx.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[WallPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        // §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — resolve from the stable surface-independent
        // store (falling back to window.wallTool), so the SPLIT plan pane threads the same
        // selected layered type as the MAIN plan view instead of dispatching systemTypeId=none.
        const systemTypeId = resolveActiveWallSystemTypeId();
        // §FIX-PLAN-WALL-TYPE-IGNORED (L-41) — HISTORICAL NOTE, CORRECTED 2026-07-11.
        //
        // The original comment here blamed a "first-registration-wins" facade (composeRuntime
        // seeding a *separate* plugin-side WallSystemTypeStore, making engineLauncher's
        // §WALL-TYPE-WIRE adapter dead) AND asserted that "the 3D builder re-resolves
        // layers/thickness from systemTypeId at render". BOTH are now false:
        //
        //   • The catalogue split was fixed at the composition root by ADR-0116
        //     (§FIX-WALL-TYPE-UNIFY-CATALOGUE): PluginRegistry's wall descriptor now seeds
        //     `buildSharedWallCatalogue()` — the ONE geometry-wall singleton the picker reads —
        //     into the authoritative handler, and the dead §WALL-TYPE-WIRE adapter was removed.
        //     Type resolution no longer depends on registration order.
        //   • The 3D builder does NOT re-derive anything. WallFragmentBuilder (§03-1.3) reads
        //     `wall.layers` straight off the INSTANCE, exactly as WallLayerPlanSymbolBuilder
        //     does for plan. 3D-created walls only *looked* right because WallTool ALSO
        //     dual-writes through the legacy CreateWallCommand, which stamps `layers` — the
        //     bus-only plan path had no such stamp, so a plan-created layered wall was stored
        //     WITHOUT layers and drew plain in BOTH views (L-239 / L-211).
        //
        // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239) moves BOTH derivations
        // (systemTypeId → thickness AND → layers[]) into the `wall.create` COMMAND handler —
        // the chokepoint every creation path dispatches through — and persists them on the
        // instance. This tool therefore no longer needs to resolve anything.
        //
        // The `thickness` below is retained ONLY as a defensive fallback for a catalogue miss
        // (the chokepoint overrides it with the type's totalThickness whenever the type
        // resolves — idempotent, identical value). It is deliberately NOT deleted yet: the
        // legacy `CreateWallCommand` path (WallTool's dual-write, CreateWallsFromSlab, the
        // project loader) still writes the legacy WallStore WITHOUT passing through
        // `wall.create`, so the bus chokepoint is not yet the sole writer. See the L-239
        // report — collapsing that legacy path is the follow-up that makes this line removable.
        const thickness    = this._getSelectedWallThickness();
        const mode         = this._getMode();

        let isCurved = false;
        let curvePayload: { control: { x: number; y: number; z: number }; segments: number } | undefined;
        if (mode === 'curved' && this._arcMidPt) {
            const ctrl = _bezierControl(startPt, this._arcMidPt, endPt);
            curvePayload = { control: { x: ctrl.x, y: 0, z: ctrl.z }, segments: ARC_SEGMENTS };
            isCurved = true;
        }

        // §P2.1 / C11 §2 — bus-only single-pipeline dispatch.
        //
        // CONTRACT (C11 §3.2 + C11 §7.0 FIX-WALL-ID):
        //   • `id` MUST be pre-generated here using createId('wall') from @pryzm/schemas.
        //     The CEB extracts id from record.payload → emits wallId on 'wall.created'.
        //     The initTools §P2.1 bridge guards on !ev.wallId — if id is omitted from
        //     the payload, wallId is undefined, the guard silently drops every event,
        //     the legacy WallStore is never updated → no 3D mesh, no plan view projection.
        //   • createId('wall') generates `wall_<ulid>` format which passes the
        //     CreateWallHandler.WALL_ID_RE regex.  crypto.randomUUID() must NOT be used.
        //   • baseLine points MUST be full Vec3 `{ x, y, z }`.  The `y` component
        //     carries the level elevation (0 in plan view = ground level).
        //
        // The handler (plugins/wall/src/handlers/CreateWall.ts) writes to the PRYZM3
        // Immer store; CommandEventBridge emits `wall.created`; the bridge in
        // initTools.ts §P2.1 mirrors into the legacy WallStore → WallRebuildCoordinator
        // → 3D mesh.  Plan view: WallStore.add() emits storeEventBus →
        // ViewTechnicalDrawingCache._onStoreChange → vd:projection-stale → Canvas2D.
        // §C83-S1 — THE PRE-COMMIT SPATIAL GATE (C83 §3, "pre-commit canExecute":
        // IMPOSSIBLE verdicts only, one query per commit).
        //
        // Founder, live build a75e8e1e: "also the wall can be placed in front of a
        // door still: which it should not." Nothing checked it, because
        // `canPlace(wall, offset, width)` takes ONE wall and compares against THAT
        // wall's own openings — a NEW wall arriving at a wall that already holds a
        // door is not expressible in that signature.
        //
        // It runs HERE, before the dispatch, rather than inside the handler's
        // `canExecute`, for a measured reason: the handler sees `ctx.stores.wall`,
        // the plugin's Immer draft, which never receives an opening placed in 3D
        // (that path writes the legacy `WallStore` directly). Gating on the draft
        // would be blind to exactly the case reported. The gate reads the
        // authoritative store, which is a superset of both paths.
        //
        // On refusal the stroke is abandoned but `_wallFirstPoint` is deliberately
        // LEFT WHERE IT IS: the user's start point was fine, only the end was
        // rejected, so they can re-aim from the same origin without re-clicking it.
        const spatial = gateWallPlacement({
            levelId,
            thickness,
            baseLine: [
                { x: startPt.worldX, y: 0, z: startPt.worldZ },
                { x: endPt.worldX,   y: 0, z: endPt.worldZ   },
            ],
            ...(curvePayload ? { curve: curvePayload } : {}),
        });
        if (spatial.blocked) {
            // §REFUSAL-IDENTITY — no `?? '<fallback>'`: the gate has already
            // rendered the user-facing sentence through the shared renderer, and
            // manufacturing a second one here would be a rival account of one
            // refusal. An absent reason is logged as absent.
            console.warn(
                '[WallPlanToolHandler] §C83-S1 REFUSED wall.create —',
                spatial.verdict?.reason,
            );
            this._arcMidPt        = null;
            this._wallCursorPoint = null;
            this._syncCreationHud();
            this._clearOverlay();
            return;
        }

        // §RULING-ORTHO-IS-A-MODE-NOT-AN-AID — SAY WHAT HAPPENED TO THE SNAP, WITH BOTH
        // NUMBERS. Logged only when THIS endpoint is the one the note describes, so a
        // polyline close or a typed-length commit can never inherit a stale note.
        // (This is L-935's disclosure with the verdict inverted — see the field's doc.)
        const projected = this._snapProjected;
        if (
            projected
            && Math.abs(projected.at.worldX - endPt.worldX) < COINCIDENT_M
            && Math.abs(projected.at.worldZ - endPt.worldZ) < COINCIDENT_M
        ) {
            console.log(
                '[WallPlanToolHandler] §RULING-ORTHO-IS-A-MODE-NOT-AN-AID — over-constrained ' +
                'second point: ORTHO HELD, the %s snap was PROJECTED onto the axis. ' +
                'The snapped feature sits %s mm from the committed end and was %s° off axis.',
                projected.snapType,
                (projected.missM * 1000).toFixed(1),
                projected.offAxisDeg.toFixed(2),
            );
        }

        const wallId = createId('wall');
        window.runtime?.bus?.executeCommand('wall.create', {
            id:       wallId,
            baseLine:  [
                { x: startPt.worldX, y: 0, z: startPt.worldZ },
                { x: endPt.worldX,   y: 0, z: endPt.worldZ   },
            ],
            height:    WALL_DEFAULT_HEIGHT,
            thickness,
            levelId,
            ...(systemTypeId  ? { systemTypeId }  : {}),
            ...(curvePayload  ? { curve: curvePayload } : {}),
        })?.catch((e: unknown) => console.error('[WallPlanToolHandler] wall.create bus failed:', e));
        console.log('[WallPlanToolHandler] Wall dispatched — mode:', mode, isCurved ? '(curved)' : '(straight)');
        this._wallSegmentCount++;

        // Chain: endpoint becomes new start; clear arc state and dim input
        this._dimInput?.reset();
        this._resetSetOutEdit();   // §WALL-SETOUT-TAB-INPUT — leave edit mode on commit
        this._resetAlignGuides();  // §FEAT-PLAN-WALL-ALIGN-INFERENCE — clear stale guides
        this._snapProjected = null;   // §RULING-ORTHO-IS-A-MODE-NOT-AN-AID — the note
                                   // described the point just committed; it must not survive it.
        this._wallFirstPoint  = endPt;
        this._arcMidPt        = null;
        this._wallCursorPoint = null;
        this._syncCreationHud();
        this._clearOverlay();
    }

    /**
     * §04-12: Returns a WorldPoint at the typed distance from start in the
     * direction of cursor, or null if dim input has no valid length or the
     * cursor is coincident with start.
     */
    /**
     * §FIX-WALL-PREVIEW-COMMIT-LENGTH-LOCK — THE single constraint-resolution chain for a
     * stroke's second point, shared by the live preview (`onMouseMove`) and the commit
     * (`onClick`). Order is load-bearing and mirrors what the preview has always drawn:
     *
     *   1. ORTHO / ANGLE-STEP direction lock — and, on a strong object snap, THE SNAP WINS.
     *      See §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP below.
     *   2. §04-12 typed-length lock — a typed dimension overrides geometric snap because
     *      it is even more explicit. Inert unless a positive length has been typed.
     *      (Curved state 2 — end point from arc mid — is deliberately unconstrained.)
     *   3. §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — soft-snap to alignment references;
     *      `captureGuides` additionally stores the dashed guides + label for the preview
     *      frame (reset first so a no-candidate frame clears any prior guide). The commit
     *      path passes false: it takes the same POINT but never touches preview state.
     *
     * Before this existed, `onClick` carried a hand-rolled copy of this chain that had
     * silently dropped step 2 — the preview/commit divergence the founder reported.
     */
    private _resolveConstrainedPoint(pt: WorldPoint, mode: string, captureGuides: boolean): WorldPoint {
        if (captureGuides) {
            this._alignGuides = [];
            this._alignLabel  = null;
        }
        this._snapProjected = null;
        if (!this._wallFirstPoint) return pt;
        let resolved = pt;
        if (mode === 'ortho') {
            // ══ §RULING-ORTHO-IS-A-MODE-NOT-AN-AID (FOUNDER RULING, 2026-08-24) ══════
            //
            // ⛔ THIS BLOCK REVERSES §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP (L-935, 2026-08-17).
            // It is a RULING, not a bug fix, and the L-935 rationale below is preserved
            // VERBATIM and UNEDITED underneath it — because that rationale is persuasive,
            // it is what re-derives the reversed behaviour, and deleting it is how it gets
            // "restored" by someone who re-reasons their way back to it six weeks from now.
            // READ THE RULING FIRST. It is the current rule.
            //
            // The founder was shown the live chip on his own screen —
            //     "ortho off · snap wins · 1.9° off axis (ortho would miss 494 mm)"
            // — and answered, verbatim:
            //
            //     "why this ortho off snap wins is even available? i dont want that:
            //      if ortho is in place - ortho is what need - no other cases"
            //
            // He was told explicitly that he had asked for the opposite on 2026-08-17 with
            // a measured 636 mm behind it, and ruled again. Twice, once in general terms
            // and once seeing the actual behaviour.
            //
            // THE RULE: **ORTHO IS A MODE, NOT AN AID.** When ortho is armed the committed
            // segment IS axis-aligned. "No other cases" is the operative phrase — there is
            // no escape hatch here, no modifier-key bypass and no tolerance band under
            // which the snap wins. L-935's three arguments are answered by one fact: they
            // all reason from "ortho is an auxiliary constraint", and the founder has now
            // said it is not one. That premise is his to set.
            //
            // ⭐ WHAT HAPPENS TO THE SNAP: IT IS PROJECTED, NOT DISCARDED. Ortho constrains
            // the DIRECTION; the snapped point still carries real positional information
            // ALONG that direction. `_snapOrtho` rotates the point onto the nearest cardinal
            // ray KEEPING ITS DISTANCE from the start, so the committed wall is axis-aligned
            // AND as long as the user's reach to the feature they aimed at. Dropping to the
            // raw cursor instead would throw that away and honour neither constraint. (This
            // is the same operator the no-snap branch uses — deliberately, so ortho does not
            // acquire a THIRD meaning in this one file.)
            //
            // ⭐ AND IT STILL SAYS SO — THE DISCLOSURE IS L-935's, INVERTED. What L-935
            // actually measured was a wall committed 636 mm from the click SILENTLY. The
            // silence was the defect; the verdict was the founder's to choose. So the note,
            // the chip and the commit log survive with the verdict flipped: *the SNAP was
            // projected, ORTHO HELD, here is the miss in mm and how far off-axis you were.*
            // If ortho ever cannot be honoured at all, that is a REFUSAL with numbers — never
            // a silent downgrade, which is the shape of defect that produced this report.
            //
            // ⚠ `PlanToolHandler.ts`'s `WorldPointSnapType` doc ("an explicit object snap
            // always wins") WAS amended in the same commit. Two files asserting opposite
            // rules is the `1360a010` failure — "the contract carried TWO OPPOSITE answers
            // to one question for five days" — and this repo has logged it once already.
            //
            // ──────────────────────────────────────────────────────────────────────────
            // ── §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP (L-935, founder 2026-08-17) ─ SUPERSEDED
            //    BY THE RULING ABOVE. Kept verbatim as the record of what was measured and
            //    why the opposite conclusion was drawn from it. DO NOT re-enable.
            //
            // THE founder defect: "draw a wall polyline in ORTHOGONAL mode; on the second
            // segment place the second point by snapping to the MIDPOINT of an existing
            // wall that is NOT aligned with the orthogonal projection."
            //
            // Ortho constrains the segment's DIRECTION. The object snap constrains its END
            // POINT. When the snapped point does not lie on the ortho ray those two
            // constraints CONFLICT, and the input is OVER-CONSTRAINED — exactly one of them
            // can survive. §STRICT-ORTHO (Apr 2026) resolved that conflict SILENTLY and in
            // favour of ortho: `_snapOrtho` was applied unconditionally, so the explicit
            // snap was discarded and the wall was committed somewhere the user never clicked.
            //
            // MEASURED (L935OrthoMidpointConflict.measure.spec.ts, ARM A) with the cursor on
            // the midpoint of a wall 9.12° off the ortho ray at 4 m:
            //     snapped midpoint  (3.949434, -0.634011)
            //     committed end     (4.000000,  0.000000)   ← what shipped
            //     MISS              636.0 mm
            // That 636 mm is the same figure the founder's own trace reports
            // §DIAG-PARTITION-REACH rescuing as a "dangling gap" — the emitter putting the
            // end in the wrong place, with a downstream rescuer papering over it.
            //
            // WHICH CONSTRAINT WINS, AND WHY THE SNAP. Three independent reasons, none of
            // them preference:
            //   1. `PlanToolHandler.ts` ALREADY DECLARES IT, verbatim: "When a handler sees
            //      one of the 'strong' snaps … it MUST respect the snap verbatim and skip
            //      auxiliary constraints like ortho / angle locks — this is the Revit/AutoCAD
            //      convention: an explicit object snap always wins." §STRICT-ORTHO contradicted
            //      the interface the handler implements, and had no contract, ADR or SPEC
            //      behind it — it was a comment.
            //   2. The ANGLE-STEP branch six lines below has honoured that rule all along
            //      (`!isStrongSnap(pt)`). Ortho was the only branch that did not; the two
            //      branches disagreed about the same question.
            //   3. A snap is an EXPLICIT gesture at a named feature of an existing element;
            //      ortho is a background aid. Discarding the explicit one is the surprising
            //      reading.
            //
            // AND IT SAYS SO. Silently taking the other branch would only move the surprise.
            // `_orthoYield` records BOTH numbers — the gap ortho would have opened, and how
            // far off-axis the accepted segment sits — which the preview chips beside the
            // cursor and `_commitWall` logs at the dispatch.
            //
            // NOT A REFUSAL. The wall is buildable and unambiguous once the conflict is
            // decided, so C83's refusal path is not engaged; the C83 §3 spatial gate in
            // `_commitWall` still runs on the resolved point exactly as before.
            //
            // NOTE ON THE TAPER. The founder's report described the wall NARROWING toward the
            // snapped point. That half was measured and REFUTED (ARM B/ARM C): the footprint's
            // every side corner sits at exactly ±halfThickness from its own centreline whether
            // or not a junction forms, and `buildMiterPrism` projects both side corners ALONG
            // the wall direction so its faces are parallel by construction. The wall never had
            // two thicknesses. What it had was an END 636 mm from the click, crossing the host
            // it should have met — which is what reads as a wedge in plan.
            // §RULING-ORTHO-IS-A-MODE-NOT-AN-AID — ONE branch, no `isStrongSnap` fork.
            // The fork WAS the state the founder ruled out; a snap now changes what gets
            // REPORTED, never what gets committed.
            const orthoPt = _snapOrtho(this._wallFirstPoint, pt);
            resolved = orthoPt;
            if (isStrongSnap(pt)) {
                const missM = Math.hypot(pt.worldX - orthoPt.worldX, pt.worldZ - orthoPt.worldZ);
                // Only a MATERIAL disagreement is worth announcing. When the snapped point
                // already lies on the ortho ray the two constraints agree and nothing was
                // given up — say nothing (COINCIDENT_M, consumed from the kernel, C73 §2.2).
                if (missM >= COINCIDENT_M) {
                    const dx = pt.worldX - this._wallFirstPoint.worldX;
                    const dz = pt.worldZ - this._wallFirstPoint.worldZ;
                    const angleDeg = Math.atan2(dz, dx) / DEG;
                    // Departure of THE SNAP from the NEAREST cardinal axis, in [0, 45].
                    const offAxisDeg = Math.abs(angleDeg - Math.round(angleDeg / 90) * 90);
                    this._snapProjected = {
                        at: orthoPt, missM, offAxisDeg, snapType: pt.snapType ?? 'object',
                    };
                }
            }
        } else if (mode !== 'linear' && mode !== 'curved' && mode !== 'byslab' && !isStrongSnap(pt)) {
            const step = window.wallModePicker?.getAngleStep?.() ?? 15;
            resolved = _snapAngle(this._wallFirstPoint, pt, step);
        }
        if (this._dimInput?.isActive && mode !== 'curved') {
            const locked = this._computeLockedEndPoint(this._wallFirstPoint, resolved);
            if (locked) resolved = locked;
        }
        if (this._alignInferenceActive(mode) && !isStrongSnap(pt)) {
            const inf = this._computeAlignInference(resolved);
            if (inf) {
                resolved = { worldX: inf.snapped.x, worldZ: inf.snapped.z };
                if (captureGuides) {
                    this._alignGuides = inf.guides.slice();
                    this._alignLabel  = inf.label;
                }
            }
        }
        return resolved;
    }

    private _computeLockedEndPoint(start: WorldPoint, cursor: WorldPoint): WorldPoint | null {
        const length = this._dimInput?.getLengthMeters();
        if (!length || length <= 0) return null;
        const dx   = cursor.worldX - start.worldX;
        const dz   = cursor.worldZ - start.worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return null;
        return {
            worldX: start.worldX + (dx / dist) * length,
            worldZ: start.worldZ + (dz / dist) * length,
        };
    }

    // ── §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — alignment inference snap ──────────

    /**
     * Whether alignment inference should run this frame. Gated so it never fights
     * the existing constraints: flag ON (default), a start point exists, FREE
     * (linear) mode only — ortho / angle already lock direction — and neither the
     * typed-length input nor the set-out numeric editor is active (both are more
     * explicit than a soft inference). The caller additionally skips inference when
     * the raw point already landed on a strong object snap (endpoint/etc. wins).
     */
    private _alignInferenceActive(mode: string): boolean {
        return this._alignInferenceEnabled()
            && !!this._wallFirstPoint
            && mode === 'linear'
            && !this._dimInput?.isActive
            && !this._setOutEditActive;
    }

    /** Feature gate — DEFAULT ON; only an explicit `false` disables (P4: typed flag). */
    private _alignInferenceEnabled(): boolean {
        return window.__pryzmPlanWallAlignInference !== false;
    }

    /**
     * Run the pure alignment inference for `cursor` against the active level's
     * walls. Tolerance is a fixed screen-pixel budget converted to world metres
     * via the live pixels-per-unit, so the snap "feel" is zoom-invariant. Returns
     * null when there is no start point or no candidate within tolerance.
     */
    private _computeAlignInference(cursor: WorldPoint): ReturnType<typeof computeWallAlignmentInference> {
        const start = this._wallFirstPoint;
        if (!start || !this._ctx) return null;
        const segs = this._collectLevelWallSegments();
        if (segs.length === 0) return null;
        const ppu = this._ctx.planCanvas.getPixelsPerUnit?.() ?? 0;
        const axisThresholdM = ppu > 0 ? ALIGN_SNAP_PX / ppu : 0.15;
        return computeWallAlignmentInference(
            { x: start.worldX,  z: start.worldZ },
            { x: cursor.worldX, z: cursor.worldZ },
            this._collectAlignReferences(segs),
            segs,
            { axisThresholdM },
        );
    }

    /** Endpoint + midpoint reference points from the active level's wall segments. */
    private _collectAlignReferences(segs: readonly SetOutSegment[]): AlignReference[] {
        const refs: AlignReference[] = [];
        for (const s of segs) {
            refs.push({ x: s.a.x, z: s.a.z, kind: 'endpoint' });
            refs.push({ x: s.b.x, z: s.b.z, kind: 'endpoint' });
            refs.push({ x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2, kind: 'midpoint' });
        }
        return refs;
    }

    /** Clear the captured alignment guides (called when a stroke commits/resets). */
    private _resetAlignGuides(): void {
        this._alignGuides = [];
        this._alignLabel  = null;
    }

    /**
     * §RULING-ORTHO-IS-A-MODE-NOT-AN-AID — the on-canvas half of "say what happened to
     * your snap". An amber chip beside the cursor stating that ORTHO HELD and carrying
     * both numbers: how far the snapped feature sits from the point actually committed,
     * and how far off the cardinal axis that snap was. Drawn only while the live point
     * is a strong snap that is materially off the ortho ray.
     *
     * ⛔ THE OLD LABEL — "ortho off · snap wins" — IS GONE BECAUSE THE STATE IS GONE
     * (founder ruling, 2026-08-24). It was NOT silenced while the yield stayed in place:
     * that would hide the defect rather than fix it. Read `_resolveConstrainedPoint`.
     *
     * Assumes the overlay transform is already the dpr transform (called from
     * `_drawWallPreview` after the wall band's save/restore). Does its own
     * save/restore; never clears.
     */
    private _drawSnapProjectedChip(): void {
        const c = this._ctx;
        const y = this._snapProjected;
        if (!c || !y || !this._wallCursorPoint) return;
        const { ctx, planCanvas } = c;
        const p = planCanvas.worldToScreen(this._wallCursorPoint.worldX, this._wallCursorPoint.worldZ);
        const label =
            `ortho held · ${y.snapType} snap projected onto axis ` +
            `(${y.offAxisDeg.toFixed(1)}° off axis · ${Math.round(y.missM * 1000)} mm from the snap)`;

        ctx.save();
        ctx.font = 'bold 10px sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = SNAP_PROJECTED_AMBER;
        ctx.fillRect(p.sx + 10, p.sy + 8, tw + 8, 15);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.sx + 14, p.sy + 16);
        ctx.restore();
    }

    /**
     * Draw the dashed alignment inference guides + a snap-label chip. Assumes the
     * overlay transform is already the dpr transform (called from _drawWallPreview
     * after the wall band's save/restore). Does its own save/restore; never clears.
     */
    private _drawAlignmentGuides(): void {
        const c = this._ctx;
        if (!c || (this._alignGuides.length === 0 && !this._alignLabel)) return;
        const { ctx, planCanvas } = c;

        ctx.save();
        for (const g of this._alignGuides) {
            const colour = g.isIntersection ? ALIGN_GUIDE_CYAN : ALIGN_GUIDE_BLUE;
            const from = planCanvas.worldToScreen(g.from.x, g.from.z);
            const to   = planCanvas.worldToScreen(g.to.x,   g.to.z);
            ctx.strokeStyle = colour;
            ctx.lineWidth   = 1.25;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(from.sx, from.sy);
            ctx.lineTo(to.sx, to.sy);
            ctx.stroke();
            ctx.setLineDash([]);
            // Small tick at the reference (existing wall feature) end.
            ctx.beginPath();
            ctx.arc(from.sx, from.sy, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = colour;
            ctx.fill();
        }

        // Snap-label chip near the snapped cursor (like the existing snap chips).
        if (this._alignLabel && this._wallCursorPoint) {
            const p = planCanvas.worldToScreen(this._wallCursorPoint.worldX, this._wallCursorPoint.worldZ);
            const label = this._alignLabel;
            ctx.font = 'bold 10px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(0,136,255,0.92)';
            ctx.fillRect(p.sx + 10, p.sy - 22, tw + 8, 15);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, p.sx + 14, p.sy - 14);
        }
        ctx.restore();
    }

    // ── §WALL-SETOUT-TAB-INPUT (L-126) — TAB-to-edit set-out numeric entry ──────────

    /**
     * TAB pressed: enter set-out edit mode (capturing the current set-out dims), or —
     * if already editing — commit the focused field and cycle focus to the NEXT dim
     * (primary → … → secondary, wrapping). No-op if there are no set-out references.
     */
    private _handleSetOutTab(): void {
        if (!this._setOutEditActive) {
            const anchor = this._wallCursorPoint ?? this._wallFirstPoint;
            if (!anchor) return;
            const dims = computeSetOutDimensions(
                { x: anchor.worldX, z: anchor.worldZ },
                this._collectLevelWallSegments(),
            );
            if (dims.length === 0) return;   // nothing to set out against
            this._setOutEditActive = true;
            this._setOutDims       = dims;
            this._setOutEditIndex  = 0;
            this._setOutBuffer     = '';
            this._setOutEditPoint  = { worldX: anchor.worldX, worldZ: anchor.worldZ };
        } else {
            // Apply whatever is typed for the current field, then advance focus.
            this._applySetOutBuffer();
            this._setOutEditIndex = (this._setOutEditIndex + 1) % this._setOutDims.length;
            this._setOutBuffer    = '';
        }
        this._syncCreationHud();
        this._redrawSetOutEdit();
    }

    /** Keystrokes while in set-out edit mode. Returns true when consumed. */
    private _handleSetOutEditKey(e: KeyboardEvent): boolean {
        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            this._setOutBuffer += e.key;
            this._applySetOutBuffer();
            this._redrawSetOutEdit();
            return true;
        }
        if (e.key === 'Backspace') {
            e.preventDefault();
            this._setOutBuffer = this._setOutBuffer.slice(0, -1);
            this._applySetOutBuffer();
            this._redrawSetOutEdit();
            return true;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            this._applySetOutBuffer();
            const pt = this._setOutEditPoint;
            this._resetSetOutEdit();
            if (pt) this._commitWall(pt);   // P6 — commit through the wall.create command
            return true;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            this._resetSetOutEdit();
            this._syncCreationHud();
            if (this._wallFirstPoint && this._wallCursorPoint) this._drawWallPreview();
            else this._clearOverlay();
            return true;
        }
        // Swallow other printable keys so they don't leak into other handlers while editing.
        return true;
    }

    /**
     * Re-derive the live vertex from the typed buffer for the focused dim. The
     * off-axis coordinate is preserved by solveSetOutPoint, so editing the X dim then
     * the Z dim composes into one point across TAB cycles. Empty buffer ⇒ no change.
     */
    private _applySetOutBuffer(): void {
        const dim = this._setOutDims[this._setOutEditIndex];
        const base = this._setOutEditPoint;
        if (!dim || !base || this._setOutBuffer === '') return;
        const mm = parseInt(this._setOutBuffer, 10);
        if (!Number.isFinite(mm)) return;
        const np = solveSetOutPoint({ x: base.worldX, z: base.worldZ }, dim, mm);
        this._setOutEditPoint = { worldX: np.x, worldZ: np.z };
        // Mirror onto the cursor point so _commitWall + the wall band use the edited vertex.
        this._wallCursorPoint = this._setOutEditPoint;
    }

    /** Redraw the wall band + set-out edit overlay for the current edited vertex. */
    private _redrawSetOutEdit(): void {
        if (this._setOutEditPoint) this._wallCursorPoint = this._setOutEditPoint;
        this._drawWallPreview();
    }

    private _closePolyline(): void {
        const start = this._wallFirstPoint;
        const end   = this._polylineFirstPoint;
        if (!start || !end) return;

        if (Math.hypot(end.worldX - start.worldX, end.worldZ - start.worldZ) >= 0.1) {
            this._arcMidPt = null; // force straight closing segment
            this._commitWall(end);
        }

        this._resetSetOutEdit();
        this._resetAlignGuides();
        this._snapProjected = null;   // §RULING-ORTHO-IS-A-MODE-NOT-AN-AID (was L-935)
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._syncCreationHud();
        this._clearOverlay();
        console.log('[WallPlanToolHandler] Polyline closed');
    }

    private _drawWallPreview(): void {
        const c = this._ctx;
        if (!c || !this._wallFirstPoint || !this._wallCursorPoint) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const s = planCanvas.worldToScreen(this._wallFirstPoint.worldX,  this._wallFirstPoint.worldZ);
        const e = planCanvas.worldToScreen(this._wallCursorPoint.worldX, this._wallCursorPoint.worldZ);

        ctx.save();

        const mode = this._getMode();

        if (mode === 'curved' && this._arcMidPt) {
            // ── Curved mode state 2: draw arc from start through arcMidPt to cursor ──
            const sm = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            const ctrl = _bezierControl(this._wallFirstPoint, this._arcMidPt, this._wallCursorPoint);
            const sc   = planCanvas.worldToScreen(ctrl.x, ctrl.z);

            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.quadraticCurveTo(sc.sx, sc.sy, e.sx, e.sy);
            ctx.stroke();

            // Arc midpoint indicator
            ctx.fillStyle = '#6600ff';
            ctx.beginPath(); ctx.arc(sm.sx, sm.sy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.stroke();

            // Length hint — approximate chord
            const distM = Math.hypot(
                this._wallCursorPoint.worldX - this._wallFirstPoint.worldX,
                this._wallCursorPoint.worldZ - this._wallFirstPoint.worldZ,
            );
            const midX = (s.sx + e.sx) / 2, midY = (s.sy + e.sy) / 2;
            const label = `~${Math.round(distM * 1000)} mm (arc)`;
            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.90)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle = '#6600ff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);

        } else if (mode === 'curved' && !this._arcMidPt) {
            // ── Curved mode state 1: awaiting arc midpoint — draw dashed preview line ──
            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth   = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.lineTo(e.sx, e.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(30,58,138,0.85)';
            ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
            ctx.fillText('Click to set arc midpoint', 12, cssH - 12);

        } else {
            // ── Linear / Ortho / Any-angle: solid thickness band (unchanged) ──────────
            const segDx = e.sx - s.sx;
            const segDy = e.sy - s.sy;
            const screenLen = Math.hypot(segDx, segDy);
            if (screenLen >= 0.5) {
                const thicknessPx = Math.max(2, planCanvas.getPixelsPerUnit() * this._getSelectedWallThickness());
                const halfWidth = thicknessPx / 2;
                const perpX = -segDy / screenLen;
                const perpY =  segDx / screenLen;
                const corners = [
                    { x: s.sx + perpX * halfWidth, y: s.sy + perpY * halfWidth },
                    { x: s.sx - perpX * halfWidth, y: s.sy - perpY * halfWidth },
                    { x: e.sx - perpX * halfWidth, y: e.sy - perpY * halfWidth },
                    { x: e.sx + perpX * halfWidth, y: e.sy + perpY * halfWidth },
                ];
                ctx.fillStyle = 'rgba(102,0,255,0.35)';
                ctx.strokeStyle = '#6600ff';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                ctx.lineTo(corners[1].x, corners[1].y);
                ctx.lineTo(corners[2].x, corners[2].y);
                ctx.lineTo(corners[3].x, corners[3].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            const dx    = this._wallCursorPoint.worldX - this._wallFirstPoint.worldX;
            const dz    = this._wallCursorPoint.worldZ - this._wallFirstPoint.worldZ;
            const lenMm = Math.round(Math.hypot(dx, dz) * 1000);
            const label = `${lenMm} mm`;
            const midX  = (s.sx + e.sx) / 2;
            const midY  = (s.sy + e.sy) / 2;

            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.90)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle = '#1e40af';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);
        }

        const canClose = this._wallSegmentCount >= 2 && this._polylineFirstPoint;
        if (canClose && mode !== 'curved') {
            const origin = planCanvas.worldToScreen(
                this._polylineFirstPoint!.worldX, this._polylineFirstPoint!.worldZ
            );
            ctx.setLineDash([4, 5]);
            ctx.lineWidth   = 1;
            ctx.strokeStyle = 'rgba(22,163,74,0.55)';
            ctx.beginPath();
            ctx.moveTo(e.sx, e.sy);
            ctx.lineTo(origin.sx, origin.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#16a34a';
            ctx.beginPath();
            ctx.arc(origin.sx, origin.sy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = 'rgba(22,163,74,0.95)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText('↵ Enter or click button to close polyline', 12, cssH - 12);
        }

        ctx.restore();

        // §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — dashed inference guides + snap
        // chip for the current cursor. Drawn after the wall band's restore; does its
        // own save/restore and does NOT clear (this method owns the clear at the top).
        // Not shown while the set-out numeric editor owns the overlay.
        if (!this._setOutEditActive) this._drawAlignmentGuides();

        // §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP (L-935) — name the constraint that was dropped,
        // live, beside the cursor. Same ownership rules as the guides above: after the wall
        // band's restore, own save/restore, never clears.
        if (!this._setOutEditActive) this._drawSnapProjectedChip();

        // §WALL-SETOUT — set-out dims from the MOVING end to the surrounding walls,
        // alongside the wall's own length label. Drawn after the wall band restore;
        // these do their own save/restore and do NOT clear.
        // §WALL-SETOUT-TAB-INPUT — while editing, render the CAPTURED dims (against the
        // back-solved vertex) with the focused field highlighted, instead of recomputing
        // (which could reselect walls and make the focused field jump under the caret).
        if (this._setOutEditActive) {
            this._drawSetOutEditOverlay();
        } else if (this._wallCursorPoint) {
            this._drawSetOutDimensions(this._wallCursorPoint);
        }
    }

    /**
     * §WALL-SETOUT-TAB-INPUT — render the captured set-out dims against the current
     * back-solved vertex (`_setOutEditPoint`). Each dim's distance is re-derived from
     * the edited point and its FIXED wall foot (axis-locked), so lines stay anchored;
     * the focused field shows the typed buffer + caret in a highlighted box.
     */
    private _drawSetOutEditOverlay(): void {
        const c = this._ctx;
        const e = this._setOutEditPoint;
        if (!c || !e) return;
        const { ctx } = c;
        ctx.save();
        this._setOutDims.forEach((d, i) => {
            const focused = i === this._setOutEditIndex;
            // Re-anchor the dim to the edited vertex along its own axis (wall foot is fixed).
            const live: SetOutDimension = d.axis === 'x'
                ? {
                    ...d,
                    from: { x: e.worldX, z: e.worldZ },
                    to:   { x: d.to.x,   z: e.worldZ },
                    distanceMm: focused && this._setOutBuffer !== ''
                        ? parseInt(this._setOutBuffer, 10) || 0
                        : Math.round(Math.abs(e.worldX - d.to.x) * 1000),
                }
                : {
                    ...d,
                    from: { x: e.worldX, z: e.worldZ },
                    to:   { x: e.worldX, z: d.to.z },
                    distanceMm: focused && this._setOutBuffer !== ''
                        ? parseInt(this._setOutBuffer, 10) || 0
                        : Math.round(Math.abs(e.worldZ - d.to.z) * 1000),
                };
            const colour = d.role === 'secondary' ? SETOUT_GREY : SETOUT_BLUE;
            this._drawOneSetOutDim(live, colour, focused);
        });
        ctx.restore();
    }

    /** §WALL-SETOUT — the active level's existing wall baselines as 2D segments
     *  (plan XZ, metres) for the pure set-out computation. Same access pattern as
     *  SlabPlanToolHandler (`window.wallStore.getAll()` + `baseLine`). */
    private _collectLevelWallSegments(): SetOutSegment[] {
        const levelId = this._ctx?.viewDef.spatial?.levelId;
        const walls: Array<{ levelId?: string; baseLine?: Array<{ x: number; z: number }> }> =
            (window.wallStore as { getAll?: () => unknown[] } | undefined)?.getAll?.() as never ?? [];
        const segs: SetOutSegment[] = [];
        for (const w of walls) {
            if (levelId && w.levelId && w.levelId !== levelId) continue;   // this level only
            const bl = w.baseLine;
            if (!bl || bl.length < 2) continue;
            segs.push({ a: { x: bl[0].x, z: bl[0].z }, b: { x: bl[1].x, z: bl[1].z } });
        }
        return segs;
    }

    /** §WALL-SETOUT — draw blue set-out dimension(s) from `point` to the nearest
     *  surrounding walls. Assumes the overlay transform is already the dpr transform;
     *  does its OWN save/restore and does NOT clear (callers own the clear). */
    private _drawSetOutDimensions(point: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx } = c;
        const dims = computeSetOutDimensions(
            { x: point.worldX, z: point.worldZ },
            this._collectLevelWallSegments(),
        );
        if (dims.length === 0) return;

        ctx.save();
        // §WALL-SETOUT-4SIDE — PRIMARY pair (nearer wall per axis) draws blue, SECONDARY
        // pair (the farther/newly-projected sides) draws grey, so the user distinguishes them.
        for (const d of dims) this._drawOneSetOutDim(d, d.role === 'secondary' ? SETOUT_GREY : SETOUT_BLUE);
        ctx.restore();
    }

    /** §WALL-SETOUT — render a single set-out dimension line + label in `colour`. */
    private _drawOneSetOutDim(d: SetOutDimension, colour: string, focused = false): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, planCanvas } = c;
        const from = planCanvas.worldToScreen(d.from.x, d.from.z);
        const to   = planCanvas.worldToScreen(d.to.x,   d.to.z);

        ctx.strokeStyle = colour;
        ctx.lineWidth   = focused ? 2 : 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(to.sx, to.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // small end tick at the wall foot
        ctx.beginPath();
        ctx.arc(to.sx, to.sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();

        const mx = (from.sx + to.sx) / 2;
        const my = (from.sy + to.sy) / 2;
        // Focused (TAB-edited) field appends a static caret to read as an active text field
        // (a blinking caret would need its own rAF — forbidden by P3 outside the scheduler).
        const label = focused ? `${d.distanceMm} mm |` : `${d.distanceMm} mm`;
        ctx.font = focused ? 'bold 11px sans-serif' : '10px sans-serif';
        const tw = ctx.measureText(label).width;
        // Focused (TAB-edited) field gets a solid highlight box so it reads as a text field.
        ctx.fillStyle = focused ? colour : 'rgba(255,255,255,0.92)';
        ctx.fillRect(mx - tw / 2 - 4, my - 9, tw + 8, 16);
        if (focused) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(mx - tw / 2 - 4, my - 9, tw + 8, 16);
        }
        ctx.fillStyle = focused ? '#ffffff' : colour;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
    }

    /** §WALL-SETOUT — before the first click: clear the overlay + draw only the
     *  set-out dims for the hovered start point. */
    private _drawSetOutPreviewOnly(point: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
        this._drawSetOutDimensions(point);
    }

    private _getSelectedWallThickness(): number {
        // §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — same surface-independent source as the commit
        // so the plan preview thickness matches the dispatched (layered) type on both surfaces.
        const systemTypeId = resolveActiveWallSystemTypeId();
        if (!systemTypeId) return WALL_DEFAULT_THICKNESS;
        const total = window.wallSystemTypeStore?.getTotalThickness?.(systemTypeId); // TODO(TASK-08)
        return typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : WALL_DEFAULT_THICKNESS;
    }

    private _ensureWallStatusOverlay(): HTMLElement {
        if (!this._wallStatusOverlay) {
            const overlay = document.createElement('div');
            overlay.className = 'th-overlay';

            const text = document.createElement('span');
            text.id = 'pvt-wall-tool-status-text';
            text.className = 'th-text';
            overlay.appendChild(text);

            const sep = document.createElement('span');
            sep.id = 'pvt-wall-tool-sep';
            sep.className = 'th-sep';
            sep.style.display = 'none';
            overlay.appendChild(sep);

            const closeBtn = document.createElement('button');
            closeBtn.id = 'pvt-close-polyline-btn';
            closeBtn.className = 'th-close-btn';
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = `<span class="th-key">↵</span><span>Close Polyline</span>`;
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closePolyline();
            });
            overlay.appendChild(closeBtn);

            document.body.appendChild(overlay);
            this._wallStatusOverlay = overlay;
        }
        return this._wallStatusOverlay;
    }

    private _removeWallStatusOverlay(): void {
        this._wallStatusOverlay?.remove();
        this._wallStatusOverlay = null;
    }

    private _syncCreationHud(): void {
        if (!this._ctx) {
            this._removeWallStatusOverlay();
            return;
        }
        const mode    = this._getMode();
        const overlay = this._ensureWallStatusOverlay();
        const textEl  = overlay.querySelector('#pvt-wall-tool-status-text');
        const closeBtn = overlay.querySelector('#pvt-close-polyline-btn') as HTMLButtonElement | null;
        const sep = overlay.querySelector('#pvt-wall-tool-sep') as HTMLElement | null;
        const canClose = this._wallSegmentCount >= 2 && !!this._polylineFirstPoint && !!this._wallFirstPoint;

        if (textEl) {
            const hudLoop = _wallLoopMode(mode);
            if (this._setOutEditActive) {
                // §WALL-SETOUT-TAB-INPUT — editing a set-out distance numerically.
                textEl.textContent = 'Type set-out mm · TAB next dim · ↵ commit · Esc cancel';
            } else if (hudLoop) {
                // §FEAT-WALL-SHAPE-MODES — the prompt comes from the SHARED gesture
                // table, so the bar cannot ask for a corner while the tool wants a
                // centre. Without this arm a circular run would prompt "Click to set
                // next point", which is the UI naming an axis that did not change.
                const g = BOUNDARY_LOOP_GESTURE[hudLoop];
                textEl.textContent =
                    `${BOUNDARY_LOOP_LABELS[hudLoop]} run · ${this._wallFirstPoint ? g.second : g.first} · Esc to cancel`;
            } else if (!this._wallFirstPoint) {
                textEl.textContent = 'Click to set start point';
            } else if (mode === 'curved' && !this._arcMidPt) {
                textEl.textContent = 'Click arc midpoint · Esc to cancel arc';
            } else if (mode === 'curved' && this._arcMidPt) {
                textEl.textContent = 'Click end point to commit arc wall';
            } else {
                textEl.textContent = 'Click to set next point · or type length + ↵';
            }
        }
        if (closeBtn) closeBtn.style.display = canClose ? '' : 'none';
        if (sep) sep.style.display = canClose ? '' : 'none';
        overlay.style.display = 'flex';
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
